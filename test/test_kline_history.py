"""指数 / ETF 日 K 管道的纯逻辑单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from pipeline.kline_history import build_payload, etf_secid, merge_points, points_from_payload


def test_merge_points_appends_newer_only():
    existing = [{"date": "2026-01-01", "open": 1, "high": 2, "low": 0.5, "close": 1.5, "volume": 10}]
    new = [
        {"date": "2026-01-01", "open": 9, "high": 9, "low": 9, "close": 9, "volume": 9},
        {"date": "2026-01-02", "open": 2, "high": 3, "low": 1, "close": 2.5, "volume": 20},
    ]
    out = merge_points(existing, new)
    assert [p["date"] for p in out] == ["2026-01-01", "2026-01-02"]
    assert out[0]["close"] == 1.5
    assert out[1]["close"] == 2.5


def test_points_from_payload_round_trip():
    points = [
        {"date": "2026-01-01", "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 10.0},
        {"date": "2026-01-02", "open": 1.5, "high": 2.5, "low": 1.0, "close": 2.0, "volume": 20.0},
    ]
    payload = build_payload("test", points)
    assert points_from_payload(payload) == points


def test_build_payload_shape():
    payload = build_payload("100.DJIA", [{
        "date": "2026-01-01", "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 10.0,
    }])
    assert payload["code"] == "100.DJIA"
    assert payload["dates"] == ["2026-01-01"]
    assert payload["open"] == [1.0]
    assert payload["high"] == [2.0]
    assert payload["low"] == [0.5]
    assert payload["close"] == [1.5]
    assert payload["volume"] == [10.0]
    assert "updated_at" in payload


def test_etf_secid_market_prefix():
    assert etf_secid("510300") == "1.510300"
    assert etf_secid("159941") == "0.159941"
