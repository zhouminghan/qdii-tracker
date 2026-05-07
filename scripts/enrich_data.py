"""
丰富基金数据：
- 涨跌幅（全量一次性接口）
- 限额/申购状态（全量一次性接口）
- 规模/基金经理/成立时间（逐只调雪球接口，有延迟）

按规模大的份额作为系列默认展示。
"""
import json
import time
import re
from datetime import datetime
from pathlib import Path

import akshare as ak
import pandas as pd


def _to_float(v):
    """安全转浮点"""
    if v is None or (isinstance(v, float) and pd.isna(v)) or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def parse_scale(scale_str: str) -> float:
    """解析规模字符串 '31.11亿' -> 31.11（亿元）"""
    if not scale_str or scale_str in ("--", "<NA>", "nan", "NaN"):
        return None
    s = str(scale_str).strip()
    # 匹配数字+单位
    m = re.match(r"([\d.]+)\s*(亿|万)", s)
    if not m:
        return None
    num = float(m.group(1))
    unit = m.group(2)
    if unit == "万":
        num = num / 10000
    return num


def fetch_rank_data():
    """全量涨跌幅数据"""
    print("🔍 拉取全量涨跌幅排名...")
    df = ak.fund_open_fund_rank_em(symbol="全部")
    print(f"  ✅ {len(df)} 条")
    rank_map = {}
    for _, row in df.iterrows():
        code = str(row["基金代码"]).strip()
        rank_map[code] = {
            "nav_date": str(row.get("日期", "")),
            "nav": _to_float(row.get("单位净值")),
            "nav_cum": _to_float(row.get("累计净值")),
            "daily_change": _to_float(row.get("日增长率")),
            "chg_1w": _to_float(row.get("近1周")),
            "chg_1m": _to_float(row.get("近1月")),
            "chg_3m": _to_float(row.get("近3月")),
            "chg_6m": _to_float(row.get("近6月")),
            "chg_1y": _to_float(row.get("近1年")),
            "chg_2y": _to_float(row.get("近2年")),
            "chg_3y": _to_float(row.get("近3年")),
            "chg_ytd": _to_float(row.get("今年来")),
            "chg_since_inception": _to_float(row.get("成立来")),
        }
    return rank_map


def fetch_purchase_data():
    """全量申购限额数据"""
    print("🔍 拉取全量申购状态/限额...")
    df = ak.fund_purchase_em()
    print(f"  ✅ {len(df)} 条")
    purchase_map = {}
    for _, row in df.iterrows():
        code = str(row["基金代码"]).strip()
        limit = _to_float(row.get("日累计限定金额"))
        # 限额字符串化（更易显示）
        purchase_map[code] = {
            "buy_status": str(row.get("申购状态", "") or "").strip(),
            "sell_status": str(row.get("赎回状态", "") or "").strip(),
            "buy_min": _to_float(row.get("购买起点")),
            "daily_limit": limit,
            "fee": str(row.get("手续费", "") or "").strip(),
        }
    return purchase_map


def fetch_etf_data():
    """ETF 场内数据（规模/价格，通过东财 ETF 现货接口批量获取）"""
    print("🔍 拉取全量 ETF 现货数据（含规模）...")
    try:
        df = ak.fund_etf_spot_em()
        print(f"  ✅ {len(df)} 条")
    except Exception as e:
        print(f"  ❌ {e}")
        return {}
    etf_map = {}
    for _, row in df.iterrows():
        code = str(row["代码"]).strip()
        total_value = _to_float(row.get("总市值"))  # 元
        scale_yi = (total_value / 1e8) if total_value else None
        etf_map[code] = {
            "etf_scale_yi": scale_yi,
            "etf_price": _to_float(row.get("最新价")),
            "etf_change_pct": _to_float(row.get("涨跌幅")),
            "etf_volume": _to_float(row.get("成交量")),
        }
    return etf_map


def fetch_basic_info(code: str):
    """逐只获取规模、基金经理、成立时间（雪球接口）"""
    try:
        df = ak.fund_individual_basic_info_xq(symbol=code)
        info = dict(zip(df["item"], df["value"]))
        return {
            "scale": parse_scale(info.get("最新规模")),
            "scale_raw": str(info.get("最新规模") or ""),
            "established": str(info.get("成立时间") or ""),
            "manager": str(info.get("基金经理") or ""),
            "fund_company": str(info.get("基金公司") or ""),
            "fund_type_xq": str(info.get("基金类型") or ""),
            "full_name": str(info.get("基金全称") or ""),
        }
    except Exception as e:
        return {"scale": None, "scale_raw": "", "established": "", "manager": "", "error": str(e)[:100]}


def fetch_fee_detail(code: str):
    """逐只获取费率详情（买入规则/卖出规则/免费持有天数）"""
    try:
        df = ak.fund_individual_detail_info_xq(symbol=code)
        buy_rules = []
        sell_rules = []
        mgmt_fee = None
        custody_fee = None
        for _, row in df.iterrows():
            ftype = str(row.get("费用类型", "")).strip()
            cond = str(row.get("条件或名称", "")).strip()
            fee = _to_float(row.get("费用"))
            if ftype == "买入规则":
                buy_rules.append({"condition": cond, "rate": fee})
            elif ftype == "卖出规则":
                sell_rules.append({"condition": cond, "rate": fee})
            elif ftype == "其他费用":
                if "管理" in cond:
                    mgmt_fee = fee
                elif "托管" in cond:
                    custody_fee = fee

        # 提取"满多少天免手续费"（0 费率的持有天数）
        free_hold_days = None
        for rule in sell_rules:
            if rule["rate"] == 0:
                # 解析条件，如 "7.0天<=持有期限"
                import re as _re
                m = _re.search(r"(\d+(?:\.\d+)?)\s*天\s*<=?\s*持有", rule["condition"])
                if m:
                    days = float(m.group(1))
                    if free_hold_days is None or days < free_hold_days:
                        free_hold_days = int(days)

        # 首档买入费率（最常用）
        first_buy_rate = buy_rules[0]["rate"] if buy_rules else None
        # 最高卖出费率（持有最短时）
        max_sell_rate = max((r["rate"] for r in sell_rules), default=None)

        return {
            "buy_rules": buy_rules,
            "sell_rules": sell_rules,
            "mgmt_fee": mgmt_fee,
            "custody_fee": custody_fee,
            "free_hold_days": free_hold_days,
            "first_buy_rate": first_buy_rate,
            "max_sell_rate": max_sell_rate,
        }
    except Exception as e:
        return {"buy_rules": [], "sell_rules": [], "error": str(e)[:100]}


def fetch_nav_with_date(code: str):
    """获取单只基金的最新净值 + 日期（T+1 已公布的数据）"""
    # 已经在 rank_map 里有 nav_date 了，不需要额外调用
    pass


# ============================================================
# 份额排序优先级
# ============================================================

def share_sort_key(share: dict) -> tuple:
    """
    份额排序键（小的在前）
    排序规则：
    1. 币种：人民币 < 美元 < 欧元 < 港币
    2. 份额类型：A < C < E < F < H < I < Q < R < LOF < FOF < 默认
    3. 代码（数字小的在前）
    """
    currency_rank = {"人民币": 0, "美元": 1, "欧元": 2, "港币": 3}.get(share.get("currency"), 9)
    # 摩根系"美钞"/"美汇"视为 A 的变体（紧跟 A 之后）
    # A(后端)视为 A 的变体，但排在所有 A 变体之后（前端 A 优先作为默认）
    class_rank = {
        "A": 1, "A(美钞)": 1.5, "A(美汇)": 1.6, "A(后端)": 1.9,
        "B": 2, "B(后端)": 2.9,
        "C": 3, "C(后端)": 3.9,
        "D": 4, "E": 5, "F": 6,
        "H": 7, "I": 8, "Q": 9, "R": 10,
        "LOF": 20, "FOF": 21, "默认": 30,
    }.get(share.get("share_class"), 99)
    return (currency_rank, class_rank, share.get("code", ""))


def main():
    project_root = Path(__file__).parent.parent
    # 统一：直接读写 web/data/（前端消费目录），不再维护 data/ 副本
    data_dir = project_root / "web" / "data"

    # Step 1: 批量数据（快）
    rank_map = fetch_rank_data()
    purchase_map = fetch_purchase_data()
    etf_map = fetch_etf_data()

    # Step 2: 收集所有要补基础信息的基金代码
    all_codes = []
    series_by_cat = {}
    for cat in ["sp500", "nasdaq_passive", "active", "global_other", "etf"]:
        fp = data_dir / f"{cat}.json"
        if not fp.exists():
            continue
        with open(fp, encoding="utf-8") as f:
            series_by_cat[cat] = json.load(f)
        for series in series_by_cat[cat]["series"]:
            for share in series["shares"]:
                all_codes.append(share["code"])

    total = len(all_codes)
    print(f"\n🔍 需要补基础信息的基金: {total} 只")

    # Step 3: 逐只拉取基础信息（慢，带进度）
    basic_info_map = {}
    fee_detail_map = {}
    print("⏳ 开始抓取规模/经理/成立时间 + 费率详情（逐只调用雪球接口）...")
    for i, code in enumerate(all_codes, 1):
        basic = fetch_basic_info(code)
        basic_info_map[code] = basic
        # 同时抓费率详情
        fee_detail_map[code] = fetch_fee_detail(code)
        if i % 10 == 0 or i == total:
            fd = fee_detail_map[code]
            free_days = fd.get('free_hold_days')
            buy_rate = fd.get('first_buy_rate')
            print(f"  进度: {i}/{total}  最新: {code} 规模={basic.get('scale_raw', '--')} 首档买入={buy_rate} 免费持有={free_days}天")
        time.sleep(0.2)  # 限速稍放宽（接口多了一个调用）

    # Step 4: 合并所有数据到 series 里
    print("\n🔀 合并数据并计算默认份额（按规模最大）...")
    for cat in ["sp500", "nasdaq_passive", "active", "global_other", "etf"]:
        if cat not in series_by_cat:
            continue
        data = series_by_cat[cat]
        total_scale = 0
        for series in data["series"]:
            for share in series["shares"]:
                code = share["code"]
                share.update(rank_map.get(code, {}))
                share.update(purchase_map.get(code, {}))
                share.update(basic_info_map.get(code, {}))
                # 费率详情
                share.update(fee_detail_map.get(code, {}))

                # ETF 场内数据：规模/价格（用这个补上雪球拿不到的 ETF 规模）
                etf_info = etf_map.get(code)
                if etf_info:
                    if etf_info.get("etf_scale_yi") and not share.get("scale"):
                        share["scale"] = etf_info["etf_scale_yi"]
                        share["scale_raw"] = f"{etf_info['etf_scale_yi']:.2f}亿"
                    share["etf_price"] = etf_info.get("etf_price")
                    share["etf_change_pct"] = etf_info.get("etf_change_pct")

                if share.get("scale"):
                    total_scale += share["scale"]

            # v3: 份额排序 —— 先人民币后美元、A<C<I<LOF
            series["shares"].sort(key=share_sort_key)

            # v5 修正：默认份额规则 = 份额类型优先（A>C>...） > 币种（人民币优先） > 规模
            # 原因：A 类才是普通投资者首选（长期持有划算），即使 C 类规模更大也不该作为默认
            # shares 已按 share_sort_key 排好序，直接取第一个即可
            series["default_share_code"] = series["shares"][0]["code"] if series["shares"] else None
            series["series_scale"] = sum(s.get("scale") or 0 for s in series["shares"])

        # 系列按规模排序
        data["series"].sort(key=lambda s: -(s.get("series_scale") or 0))
        data["total_scale"] = round(total_scale, 2)
        data["enriched_at"] = datetime.now().isoformat()

        with open(data_dir / f"{cat}.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  💾 {cat}.json  系列数={len(data['series'])}  总规模={data['total_scale']}亿")

    # 更新 meta
    meta_fp = data_dir / "meta.json"
    with open(meta_fp, encoding="utf-8") as f:
        meta = json.load(f)
    meta["enriched_at"] = datetime.now().isoformat()
    meta["enriched_fields"] = ["涨跌幅", "规模", "限额", "基金经理", "成立时间"]
    with open(meta_fp, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print("\n✅ 全量丰富完成！")


if __name__ == "__main__":
    main()
