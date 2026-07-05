"""
东方财富数据源：lsjz / pingzhongdata / F10 概况页 + 费率页。
从 enrich_data.py / fill_missing.py / refresh_purchase.py 提取，消除 3 份 lsjz 重复。
"""
import json
import re
from datetime import datetime

import requests

from core.constants import HEADERS_EASTMONEY, HEADERS_FUND
from core.utils import to_float, BEIJING_TZ


def fetch_lsjz(code: str):
    """
    用天天基金 lsjz API 获取最新净值。
    合并 3 份重复实现：
    - enrich_data.py: fetch_etf_nav_date_lsjz（只返回 nav_date）
    - fill_missing.py: fetch_lsjz（返回 nav/nav_date/daily_change）
    - refresh_purchase.py: fetch_lsjz_single（返回 nav/nav_date/daily_change，无防御检查）
    合并版：返回 nav/nav_date/daily_change，带完整防御检查。
    """
    url = (
        f"https://api.fund.eastmoney.com/f10/lsjz"
        f"?callback=jQuery&fundCode={code}&pageIndex=1&pageSize=1"
    )
    try:
        r = requests.get(url, headers=HEADERS_EASTMONEY, timeout=8)
    except Exception:
        return None
    if r.status_code != 200:
        print(f"  ⚠️  fetch_lsjz({code}) HTTP {r.status_code}")
        return None
    m = re.search(r"jQuery\((.*)\)", r.text, re.DOTALL)
    if not m:
        print(f"  ⚠️  fetch_lsjz({code}) 无法解析 jQuery 包裹")
        return None
    try:
        data = json.loads(m.group(1))
        # 防御：Data 字段可能是字符串（如 "data"）而非 dict
        data_obj = data.get("Data", {})
        if not isinstance(data_obj, dict):
            print(f"  ⚠️  fetch_lsjz({code}) Data 类型异常: {type(data_obj).__name__}")
            return None
        items = data_obj.get("LSJZList", [])
        if not items:
            return None
        latest = items[0]
        result = {}
        nav_date = latest.get("FSRQ")
        if nav_date:
            result["nav_date"] = nav_date
        nav = to_float(latest.get("DWJZ"))
        if nav is not None:
            result["nav"] = nav
        chg = to_float(latest.get("JZZZL"))
        if chg is not None:
            result["daily_change"] = chg
        return result if result else None
    except Exception as e:
        print(f"  ⚠️  fetch_lsjz({code}) 解析异常: {e}")
        return None


def fetch_pzd(code: str):
    """
    抓 pingzhongdata：历史收益（chg_1m/3m/6m/1y）+ 备选净值。
    原逻辑来自 fill_missing.py。
    净值优先用 lsjz（更快），本函数作为历史收益的补充源。
    """
    url = f"https://fund.eastmoney.com/pingzhongdata/{code}.js"
    try:
        r = requests.get(url, headers=HEADERS_FUND, timeout=8)
    except Exception:
        return None
    if r.status_code != 200:
        return None
    r.encoding = "utf-8"
    text = r.text

    result = {}
    # 近 N 月/年收益率
    mapping = {
        "syl_1n": "chg_1y",  # 近1年
        "syl_3y": "chg_3m",  # 近3月
        "syl_6y": "chg_6m",  # 近6月
        "syl_1y": "chg_1m",  # 近1月
    }
    for src, dst in mapping.items():
        m = re.search(rf'var\s+{src}\s*=\s*"?([^";]+)"?\s*;', text)
        if m:
            result[dst] = to_float(m.group(1))

    # 最新净值 + 日期 + 日涨跌（备选，当 lsjz 失败时使用）
    m = re.search(r"var\s+Data_netWorthTrend\s*=\s*(\[.*?\]);", text, re.DOTALL)
    if m:
        try:
            arr = json.loads(m.group(1))
            if arr:
                last = arr[-1]
                ts = last.get("x")
                if ts:
                    result["nav_date"] = datetime.fromtimestamp(ts / 1000, tz=BEIJING_TZ).strftime("%Y-%m-%d")
                nav = to_float(last.get("y"))
                if nav is not None:
                    result["nav"] = nav
                chg = to_float(last.get("equityReturn"))
                if chg is not None:
                    result["daily_change"] = chg
        except Exception:
            pass

    # 基金简称（校验用）
    m = re.search(r'var\s+fS_name\s*=\s*"([^"]+)"', text)
    if m:
        result["pzd_name"] = m.group(1)

    return result if result else None


def fetch_f10(code: str):
    """
    抓天天基金 F10 概况页（含规模/成立日期/基金经理）+ 费率页。
    原逻辑来自 fill_missing.py。
    """
    url = f"https://fundf10.eastmoney.com/jbgk_{code}.html"
    try:
        r = requests.get(url, headers=HEADERS_EASTMONEY, timeout=8)
    except Exception:
        return None
    if r.status_code != 200:
        return None
    r.encoding = "utf-8"
    text = r.text
    result = {}

    # 成立日期
    m = re.search(r"<th>成立日期.*?</th>\s*<td[^>]*>([^<]+?)(?:\s*/|</td>)", text, re.DOTALL)
    if m:
        raw = m.group(1).strip()
        d = re.match(r"(\d{4})年(\d{2})月(\d{2})日", raw)
        if d:
            result["established"] = f"{d.group(1)}-{d.group(2)}-{d.group(3)}"

    # 基金经理
    m = re.search(r"<th>基金经理人</th>\s*<td[^>]*>.*?>([^<]+)</a>", text, re.DOTALL)
    if m:
        result["manager"] = m.group(1).strip()

    # 资产规模
    m = re.search(r"资产规模[：:]</?\w*[^>]*>?\s*([\d.]+)\s*亿元", text)
    if m:
        scale_num = to_float(m.group(1))
        if scale_num:
            result["scale"] = scale_num
            result["scale_raw"] = f"{scale_num}亿"

    # 从费率页抓取管理费/托管费/销售服务费/首档买入费率
    try:
        fee_url = f"https://fundf10.eastmoney.com/jjfl_{code}.html"
        fr = requests.get(fee_url, headers=HEADERS_EASTMONEY, timeout=8)
        if fr.status_code == 200:
            fr.encoding = "utf-8"
            fee_text = fr.text
            # 销售服务费
            fm = re.search(r"销售服务费[率]?.*?<td[^>]*>([\d.]+)%", fee_text, re.DOTALL)
            if fm:
                result["sale_service_fee"] = float(fm.group(1))
            # 管理费
            fm = re.search(r"管理费[率]?.*?<td[^>]*>([\d.]+)%", fee_text, re.DOTALL)
            if fm:
                result["mgmt_fee"] = float(fm.group(1))
            # 托管费
            fm = re.search(r"托管费[率]?.*?<td[^>]*>([\d.]+)%", fee_text, re.DOTALL)
            if fm:
                result["custody_fee"] = float(fm.group(1))
            # 首档买入费率
            fm = re.search(r"申购费率.*?<td[^>]*>([\d.]+)%", fee_text, re.DOTALL)
            if fm:
                result["first_buy_rate"] = float(fm.group(1))
    except Exception:
        pass

    return result if result else None


def fetch_fee_rules(code: str):
    """
    从天天基金费率页抓取买入/卖出规则详情。
    原逻辑来自 fill_missing.py Pass 2b。
    返回 {"buy_rules": [...], "sell_rules": [...]} 或 None。
    """
    fee_url = f"https://fundf10.eastmoney.com/jjfl_{code}.html"
    try:
        fr = requests.get(fee_url, headers=HEADERS_EASTMONEY, timeout=8)
        if fr.status_code != 200:
            return None
        fr.encoding = "utf-8"
        fee_text = fr.text
    except Exception:
        return None

    def normalize_condition(cond: str, is_buy: bool = True) -> str:
        """统一费率条件格式：中文描述 → 远端符号格式"""
        if not cond or cond == "---":
            return cond
        unit_field = "买入金额" if is_buy else "持有期限"

        def _days_to_unit(val_str, unit):
            unit = unit.rstrip("元")
            if unit == "天":
                days = float(val_str)
                if days == 365:
                    return "1.0", "年"
                elif days == 730:
                    return "2.0", "年"
                elif days == 1095:
                    return "3.0", "年"
            return val_str, unit

        # "大于等于X，小于Y"
        m = re.match(r"大于等于([\d.]+)(万元?|天|年)[，,]\s*小于([\d.]+)(万元?|天|年)", cond)
        if m:
            lo, u1, hi, u2 = m.group(1), m.group(2), m.group(3), m.group(4)
            lo, u1 = _days_to_unit(lo, u1)
            hi, u2 = _days_to_unit(hi, u2)
            return f"{lo}{u1}<={unit_field}<{hi}{u2}"
        # "小于X"
        m = re.match(r"小于([\d.]+)(万元?|天|年)", cond)
        if m:
            val, u = m.group(1), m.group(2)
            val, u = _days_to_unit(val, u)
            return f"0.0{u}<{unit_field}<{val}{u}"
        # "大于等于X"
        m = re.match(r"大于等于([\d.]+)(万元?|天|年)", cond)
        if m:
            val, u = m.group(1), m.group(2)
            val, u = _days_to_unit(val, u)
            return f"{val}{u}<={unit_field}"
        return cond

    buy_rules = []
    sell_rules = []

    # 申购费率表（多档）
    buy_section = re.search(r"申购费率.*?(<table.*?</table>)", fee_text, re.DOTALL)
    if buy_section:
        rows = re.findall(r"<tr>(.*?)</tr>", buy_section.group(1), re.DOTALL)
        for row in rows:
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
            if len(cells) >= 2:
                cond = re.sub(r"<[^>]+>", "", cells[0]).strip()
                cond = normalize_condition(cond, is_buy=True)
                rate_str = re.sub(r"<[^>]+>", "", cells[1]).strip()
                rate_m = re.search(r"([\d.]+)%", rate_str)
                rate_per = re.search(r"([\d.]+)元", rate_str)
                if rate_m:
                    buy_rules.append({"condition": cond, "rate": float(rate_m.group(1))})
                elif rate_per:
                    buy_rules.append({"condition": cond, "rate": float(rate_per.group(1))})

    # 赎回费率表
    sell_section = re.search(r"赎回费率.*?(<table.*?</table>)", fee_text, re.DOTALL)
    if sell_section:
        rows = re.findall(r"<tr>(.*?)</tr>", sell_section.group(1), re.DOTALL)
        for row in rows:
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
            if len(cells) >= 2:
                cond = re.sub(r"<[^>]+>", "", cells[0]).strip()
                cond = normalize_condition(cond, is_buy=False)
                rate_str = re.sub(r"<[^>]+>", "", cells[1]).strip()
                rate_m = re.search(r"([\d.]+)%", rate_str)
                if rate_m:
                    sell_rules.append({"condition": cond, "rate": float(rate_m.group(1))})
                elif "0" in rate_str or "免" in rate_str:
                    sell_rules.append({"condition": cond, "rate": 0.0})

    if buy_rules or sell_rules:
        return {"buy_rules": buy_rules, "sell_rules": sell_rules}
    return None
