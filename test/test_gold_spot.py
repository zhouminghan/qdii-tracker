"""黄金实时快照解析单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from pipeline.gold_spot import parse_au9999, parse_xau

AU_SAMPLE = (
    'var quote_json = {"flag":true,"JO_71":{"code":"JO_71","time":1794811094000,'
    '"q64":837.55,"q70":-11.45,"q80":-1.367084,"unit":"元/克","showName":"黄金9999",'
    '"showCode":"Au9999"}};'
)
XAU_SAMPLE = (
    'var hq_str_hf_XAU="3844.83,3879.920,3844.83,3845.18,3901.15,3832.36,14:36:00,'
    '3879.92,3873.03,0,0,0,2026-11-16,伦敦金（现货黄金）";'
)


def test_parses_au9999_quote():
    quote = parse_au9999(AU_SAMPLE)
    assert quote["price"] == 837.55
    assert quote["change_pct"] == -1.367084
    assert quote["as_of"] == "2026-11-16"
    assert quote["source"] == "金投网 Au9999"
    assert quote["derived"] is False


def test_parses_london_spot_xau():
    quote = parse_xau(XAU_SAMPLE)
    assert quote["price"] == 3844.83
    assert round(quote["change_pct"], 3) == round((3844.83 - 3879.92) / 3879.92 * 100, 3)
    assert quote["as_of"] == "2026-11-16"
    assert quote["source"] == "新浪财经 hf_XAU"
    assert quote["derived"] is False


def test_rejects_invalid_gold_payloads():
    assert parse_au9999("not a quote") is None
    assert parse_au9999('var quote_json = {"JO_71":{"q64":0}};') is None
    assert parse_xau("not a quote") is None
