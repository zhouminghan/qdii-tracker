"""nasdaq_history 纯计算逻辑单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from pipeline.nasdaq_history import (
    annual_stats,
    build_heatmap,
    build_summary,
    monthly_returns,
    rank_months,
    trough_histogram,
)


def _series(years):
    """按年份生成 1~12 月的月线收盘价（每月 +10，跨年不重置）。"""
    points = []
    close = 100.0
    for y in years:
        for m in range(1, 13):
            close += 10.0
            points.append((y, m, close))
    return points


def test_monthly_returns_basic():
    monthly = [(2019, 12, 90), (2020, 1, 100), (2020, 2, 110), (2020, 3, 99)]
    r = monthly_returns(monthly)
    assert round(r[(2020, 1)], 4) == round((100 / 90 - 1) * 100, 4)
    assert round(r[(2020, 2)], 4) == round((110 / 100 - 1) * 100, 4)
    assert round(r[(2020, 3)], 4) == round((99 / 110 - 1) * 100, 4)


def test_annual_stats_drawdown_and_return():
    # 2020 年内：100 -> 120 -> 90 -> 110，最大回撤 120->90 = -25%
    monthly = [(2019, 12, 80)]
    monthly += [(2020, 1, 100), (2020, 2, 120), (2020, 3, 90), (2020, 4, 110)]
    annual = annual_stats(monthly, start_year=2020)
    assert len(annual) == 1
    a = annual[0]
    assert a["year"] == 2020
    assert a["max_drawdown_pct"] == -25.0
    assert a["peak_month"] == 2
    assert a["trough_month"] == 3
    assert a["close"] == 110.0
    assert a["return_pct"] == 37.5  # 110 / 80 - 1


def test_trough_histogram_counts():
    annual = [
        {"year": 2020, "trough_month": 10},
        {"year": 2021, "trough_month": 10},
        {"year": 2022, "trough_month": 8},
    ]
    hist = trough_histogram(annual)
    by_month = {h["month"]: h["count"] for h in hist}
    assert by_month[10] == 2
    assert by_month[8] == 1
    assert sum(by_month.values()) == 3


def test_build_heatmap_filters_start_year():
    r = {(1996, 1): 1.0, (1997, 1): 2.0, (1998, 2): 3.0}
    hm = build_heatmap(r, start_year=1997)
    assert hm["years"] == [1997, 1998]
    assert len(hm["rows"]) == 2
    assert hm["rows"][0][0] == 2.0
    assert hm["rows"][1][1] == 3.0
    assert hm["rows"][1][0] is None


def test_rank_months_descending_with_empty_tail():
    r = {
        (2021, 1): 1.0, (2021, 2): -1.0, (2021, 3): 2.0,
        (2022, 1): 3.0, (2022, 2): 1.0, (2022, 3): 0.0,
    }
    ranking = rank_months(r, {2021, 2022})
    # 1月均值 2.0，3月均值 1.0，2月均值 0.0；其余月份无数据排最后
    assert [x["month"] for x in ranking[:3]] == [1, 3, 2]
    assert ranking[0]["avg_pct"] == 2.0
    assert ranking[0]["positive_ratio"] == 100.0
    assert all(x["avg_pct"] is None for x in ranking[3:])


def test_build_summary_consistent_across_windows():
    def month_rank(m, avg):
        return {"month": m, "avg_pct": avg, "positive_ratio": 50.0, "n": 5}

    ranking = {
        "5y": [month_rank(11, 3.0), month_rank(10, 2.0), month_rank(9, -2.0)],
        "10y": [month_rank(11, 2.5), month_rank(10, 1.5), month_rank(9, -1.5)],
        "full": [month_rank(11, 2.0), month_rank(10, 1.0), month_rank(9, -1.0)],
    }
    s = build_summary(ranking)
    assert s["best_month"] == 11
    assert s["worst_month"] == 9
    assert "11月 三组口径均最强" in s["text"]
    assert "9月 三组口径均垫底" in s["text"]


def test_series_length_and_monotonicity():
    monthly = _series([1999, 2000, 2001])
    assert len(monthly) == 36
    assert monthly[0] == (1999, 1, 110.0)
    assert monthly[-1] == (2001, 12, 460.0)
