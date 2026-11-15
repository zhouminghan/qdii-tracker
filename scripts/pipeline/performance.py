#!/usr/bin/env python3
"""从历史净值补算基金缺失区间收益。

仅填充当前为空的字段，不覆盖数据源已经给出的值。默认优先读取本地
web/data/nav-history/{code}.json，缺失时再抓公开 pingzhongdata 历史。
"""
from __future__ import annotations

import argparse
import json
from bisect import bisect_right
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from core.constants import CATEGORIES, DATA_DIR
from core.utils import beijing_now_iso, read_json, write_json
from sources.eastmoney_source import fetch_pzd_history

PERIOD_DAYS = {
    "chg_1w": 7,
    "chg_1m": 30,
    "chg_3m": 90,
    "chg_6m": 180,
    "chg_1y": 365,
    "chg_2y": 730,
    "chg_3y": 1095,
}
MAX_WORKERS = 4


def _returns_at(dates: list[str], navs: list[float], calendar_days: int) -> float | None:
    if len(dates) < 2 or len(dates) != len(navs):
        return None
    try:
        target = (date.fromisoformat(dates[-1]) - timedelta(days=calendar_days)).isoformat()
    except ValueError:
        return None
    base_index = bisect_right(dates, target) - 1
    if base_index < 0:
        return None
    latest = navs[-1]
    base = navs[base_index]
    if not base or base <= 0 or latest is None:
        return None
    return round((latest / base - 1) * 100, 2)


def compute_period_returns(dates: list[str], navs: list[float]) -> dict[str, float | None]:
    """按日历区间查找最近可用净值并计算区间收益。"""
    return {key: _returns_at(dates, navs, offset) for key, offset in PERIOD_DAYS.items()}


def compute_ytd(dates: list[str], navs: list[float]) -> float | None:
    """以上一年最后一个净值为基准计算今年来收益。"""
    if not dates or not navs:
        return None
    latest_year = dates[-1][:4]
    base_index = None
    for index, value in enumerate(dates):
        if value[:4] < latest_year:
            base_index = index
    if base_index is None:
        return None
    base = navs[base_index]
    latest = navs[-1]
    if not base or base <= 0 or latest is None:
        return None
    return round((latest / base - 1) * 100, 2)


def compute_since_inception(dates: list[str], navs: list[float]) -> float | None:
    """按首个可用净值计算成立来收益。"""
    if not dates or not navs or not navs[0] or navs[0] <= 0:
        return None
    return round((navs[-1] / navs[0] - 1) * 100, 2)


def missing_metrics(share: dict[str, Any]) -> list[str]:
    keys = list(PERIOD_DAYS) + ["chg_ytd", "chg_since_inception"]
    return [key for key in keys if share.get(key) is None]


def _load_local_history(code: str, data_dir: Path) -> dict[str, Any] | None:
    path = data_dir / "nav-history" / f"{code}.json"
    return read_json(path) if path.exists() else None


def _history_points(history: dict[str, Any] | None) -> tuple[list[str], list[float]]:
    if not history:
        return [], []
    raw_dates = history.get("dates") or []
    raw_navs = history.get("navs") or history.get("close") or []
    points = [
        (str(day), float(nav))
        for day, nav in zip(raw_dates, raw_navs)
        if day and nav is not None
    ]
    points.sort(key=lambda item: item[0])
    return [item[0] for item in points], [item[1] for item in points]


def _fetch_history(code: str) -> dict[str, Any] | None:
    points = fetch_pzd_history(code)
    if not points:
        return None
    return {
        "dates": [point["date"] for point in points],
        "navs": [point["nav"] for point in points],
    }


def _scope_files(scope: str) -> list[str]:
    if scope == "otc":
        return [category for category in CATEGORIES if category != "etf"]
    if scope == "etf":
        return ["etf"]
    return list(CATEGORIES)


def supplement(
    data_dir: Path = DATA_DIR,
    scope: str = "all",
    codes: set[str] | None = None,
    fetch_missing: bool = True,
) -> dict[str, int]:
    """补算所有可计算但缺失的区间收益，返回统计。"""
    category_data = {
        category: read_json(data_dir / f"{category}.json")
        for category in _scope_files(scope)
        if (data_dir / f"{category}.json").exists()
    }
    required_codes: set[str] = set()
    for data in category_data.values():
        for series in data.get("series", []):
            for share in series.get("shares", []):
                code = str(share.get("code") or "")
                status = str(share.get("buy_status") or "")
                has_price = share.get("nav") is not None or share.get("etf_price") is not None
                if (
                    code
                    and has_price
                    and "封闭" not in status
                    and missing_metrics(share)
                    and (not codes or code in codes)
                ):
                    required_codes.add(code)

    histories: dict[str, dict[str, Any] | None] = {}
    fetch_codes: list[str] = []
    for code in sorted(required_codes):
        local = _load_local_history(code, data_dir)
        if local:
            histories[code] = local
        elif fetch_missing:
            fetch_codes.append(code)

    if fetch_codes:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {executor.submit(_fetch_history, code): code for code in fetch_codes}
            for future in as_completed(futures):
                code = futures[future]
                try:
                    histories[code] = future.result()
                except Exception:
                    histories[code] = None

    stats = {"shares": 0, "metrics": 0, "files": 0, "no_history": 0}
    for category, data in category_data.items():
        changed = False
        for series in data.get("series", []):
            for share in series.get("shares", []):
                code = str(share.get("code") or "")
                if not missing_metrics(share):
                    continue
                dates, navs = _history_points(histories.get(code))
                if not dates:
                    if not codes or code in codes:
                        stats["no_history"] += 1
                    continue
                derived = compute_period_returns(dates, navs)
                derived["chg_ytd"] = compute_ytd(dates, navs)
                derived["chg_since_inception"] = compute_since_inception(dates, navs)
                filled = 0
                for key, value in derived.items():
                    if share.get(key) is None and value is not None:
                        share[key] = value
                        filled += 1
                if filled:
                    stats["shares"] += 1
                    stats["metrics"] += filled
                    changed = True
        if changed:
            write_json(data_dir / f"{category}.json", data)
            stats["files"] += 1

    if stats["files"]:
        meta_path = data_dir / "meta.json"
        if meta_path.exists():
            meta = read_json(meta_path)
            meta["generated_at"] = beijing_now_iso()
            write_json(meta_path, meta)
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="补算基金缺失区间收益")
    parser.add_argument("--scope", choices=["all", "otc", "etf"], default="all")
    parser.add_argument("--codes", help="逗号分隔的基金代码")
    parser.add_argument("--offline", action="store_true", help="只使用本地 nav-history")
    args = parser.parse_args()
    codes = {code.strip() for code in args.codes.split(",") if code.strip()} if args.codes else None
    stats = supplement(scope=args.scope, codes=codes, fetch_missing=not args.offline)
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == "__main__":
    main()
