"""config_loader SSOT 读取/校验单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

import core.config_loader as cl


def test_validate_config_accepts_minimal_valid():
    cfg = {"classify": {"force_include": {}}, "company_brand": {}, "passive_override": {}}
    assert cl.validate_config(cfg) == []


def test_validate_config_rejects_bad_category():
    cfg = {"classify": {"force_include": {"123456": "not-a-category"}}}
    errors = cl.validate_config(cfg)
    assert any("分类非法" in e for e in errors)


def test_validate_config_rejects_brand_missing_fields():
    cfg = {"classify": {}, "company_brand": {"X": {"color": "red"}}}
    errors = cl.validate_config(cfg)
    assert any("缺少 color/letter" in e for e in errors)


def test_load_config_reads_ssot():
    cfg = cl.load_config(force_reload=True)
    assert isinstance(cfg, dict)
    assert "classify" in cfg
    assert "company_brand" in cfg


def test_save_load_roundtrip(monkeypatch, tmp_path):
    target = tmp_path / "funds.json"
    monkeypatch.setattr(cl, "_config_path", lambda: target)
    monkeypatch.setattr(cl, "_CONFIG", None)

    cl.save_config({"classify": {"force_include": {"123456": "etf"}}})
    assert cl.load_config()["classify"]["force_include"]["123456"] == "etf"
    assert target.exists()
