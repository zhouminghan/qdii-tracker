"""单元测试：core/utils.py 的纯函数"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from core.utils import to_float, read_json, write_json, parse_scale, calc_series_scale


def test_to_float_None():
    assert to_float(None) is None

def test_to_float_empty():
    assert to_float("") is None
    assert to_float("null") is None

def test_to_float_valid():
    assert to_float("1.5") == 1.5
    assert to_float("0") == 0.0
    assert to_float("-3.14") == -3.14

def test_parse_scale():
    assert parse_scale("31.11亿") == 31.11
    assert parse_scale("5000万") == 0.5
    assert parse_scale("--") is None
    assert parse_scale(None) is None

def test_calc_series_scale():
    shares = [
        {"share_class": "A", "currency": "人民币", "scale": 10.5},
        {"share_class": "C", "currency": "人民币", "scale": 3.0},
    ]
    assert calc_series_scale(shares) == 10.5

def test_write_read_json(tmp_path):
    data = {"key": "value", "nested": {"a": 1}}
    fp = tmp_path / "test.json"
    write_json(fp, data)
    result = read_json(fp)
    assert result == data

def test_write_json_atomic(tmp_path):
    """写入后不应有 .tmp 残留文件。"""
    fp = tmp_path / "test.json"
    write_json(fp, {"x": 1})
    tmp_files = list(tmp_path.glob("*.tmp"))
    assert len(tmp_files) == 0


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
