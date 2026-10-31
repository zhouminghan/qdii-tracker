"""
scripts/pipeline/nav_history.py — 生成基金历史净值文件

为每只默认份额生成 web/data/nav-history/{code}.json，扁平数组格式：
  {"code": "...", "updated_at": "...", "dates": ["YYYY-MM-DD", ...], "navs": [float, ...]}

- 全量（默认）：fetch_pzd_history 抓成立以来完整净值序列
- 增量（--incremental）：读现有文件，用 lsjz 抓最近 N 条，仅追加新日期
  （nav_date 永不回退；文件缺失时自动退回全量）

供前端走势弹窗离线查询与自建回测使用；merge_incremental / build_payload
为纯逻辑，可单测。
"""
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from core.constants import CATEGORIES, DATA_DIR
from core.utils import beijing_now_iso, read_json, write_json
from sources.eastmoney_source import fetch_lsjz_history, fetch_pzd_history

NAV_HISTORY_DIR = DATA_DIR / "nav-history"
INCREMENTAL_LOOKBACK = 10
MAX_WORKERS = 4


def collect_default_codes(scope="all"):
    """收集各分类 default share 代码（scope: all/otc/etf）。"""
    cats = CATEGORIES
    if scope == "otc":
        cats = [c for c in CATEGORIES if c != "etf"]
    elif scope == "etf":
        cats = ["etf"]

    codes = []
    for cat in cats:
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


def _code_path(code):
    return NAV_HISTORY_DIR / f"{code}.json"


def merge_incremental(dates, navs, new_points):
    """增量合并：只追加日期晚于现有最后日期的点，保持升序；返回 (dates, navs)。"""
    out_dates = list(dates) if dates else []
    out_navs = list(navs) if navs else []
    last = out_dates[-1] if out_dates else None
    for p in new_points or []:
        d = p.get("date")
        nav = p.get("nav")
        if not d or nav is None:
            continue
        if last is not None and d <= last:
            continue
        out_dates.append(d)
        out_navs.append(nav)
        last = d
    return out_dates, out_navs


def build_payload(code, dates, navs):
    """组装单只基金的历史净值文件内容。"""
    return {
        "code": str(code),
        "updated_at": beijing_now_iso(),
        "dates": dates,
        "navs": navs,
    }


def _write(code, dates, navs):
    NAV_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    write_json(_code_path(code), build_payload(code, dates, navs))


def _update_full(code):
    points = fetch_pzd_history(code)
    if not points:
        return None
    dates = [p["date"] for p in points]
    navs = [p["nav"] for p in points]
    _write(code, dates, navs)
    return len(dates)


def _update_incremental(code):
    fp = _code_path(code)
    existing = read_json(fp) if fp.exists() else None
    dates0 = (existing or {}).get("dates") or []
    navs0 = (existing or {}).get("navs") or []
    if not dates0:
        return _update_full(code)
    new_points = fetch_lsjz_history(code, limit=INCREMENTAL_LOOKBACK)
    if not new_points:
        return len(dates0)
    dates, navs = merge_incremental(dates0, navs0, new_points)
    if dates != dates0 or navs != navs0:
        _write(code, dates, navs)
    return len(dates)


def run(mode, codes):
    """并发生成/更新历史净值文件。mode: full|incremental。"""
    update = _update_incremental if mode == "incremental" else _update_full
    label = "增量" if mode == "incremental" else "全量"
    print(f"🎯 nav_history({label}): {len(codes)} 只基金")
    sem = threading.BoundedSemaphore(MAX_WORKERS)
    lock = threading.Lock()
    stats = {"ok": 0, "skip": 0}

    def worker(code):
        with sem:
            try:
                n = update(code)
            except Exception:
                n = None
        with lock:
            if n:
                stats["ok"] += 1
            else:
                stats["skip"] += 1

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = [ex.submit(worker, c) for c in codes]
        for i, _ in enumerate(as_completed(futures), 1):
            if i % 50 == 0:
                print(f"  nav_history 进度: {i}/{len(codes)}")
    print(f"✅ nav_history: 成功 {stats['ok']}，跳过/失败 {stats['skip']}")


def main():
    parser = argparse.ArgumentParser(description="生成基金历史净值文件")
    parser.add_argument("--incremental", action="store_true", help="增量模式：只追加新日期")
    parser.add_argument("--scope", choices=["all", "otc", "etf"], default="all", help="处理范围")
    parser.add_argument("--codes", help="逗号分隔的基金代码，只处理这些代码")
    args = parser.parse_args()

    if args.codes:
        codes = sorted(set(c.strip() for c in args.codes.split(",") if c.strip()))
    else:
        codes = collect_default_codes(args.scope)
    if not codes:
        print("🎯 nav_history: 无待处理基金")
        return
    run("incremental" if args.incremental else "full", codes)


if __name__ == "__main__":
    main()
