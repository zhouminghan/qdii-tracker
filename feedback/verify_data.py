#!/usr/bin/env python3
"""
feedback/verify_data.py — 数据侧黄金样例校验（Harness 反馈层组件之一）

用途：
    比对 feedback/golden_fixtures.json 里人工标注的「应该长什么样」，
    与 web/data/*.json 实际内容逐条核对，防止分类规则/pipeline 改动
    误伤基金数据（误分类、字段抓取失败变 null、涨跌幅跳变异常等）。

设计原则（对应 Harness Engineering「反馈层：绿灯不等于任务完成」）：
    - fixtures 为空时视为通过（骨架阶段允许空跑，不阻塞现有流程）
    - 每条 fixture 的检查值必须来自「已验证通过」的真实场景，不接受凭空编造
    - 校验失败时列出全部 diff，不因为第一条失败就退出（一次性看清所有问题）

用法：
    python3 feedback/verify_data.py          # 独立运行
    from feedback.verify_data import run_verification  # 被 fundctl.py check 调用
"""
import json
import sys
from pathlib import Path

FEEDBACK_DIR = Path(__file__).parent
ROOT_DIR = FEEDBACK_DIR.parent
DATA_DIR = ROOT_DIR / "web" / "data"
FIXTURES_PATH = FEEDBACK_DIR / "golden_fixtures.json"


def _load_fixtures() -> list:
    with open(FIXTURES_PATH, encoding="utf-8") as f:
        doc = json.load(f)
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
