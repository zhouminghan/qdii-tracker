"""
用天天基金 pingzhongdata 接口补全缺失字段：
- 净值 nav / 净值日期 nav_date（场外）—— 每日强制覆盖（修复"已有值就锁死"的 bug）
- 日涨跌 daily_change（场外 · 按净值算）—— 每日强制覆盖
- 近1月 / 近3月 / 近6月 / 近1年（场外 + ETF 都补）—— 仅填漏，避免异常返回污染
- 今年来 chg_ytd（Pass 3 · AKShare 累计收益率走势推算）
- 基金名（带份额类型）—— 已有

字段映射（天天基金 pingzhongdata）：
  syl_1n = 近1年
  syl_3y = 近3月
  syl_6y = 近6月
  syl_1y = 近1月

合并策略（merge_share_data）：
- 场外基金：每天强制刷新 nav/nav_date/daily_change（否则后续 Actions 永远拿不到新交易日数据）；
            历史收益字段仅在缺失时填充
- 场内 ETF：只补历史收益（nav/daily_change 用 etf_price/etf_change_pct，不复用净值）
- 成立来收益（chg_since_inception）不在本脚本范围，pingzhongdata 没有该字段

Pass1 选基逻辑：
- 场外 QDII：无条件加入（每天都要刷新最新净值，不再依赖"字段缺失"判定）
- 场内 ETF：只在历史收益缺失时加入
"""
import json
import re
import time
from datetime import datetime
from pathlib import Path

import requests


HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://fund.eastmoney.com/",
}

# 对场内 ETF，这些字段不应被 pingzhongdata 的净值数据覆盖
# （场内 ETF 前端用的是 etf_price / etf_change_pct，净值口径不同）
ETF_SKIP_FIELDS = {"nav", "nav_date", "daily_change"}

# 这些字段每天都会变，pingzhongdata 取到新值时必须强制覆盖
# （否则首次跑完后旧值被锁死，后续 Actions 永远不会更新到新交易日）
ALWAYS_OVERWRITE_FIELDS = {"nav", "nav_date", "daily_change"}


def _to_float(v):
    if v is None or v == "" or v == "null":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def fetch_f10(code: str):
    """抓天天基金 F10 概况页（含规模/成立日期/基金经理）"""
    url = f"https://fundf10.eastmoney.com/jbgk_{code}.html"
    try:
        r = requests.get(url, headers=HEADERS, timeout=8)
    except Exception:
        return None
    if r.status_code != 200:
        return None
    r.encoding = "utf-8"
    text = r.text
    result = {}

    # 成立日期: "2023年04月06日 / 0.227亿份"
    m = re.search(r"<th>成立日期.*?</th>\s*<td[^>]*>([^<]+?)(?:\s*/|</td>)", text, re.DOTALL)
    if m:
        raw = m.group(1).strip()
        # 转换 "2023年04月06日" -> "2023-04-06"
        d = re.match(r"(\d{4})年(\d{2})月(\d{2})日", raw)
        if d:
            result["established"] = f"{d.group(1)}-{d.group(2)}-{d.group(3)}"

    # 基金经理: <th>基金经理人</th>...<a>张军</a>
    m = re.search(r"<th>基金经理人</th>\s*<td[^>]*>.*?>([^<]+)</a>", text, re.DOTALL)
    if m:
        result["manager"] = m.group(1).strip()

    # 资产规模: 36.62亿元（截止至：2026-03-31）
    m = re.search(r"资产规模[：:]</?\w*[^>]*>?\s*([\d.]+)\s*亿元", text)
    if m:
        scale_num = _to_float(m.group(1))
        if scale_num:
            result["scale"] = scale_num
            result["scale_raw"] = f"{scale_num}亿"

    # 从费率页抓取销售服务费（管理费/托管费已由雪球接口覆盖，这里只补销售服务费）
    try:
        fee_url = f"https://fundf10.eastmoney.com/jjfl_{code}.html"
        fr = requests.get(fee_url, headers=HEADERS, timeout=8)
        if fr.status_code == 200:
            fr.encoding = "utf-8"
            fee_text = fr.text
            fm = re.search(r"销售服务费[率]?.*?<td[^>]*>([\d.]+)%", fee_text, re.DOTALL)
            if fm:
                result["sale_service_fee"] = float(fm.group(1))
    except Exception:
        pass

    return result if result else None


def fetch_pzd(code: str):
    """抓 pingzhongdata 关键字段"""
    url = f"https://fund.eastmoney.com/pingzhongdata/{code}.js"
    try:
        r = requests.get(url, headers=HEADERS, timeout=8)
    except Exception as e:
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
            result[dst] = _to_float(m.group(1))

    # 备注：pingzhongdata 里 Data_grandTotal 不是"成立以来"收益（只是短期走势起点），
    # 天天基金的"成立来收益"需要从 F10 业绩页单独抓。本脚本先不补该字段。

    # 最新净值 + 日期 + 日涨跌（来自 Data_netWorthTrend 数组最后一个点）
    m = re.search(r"var\s+Data_netWorthTrend\s*=\s*(\[.*?\]);", text, re.DOTALL)
    if m:
        try:
            arr = json.loads(m.group(1))
            if arr:
                last = arr[-1]
                # date 是 Unix 毫秒时间戳
                ts = last.get("x")
                if ts:
                    result["nav_date"] = datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d")
                nav = _to_float(last.get("y"))
                if nav is not None:
                    result["nav"] = nav
                chg = _to_float(last.get("equityReturn"))
                if chg is not None:
                    result["daily_change"] = chg
        except Exception:
            pass

    # 基金简称（校验用）
    m = re.search(r'var\s+fS_name\s*=\s*"([^"]+)"', text)
    if m:
        result["pzd_name"] = m.group(1)

    return result if result else None


def merge_share_data(share: dict, pzd: dict, is_etf: bool = False):
    """合并 pzd 数据到 share。
    - nav/nav_date/daily_change：每天都会变 → 强制覆盖（ETF 跳过这三个字段）
    - 历史收益（chg_1m/3m/6m/1y）：只填空白，避免旧值被异常返回污染

    防回退机制：nav_date 只允许前进（新值 >= 旧值），
    防止 pingzhongdata CDN 缓存返回旧数据导致日期倒退。
    nav_date 检查必须在任何字段写入之前完成，避免 nav 被旧值污染。
    """
    updated = []

    # 防回退前置检查：如果接口返回了更旧的 nav_date，整组 nav 字段都不更新
    if not is_etf:
        new_nav_date = pzd.get("nav_date")
        cur_nav_date = share.get("nav_date", "")
        if new_nav_date and cur_nav_date and new_nav_date < cur_nav_date:
            # 接口返回旧日期 → 只更新历史收益，跳过 nav 相关字段
            for key in ("chg_1m", "chg_3m", "chg_6m", "chg_1y"):
                new_val = pzd.get(key)
                if new_val is not None and share.get(key) in (None, "", 0):
                    share[key] = new_val
                    updated.append(key)
            return updated

    candidate_keys = [
        "nav", "nav_date", "daily_change",
        "chg_1m", "chg_3m", "chg_6m", "chg_1y",
    ]
    for key in candidate_keys:
        if is_etf and key in ETF_SKIP_FIELDS:
            continue
        new_val = pzd.get(key)
        if new_val is None:
            continue
        cur = share.get(key)
        if key in ALWAYS_OVERWRITE_FIELDS:
            if cur != new_val:
                share[key] = new_val
                updated.append(key)
        else:
            # 历史收益：仅当缺失时填充
            if cur in (None, "", 0):
                share[key] = new_val
                updated.append(key)
    return updated


def fetch_ytd(code: str):
    """
    用 AKShare 抓"累计收益率走势"，推算今年以来的收益率（YTD）
    - 累计收益率从基金成立日起算
    - YTD = (1 + last) / (1 + year_start) - 1
    成本：每只 ~0.5s，批量用时可接受
    返回 float 百分比，或 None
    """
    try:
        import akshare as ak  # 延迟导入，避免启动开销
        import pandas as pd
    except ImportError:
        return None
    try:
        df = ak.fund_open_fund_info_em(symbol=code, indicator="累计收益率走势")
        if df is None or len(df) == 0:
            return None
        # 兼容列名差异
        date_col = "日期" if "日期" in df.columns else "净值日期"
        ret_col = "累计收益率"
        df[date_col] = pd.to_datetime(df[date_col])
        year_start = datetime(datetime.now().year, 1, 1)
        ytd_df = df[df[date_col] >= year_start].sort_values(date_col)
        if len(ytd_df) < 2:
            # 成立不足 1 年或今年没数据点
            return None
        first = ytd_df.iloc[0][ret_col]
        last = ytd_df.iloc[-1][ret_col]
        if first is None or last is None:
            return None
        chg = (1 + last / 100.0) / (1 + first / 100.0) - 1
        return round(chg * 100, 2)
    except Exception:
        return None


def main():
    project_root = Path(__file__).parent.parent
    # 统一：直接读写 web/data/（前端消费目录），不再维护 data/ 副本
    # 历史 bug（2026-05-08）：两目录分裂时，data/ 里的上游简化快照会覆盖 web/data/ 的完整版
    #                        统一成单一目录后，该 bug 根治，字段永远完整
    data_dir = project_root / "web" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    ALL_CATS = ["sp500", "nasdaq_passive", "active", "global_other", "etf"]

    loaded_data = {}
    for cat in ALL_CATS:
        fp = data_dir / f"{cat}.json"
        if fp.exists():
            with open(fp, encoding="utf-8") as f:
                loaded_data[cat] = json.load(f)
        else:
            print(f"⚠️  {cat}.json 不存在，跳过（首次运行需先跑 scan_funds.py + enrich_data.py）")

    # ------------------------- Pass 1：pingzhongdata 历史收益 -------------------------
    # 场外 QDII：每天都跑（要刷新 nav/nav_date/daily_change），pzd 抓不到再降级
    # 场内 ETF：只在历史收益缺失时跑（净值字段不用，ETF 用 etf_price/etf_change_pct）
    targets = []
    for cat, d in loaded_data.items():
        is_etf = (cat == "etf")
        for s in d["series"]:
            for sh in s["shares"]:
                if is_etf:
                    # ETF 仅看历史收益是否缺
                    probe_keys = ["chg_1m", "chg_1y"]
                    missing = [k for k in probe_keys if sh.get(k) in (None, "", 0)]
                    if missing:
                        targets.append((cat, sh["code"], sh, missing, is_etf))
                else:
                    # 场外 QDII 每天都要更新最新净值，无条件加入
                    probe_keys = ["chg_1m", "chg_1y"]
                    missing = [k for k in probe_keys if sh.get(k) in (None, "", 0)]
                    targets.append((cat, sh["code"], sh, missing or ["daily-refresh"], is_etf))

    total = len(targets)
    print(f"🎯 Pass 1: {total} 只基金需处理（场外每日刷新 nav/daily_change + 历史收益补漏；ETF 仅补漏历史收益）")
    print()

    success = 0
    fail = 0
    for i, (cat, code, sh, missing, is_etf) in enumerate(targets, 1):
        pzd = fetch_pzd(code)
        if pzd:
            up = merge_share_data(sh, pzd, is_etf=is_etf)
            if up:
                success += 1
                tag = "[ETF]" if is_etf else "     "
                print(f"  [{i}/{total}] ✅ {tag} {code} 补上 {up}")
            else:
                print(f"  [{i}/{total}] ⚠️  {code} 有返回但无可用字段")
        else:
            fail += 1
            print(f"  [{i}/{total}] ❌ {code} pzd 抓取失败")
        time.sleep(0.15)

    # ------------------------- Pass 2：F10 基础信息 + 销售服务费 -------------------------
    print()
    print("=" * 50)
    print("Pass 2: 从 F10 补充规模/成立日期/基金经理/销售服务费")
    print("=" * 50)
    f10_targets = []
    for cat, d in loaded_data.items():
        for s in d["series"]:
            for sh in s["shares"]:
                if sh.get("scale") in (None, "", 0) or \
                   sh.get("established") in (None, "") or \
                   sh.get("manager") in (None, "") or \
                   sh.get("sale_service_fee") is None:
                    f10_targets.append((cat, sh["code"], sh))
    total2 = len(f10_targets)
    print(f"🎯 目标：{total2} 只缺基础信息")
    success2 = 0
    for i, (cat, code, sh) in enumerate(f10_targets, 1):
        info = fetch_f10(code)
        if info:
            changed = []
            for key in ["scale", "scale_raw", "established", "manager", "sale_service_fee"]:
                if info.get(key) is not None and sh.get(key) in (None, "", 0):
                    sh[key] = info[key]
                    changed.append(key)
            if changed:
                success2 += 1
                print(f"  [{i}/{total2}] ✅ {code} 补上 {changed}")
        else:
            print(f"  [{i}/{total2}] ❌ {code} F10 失败")
        time.sleep(0.2)

    # ------------------------- Pass 3：YTD 今年来收益 -------------------------
    print()
    print("=" * 50)
    print("Pass 3: 补充今年来收益率 chg_ytd")
    print("=" * 50)
    ytd_targets = []
    for cat, d in loaded_data.items():
        for s in d["series"]:
            for sh in s["shares"]:
                if sh.get("chg_ytd") in (None, "", 0):
                    ytd_targets.append((cat, sh["code"], sh))
    total3 = len(ytd_targets)
    print(f"🎯 目标：{total3} 只缺 YTD 数据")
    success3 = 0
    fail3 = 0
    for i, (cat, code, sh) in enumerate(ytd_targets, 1):
        ytd = fetch_ytd(code)
        if ytd is not None:
            sh["chg_ytd"] = ytd
            success3 += 1
            print(f"  [{i}/{total3}] ✅ {code} YTD = {ytd:+.2f}%")
        else:
            fail3 += 1
            print(f"  [{i}/{total3}] ❌ {code} 无累计收益率数据")
        time.sleep(0.2)

    # ------------------------- 统一写回 -------------------------
    print("\n💾 写回板块数据...")
    for cat, d in loaded_data.items():
        fp = data_dir / f"{cat}.json"
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
        print(f"  ✅ {cat}.json")

    print()
    print(f"📊 总结：Pass1 成功 {success} / 失败 {fail} / 共 {total}")
    print(f"         Pass2 成功 {success2} / 共 {total2}")
    print(f"         Pass3 成功 {success3} / 失败 {fail3} / 共 {total3}")


if __name__ == "__main__":
    main()
