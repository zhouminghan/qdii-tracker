#!/usr/bin/env python3
"""
scripts/pipeline/verify_data.py — 数据侧黄金样例校验

从 knowledge/golden-fixtures.md 解析内嵌的 JSON 数据块，
与 web/data/*.json 逐条核对。

用法：
    python3 scripts/pipeline/verify_data.py          # 独立运行
    from pipeline.verify_data import run_verification  # 被 fundctl.py check 调用
"""
import json
import re
import sys

from core.constants import ROOT_DIR, DATA_DIR
FIXTURES_MD = ROOT_DIR / "knowledge" / "golden-fixtures.md"


def _load_fixtures() -> list:
    """从 knowledge/golden-fixtures.md 提取最后一个 ```json 代码块的 fixtures 数据。"""
    text = FIXTURES_MD.read_text(encoding="utf-8")
    blocks = re.findall(r"```json\n(.*?)\n```", text, re.DOTALL)
    if not blocks:
        return []
    doc = json.loads(blocks[-1])
    return doc.get("fixtures", [])


def _load_all_series() -> dict:
    """遍历 web/data/*.json，建立 share_code -> (series, category) 的索引。"""
    from_code = {}
    if not DATA_DIR.exists():
        return from_code
    for fp in DATA_DIR.glob("*.json"):
        if fp.name in ("meta.json",):
            continue
        try:
            d = json.loads(fp.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        category = d.get("category", fp.stem)
        for s in d.get("series", []):
            for sh in s.get("shares", []):
                code = sh.get("code")
                if code:
                    from_code[code] = {"series": s, "share": sh, "category": category}
    return from_code


def run_verification() -> list:
    """执行校验，返回错误列表（空列表 = 全部通过）。"""
    fixtures = _load_fixtures()
    if not fixtures:
        return []  # 骨架阶段：无 fixtures 视为通过

    index = _load_all_series()
    errors = []

    for fx in fixtures:
        code = fx.get("code")
        entry = index.get(code)
        if entry is None:
            errors.append(f"[{code}] 未在 web/data/*.json 中找到该份额代码")
            continue

        expected_cat = fx.get("expected_category")
        if expected_cat and entry["category"] != expected_cat:
            errors.append(
                f"[{code}] 分类不符：期望 {expected_cat}，实际 {entry['category']}"
            )

        checks = fx.get("checks", {})
        share = entry["share"]

        nav_range = checks.get("nav_range")
        if nav_range:
            nav = share.get("nav")
            lo, hi = nav_range
            if nav is None or not (lo <= nav <= hi):
                errors.append(f"[{code}] nav={nav} 超出预期区间 {nav_range}")

        chg_range = checks.get("chg_ytd_range")
        if chg_range:
            chg = share.get("chg_ytd")
            lo, hi = chg_range
            if chg is None or not (lo <= chg <= hi):
                errors.append(f"[{code}] chg_ytd={chg} 超出预期区间 {chg_range}")

        required_fields = checks.get("required_fields")
        if required_fields:
            for f in required_fields:
                if share.get(f) in (None, "", []):
                    errors.append(f"[{code}] 必需字段为空: {f}")

        expected_default = checks.get("default_share_code")
        if expected_default:
            actual_default = entry["series"].get("default_share_code")
            if actual_default != expected_default:
                errors.append(
                    f"[{code}] default_share_code 不符：期望 {expected_default}，实际 {actual_default}"
                )

    return errors


def main():
    errors = run_verification()
    if errors:
        print("❌ Golden fixtures 校验失败：")
        for e in errors:
            print(" -", e)
        raise SystemExit(1)
    print("✅ Golden fixtures 校验通过（含空 fixtures 骨架态）")


if __name__ == "__main__":
    main()
