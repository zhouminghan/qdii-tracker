"""
共享工具函数：安全转浮点、JSON 读写、generated_at bump、规模解析。
所有脚本统一从此模块导入，消除重复实现。
"""
import json
import re
from pathlib import Path

from core.constants import CATEGORIES, DATA_DIR
from timezone_utils import beijing_now_iso


def to_float(v):
    """
    安全转浮点（合并 3 份略有不同的实现）。
    - enrich_data.py: 不检查 pd.isna
    - fill_missing.py: 检查 v == "null" 但不检查 pd.isna
    - refresh_purchase.py: 检查 pd.isna 但不检查 v == "null"
    合并版：同时检查 pd.isna + NaN + "null"，取最完整逻辑。
    """
    if v is None:
        return None
    # pandas NA/NaN 检查（pd.NA 不支持 == 比较，必须先 isinstance/pd.isna）
    try:
        import pandas as pd
        if isinstance(v, float) and pd.isna(v):
            return None
        if pd.api.types.is_scalar(v) and pd.isna(v):
            return None
    except (ImportError, TypeError, ValueError):
        pass
    if v == "" or v == "null":
        return None
    try:
        f = float(v)
        # NaN 是唯一不等于自身的值
        if f != f:
            return None
        return f
    except (ValueError, TypeError):
        return None


def read_json(path: Path) -> dict:
    """统一 JSON 读取"""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: dict):
    """统一 JSON 写入（ensure_ascii=False, indent=2, 末尾换行）"""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def bump_generated_at(meta_fp: Path = None, data_dir: Path = None, now_str: str = None):
    """
    统一更新 meta.json + 所有数据文件的 generated_at。
    原逻辑分布在 fill_missing.py / refresh_purchase.py / reclassify_fund.py 三处。
    """
    if not now_str:
        now_str = beijing_now_iso()
    if not data_dir:
        data_dir = DATA_DIR
    if not meta_fp:
        meta_fp = data_dir / "meta.json"

    # 更新 meta.json
    if meta_fp.exists():
        meta = read_json(meta_fp)
        meta["generated_at"] = now_str
        write_json(meta_fp, meta)

    # 更新所有分类数据文件
    for cat in CATEGORIES:
        fp = data_dir / f"{cat}.json"
        if fp.exists():
            d = read_json(fp)
            d["generated_at"] = now_str
            write_json(fp, d)


def parse_scale(scale_str: str) -> float:
    """
    解析规模字符串 '31.11亿' -> 31.11（亿元）。
    原逻辑来自 enrich_data.py。
    """
    if not scale_str or scale_str in ("--", "<NA>", "nan", "NaN"):
        return None
    s = str(scale_str).strip()
    m = re.match(r"([\d.]+)\s*(亿|万)", s)
    if not m:
        return None
    num = float(m.group(1))
    unit = m.group(2)
    if unit == "万":
        num = num / 10000
    return num
