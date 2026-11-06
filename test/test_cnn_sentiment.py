"""cnn_sentiment 恐慌贪婪分档与组装逻辑单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from pipeline.cnn_sentiment import band_of, parse_payload


def test_band_boundaries():
    assert band_of(0)["key"] == "extreme_fear"
    assert band_of(24.9)["key"] == "extreme_fear"
    assert band_of(25)["key"] == "fear"
    assert band_of(45)["key"] == "neutral"
    assert band_of(55)["key"] == "greed"
    assert band_of(75)["key"] == "extreme_greed"
    assert band_of(100)["key"] == "extreme_greed"
    assert band_of(19.88)["label"] == "极度恐慌"


def test_parse_payload_fields():
    raw = {
        "fear_and_greed": {
            "score": 19.877551,
            "rating": "extreme fear",
            "timestamp": "2026-11-05T23:59:56+00:00",
            "previous_close": 27.2857,
            "previous_1_week": 30.7672,
            "previous_1_month": 43.0857,
            "previous_1_year": 23.0571,
        },
        "fear_and_greed_historical": {
            "data": [
                {"x": 1762387200000.0, "y": 24.3428, "rating": "extreme fear"},
                {"x": 1762473600000.0, "y": 20.4285, "rating": "extreme fear"},
            ],
        },
    }
    p = parse_payload(raw)
    assert p["score"] == 19.88
    assert p["band"] == "extreme_fear"
    assert p["label"] == "极度恐慌"
    assert p["previous"]["close"] == 27.29
    assert p["previous"]["year"] == 23.06
    assert len(p["history"]) == 2
    assert p["history"][0]["score"] == 24.34
    assert p["history"][0]["date"].count("-") == 2


def test_parse_payload_missing_score():
    assert parse_payload({"fear_and_greed": {}}) is None
