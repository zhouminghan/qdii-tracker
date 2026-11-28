"""market_snapshot 黄金折算纯逻辑单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

import pipeline.market_snapshot as ms
from core.constants import OZ_TO_GRAM


def _quote(price: float) -> dict:
    return {"price": float(price), "as_of": "2026-11-27", "source": "test", "derived": False}


def test_build_gold_computes_conversion_and_premium(monkeypatch):
    fx = {"items": {"usdcnh": _quote(6.6)}}
    spot = {"au9999": {"price": 850.0}, "xau": {"price": 4000.0}}

    monkeypatch.setattr(ms, "_read_json", lambda path: spot)
    monkeypatch.setattr(ms, "_series", lambda path: {"points": [], "updated_at": None})
    monkeypatch.setattr(ms, "_live_quote", lambda item, fallback=None: _quote(item["price"]) if item else None)

    gold = ms._build_gold(fx)
    converted = 4000.0 * 6.6 / OZ_TO_GRAM

    assert gold["xau"]["price"] == 4000.0
    assert gold["converted_cny_per_gram"]["value"] == round(converted, 6)
    assert gold["premium_cny"]["value"] == round(850.0 - converted, 6)
    assert gold["premium_pct"]["value"] == round((850.0 - converted) / converted * 100, 6)
    assert gold["converted_cny_per_gram"]["derived"] is True


def test_round_and_scalar_precision():
    assert ms._round(1.23456789) == 1.234568
    scalar = ms._scalar(1.23456789, "2026-11-27", "test", True)
    assert scalar["value"] == 1.234568
    assert scalar["as_of"] == "2026-11-27"
    assert scalar["derived"] is True
