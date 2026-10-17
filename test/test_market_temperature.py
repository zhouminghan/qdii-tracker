"""market_temperature 纯评分逻辑单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from pipeline.market_temperature import (
    score_piecewise,
    score_nasdaq_trend,
    compute_scores,
    weighted_score,
    band_of,
    WEIGHTS,
)


def test_score_piecewise_lower_is_better():
    anchors = [(15, 85), (20, 70), (25, 55), (30, 40), (40, 25), (100, 10)]
    assert score_piecewise(14, anchors) == 85
    assert score_piecewise(20, anchors) == 70
    assert score_piecewise(40, anchors) == 25
    assert score_piecewise(41, anchors) == 10


def test_score_piecewise_higher_is_better():
    anchors = [(0, 10), (50, 60), (100, 90)]
    assert score_piecewise(100, anchors, lower_is_better=False) == 90
    assert score_piecewise(50, anchors, lower_is_better=False) == 60
    assert score_piecewise(49, anchors, lower_is_better=False) == 10


def test_score_nasdaq_trend_linear_and_clipped():
    assert score_nasdaq_trend(0) == 50
    assert score_nasdaq_trend(10) == 100
    assert score_nasdaq_trend(-10) == 0
    assert score_nasdaq_trend(100) == 100
    assert score_nasdaq_trend(-100) == 0


def test_weighted_score_matches_spec_example():
    scores = {
        "nasdaq_trend": {"score": 75},
        "vix": {"score": 64},
        "treasury_10y": {"score": 73},
        "dxy": {"score": 49},
    }
    assert weighted_score(scores) == 67
    assert sum(WEIGHTS.values()) == 1.0


def test_band_boundaries():
    assert band_of(39)[0] == "red"
    assert band_of(40)[0] == "yellow"
    assert band_of(70)[0] == "yellow"
    assert band_of(71)[0] == "green"
    assert band_of(100)[0] == "green"


def test_compute_scores_shapes_and_labels():
    raw = {
        "nasdaq_trend": {"pct_above_ma": 7.0},
        "vix": {"value": 16.0},
        "treasury_10y": {"value": 5.1},
        "dxy": {"value": 101.8},
    }
    scores = compute_scores(raw)
    assert set(scores) == set(WEIGHTS)
    for key in WEIGHTS:
        assert "score" in scores[key]
        assert "label" in scores[key]
    assert scores["nasdaq_trend"]["score"] == 85
    assert scores["treasury_10y"]["label"] == "利率压制"


def test_compute_scores_missing_raw():
    scores = compute_scores({})
    for key in WEIGHTS:
        assert scores[key]["score"] is None
        assert scores[key]["label"] == "暂无数据"
