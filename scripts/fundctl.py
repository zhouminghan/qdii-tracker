#!/usr/bin/env python3
"""
统一入口：
- add: 新增/强制纳入一只基金（配置 + 局部后处理）
- remove: 移除一只基金（配置 + 数据清理）
- move: 增量移动分类（复用 pipeline.reclassify）
- refresh: 日常增量（默认 fill）
- sync: 全量流水线
- check: 一致性校验
- diagnose: 诊断数据异常
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.constants import CATEGORIES, DATA_DIR, DATA_SCHEMA_VERSION, HOLDINGS_CATEGORIES, ROOT_DIR
from core.config_loader import get_config, save_config, validate_config

# 直接 import pipeline 模块（替代 subprocess 调用）
from pipeline import scan, enrich, fill, holdings, reclassify, codegen

from checks.verify_data import run_verification
from checks.verify_purchase import run_verification as run_purchase_verification
from checks.scan_scenarios import find_related_scenarios
from checks.cross_validate import run_cross_validation
from checks.architecture_lint import run_lint as run_architecture_lint
from checks.diagnose import diagnose_all


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


def cmd_remove(args):
    """从配置和数据中移除一只基金的所有份额。"""
    code = args.code.strip()

    # 1. 从 config force_include 移除
    cfg = get_config()
    force_inc = cfg.get("classify", {}).get("force_include", {})
    if code in force_inc:
        removed_cat = force_inc.pop(code)
        save_config(cfg)
        print(f"✅ 已从 config force_include 移除: {code} (原分类: {removed_cat})")
    else:
        print(f"⚠ {code} 不在 force_include 中，跳过配置移除")

    # 2. 从所有分类 JSON 中移除该基金
    found_any = False
    for cat in CATEGORIES:
        fp = DATA_DIR / f"{cat}.json"
        if not fp.exists():
            continue
        data = json.loads(fp.read_text(encoding="utf-8"))
        new_series = []
        for s in data.get("series", []):
            shares = s.get("shares", [])
            if any(sh.get("code") == code for sh in shares):
                found_any = True
                print(f"✅ 已从 {cat} 移除: {s.get('display_name', code)}")
                continue
            new_series.append(s)
        if len(new_series) != len(data.get("series", [])):
            data["series"] = new_series
            fp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    if not found_any:
        print(f"⚠ 未在任何分类中找到基金代码: {code}")
        return

    # 3. 清理 holdings 文件
    holdings_fp = DATA_DIR / "holdings" / f"{code}.json"
    if holdings_fp.exists():
        holdings_fp.unlink()
        print(f"✅ 已清理 holdings: {code}.json")

    # 4. 更新 meta.json
    meta_fp = DATA_DIR / "meta.json"
    if meta_fp.exists():
        import datetime
        meta = json.loads(meta_fp.read_text(encoding="utf-8"))
        meta["generated_at"] = datetime.datetime.now().isoformat()
        meta_fp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    # 5. 重新生成前端配置
    _run(codegen.main)
    print(f"🎉 remove 完成: {code}")


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


def _check_module_contracts():
    """LAYER 5: 检查 knowledge/pipeline-contracts.md 中列出的 pipeline 模块是否有 docstring。

    Returns:
        (ok: bool, warnings: list[str])
        ok 始终为 True（文档检查不阻止 pass/fail）。
    """
    pipeline_dir = ROOT_DIR / "scripts" / "pipeline"
    contracts_md = ROOT_DIR / "knowledge" / "pipeline-contracts.md"
    warnings = []

    # 从 contracts.md 提取模块名列表
    module_names = set()
    if contracts_md.exists():
        content = contracts_md.read_text(encoding="utf-8")
        import re
        # 匹配 "## N. xxx.py" 格式的标题
        for m in re.finditer(r'^##\s+\d+\.\s+(\w+)\.py', content, re.MULTILINE):
            module_names.add(m.group(1))

    for name in sorted(module_names):
        fp = pipeline_dir / f"{name}.py"
        if not fp.exists():
            warnings.append(f"{name}.py: 模块不存在")
            continue
        # 检查文件前 20 行是否包含模块功能描述
        first_20 = fp.read_text(encoding="utf-8").split("\n")[:20]
        # 跳过 shebang / coding / 空行 / import 后，查找 docstring 或注释描述
        has_doc = False
        for line in first_20:
            stripped = line.strip()
            if not stripped or stripped.startswith("#!") or stripped.startswith("# -*-"):
                continue
            if stripped.startswith('"""') or stripped.startswith("'''"):
                has_doc = True
                break
            if stripped.startswith("#"):
                # 允许模块注释作为文档替代（例如 "# 扫描分类"）
                if any(kw in stripped for kw in ["职责", "扫描", "丰富", "补全", "持仓",
                                                   "诊断", "校验", "生成", "重分类",
                                                   "版本", "模块", "module", "enrich",
                                                   "fill", "scan", "holdings", "diagnose",
                                                   "verify", "codegen", "reclassify",
                                                   "stamp"]):
                    has_doc = True
                    break
        if not has_doc:
            warnings.append(f"{name}.py: 缺少模块 docstring（前 20 行无文档描述）")

    return True, warnings


def cmd_check(_args):
    """分层短路校验：每层失败立即退出，不继续后续检查。"""
    import time
    _t0 = time.time()

    # ---- Layer 0/6: nav_date 新鲜度检查 (non-blocking warning) ----
    from datetime import datetime, timedelta
    from core.utils import read_json
    print("[LAYER 0/7] nav_date 新鲜度检查 ...", end=" ")
    stale_count = 0
    cutoff = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    for cat_file in sorted(DATA_DIR.glob("*.json")):
        if cat_file.name == "meta.json":
            continue
        try:
            data = read_json(cat_file)
        except Exception:
            continue
        for series in data.get("series", []):
            for share in series.get("shares", []):
                nd = share.get("nav_date", "")
                if nd and nd < cutoff:
                    stale_count += 1
    if stale_count > 0:
        print(f"⚠ {stale_count} 个份额 nav_date 超过 7 天未更新")
    else:
        print("OK ✓")

    # ---- Layer 1/6: 配置文件存在性 ----
    print("[LAYER 1/7] 检查配置文件 ...")
    config_fp = ROOT_DIR / "config" / "funds.json"
    if not config_fp.exists():
        print(f"❌ 配置文件不存在: {config_fp}")
        raise SystemExit(1)
    print("  ✅ config/funds.json 存在")

    cfg_errors = validate_config(get_config())
    if cfg_errors:
        print("❌ config/funds.json 内容非法：")
        for e in cfg_errors:
            print(f"  - {e}")
        raise SystemExit(1)
    print("  ✅ config/funds.json 结构合法")

    # ---- meta.json schema 版本 ----
    meta_fp = DATA_DIR / "meta.json"
    meta = read_json(meta_fp) if meta_fp.exists() else {}
    if meta.get("schema_version") != DATA_SCHEMA_VERSION:
        print(f"❌ meta.json schema_version != {DATA_SCHEMA_VERSION}（字段演进未同步 schema 版本）")
        raise SystemExit(1)
    print(f"  ✅ meta.json schema_version = {DATA_SCHEMA_VERSION}")

    # ---- Layer 2/6: 目录结构校验（architecture_lint，纯结构，秒级） ----
    print("[LAYER 2/7] 目录纪律校验 ...")
    lint_errors = run_architecture_lint()
    if lint_errors:
        print("❌ 目录纪律校验失败：")
        for e in lint_errors:
            print(" -", e)
        raise SystemExit(1)
    print("  ✅ 目录纪律校验通过")

    # ---- Layer 3/6: Golden fixtures 校验 ----
    print("[LAYER 3/7] Golden fixtures 校验 ...")
    golden_errors = run_verification()
    if golden_errors:
        print("❌ Golden fixtures 校验失败：")
        for e in golden_errors:
            print(" -", e)
        raise SystemExit(1)
    print("  ✅ Golden fixtures 校验通过")

    # ---- Layer 4/6: 类内一致性校验 ----
    print("[LAYER 4/7] 类内一致性校验 ...")
    cfg = get_config()
    errors = []

    # force_include code 必须在数据中存在
    data_codes = _all_share_codes()
    for code in cfg.get("classify", {}).get("force_include", {}).keys():
        if code not in data_codes:
            errors.append(f"force_include 代码不存在于数据: {code}")

    # passive_override(type=active) 必须有 holdings
    for code, info in cfg.get("passive_override", {}).items():
        if info.get("type") == "active":
            if not (DATA_DIR / "holdings" / f"{code}.json").exists():
                errors.append(f"passive_override(active) 缺少 holdings 文件: {code}")

    # default_share_code 必须在 shares 中
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

    # 申购状态 / 日限额 / 变更历史一致性（防 ETF 污染、1e11 哨兵、历史漂移）
    errors += run_purchase_verification()

    if errors:
        print("❌ 类内一致性校验失败：")
        for e in errors:
            print(" -", e)
        raise SystemExit(1)
    print("  ✅ 类内一致性校验通过")

    # ---- Layer 5/7: 模块契约文档完整性 ----
    print("[LAYER 5/7] 模块契约文档检查 ...", end=" ")
    contracts_ok, warnings = _check_module_contracts()
    if warnings:
        print("⚠")
        for w in warnings:
            print(f"  ⚠ {w}")
    else:
        print("OK ✓")

    # ---- Layer 6/7: 跨源交叉验证（需联网，--offline 跳过） ----
    print("[LAYER 6/7] 跨源交叉验证 ...", end=" ")
    if getattr(_args, 'offline', False):
        print("⏭ 跳过（--offline）")
    else:
        try:
            cv_compared, cv_anomalies = run_cross_validation(sample_size=10)
            if cv_anomalies:
                print(f"⚠ {len(cv_anomalies)} 个异常")
                for a in cv_anomalies[:3]:
                    print(f"  ⚠ {a['code']} nav偏差: {a['deviation']:.2f}%")
            elif cv_compared == 0:
                print("⚠ 未验证（0 只完成跨源对比，lsjz/pzd 数据源不可用）")
            else:
                print(f"OK ✓（{cv_compared} 只对比）")
        except Exception as e:
            print(f"⚠ 跳过: {e}")

    # ---- Layer 7: Agent 规则机器验证（可选，--agent-rules） ----
    if getattr(_args, 'agent_rules', False):
        from checks.check_agent_rules import check_agent_rules
        check_agent_rules()

    print(f"\n✅ 全部分层校验通过（总耗时 {time.time() - _t0:.2f}s）")

    # 联动提示（non-blocking）：本次改动是否有匹配的 UI 回归场景该重跑
    related = find_related_scenarios()
    if related:
        print("\n💡 检测到未提交改动涉及以下文件，有关联的回归场景建议重跑确认：")
        for changed_file, scenarios in related.items():
            print(f"   {changed_file}")
            for sc in scenarios:
                print(f"     → {sc}")


def cmd_probe(_args):
    """数据源适配层探针：导入级健康检查（不发起网络请求）。"""
    import importlib
    print("数据源适配层探针（导入级，不发起网络请求）")
    ok = True
    for name in ("akshare_source", "eastmoney_source", "xueqiu_source"):
        try:
            mod = importlib.import_module(f"sources.{name}")
        except Exception as e:  # noqa: BLE001
            print(f"  ❌ sources.{name} 导入失败: {e}")
            ok = False
            continue
        fns = sorted(n for n in dir(mod) if n.startswith("fetch_") and callable(getattr(mod, n)))
        print(f"  ✅ sources.{name}: {len(fns)} 个 fetch_* 函数 -> {', '.join(fns)}")
    if not ok:
        raise SystemExit(1)
    print("（实时连通性由 pipeline 实际 fetch + cross_validate 校验，probe 仅验导入面）")


def cmd_diagnose(args):
    """诊断数据异常并给出修复建议"""
    from checks.diagnose import diagnose_all, auto_fix as _auto_fix
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

    p_remove = sub.add_parser("remove", help="删除一只基金（从配置和数据中移除）")
    p_remove.add_argument("--code", required=True)
    p_remove.set_defaults(func=cmd_remove)

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
    p_check.add_argument("--agent-rules", action="store_true", help="额外运行 Agent 规则机器验证")
    p_check.add_argument("--offline", action="store_true", help="跳过跨源交叉验证（Layer 6，需联网）")
    p_check.set_defaults(func=cmd_check)

    p_probe = sub.add_parser("probe", help="数据源适配层探针（导入级）")
    p_probe.set_defaults(func=cmd_probe)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
