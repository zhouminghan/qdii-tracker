"""
scripts/pipeline/macro_rates.py — 宏观利率（美债 2/10/30 年收益率）

从东方财富（akshare bond_zh_us_rate）抓取美国国债 2/10/30 年收益率最新值，
写入 web/data/macro-rates.json，供「全球行情」Tab 的宏观利率区渲染。
"""
from core.constants import DATA_DIR
from core.utils import beijing_now_iso, read_json, write_json

OUTPUT_FP = DATA_DIR / "macro-rates.json"


def _to_float(v):
    try:
        f = float(v)
        return round(f, 2) if f == f else None
    except (TypeError, ValueError):
        return None


def fetch_treasury():
    import akshare as ak

    df = ak.bond_zh_us_rate(start_date="20250101")
    if df is None or len(df) == 0:
        return None
    row = df.iloc[-1]
    return {
        "date": str(row["日期"])[:10],
        "y2": _to_float(row.get("美国国债收益率2年")),
        "y10": _to_float(row.get("美国国债收益率10年")),
        "y30": _to_float(row.get("美国国债收益率30年")),
    }


def build():
    """抓取 + 组装；失败且无历史快照返回 None。"""
    try:
        treasury = fetch_treasury()
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠ 宏观利率抓取失败: {e}")
        treasury = None

    if treasury is None:
        prev = read_json(OUTPUT_FP) if OUTPUT_FP.exists() else {}
        if prev.get("treasury", {}).get("y10") is not None:
            print("  ⚠ 宏观利率：数据源失败，保留历史快照")
            return prev
        return None

    return {
        "generated_at": beijing_now_iso(),
        "schema_version": 1,
        "source": "东方财富/akshare",
        "treasury": treasury,
    }


def main():
    payload = build()
    if payload is None:
        print("❌ 宏观利率：数据源失败且无历史快照，跳过写入")
        raise SystemExit(1)
    write_json(OUTPUT_FP, payload)
    t = payload["treasury"]
    print(f"✅ 宏观利率：2y {t['y2']}% · 10y {t['y10']}% · 30y {t['y30']}%")


if __name__ == "__main__":
    main()
