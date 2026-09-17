"""分类纯函数 + classify_fund 的回归测试。

目标：把「基金被分到哪个 tab」的核心规则固化下来，
防止改 config/funds.json 的关键词 / force_include 时误伤分类。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from pipeline import scan


def test_is_qdii():
    assert scan.is_qdii("易方达标普500指数(QDII)", "QDII") is True
    assert scan.is_qdii("广发全球精选", "指数型-海外股票") is True
    assert scan.is_qdii("华夏沪深300", "股票型") is False


def test_is_etf():
    assert scan.is_etf("513500", "标普500ETF博时") is True   # 51x 前缀
    assert scan.is_etf("159920", "恒生ETF") is True          # 15x 前缀
    assert scan.is_etf("161125", "易方达标普500指数(QDII)") is False
    assert scan.is_etf("000001", "华夏ETF联接") is False      # ETF 联接不算场内


def test_extract_etf_target():
    assert scan.extract_etf_target("标普500ETF博时") == "sp500"
    assert scan.extract_etf_target("国泰纳斯达克100ETF") == "nasdaq100"
    assert scan.extract_etf_target("纳指科技ETF") == "nasdaq100"
    assert scan.extract_etf_target("美国50ETF") == "us50"


def test_extract_share_class():
    assert scan.extract_share_class("广发全球精选股票(QDII)人民币A") == "A"
    assert scan.extract_share_class("广发全球精选股票(QDII)人民币C") == "C"
    assert scan.extract_share_class("某养老目标FOF基金") == "FOF"
    assert scan.extract_share_class("某基金A(后端)") == "A(后端)"
    assert scan.extract_share_class("易方达标普信息科技指数(QDII-LOF)A人民币") == "A"
    assert scan.extract_share_class("某基金") == "默认"


def test_extract_currency():
    assert scan.extract_currency("某基金美元A") == "美元"
    assert scan.extract_currency("某基金欧元") == "欧元"
    assert scan.extract_currency("某基金港币") == "港币"
    assert scan.extract_currency("某基金人民币A") == "人民币"


def test_make_display_name():
    assert scan.make_display_name("易方达标普500指数(QDII)人民币A") == "易方达标普500指数"
    assert scan.make_display_name("华夏纳斯达克100指数(QDII)美元") == "华夏纳斯达克100指数"


def test_extract_company_and_series():
    assert scan.extract_company_and_series("易方达标普信息科技指数(QDII-LOF)A人民币") == (
        "易方达", "标普信息科技指数"
    )


def test_classify_force_exclude():
    # 012535 在 config/funds.json 的 force_exclude 中
    assert scan.classify_fund("012535", "任何基金", "QDII") == "exclude"


def test_classify_force_include():
    # 160644 → global_other、161128 → active（均在 force_include 中）
    assert scan.classify_fund("160644", "鹏华港美互联", "QDII") == "global_other"
    assert scan.classify_fund("161128", "易方达标普信息科技指数(QDII-LOF)", "QDII") == "active"


def test_classify_keyword_rules():
    assert scan.classify_fund("161125", "易方达标普500指数(QDII)", "QDII") == "sp500"
    assert scan.classify_fund("513500", "标普500ETF博时", "QDII") == "etf"
    assert scan.classify_fund("513100", "国泰纳斯达克100ETF", "QDII") == "etf"


def test_classify_non_qdii_excluded():
    assert scan.classify_fund("000001", "华夏沪深300指数", "股票型") == "exclude"
