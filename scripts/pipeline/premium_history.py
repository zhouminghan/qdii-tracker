"""
scripts/pipeline/premium_history.py — 生成场内 ETF 历史溢价曲线

溢价近似 = (ETF 日 K 收盘价 - 当日净值) / 当日净值 × 100%。
注意：历史 IOPV 不公开，此处用「历史净值」替代盘中 IOPV，与前端实时溢价口径一致
（实时溢价也是「盘中价 vs 最近收盘净值」）。写入 web/data/etf-premium-history.json。
"""
import json

from core.constants import DATA_DIR
from core.utils import read_json, write_json, beijing_now_iso
from sources.eastmoney_source import fetch_etf_kline_history, fetch_lsjz_history


def align_premium(closes, navs):
    """按日期对齐收盘价与净值，返回 [{date, close, nav, premium}, ...]（升序）。"""
    nav_by_date = {n["date"]: n["nav"] for n in navs or []}
    out = []
    for c in closes or []:
        nav = nav_by_date.get(c["date"])
        if nav is None or nav <= 0 or c["close"] is None:
            continue
        out.append({
            "date": c["date"],
            "close": round(c["close"], 4),
            "nav": round(nav, 4),
            "premium": round((c["close"] - nav) / nav * 100, 2),
        })
    return out


def collect_etf_codes():
    fp = DATA_DIR / "etf.json"
    if not fp.exists():
        return []
    data = read_json(fp)
    return [str(sh.get("code")) for s in data.get("series", []) for sh in s.get("shares", []) if sh.get("code")]


def main():
    codes = collect_etf_codes()
    print(f"🎯 历史溢价: {len(codes)} 只 ETF")
    result = {}
    for code in codes:
        closes = fetch_etf_kline_history(code)
        navs = fetch_lsjz_history(code)
        series = align_premium(closes, navs)
        if series:
            result[code] = series
    fp = DATA_DIR / "etf-premium-history.json"
    existing = read_json(fp).get("premiums", {}) if fp.exists() else {}
    merged = dict(existing)
    merged.update(result)
    out = {"generated_at": beijing_now_iso(), "premiums": merged}
    write_json(fp, out)
    print(f"✅ etf-premium-history.json 已生成：本次 {len(result)}/{len(codes)} 只，累计 {len(merged)} 只")


if __name__ == "__main__":
    main()
