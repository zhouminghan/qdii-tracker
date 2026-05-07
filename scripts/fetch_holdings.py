"""
抓取基金持仓（Top10 重仓股）
- 只抓主动基金（被动指数跟踪指数，持仓意义不大）
- 输出到 data/holdings/{code}.json
- 失败不报错，日志记录
"""
import json
import time
from datetime import datetime
from pathlib import Path

import akshare as ak
import pandas as pd


def _to_float(v):
    if v is None or (isinstance(v, float) and pd.isna(v)) or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def fetch_holdings(code: str, year: str = None):
    """抓取单只基金的持仓数据"""
    if year is None:
        year = str(datetime.now().year)
    try:
        df = ak.fund_portfolio_hold_em(symbol=code, date=year)
        if len(df) == 0:
            return None
        # 按季度分组（最新季度排前面）
        by_quarter = {}
        for _, row in df.iterrows():
            quarter = str(row.get("季度", ""))
            item = {
                "rank": int(row.get("序号", 0)) if row.get("序号") else None,
                "stock_code": str(row.get("股票代码", "")).strip(),
                "stock_name": str(row.get("股票名称", "")).strip(),
                "weight": _to_float(row.get("占净值比例")),  # %
                "shares": _to_float(row.get("持股数")),      # 万股
                "market_value": _to_float(row.get("持仓市值")),  # 万元
            }
            by_quarter.setdefault(quarter, []).append(item)

        # 取最新季度
        quarters_sorted = sorted(by_quarter.keys(), reverse=True)
        latest_q = quarters_sorted[0] if quarters_sorted else None
        latest_holdings = by_quarter.get(latest_q, [])

        total_weight = sum(h["weight"] or 0 for h in latest_holdings)
        heavy_count = sum(1 for h in latest_holdings if (h["weight"] or 0) > 5)

        return {
            "code": code,
            "latest_quarter": latest_q,
            "holdings_count": len(latest_holdings),
            "total_weight": round(total_weight, 2),
            "heavy_count": heavy_count,
            "holdings": latest_holdings,
            "all_quarters": by_quarter,  # 保留完整（未来可用）
            "fetched_at": datetime.now().isoformat(),
        }
    except Exception as e:
        return {"error": str(e)[:200], "code": code}


def main():
    project_root = Path(__file__).parent.parent
    # 统一：直接读写 web/data/（前端消费目录）
    data_dir = project_root / "web" / "data"
    holdings_dir = data_dir / "holdings"
    holdings_dir.mkdir(parents=True, exist_ok=True)

    # 抓主动基金 + 全球/其他 QDII（两个都是主动型，都值得看持仓；被动指数无意义）
    target_codes = []
    for cat in ["active", "global_other"]:
        fp = data_dir / f"{cat}.json"
        if not fp.exists():
            continue
        with open(fp, encoding="utf-8") as f:
            d = json.load(f)
        # 收集默认份额代码（一个系列只抓一个，因为同系列份额持仓相同）
        for series in d["series"]:
            default_code = series.get("default_share_code")
            if default_code:
                target_codes.append((default_code, series.get("display_name", "")))

    total = len(target_codes)
    print(f"🎯 目标：{total} 只主动基金")
    print(f"📁 输出：{holdings_dir}")
    print()

    success = 0
    fail = 0
    for i, (code, name) in enumerate(target_codes, 1):
        result = fetch_holdings(code)
        if result and "error" not in result:
            # 保存
            with open(holdings_dir / f"{code}.json", "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            success += 1
            top_str = ""
            if result["holdings"]:
                top3 = result["holdings"][:3]
                top_str = " | ".join(f"{h['stock_name']} {h['weight']}%" for h in top3)
            print(f"  [{i}/{total}] ✅ {code} {name[:20]} - {top_str}")
        else:
            fail += 1
            err = (result or {}).get("error", "未知") if result else "无数据"
            print(f"  [{i}/{total}] ❌ {code} {name[:20]} - {err[:50]}")

        time.sleep(0.3)  # 限速

    print()
    print(f"✅ 完成：成功 {success} 失败 {fail}")


if __name__ == "__main__":
    main()
