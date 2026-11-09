#!/usr/bin/env python3
"""
scripts/pipeline/market_snapshot.py — 生成首屏行情本地快照

纯离线读取 web/data/*.json、index-kline/、fx-kline/ 和溢价历史，写入
web/data/market-snapshot.json。报价取最近收盘或本地序列可推导值；没有本地
依据的字段保留 null，不联网，也不伪造实时行情。

由 scripts/checks/build_snapshot.py 调用；update-data.yml 的现有
`git add web/data/` 会把产物一起带上 Pages。
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.constants import DATA_DIR

OZ_TO_GRAM = 31.1034768
OUTPUT_FILE = DATA_DIR / "market-snapshot.json"

# 键与前端 market-cards 的 data-symbol 对齐；缺失文件会产出 null 报价。
INDEX_FILES = {
    "100.DJIA": "index-kline/100.DJIA.json",
    "100.SPX": "index-kline/100.SPX.json",
    "100.NDX": "index-kline/100.NDX.json",
    "100.NDX100": "index-kline/100.NDX100.json",
    "251.SOX": "index-kline/251.SOX.json",
    "sh000001": "index-kline/sh000001.json",
    "sh000300": "index-kline/sh000300.json",
    "sh000688": "index-kline/sh000688.json",
    "100.HSI": "index-kline/100.HSI.json",
    "124.HSTECH": "index-kline/124.HSTECH.json",
    "100.N225": "index-kline/100.N225.json",
    "100.KS11": "index-kline/100.KS11.json",
    "au9999": "index-kline/au9999.json",
}

BIG_TECH_FILES = {
    key: f"index-kline/{key}.json"
    for key in ("usAAPL", "usMSFT", "usNVDA", "usGOOG", "usAMZN", "usMETA", "usTSLA")
}

FX_DIRECT_FILES = {
    "usdcnh": "fx-kline/133.USDCNH.json",
    "fxUSDCNY": "fx-kline/fxUSDCNY.json",
    "fxUSDJPY": "fx-kline/fxUSDJPY.json",
    "fxCNYHKD": "fx-kline/fxCNYHKD.json",
}

OFFSHORE_CATEGORIES = ("sp500", "nasdaq_passive", "active", "global_index", "global_other")
_SERIES_CACHE: dict[Path, dict[str, Any]] = {}


def _read_json(path: Path) -> Any:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, ValueError):
        return None


def _finite(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _round(value: float) -> float:
    return round(value, 6)


def _empty_quote(source: str | None = None, derived: bool = False) -> dict[str, Any]:
    return {
        "price": None,
        "change": None,
        "change_pct": None,
        "as_of": None,
        "source_updated_at": None,
        "source": source,
        "derived": derived,
    }


def _empty_value(source: str | None = None) -> dict[str, Any]:
    return {"value": None, "as_of": None, "source": source, "derived": False}


def _series(path: Path) -> dict[str, Any]:
    """读取日 K 为 {date: close} 升序点列，忽略非有限值。"""
    if path in _SERIES_CACHE:
        return _SERIES_CACHE[path]
    payload = _read_json(path)
    by_date: dict[str, float] = {}
    if isinstance(payload, dict):
        dates = payload.get("dates") or []
        closes = payload.get("close") or []
        for raw_date, raw_close in zip(dates, closes):
            close = _finite(raw_close)
            if close is None or close <= 0 or not raw_date:
                continue
            by_date[str(raw_date)[:10]] = close
    result = {
        "points": sorted(by_date.items()),
        "updated_at": payload.get("updated_at") if isinstance(payload, dict) else None,
    }
    _SERIES_CACHE[path] = result
    return result


def _quote_from_points(
    points: list[tuple[str, float]],
    source: str | None,
    updated_at: Any = None,
    derived: bool = False,
    derived_from: list[str] | None = None,
) -> dict[str, Any]:
    quote = _empty_quote(source, derived)
    quote["source_updated_at"] = updated_at
    if derived:
        quote["derived_from"] = derived_from or []
    if not points:
        return quote

    date, price = points[-1]
    quote["price"] = _round(price)
    quote["as_of"] = date
    if len(points) >= 2:
        previous = points[-2][1]
        if previous > 0:
            quote["change"] = _round(price - previous)
            quote["change_pct"] = _round((price - previous) / previous * 100)
    return quote


def _quote_from_file(relative: str) -> dict[str, Any]:
    path = DATA_DIR / relative
    series = _series(path)
    return _quote_from_points(series["points"], relative, series["updated_at"])


def _derived_quote(
    terms: list[tuple[dict[str, Any], float, str]],
    source: str,
    multiplier: float = 1.0,
) -> dict[str, Any]:
    """按共同日期组合多个收盘序列；指数 -1 表示取倒数。"""
    if not terms or not all(series["points"] for series, _, _ in terms):
        return _empty_quote(source, True)
    maps = [dict(series["points"]) for series, _, _ in terms]
    common = set(maps[0])
    for item in maps[1:]:
        common &= set(item)
    points: list[tuple[str, float]] = []
    for date in sorted(common):
        value = multiplier
        for close_map, (_, exponent, _) in zip(maps, terms):
            close = close_map[date]
            if close <= 0:
                value = None
                break
            value *= close ** exponent
        if value is not None and math.isfinite(value) and value > 0:
            points.append((date, value))
    return _quote_from_points(
        points,
        source,
        derived=True,
        derived_from=[label for _, _, label in terms],
    )


def _latest_asof(values: Any) -> str | None:
    dates = []
    for item in values:
        if not isinstance(item, dict):
            continue
        date = item.get("as_of") or item.get("date") or item.get("generated_at")
        if date:
            dates.append(str(date)[:10])
    return max(dates) if dates else None


def _scalar(value: Any, as_of: Any, source: str | None, derived: bool = False) -> dict[str, Any]:
    number = _finite(value)
    return {
        "value": _round(number) if number is not None else None,
        "as_of": str(as_of)[:10] if as_of else None,
        "source": source,
        "derived": derived,
    }


def _quote_section(files: dict[str, str]) -> dict[str, Any]:
    items = {key: _quote_from_file(relative) for key, relative in files.items()}
    return {"as_of": _latest_asof(items.values()), "items": items}


def _build_fx() -> dict[str, Any]:
    items = {key: _quote_from_file(relative) for key, relative in FX_DIRECT_FILES.items()}
    usd_cny = _series(DATA_DIR / FX_DIRECT_FILES["fxUSDCNY"])
    cny_hkd = _series(DATA_DIR / FX_DIRECT_FILES["fxCNYHKD"])
    usd_jpy = _series(DATA_DIR / FX_DIRECT_FILES["fxUSDJPY"])

    items["fxUSDHKD"] = _derived_quote(
        [(usd_cny, 1.0, "fxUSDCNY"), (cny_hkd, 1.0, "fxCNYHKD")],
        "derived:fxUSDCNY*fxCNYHKD",
    )
    items["fxCNYJPY"] = _derived_quote(
        [(usd_jpy, 1.0, "fxUSDJPY"), (usd_cny, -1.0, "fxUSDCNY")],
        "derived:fxUSDJPY/fxUSDCNY",
    )
    items["fxHKDCNY"] = _derived_quote(
        [(cny_hkd, -1.0, "fxCNYHKD")],
        "derived:1/fxCNYHKD",
    )
    items["cnyusd"] = _derived_quote(
        [(usd_cny, -1.0, "fxUSDCNY")],
        "derived:1/fxUSDCNY",
    )
    items["hkdusd"] = _derived_quote(
        [(usd_cny, -1.0, "fxUSDCNY"), (cny_hkd, -1.0, "fxCNYHKD")],
        "derived:1/(fxUSDCNY*fxCNYHKD)",
    )
    return {"as_of": _latest_asof(items.values()), "items": items}


def _build_gold(fx: dict[str, Any]) -> dict[str, Any]:
    au = _quote_from_file(INDEX_FILES["au9999"])
    cnh = fx["items"]["usdcnh"]
    au_series = _series(DATA_DIR / INDEX_FILES["au9999"])
    cnh_series = _series(DATA_DIR / FX_DIRECT_FILES["usdcnh"])

    # 本地没有独立的伦敦金 / COMEX 日 K。伦敦金仅按上海金与 USDCNH 反推，
    # 并在前端标注为折算值；由该折算价再反推出的境内溢价恒为 0，故不计算。
    xau = _derived_quote(
        [(au_series, 1.0, "au9999"), (cnh_series, -1.0, "133.USDCNH")],
        "derived:au9999*31.1034768/USDCNH",
        OZ_TO_GRAM,
    )
    converted_value = None
    if xau["price"] is not None and cnh["price"] is not None:
        converted_value = xau["price"] * cnh["price"] / OZ_TO_GRAM
    converted = _scalar(converted_value, xau["as_of"], "derived:au9999/USDCNH", True)
    premium_cny = _empty_value("本地快照无独立伦敦金报价")
    premium_pct = _empty_value("本地快照无独立伦敦金报价")
    comex = _empty_quote("本地 K 线未收录 COMEX")
    return {
        "as_of": _latest_asof([au, cnh, xau]),
        "au9999": au,
        "comex": comex,
        "xau": xau,
        "usdcnh": cnh,
        "converted_cny_per_gram": converted,
        "premium_cny": premium_cny,
        "premium_pct": premium_pct,
    }


def _build_brand_gold() -> dict[str, Any]:
    payload = _read_json(DATA_DIR / "brand-gold.json") or {}
    generated_at = payload.get("generated_at") if isinstance(payload, dict) else None
    as_of = str(generated_at)[:10] if generated_at else None
    brands = []
    if isinstance(payload, dict):
        for brand in payload.get("brands") or []:
            if not isinstance(brand, dict):
                continue
            brands.append({
                "brand": brand.get("brand"),
                "ornament": _finite(brand.get("ornament")),
                "investment_bar": _finite(brand.get("investment_bar")),
                "as_of": as_of,
            })
    return {
        "generated_at": generated_at,
        "as_of": as_of,
        "source": payload.get("source") if isinstance(payload, dict) else None,
        "brands": brands,
    }


def _build_macro() -> tuple[dict[str, Any], dict[str, Any]]:
    temperature = _read_json(DATA_DIR / "market-temperature.json") or {}
    rates = _read_json(DATA_DIR / "macro-rates.json") or {}
    pe = _read_json(DATA_DIR / "ndx-pe.json") or {}
    indicators = temperature.get("indicators") or {} if isinstance(temperature, dict) else {}
    treasury = rates.get("treasury") or {} if isinstance(rates, dict) else {}

    def raw(key: str) -> dict[str, Any]:
        item = indicators.get(key) or {}
        return item.get("raw") or {} if isinstance(item, dict) else {}

    vix_raw = raw("vix")
    dxy_raw = raw("dxy")
    ndx_raw = raw("nasdaq_trend")
    treasury_date = treasury.get("date")
    macro = {
        "vix": _scalar(vix_raw.get("value"), vix_raw.get("date"), "market-temperature.json"),
        "dxy": _scalar(dxy_raw.get("value"), dxy_raw.get("date"), "market-temperature.json"),
        "treasury_2y": _scalar(treasury.get("y2"), treasury_date, "macro-rates.json"),
        "treasury_10y": _scalar(treasury.get("y10"), treasury_date, "macro-rates.json"),
        "treasury_30y": _scalar(treasury.get("y30"), treasury_date, "macro-rates.json"),
        "ndx_pe": _scalar(pe.get("pe"), pe.get("date"), "ndx-pe.json"),
        "nasdaq_trend": {
            "price": _finite(ndx_raw.get("price")),
            "ma200": _finite(ndx_raw.get("ma200")),
            "pct_above_ma": _finite(ndx_raw.get("pct_above_ma")),
            "as_of": ndx_raw.get("date"),
            "source": "market-temperature.json",
            "derived": False,
        },
    }
    scalar_values = [v for v in macro.values() if isinstance(v, dict)]
    macro["as_of"] = _latest_asof(scalar_values)

    temperature_snapshot = dict(temperature) if isinstance(temperature, dict) else {}
    temperature_snapshot["generated_at"] = temperature_snapshot.get("generated_at")
    temperature_snapshot["as_of"] = temperature_snapshot.get("generated_at")
    return macro, temperature_snapshot


def _default_share(series: dict[str, Any]) -> dict[str, Any] | None:
    shares = series.get("shares") or []
    default_code = series.get("default_share_code")
    return next((s for s in shares if isinstance(s, dict) and s.get("code") == default_code), None) or (
        shares[0] if shares and isinstance(shares[0], dict) else None
    )


def _build_offshore(generated_at: str | None) -> dict[str, Any]:
    items: dict[str, Any] = {}
    for category in OFFSHORE_CATEGORIES:
        payload = _read_json(DATA_DIR / f"{category}.json") or {}
        for series in payload.get("series") or []:
            if not isinstance(series, dict):
                continue
            share = _default_share(series)
            if not share or not share.get("code"):
                continue
            code = str(share["code"])
            items[code] = {
                "code": code,
                "name": series.get("display_name") or share.get("name"),
                "category": category,
                "nav": _finite(share.get("nav")),
                "daily_change": _finite(share.get("daily_change")),
                "nav_date": share.get("nav_date"),
                "as_of": share.get("nav_date"),
                "source": f"{category}.json",
            }
    return {
        "generated_at": generated_at,
        "as_of": _latest_asof(items.values()),
        "count": len(items),
        "items": items,
    }


def _build_etf_premium(generated_at: str | None) -> dict[str, Any]:
    payload = _read_json(DATA_DIR / "etf.json") or {}
    history = _read_json(DATA_DIR / "etf-premium-history.json") or {}
    premiums = history.get("premiums") or {} if isinstance(history, dict) else {}
    items: dict[str, Any] = {}
    for series in payload.get("series") or []:
        if not isinstance(series, dict):
            continue
        for share in series.get("shares") or []:
            if not isinstance(share, dict) or not share.get("code"):
                continue
            code = str(share["code"])
            rows = premiums.get(code) or []
            latest = next((row for row in reversed(rows) if isinstance(row, dict)), None) or {}
            price = _finite(share.get("etf_price")) or _finite(latest.get("close"))
            nav = _finite(share.get("nav")) or _finite(latest.get("nav"))
            premium = _finite(share.get("etf_premium")) or _finite(latest.get("premium"))
            premium_derived = False
            if premium is None and price is not None and nav is not None and nav > 0:
                premium = (price - nav) / nav * 100
                premium_derived = True
            items[code] = {
                "code": code,
                "name": series.get("display_name") or share.get("name"),
                "price": price,
                "change_pct": _finite(share.get("etf_change_pct")),
                "nav": nav,
                "premium": _round(premium) if premium is not None else None,
                "premium_derived": premium_derived,
                "price_as_of": share.get("nav_date"),
                "premium_as_of": latest.get("date"),
                "as_of": share.get("nav_date") or latest.get("date"),
                "source": "etf.json + etf-premium-history.json",
            }
    return {
        "generated_at": generated_at,
        "as_of": _latest_asof(items.values()),
        "count": len(items),
        "items": items,
    }


def collect_snapshot() -> dict[str, Any]:
    meta = _read_json(DATA_DIR / "meta.json") or {}
    generated_at = meta.get("generated_at") if isinstance(meta, dict) else None
    if not generated_at:
        generated_at = datetime.now(timezone.utc).isoformat()

    market_indices = _quote_section(INDEX_FILES)
    big_tech = _quote_section(BIG_TECH_FILES)
    fx = _build_fx()
    gold = _build_gold(fx)
    macro, temperature = _build_macro()
    return {
        "generated_at": generated_at,
        "schema_version": 1,
        "source": "local data files (offline close snapshot)",
        "market_indices": market_indices,
        "big_tech": big_tech,
        "fx": fx,
        "gold": gold,
        "brand_gold": _build_brand_gold(),
        "macro": macro,
        "temperature": temperature,
        "etf_premium": _build_etf_premium(generated_at),
        "offshore_live_nav": _build_offshore(generated_at),
    }


def build() -> dict[str, Any]:
    """生成并返回 market-snapshot.json；仅读写本地文件，不发起网络请求。"""
    snapshot = collect_snapshot()
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return snapshot


def main() -> None:
    snapshot = build()
    print(
        "✅ 首屏行情快照已生成："
        f"{len(snapshot['market_indices']['items'])} 个指数 / "
        f"{len(snapshot['big_tech']['items'])} 只科技股 / "
        f"{len(snapshot['fx']['items'])} 个汇率 / "
        f"{snapshot['etf_premium']['count']} 只 ETF"
    )


if __name__ == "__main__":
    main()
