"""
scripts/pipeline/sparklines.py — 生成行内迷你走势数据

为每只基金（default share）抓取 pingzhongdata 的历史净值序列，
裁剪最近 N 个点，写入 web/data/sparklines.json，供前端表格行内 sparkline 使用。

纯逻辑（trim_series）可单测；网络抓取在 sync（全量）时执行。
"""
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

from core.constants import DATA_DIR, CATEGORIES, ROOT_DIR
from core.utils import read_json, write_json, beijing_now_iso
from sources.eastmoney_source import fetch_pzd_history

MAX_WORKERS = 4
SPARKLINE_POINTS = 30


def trim_series(points, n=SPARKLINE_POINTS):
    """裁剪历史净值序列到最近 n 个点（保持输入顺序，取末尾 n 个）。"""
    if not points:
        return []
    return points[-n:]


def collect_default_codes():
    codes = []
    for cat in CATEGORIES:
        fp = DATA_DIR / f"{cat}.json"
        if not fp.exists():
            continue
        data = read_json(fp)
        for series in data.get("series", []):
            code = series.get("default_share_code")
            if not code:
                shares = series.get("shares") or []
                if shares:
                    code = shares[0].get("code")
            if code:
                codes.append(str(code))
    return sorted(set(codes))


def build_sparkline_payload(codes):
    payload = {}
    if not codes:
        return payload
    # 简单限流：4 线程并发，避免打爆天天基金
    import threading
    sem = threading.BoundedSemaphore(MAX_WORKERS)
    lock = threading.Lock()

    def worker(code):
        with sem:
            points = fetch_pzd_history(code)
        if points:
            navs = [p["nav"] for p in trim_series(points)]
            if navs:
                with lock:
                    payload[code] = navs

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = [ex.submit(worker, c) for c in codes]
        for i, f in enumerate(as_completed(futures), 1):
            try:
                f.result()
            except Exception:
                pass
            if i % 50 == 0:
                print(f"  sparkline 进度: {i}/{len(codes)}")
    return payload


def main():
    codes = collect_default_codes()
    fp = DATA_DIR / "sparklines.json"
    existing = read_json(fp).get("sparklines", {}) if fp.exists() else {}
    # 优先补缺失的基金，再刷新已有基金，保证限流下也能逐步收敛到全量
    missing = [c for c in codes if c not in existing]
    ordered = missing + [c for c in codes if c in existing]
    print(f"🎯 sparkline: {len(codes)} 只基金（缺 {len(missing)}）")
    payload = build_sparkline_payload(ordered)
    merged = dict(existing)
    merged.update(payload)
    out = {
        "generated_at": beijing_now_iso(),
        "points": SPARKLINE_POINTS,
        "sparklines": merged,
    }
    write_json(fp, out)
    print(f"✅ sparklines.json 已生成：本次 {len(payload)}/{len(codes)} 只，累计 {len(merged)} 只")


if __name__ == "__main__":
    main()
