"""单元测试：sources/akshare_source.py 的批量接口重试与降级。"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

import sources.akshare_source as src


class _NoSleep:
    @staticmethod
    def sleep(_seconds):
        pass


class _FlakyCaller:
    """模拟 _call_ak：前 fail_times 次抛异常，之后成功。"""

    def __init__(self, fail_times, exc=TimeoutError("boom")):
        self.fail_times = fail_times
        self.exc = exc
        self.calls = 0

    def __call__(self, func, *args, **kwargs):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise self.exc
        return object()


def _always_fail(*_args, **_kwargs):
    raise TimeoutError("boom")


def test_call_ak_batch_retries_then_succeeds(monkeypatch):
    caller = _FlakyCaller(fail_times=1)
    monkeypatch.setattr(src, "_call_ak", caller)
    monkeypatch.setattr(src, "time", _NoSleep)
    result = src._call_ak_batch(lambda: None)
    assert result is not None
    assert caller.calls == 2


def test_call_ak_batch_raises_after_exhausted(monkeypatch):
    caller = _FlakyCaller(fail_times=99)
    monkeypatch.setattr(src, "_call_ak", caller)
    monkeypatch.setattr(src, "time", _NoSleep)
    with pytest.raises(TimeoutError):
        src._call_ak_batch(lambda: None)
    assert caller.calls == src._BATCH_RETRIES


def test_fetch_rank_data_degrades_to_empty(monkeypatch):
    monkeypatch.setattr(src, "_call_ak_batch", _always_fail)
    assert src.fetch_rank_data() == {}


def test_fetch_purchase_data_degrades_to_empty(monkeypatch):
    monkeypatch.setattr(src, "_call_ak_batch", _always_fail)
    assert src.fetch_purchase_data() == {}


def test_fetch_etf_data_degrades_to_empty(monkeypatch):
    monkeypatch.setattr(src, "_call_ak_batch", _always_fail)
    assert src.fetch_etf_data() == {}
