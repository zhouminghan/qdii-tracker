"""gold 黄金折算与溢价逻辑单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from core.gold import gold_cny_per_gram, gold_panel, gold_premium, OZ_TO_GRAM


def test_conversion_matches_whitepaper_formula():
    # 用示例：4000 美元/盎司 × 6.6 / 31.1034768 ≈ 848.84
    r = gold_cny_per_gram(4000, 6.6)
    assert r == round(4000 * 6.6 / OZ_TO_GRAM, 2)


def test_premium_positive_and_negative():
    p = gold_premium(850, 848.84)
    assert p["premium_cny"] == 1.16
    assert p["premium_pct"] == round(1.16 / 848.84 * 100, 3)

    n = gold_premium(840, 848.84)
    assert n["premium_cny"] == -8.84
    assert n["premium_pct"] < 0


def test_premium_zero_converted_returns_none():
    r = gold_premium(850, 0)
    assert r["premium_cny"] is None
    assert r["premium_pct"] is None


def test_panel_tone():
    assert gold_panel(4000, 6.6, 848.84)["tone"] == "positive"
    assert gold_panel(4000, 6.6, 840)["tone"] == "negative"
    assert gold_panel(4000, 6.6, 900)["tone"] == "high"
