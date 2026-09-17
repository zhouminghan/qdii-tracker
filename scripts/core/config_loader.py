"""
配置加载器：从 config/funds.json（SSOT）读取所有业务决策数据。
所有脚本统一通过本模块读取配置，不直接硬编码。
"""
import json
from pathlib import Path

from core.constants import CONFIG_DIR
from core.utils import write_json

_CONFIG = None


def _config_path() -> Path:
    return CONFIG_DIR / "funds.json"


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
    write_json(_config_path(), cfg)


def validate_config(cfg: dict) -> list:
    """校验 config/funds.json 内容合法性，返回错误列表（空列表 = 通过）。
    挂在 fundctl.py check Layer 1，防止手滑写入非法分类名/缺失字段。"""
    from core.constants import CATEGORIES

    errors = []
    cls = cfg.get("classify", {})
    if not isinstance(cls, dict):
        return ["classify 应为 object"]

    # force_include 的 value 必须是合法分类
    for code, cat in cls.get("force_include", {}).items():
        if cat not in CATEGORIES:
            errors.append(f"classify.force_include[{code}] 分类非法: {cat!r}（合法值 {CATEGORIES}）")

    # 关键词列表必须是 list[str]
    list_keys = (
        "exclude_keywords", "sp500_keywords", "nasdaq_keywords",
        "nasdaq_general_keywords", "us_active_keywords", "active_whitelist",
        "force_exclude",
    )
    for key in list_keys:
        val = cls.get(key)
        if val is not None and not isinstance(val, list):
            errors.append(f"classify.{key} 应为 list")

    # company_brand 每个条目必须有 color + letter
    for name, b in cfg.get("company_brand", {}).items():
        if not isinstance(b, dict) or "color" not in b or "letter" not in b:
            errors.append(f"company_brand[{name}] 缺少 color/letter")

    # passive_override 每个条目必须有 type + name
    for code, po in cfg.get("passive_override", {}).items():
        if not isinstance(po, dict) or "type" not in po or "name" not in po:
            errors.append(f"passive_override[{code}] 缺少 type/name")

    # starred 应为 list
    if "starred" in cfg and not isinstance(cfg["starred"], list):
        errors.append("starred 应为 list")
    return errors
