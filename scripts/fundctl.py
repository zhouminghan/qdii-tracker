#!/usr/bin/env python3
"""
统一入口：
- add: 新增/强制纳入一只基金（配置 + 局部后处理）
- move: 增量移动分类（复用 pipeline.reclassify）
- refresh: 日常增量（默认 fill + refresh）
- sync: 全量流水线
- check: 一致性校验
"""
import argparse
import json
import sys
from pathlib import Path

# 把项目根目录加进 sys.path，以便 import feedback/ 下的模块
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.constants import CATEGORIES, DATA_DIR, HOLDINGS_CATEGORIES
from core.config_loader import get_config, save_config

# 直接 import pipeline 模块（替代 subprocess 调用）
from pipeline import scan, enrich, fill, holdings, reclassify, codegen

from feedback.verify_data import run_verification
from feedback.scan_scenarios import find_related_scenarios
from architecture_lint import run_lint as run_architecture_lint
from pipeline.diagnose import diagnose_all


def _run(main_fn, *argv_extra):
    """调用 pipeline 模块的 main()，通过临时修改 sys.argv 传递 argparse 参数。"""
    saved = sys.argv
    try:
        sys.argv = [main_fn.__module__] + list(argv_extra)
        main_fn()
    finally:
        sys.argv = saved


def cmd_add(args):
    code = args.code.strip()
    to_cat = args.to

    cfg = get_config()
    cfg.setdefault("classify", {}).setdefault("force_include", {})[code] = to_cat
    if args.keyword and to_cat == "active":
        wl = cfg["classify"].setdefault("active_whitelist", [])
        if args.keyword not in wl:
            wl.append(args.keyword)
    save_config(cfg)
    print(f"✅ 配置已更新: force_include[{code}]={to_cat}")

    # 生成前端派生常量
    _run(codegen.main)

    # 扫描 + 局部补数
    _run(scan.main)
    _run(enrich.main, "--codes", code)
    _run(fill.main, "--codes", code)
    if to_cat in HOLDINGS_CATEGORIES:
        _run(holdings.main, "--codes", code)

    print("🎉 add 完成")


def cmd_move(args):
    extra = []
    if args.no_holdings:
        extra.append("--no-holdings")
    if args.no_whitelist:
        extra.append("--no-whitelist")
    _run(reclassify.main, "--keyword", args.keyword,
         "--from", args.from_cat, "--to", args.to_cat, *extra)
    _run(codegen.main)


def cmd_refresh(args):
    """增量刷新（fill 已包含净值 + 申购状态 + 历史追踪）"""
    if args.codes:
        _run(fill.main, "--codes", args.codes)
    else:
        _run(fill.main)


def cmd_sync(_args):
    _run(scan.main)
    _run(enrich.main)
    _run(fill.main)
    _run(holdings.main)
    _run(codegen.main)


def _all_share_codes() -> set:
    codes = set()
    for cat in CATEGORIES:
        fp = DATA_DIR / f"{cat}.json"
        if not fp.exists():
            continue
        d = json.loads(fp.read_text(encoding="utf-8"))
        for s in d.get("series", []):
            for sh in s.get("shares", []):
                c = sh.get("code")
                if c:
                    codes.add(c)
    return codes


def cmd_check(_args):
    cfg = get_config()
    errors = []

    # 1) force_include code 必须在数据中存在
    data_codes = _all_share_codes()
    for code in cfg.get("classify", {}).get("force_include", {}).keys():
        if code not in data_codes:
            errors.append(f"force_include 代码不存在于数据: {code}")

    # 2) passive_override(type=active) 必须有 holdings
    for code, info in cfg.get("passive_override", {}).items():
        if info.get("type") == "active":
            if not (DATA_DIR / "holdings" / f"{code}.json").exists():
                errors.append(f"passive_override(active) 缺少 holdings 文件: {code}")

    # 3) default_share_code 必须在 shares 中
    for cat in CATEGORIES:
        fp = DATA_DIR / f"{cat}.json"
        if not fp.exists():
            continue
        d = json.loads(fp.read_text(encoding="utf-8"))
        for s in d.get("series", []):
            default_code = s.get("default_share_code")
            share_codes = {sh.get("code") for sh in s.get("shares", [])}
            if default_code and default_code not in share_codes:
                errors.append(f"{cat}/{s.get('display_name','?')} default_share_code 无效: {default_code}")

    # 4) golden fixtures 校验（feedback/verify_data.py）
    golden_errors = run_verification()
    if golden_errors:
        errors.extend(golden_errors)

    # 5) 目录纪律校验（scripts/architecture_lint.py，对应 AGENT.md 第11条）
    lint_errors = run_architecture_lint()
    if lint_errors:
        errors.extend(lint_errors)

    if errors:
        print("❌ 一致性校验失败：")
        for e in errors:
            print(" -", e)
        raise SystemExit(1)

    print("✅ 一致性校验通过")

    # 6) 联动提示（non-blocking）：本次改动是否有匹配的 UI 回归场景该重跑
    related = find_related_scenarios()
    if related:
        print("\n💡 检测到未提交改动涉及以下文件，有关联的回归场景建议重跑确认：")
        for changed_file, scenarios in related.items():
            print(f"   {changed_file}")
            for sc in scenarios:
                print(f"     → {sc}")


def cmd_diagnose(args):
    """诊断数据异常并给出修复建议"""
    from pipeline.diagnose import diagnose_all, auto_fix as _auto_fix
    issues = diagnose_all()
    if args.cat:
        issues = [i for i in issues if i["cat"] == args.cat]

    if args.auto_fix:
        fixed, failed = _auto_fix(issues)
        print(f"auto-fix: {fixed} 修复, {failed} 失败")

    if args.json:
        print(json.dumps(issues, ensure_ascii=False, indent=2))
    elif issues:
        for item in issues:
            print(f"[{item['severity'].upper()}] {item['category']}: {item['fund_name']}({item['fund_code']}) → {item['suggestion']}")
    else:
        print("✅ 数据正常，无异常")


def main():
    p = argparse.ArgumentParser(description="QDII Tracker 统一命令")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_add = sub.add_parser("add", help="新增/强制纳入一只基金")
    p_add.add_argument("--code", required=True)
    p_add.add_argument("--to", required=True, choices=CATEGORIES)
    p_add.add_argument("--keyword", help="可选：加入 active_whitelist 的关键词")
    p_add.set_defaults(func=cmd_add)

    p_move = sub.add_parser("move", help="移动分类")
    p_move.add_argument("--keyword", required=True)
    p_move.add_argument("--from", dest="from_cat", required=True, choices=CATEGORIES)
    p_move.add_argument("--to", dest="to_cat", required=True, choices=CATEGORIES)
    p_move.add_argument("--no-holdings", action="store_true")
    p_move.add_argument("--no-whitelist", action="store_true")
    p_move.set_defaults(func=cmd_move)

    p_refresh = sub.add_parser("refresh", help="增量刷新")
    p_refresh.add_argument("--codes", help="逗号分隔，仅刷新这些代码")
    p_refresh.set_defaults(func=cmd_refresh)

    p_sync = sub.add_parser("sync", help="全量同步")
    p_sync.set_defaults(func=cmd_sync)

    p_diagnose = sub.add_parser("diagnose", help="诊断数据异常")
    p_diagnose.add_argument("--cat", help="按分类筛选")
    p_diagnose.add_argument("--json", action="store_true", help="JSON 输出")
    p_diagnose.add_argument("--auto-fix", action="store_true", help="自动修复 missing_nav 异常")
    p_diagnose.set_defaults(func=cmd_diagnose)

    p_check = sub.add_parser("check", help="一致性校验")
    p_check.set_defaults(func=cmd_check)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
