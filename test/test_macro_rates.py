"""宏观利率解析单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from pipeline.macro_rates import parse_fred_series, parse_treasury_csv

TREASURY_SAMPLE = (
    'Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr",'
    '"5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"\n'
    '11/13/2026,4.10,4.18,4.26,4.32,4.34,4.42,4.65,4.88,4.92,4.98,5.05,5.15,5.52,5.47\n'
    '11/12/2026,4.12,4.18,4.26,4.32,4.35,4.42,4.65,4.86,4.90,4.95,5.02,5.10,5.48,5.43\n'
)

FRED_SAMPLE = "DATE,DGS10\n2026-11-11,\n2026-11-12,5.10\n"


def test_parses_official_treasury_csv():
    treasury = parse_treasury_csv(TREASURY_SAMPLE)
    assert treasury == {"date": "2026-11-13", "y2": 4.88, "y10": 5.15, "y30": 5.47}


def test_parses_fred_series_with_missing_points():
    assert parse_fred_series(FRED_SAMPLE) == [
        ("2026-11-11", None),
        ("2026-11-12", 5.10),
    ]


def test_returns_none_when_treasury_columns_missing():
    assert parse_treasury_csv("Date,1 Mo\n11/13/2026,4.10\n") is None
