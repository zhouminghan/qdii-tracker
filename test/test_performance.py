"""历史净值收益补算测试。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from pipeline.performance import compute_period_returns, compute_ytd, missing_metrics


def test_computes_period_returns_by_calendar_range():
    dates = ["2023-01-01", "2023-12-31", "2024-01-01", "2024-06-01", "2024-12-25", "2025-01-01"]
    navs = [1.0, 1.2, 1.3, 1.4, 1.8, 2.0]
    result = compute_period_returns(dates, navs)
    assert result["chg_1w"] == round((2.0 / 1.8 - 1) * 100, 2)
    assert result["chg_1y"] == round((2.0 / 1.3 - 1) * 100, 2)
    assert result["chg_2y"] == round((2.0 / 1.0 - 1) * 100, 2)


def test_ytd_uses_last_nav_from_previous_year():
    assert compute_ytd(
        ["2024-12-30", "2024-12-31", "2025-01-02"],
        [1.0, 1.1, 1.21],
    ) == 10.0


def test_closed_share_has_all_metrics_missing():
    assert missing_metrics({"buy_status": "封闭期"}) == [
        "chg_1w",
        "chg_1m",
        "chg_3m",
        "chg_6m",
        "chg_1y",
        "chg_2y",
        "chg_3y",
        "chg_ytd",
        "chg_since_inception",
    ]
