"""
scripts/pipeline/ndx_pe.py — 纳指100 市盈率（PE）

从 Siblis Research 免费 API 抓取 NDX trailing PE 月末快照，取最新值，
写入 web/data/ndx-pe.json。免费档仅提供历史月末快照，非每日实时值。
"""
import requests

from core.constants import DATA_DIR
from core.utils import beijing_now_iso, read_json, write_json

URL = "https://siblisresearch.com/api/v1/NDX/pe-trailing"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
OUTPUT_FP = DATA_DIR / "ndx-pe.json"


def fetch_latest():
    r = requests.get(URL, timeout=20, headers=HEADERS)
    r.raise_for_status()
    payload = r.json()
    data = payload.get("data") or []
    if not data:
        return None
    last = data[-1]
    return {
        "pe": round(float(last["value"]), 2),
        "date": str(last["trading_day (EOD)"]),
        "frequency": payload.get("frequency"),
    }


def build():
    """抓取 + 组装；失败且无历史快照返回 None。"""
    try:
        latest = fetch_latest()
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠ 纳指 PE 抓取失败: {e}")
        latest = None

    if latest is None:
        prev = read_json(OUTPUT_FP) if OUTPUT_FP.exists() else {}
        if prev.get("pe") is not None:
            print("  ⚠ 纳指 PE：数据源失败，保留历史快照")
            return prev
        return None

    return {
        "generated_at": beijing_now_iso(),
        "schema_version": 1,
        "pe": latest["pe"],
        "date": latest["date"],
        "source": "Siblis Research",
        "note": "免费档为月末快照，非实时 PE。",
    }


def main():
    payload = build()
    if payload is None:
        print("❌ 纳指 PE：数据源失败且无历史快照，跳过写入")
        raise SystemExit(1)
    write_json(OUTPUT_FP, payload)
    print(f"✅ 纳指 PE：{payload['pe']}（{payload['date']}，Siblis）")


if __name__ == "__main__":
    main()
