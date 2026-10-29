"""单元测试：sources/ths_source.py 的单日申购上限补数。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

import sources.ths_source as src


class _FakeResp:
    def __init__(self, text):
        self.text = text


def test_fetch_purchase_ths_parses_wan_to_yuan(monkeypatch):
    monkeypatch.setattr(
        src,
        "requests_get",
        lambda url, headers=None: _FakeResp(
            '{"data":[{"code":"022525","sgstat":"限制大额","money":"0.0100"}],"error":{"id":0}}'
        ),
    )
    info = src.fetch_purchase_ths("022525")
    assert info["ths_sgstat"] == "限制大额"
    assert info["daily_limit"] == 100.0


def test_fetch_purchase_ths_empty_money_is_none(monkeypatch):
    monkeypatch.setattr(
        src,
        "requests_get",
        lambda url, headers=None: _FakeResp(
            '{"data":[{"code":"006105","sgstat":"开放","money":""}],"error":{"id":0}}'
        ),
    )
    info = src.fetch_purchase_ths("006105")
    assert info["daily_limit"] is None


def test_fetch_purchase_ths_malformed_returns_none(monkeypatch):
    monkeypatch.setattr(src, "requests_get", lambda url, headers=None: _FakeResp("not json"))
    assert src.fetch_purchase_ths("022525") is None


def test_fetch_purchase_ths_network_failure_returns_none(monkeypatch):
    monkeypatch.setattr(src, "requests_get", lambda url, headers=None: None)
    assert src.fetch_purchase_ths("022525") is None


def test_apply_fallback_fills_missing_limit(monkeypatch):
    monkeypatch.setattr(
        src,
        "fetch_purchase_ths",
        lambda code: {"ths_sgstat": "限制大额", "daily_limit": 100.0},
    )
    share = {"code": "022525", "currency": "人民币", "buy_status": "限大额", "daily_limit": 0.0}
    assert src.apply_ths_limit_fallback(share) is True
    assert share["daily_limit"] == 100.0


def test_apply_fallback_skips_existing_limit(monkeypatch):
    def _boom(_code):
        raise AssertionError("should not be called")

    monkeypatch.setattr(src, "fetch_purchase_ths", _boom)
    share = {"code": "008763", "currency": "人民币", "buy_status": "限大额", "daily_limit": 1000.0}
    assert src.apply_ths_limit_fallback(share) is False


def test_apply_fallback_fills_usd_share_below_cap(monkeypatch):
    monkeypatch.setattr(
        src,
        "fetch_purchase_ths",
        lambda code: {"ths_sgstat": "限制大额", "daily_limit": 30000.0},
    )
    share = {"code": "019549", "currency": "美元", "buy_status": "限大额", "daily_limit": 0.0}
    assert src.apply_ths_limit_fallback(share) is True
    assert share["daily_limit"] == 30000.0


def test_apply_fallback_skips_usd_share_above_cap(monkeypatch):
    monkeypatch.setattr(
        src,
        "fetch_purchase_ths",
        lambda code: {"ths_sgstat": "限制大额", "daily_limit": 2800000.0},
    )
    share = {"code": "999999", "currency": "美元", "buy_status": "限大额", "daily_limit": 0.0}
    assert src.apply_ths_limit_fallback(share) is False
    assert share["daily_limit"] == 0.0


def test_apply_fallback_manual_override_without_network(monkeypatch):
    def _boom(_code):
        raise AssertionError("manual override should not hit network")

    monkeypatch.setattr(src, "fetch_purchase_ths", _boom)
    share = {"code": "000906", "currency": "美元", "buy_status": "限大额", "daily_limit": 0.0}
    assert src.apply_ths_limit_fallback(share) is True
    assert share["daily_limit"] == 280.0


def test_apply_fallback_manual_override_is_idempotent(monkeypatch):
    def _boom(_code):
        raise AssertionError("manual override should not hit network")

    monkeypatch.setattr(src, "fetch_purchase_ths", _boom)
    share = {"code": "013404", "currency": "美元", "buy_status": "限大额", "daily_limit": 75.0}
    assert src.apply_ths_limit_fallback(share) is False


def test_apply_fallback_skips_non_limit_status(monkeypatch):
    def _boom(_code):
        raise AssertionError("should not be called")

    monkeypatch.setattr(src, "fetch_purchase_ths", _boom)
    share = {"code": "006105", "currency": "人民币", "buy_status": "开放申购", "daily_limit": None}
    assert src.apply_ths_limit_fallback(share) is False


def test_merge_purchase_info_preserves_existing_limit_when_source_zero():
    share = {"code": "022525", "buy_status": "限大额", "daily_limit": 100.0}
    src.merge_purchase_info(share, {"buy_status": "限大额", "daily_limit": 0.0, "sell_status": "开放赎回"})
    assert share["daily_limit"] == 100.0
    assert share["buy_status"] == "限大额"


def test_merge_purchase_info_overwrites_when_source_has_limit():
    share = {"code": "008763", "buy_status": "限大额", "daily_limit": 500.0}
    src.merge_purchase_info(share, {"buy_status": "限大额", "daily_limit": 1000.0})
    assert share["daily_limit"] == 1000.0
