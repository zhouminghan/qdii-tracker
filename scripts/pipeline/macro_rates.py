"""
scripts/pipeline/macro_rates.py — 宏观利率（美债 2/10/30 年收益率）

抓取链（官方财政部 → FRED → 东方财富）在 `sources/treasury_source.py`；
本模块负责组装输出并写入 web/data/macro-rates.json。
"""
from core.constants import DATA_DIR
from core.utils import beijing_now_iso, read_json, write_json
from sources.treasury_source import fetch_treasury

OUTPUT_FP = DATA_DIR / "macro-rates.json"


def build():
    """抓取 + 组装；失败且无历史快照返回 None。"""
    treasury, source = fetch_treasury()

    if treasury is None:
        prev = read_json(OUTPUT_FP) if OUTPUT_FP.exists() else {}
        if prev.get("treasury", {}).get("y10") is not None:
            print("  ⚠ 宏观利率：数据源失败，保留历史快照")
            return prev
        return None

    return {
        "generated_at": beijing_now_iso(),
        "schema_version": 1,
        "source": source or "东方财富/akshare",
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
