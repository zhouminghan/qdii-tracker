"""
共享工具函数：安全转浮点、JSON 读写、generated_at bump、规模解析。
所有脚本统一从此模块导入，消除重复实现。
"""
import json
import re
from pathlib import Path

from core.constants import DATA_DIR, STANDARD_SHARE_KEY_ORDER, STANDARD_HOLDINGS_KEY_ORDER, STANDARD_HOLDING_ITEM_KEY_ORDER
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
    更新 meta.json 的 generated_at（各数据文件不再写 generated_at，避免 diff 噪音；
    前端只用 meta.generated_at 做版本戳 / 陈旧检测）。
    """
    if not now_str:
        now_str = beijing_now_iso()
    if not data_dir:
        data_dir = DATA_DIR
    if not meta_fp:
        meta_fp = data_dir / "meta.json"

    # 仅更新 meta.json（各数据文件不再写 generated_at，避免每次 diff 噪音；
    # 前端只用 meta.generated_at 做版本戳 / 陈旧检测）
    if meta_fp.exists():
        meta = read_json(meta_fp)
        meta["generated_at"] = now_str
        write_json(meta_fp, meta)


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


def normalize_share_keys(data: dict) -> dict:
    """
    按 STANDARD_SHARE_KEY_ORDER 重排所有 series→shares 的 key 顺序。
    不影响数据值，不增删 key。调用方应传入 data dict（顶层含 series 字段），
    原地修改 data 后返回。
    用于所有 pipeline 写盘前，确保各分类数据文件 key 顺序一致。
    """
    for series in data.get("series", []):
        for i, share in enumerate(series.get("shares", [])):
            ordered = {}
            # 先按标准顺序放已有 key
            for k in STANDARD_SHARE_KEY_ORDER:
                if k in share:
                    ordered[k] = share[k]
            # 再放标准顺序中没有的额外 key（如 error）
            for k in share:
                if k not in STANDARD_SHARE_KEY_ORDER:
                    ordered[k] = share[k]
            series["shares"][i] = ordered
    return data


def normalize_holdings_keys(data: dict) -> dict:
    """
    按 STANDARD_HOLDINGS_KEY_ORDER 重排 holdings/{code}.json 的顶层 key 顺序，
    并对 holdings / all_quarters 中各季度条目按 STANDARD_HOLDING_ITEM_KEY_ORDER 重排。
    不影响数据值，不增删 key。原地修改 data 后返回。
    """
    # 1. 重排顶层 key
    ordered = {}
    for k in STANDARD_HOLDINGS_KEY_ORDER:
        if k in data:
            ordered[k] = data[k]
    for k in data:
        if k not in STANDARD_HOLDINGS_KEY_ORDER:
            ordered[k] = data[k]
    # 写回 data（原地修改）
    data.clear()
    data.update(ordered)

    # 2. 重排 holdings 数组中每个条目
    for i, item in enumerate(data.get("holdings", [])):
        item_ordered = {}
        for k in STANDARD_HOLDING_ITEM_KEY_ORDER:
            if k in item:
                item_ordered[k] = item[k]
        for k in item:
            if k not in STANDARD_HOLDING_ITEM_KEY_ORDER:
                item_ordered[k] = item[k]
        data["holdings"][i] = item_ordered

    # 3. 重排 all_quarters 中每个季度的条目
    for quarter, items in data.get("all_quarters", {}).items():
        for i, item in enumerate(items):
            item_ordered = {}
            for k in STANDARD_HOLDING_ITEM_KEY_ORDER:
                if k in item:
                    item_ordered[k] = item[k]
            for k in item:
                if k not in STANDARD_HOLDING_ITEM_KEY_ORDER:
                    item_ordered[k] = item[k]
            data["all_quarters"][quarter][i] = item_ordered

    return data
