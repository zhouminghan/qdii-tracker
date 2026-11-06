"""dca_strategy VIX & PE 阶梯定投规则单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from core.dca_strategy import pe_label, strategy_of


def test_extreme_fear_golden_pit():
    r = strategy_of(10, 35, 30)
    assert r["key"] == "extreme_fear"
    assert r["action"] == "黄金坑策略"
    assert r["strategy"] == "大胆加仓 / 倍定投"
    assert r["vix_matched"] is True
    assert r["pe_label"] == "估值中性，控制节奏"


def test_extreme_fear_but_vix_too_low():
    r = strategy_of(10, 28, 30)
    assert r["key"] == "extreme_fear"
    assert r["vix_matched"] is False
    assert "低于" in r["note"]


def test_neutral_regular_dca():
    r = strategy_of(50, 20, 30)
    assert r["key"] == "neutral"
    assert r["action"] == "常态定投"
    assert r["vix_matched"] is True


def test_extreme_greed_bubble():
    r = strategy_of(80, 10, 40)
    assert r["key"] == "extreme_greed"
    assert r["action"] == "泡沫高危"
    assert r["strategy"] == "卖出 / 买入对冲"
    assert r["vix_matched"] is True
    assert r["pe_label"] == "估值偏高，注意回撤风险"


def test_greed_but_vix_too_high():
    r = strategy_of(60, 25, None)
    assert r["key"] == "greed"
    assert r["vix_matched"] is False
    assert "高于" in r["note"]
    assert r["pe_label"] == "暂无 PE 数据"


def test_band_boundaries():
    assert strategy_of(25, 28, None)["key"] == "fear"
    assert strategy_of(26, 28, None)["key"] == "fear"
    assert strategy_of(45, 20, None)["key"] == "neutral"
    assert strategy_of(55, 18, None)["key"] == "greed"
    assert strategy_of(75, 10, None)["key"] == "extreme_greed"


def test_pe_label_boundaries():
    assert pe_label(35) == "估值偏高，注意回撤风险"
    assert pe_label(25) == "估值中性，控制节奏"
    assert pe_label(24) == "估值偏低，长期赔率改善"
    assert pe_label(None) == "暂无 PE 数据"
