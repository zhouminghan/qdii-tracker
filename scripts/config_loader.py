"""
配置加载器：从 config/funds.json（SSOT）读取所有业务决策数据。
所有脚本统一通过本模块读取配置，不直接硬编码。
"""
import json
from pathlib import Path

_CONFIG = None


def _config_path() -> Path:
    return Path(__file__).parent.parent / "config" / "funds.json"


def load_config(force_reload: bool = False) -> dict:
    global _CONFIG
    if _CONFIG is None or force_reload:
        with open(_config_path(), encoding="utf-8") as f:
            _CONFIG = json.load(f)
    return _CONFIG


def get_config() -> dict:
    return load_config()


def save_config(cfg: dict):
    """写回 config/funds.json（fundctl add/move 时使用）"""
    global _CONFIG
    _CONFIG = cfg
    with open(_config_path(), "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")


def add_force_include(code: str, category: str):
    """向 force_include 添加一条，并保存"""
    cfg = get_config()
    cfg["classify"]["force_include"][code] = category
    save_config(cfg)


def add_active_whitelist(keyword: str):
    """向 active_whitelist 添加一条，并保存"""
    cfg = get_config()
    wl = cfg["classify"]["active_whitelist"]
    if keyword not in wl:
        wl.append(keyword)
        save_config(cfg)
