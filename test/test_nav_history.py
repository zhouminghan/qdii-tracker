"""历史净值文件生成的纯逻辑单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from pipeline.nav_history import build_payload, merge_incremental


def test_merge_incremental_appends_newer_only():
    dates, navs = merge_incremental(["2026-01-01", "2026-01-02"], [1.0, 1.1], [
        {"date": "2026-01-02", "nav": 1.1},
        {"date": "2026-01-03", "nav": 1.2},
    ])
    assert dates == ["2026-01-01", "2026-01-02", "2026-01-03"]
    assert navs == [1.0, 1.1, 1.2]


def test_merge_incremental_empty_existing():
    dates, navs = merge_incremental([], [], [{"date": "2026-01-03", "nav": 1.2}])
    assert dates == ["2026-01-03"]
    assert navs == [1.2]


def test_merge_incremental_ignores_old_and_invalid():
    dates, navs = merge_incremental(["2026-01-03"], [1.2], [
        {"date": "2026-01-03", "nav": 9.9},
        {"date": "", "nav": 1.3},
        {"date": "2026-01-04", "nav": 1.21},
    ])
    assert dates == ["2026-01-03", "2026-01-04"]
    assert navs == [1.2, 1.21]


def test_build_payload_shape():
    payload = build_payload("270042", ["2026-01-03"], [1.2])
    assert payload["code"] == "270042"
    assert payload["dates"] == ["2026-01-03"]
    assert payload["navs"] == [1.2]
    assert "updated_at" in payload
