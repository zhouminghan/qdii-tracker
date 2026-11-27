"""单元测试：core/utils.py 的纯函数"""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

import requests

from core.utils import to_float, read_json, write_json, parse_scale, calc_series_scale, call_ak, requests_get


class _FakeResp:
    def __init__(self, status_code):
        self.status_code = status_code


def test_to_float_None():
    assert to_float(None) is None

def test_to_float_empty():
    assert to_float("") is None
    assert to_float("null") is None

def test_to_float_valid():
    assert to_float("1.5") == 1.5
    assert to_float("0") == 0.0
    assert to_float("-3.14") == -3.14
    assert to_float("1,234.5") == 1234.5
    assert to_float("12.5%") == 12.5

def test_to_float_invalid():
    assert to_float("---") is None
    assert to_float("abc") is None
    assert to_float("  ") is None
    assert to_float(True) is None
    assert to_float(float("nan")) is None

def test_parse_scale():
    assert parse_scale("31.11亿") == 31.11
    assert parse_scale("5000万") == 0.5
    assert parse_scale("--") is None
    assert parse_scale(None) is None
    assert parse_scale("31.11亿份") == 31.11
    assert parse_scale("") is None
    assert parse_scale("nan") is None

def test_calc_series_scale():
    shares = [
        {"share_class": "A", "currency": "人民币", "scale": 10.5},
        {"share_class": "C", "currency": "人民币", "scale": 3.0},
    ]
    assert calc_series_scale(shares) == 10.5

def test_calc_series_scale_fallback_when_a_missing_scale():
    # A 类人民币份额存在但无规模时，应回退到其它有规模的份额，而不是返回 0
    shares = [
        {"share_class": "A", "currency": "人民币", "scale": None},
        {"share_class": "C", "currency": "人民币", "scale": 3.0},
    ]
    assert calc_series_scale(shares) == 3.0

def test_write_read_json(tmp_path):
    data = {"key": "value", "nested": {"a": 1}}
    fp = tmp_path / "test.json"
    write_json(fp, data)
    result = read_json(fp)
    assert result == data


def test_call_ak_returns_in_main_thread():
    # 主线程走 signal 超时路径，快速函数应正常返回
    assert call_ak(lambda: 7, timeout=5) == 7


def test_call_ak_returns_in_worker_thread():
    # fill 的 Pass 3/4 在子线程跑逐只接口，不能因 signal 不可用而静默失败
    import threading

    result = {}

    def target():
        result["v"] = call_ak(lambda: 42, timeout=5)

    t = threading.Thread(target=target)
    t.start()
    t.join()
    assert result["v"] == 42

def test_write_json_atomic(tmp_path):
    """写入后不应有 .tmp 残留文件。"""
    fp = tmp_path / "test.json"
    write_json(fp, {"x": 1})
    tmp_files = list(tmp_path.glob("*.tmp"))
    assert len(tmp_files) == 0


def test_write_json_compact_single_line(tmp_path):
    """compact 模式应输出无缩进的单行 JSON，且末尾换行。"""
    fp = tmp_path / "compact.json"
    write_json(fp, {"a": 1, "b": [1, 2]}, compact=True)
    text = fp.read_text(encoding="utf-8")
    assert "\n" not in text.rstrip("\n")
    assert text.endswith("\n")
    assert text.rstrip("\n") == '{"a":1,"b":[1,2]}'


def test_requests_get_returns_response_on_200(monkeypatch):
    calls = {"n": 0}

    def fake_get(url, headers=None, timeout=None):
        calls["n"] += 1
        return _FakeResp(200)

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(time, "sleep", lambda _: None)
    r = requests_get("http://example.test", backoff=0)
    assert r is not None and r.status_code == 200
    assert calls["n"] == 1


def test_requests_get_retries_transient_then_returns_none(monkeypatch):
    calls = {"n": 0}

    def fake_get(url, headers=None, timeout=None):
        calls["n"] += 1
        return _FakeResp(500)

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(time, "sleep", lambda _: None)
    assert requests_get("http://example.test", backoff=0) is None
    assert calls["n"] == 3  # retries=2 → 3 attempts


def test_requests_get_no_retry_on_permanent_4xx(monkeypatch):
    calls = {"n": 0}

    def fake_get(url, headers=None, timeout=None):
        calls["n"] += 1
        return _FakeResp(404)

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(time, "sleep", lambda _: None)
    assert requests_get("http://example.test", backoff=0) is None
    assert calls["n"] == 1


def test_requests_get_no_retry_on_dns_failure(monkeypatch):
    calls = {"n": 0}

    def fake_get(url, headers=None, timeout=None):
        calls["n"] += 1
        raise requests.exceptions.ConnectionError("nodename nor servname")

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(time, "sleep", lambda _: None)
    assert requests_get("http://example.test", backoff=0) is None
    assert calls["n"] == 1


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
