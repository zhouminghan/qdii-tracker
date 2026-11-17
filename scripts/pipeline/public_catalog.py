#!/usr/bin/env python3
"""生成前端公共基金目录契约 web/data/catalog.json。

输入：
  - web/data/meta.json
  - web/data/{CATEGORIES}.json
  - config/funds.json（公司品牌色/字母）

输出：
  - web/data/catalog.json

契约版本为 1。输出包含 generated_at、source、status、data、quality，前端只读取
此 envelope，不直接猜测各分类文件的字段状态。本模块纯离线，不修改原始分类数据。
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

from core.constants import CATEGORIES, CONFIG_DIR, DATA_DIR

CATALOG_SCHEMA_VERSION = 1
CATALOG_FILENAME = "catalog.json"
LIMIT_SCOPE_FILE = "limit-scopes.json"
LIMIT_SCOPE_VALUES = ("share", "series_shared", "unknown")
LIMIT_SCOPE_FIELDS = (
    "limit_scope",
    "limit_group_id",
    "limit_currency",
    "limit_source",
    "limit_source_url",
    "limit_effective_date",
    "limit_expires_at",
    "limit_verified_at",
    "limit_confidence",
    "limit_status",
)


def _read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as fp:
        value = json.load(fp)
    return value if isinstance(value, dict) else {}


def _load_brand_config() -> dict[str, Any]:
    path = CONFIG_DIR / "funds.json"
    if not path.exists():
        return {}
    return _read_json(path).get("company_brand", {})


def _load_limit_scope_config() -> dict[str, Any]:
    path = CONFIG_DIR / LIMIT_SCOPE_FILE
    if not path.exists():
        return {"entries": []}
    try:
        return _read_json(path)
    except (OSError, json.JSONDecodeError, ValueError):
        return {"entries": []}


def _limit_scope_overrides(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """把人工核验配置展开为 share_code -> entry。"""
    overrides: dict[str, dict[str, Any]] = {}
    entries = config.get("entries") if isinstance(config, dict) else []
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        for code in entry.get("share_codes") or []:
            if code:
                overrides[str(code)] = entry
    return overrides


def _apply_limit_scope(
    share: dict[str, Any],
    series: dict[str, Any],
    overrides: dict[str, dict[str, Any]],
    warnings: list[str],
    reference_date: date,
) -> str | None:
    """给份额补充额度适用范围；没有可靠公告时保持 unknown。"""
    code = str(share.get("code") or "")
    entry = overrides.get(code)
    daily_limit = share.get("daily_limit")
    has_limit = isinstance(daily_limit, (int, float)) and daily_limit > 0

    if entry:
        expected_series = entry.get("series_id")
        if expected_series and expected_series != series.get("series_id"):
            warnings.append(f"{code}: 额度核验记录的 series_id 与当前系列不一致")
        scope = entry.get("limit_scope")
        if scope not in LIMIT_SCOPE_VALUES:
            scope = "unknown"
            warnings.append(f"{code}: 额度核验记录的 limit_scope 无效，已降级为 unknown")
        for field in LIMIT_SCOPE_FIELDS:
            if field in entry:
                share[field] = entry[field]
        expires_at = entry.get("limit_expires_at")
        if expires_at:
            try:
                expired = date.fromisoformat(str(expires_at)[:10]) < reference_date
            except ValueError:
                expired = True
                warnings.append(f"{code}: 额度核验记录的 limit_expires_at 无效，按失效处理")
            if expired:
                share["limit_scope"] = "unknown"
                share["limit_status"] = "expired"
                warnings.append(f"{code}: 额度核验记录已失效，等待新公告复核")
                return None
        share["limit_scope"] = scope
        share["limit_status"] = entry.get("limit_status") or "active"
        share["limit_currency"] = entry.get("limit_currency") or share.get("currency")
        return scope if has_limit else None

    share["limit_scope"] = "share" if has_limit and len(series.get("shares") or []) == 1 else "unknown"
    share["limit_status"] = "unverified" if has_limit else "unknown"
    share["limit_currency"] = share.get("currency")
    return share["limit_scope"] if has_limit else None


def _date_age_days(value: str | None, reference: date) -> int | None:
    if not value:
        return None
    try:
        parsed = date.fromisoformat(value[:10])
    except ValueError:
        return None
    return max(0, (reference - parsed).days)


def build_catalog(
    data_dir: Path = DATA_DIR,
    config: dict[str, Any] | None = None,
    generated_at: str | None = None,
    limit_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """读取现有分类 JSON 并返回带质量信息的公共目录 envelope。"""
    meta = _read_json(data_dir / "meta.json") if (data_dir / "meta.json").exists() else {}
    generated_at = generated_at or meta.get("generated_at") or datetime.now().astimezone().isoformat()
    reference_date = datetime.fromisoformat(generated_at.replace("Z", "+00:00")).date()
    brand_config = (config or _load_brand_config()).get("company_brand", {})
    limit_overrides = _limit_scope_overrides(limit_config if limit_config is not None else _load_limit_scope_config())

    categories: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    errors: list[str] = []
    total_series = 0
    total_shares = 0
    missing_nav = 0
    expected_no_nav = 0
    stale_nav = 0
    limit_scope_counts = {value: 0 for value in LIMIT_SCOPE_VALUES}
    newest_nav_date: str | None = None

    for category in CATEGORIES:
        path = data_dir / f"{category}.json"
        if not path.exists():
            errors.append(f"缺少分类文件: {path.name}")
            categories[category] = {"label": category, "series": [], "count": 0}
            continue

        payload = _read_json(path)
        series = payload.get("series", [])
        if not isinstance(series, list):
            errors.append(f"{path.name}: series 不是数组")
            series = []

        category_missing_nav = 0
        category_expected_no_nav = 0
        category_stale_nav = 0
        for item in series:
            shares = item.get("shares", [])
            if not isinstance(shares, list):
                shares = []
            total_shares += len(shares)
            for share in shares:
                scope = _apply_limit_scope(share, item, limit_overrides, warnings, reference_date)
                if scope:
                    limit_scope_counts[scope] += 1
                is_etf = category == "etf"
                price = share.get("etf_price") if is_etf else share.get("nav")
                if price is None:
                    if "封闭" in str(share.get("buy_status") or ""):
                        category_expected_no_nav += 1
                    else:
                        category_missing_nav += 1
                nav_date = share.get("nav_date")
                if nav_date and (newest_nav_date is None or nav_date > newest_nav_date):
                    newest_nav_date = nav_date
                age = _date_age_days(nav_date, reference_date)
                if age is not None and age > 7:
                    category_stale_nav += 1

        total_series += len(series)
        missing_nav += category_missing_nav
        expected_no_nav += category_expected_no_nav
        stale_nav += category_stale_nav
        if category_missing_nav:
            warnings.append(f"{category}: {category_missing_nav} 个份额缺少可用价格")
        if category_stale_nav:
            warnings.append(f"{category}: {category_stale_nav} 个份额净值超过 7 天")
        categories[category] = {
            "label": category,
            "count": len(series),
            "share_count": sum(len(item.get("shares", [])) for item in series),
            "series": series,
        }

    if not total_series:
        errors.append("目录没有任何基金系列")

    status = "error" if errors else ("degraded" if warnings else "ok")
    catalog = {
        "schema_version": CATALOG_SCHEMA_VERSION,
        "generated_at": generated_at,
        "source": "web/data/{sp500,nasdaq_passive,active,global_index,global_other,etf}.json",
        "status": status,
        "data": {
            "categories": categories,
            "summary": {
                "series_count": total_series,
                "share_count": total_shares,
                "category_count": len(categories),
                "newest_nav_date": newest_nav_date,
            },
            "company_brands": brand_config,
        },
        "quality": {
            "status": status,
            "checked_at": datetime.now().astimezone().isoformat(),
            "missing_nav": missing_nav,
            "expected_no_nav": expected_no_nav,
            "stale_nav": stale_nav,
            "limit_scope": limit_scope_counts,
            "warnings": warnings,
            "errors": errors,
        },
    }
    return catalog


def write_catalog(output: Path = DATA_DIR / CATALOG_FILENAME) -> dict[str, Any]:
    catalog = build_catalog()
    output.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return catalog


def main() -> None:
    catalog = write_catalog()
    summary = catalog["data"]["summary"]
    print(
        "✅ 公共目录已生成："
        f"{summary['series_count']} 个系列 / {summary['share_count']} 个份额，"
        f"质量状态 {catalog['status']}"
    )
    for warning in catalog["quality"]["warnings"]:
        print(f"  ⚠ {warning}")


if __name__ == "__main__":
    main()
