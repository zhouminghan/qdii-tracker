"""
轻量申购状态刷新：仅拉取申购状态/限额 + 涨跌幅（批量接口，快）
不调用逐只雪球接口，适合高频增量更新。
"""
import json
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


def main():
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "web" / "data"

    # 1. 批量拉取申购数据（全量，秒级）
    print("🔍 拉取全量申购状态/限额...")
    purchase_df = ak.fund_purchase_em()
    print(f"  ✅ {len(purchase_df)} 条")
    purchase_map = {}
    for _, row in purchase_df.iterrows():
        code = str(row["基金代码"]).strip()
        limit = _to_float(row.get("日累计限定金额"))
        purchase_map[code] = {
            "buy_status": str(row.get("申购状态", "") or "").strip(),
            "sell_status": str(row.get("赎回状态", "") or "").strip(),
            "buy_min": _to_float(row.get("购买起点")),
            "daily_limit": limit,
            "fee": str(row.get("手续费", "") or "").strip(),
        }

    # 2. 批量拉取涨跌幅数据（全量，秒级）
    print("🔍 拉取全量涨跌幅排名...")
    rank_df = ak.fund_open_fund_rank_em(symbol="全部")
    print(f"  ✅ {len(rank_df)} 条")
    rank_map = {}
    for _, row in rank_df.iterrows():
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

    # 3. 合并到现有 JSON 文件
    for cat in ["sp500", "nasdaq_passive", "active", "global_other", "etf"]:
        fp = data_dir / f"{cat}.json"
        if not fp.exists():
            continue
        with open(fp, encoding="utf-8") as f:
            data = json.load(f)
        updated = 0
        for series in data["series"]:
            for share in series["shares"]:
                code = share["code"]
                # 申购数据
                if code in purchase_map:
                    share.update(purchase_map[code])
                    updated += 1
                # 涨跌幅数据
                if code in rank_map:
                    # 只更新涨跌幅相关字段，不覆盖 scale/manager 等
                    for k, v in rank_map[code].items():
                        if v is not None:
                            share[k] = v
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  💾 {cat}.json  更新 {updated} 只份额的申购状态 + 涨跌幅")

    # 4. 更新 meta
    meta_fp = data_dir / "meta.json"
    if meta_fp.exists():
        with open(meta_fp, encoding="utf-8") as f:
            meta = json.load(f)
        meta["purchase_refreshed_at"] = datetime.now().isoformat()
        with open(meta_fp, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

    print("\n✅ 申购状态 + 涨跌幅刷新完成！")


if __name__ == "__main__":
    main()
