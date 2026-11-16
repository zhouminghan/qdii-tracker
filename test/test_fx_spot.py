"""实时汇率快照解析单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from pipeline.fx_spot import parse_payload

SAMPLE = (
    'var hq_str_fx_susdcny="14:34:01,6.6696,6.6698,6.6726,34,6.6711,6.6724,6.6690,'
    '6.6696,在岸人民币,-0.0450,-0.0030,0.0034,此行情由新浪财经计算得出,0.0000,0.0000,,2026-11-16";\n'
    'var hq_str_fx_scnyhkd="14:36:26,1.1762,1.1764,1.175800,7.1,1.175800,1.176380,1.175670,'
    '1.1762,人民币兑港元即期汇率,0.04,0.0004,0.0006038,,1.180830,1.111340,,2026-11-16";\n'
)


def test_parses_sina_fx_payload():
    items = parse_payload(SAMPLE)
    assert items["fxUSDCNY"]["price"] == 6.6696
    assert items["fxUSDCNY"]["change_pct"] == -0.045
    assert items["fxUSDCNY"]["as_of"] == "2026-11-16"
    assert items["fxCNYHKD"]["price"] == 1.1762
    assert items["fxCNYHKD"]["source_updated_at"] == "2026-11-16T14:36:26+08:00"


def test_ignores_unknown_or_empty_symbols():
    assert parse_payload('var hq_str_fx_susdx="1,2";') == {}
    assert parse_payload('var hq_str_fx_susdcny="";') == {}
