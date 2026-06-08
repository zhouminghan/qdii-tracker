#!/usr/bin/env python3
"""
统一入口：
- add: 新增/强制纳入一只基金（配置 + 局部后处理）
- move: 增量移动分类（复用 reclassify_fund.py）
- refresh: 日常增量（默认 fill_missing + refresh_purchase）
- sync: 全量流水线
- check: 一致性校验
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from config_loader import get_config, save_config

ROOT = Path(__file__).parent.parent
SCRIPTS = ROOT / "scripts"
DATA = ROOT / "web" / "data"
CATS = ["sp500", "nasdaq_passive", "active", "global_index", "global_other", "etf"]


def run_py(script: str, *args):
    cmd = [sys.executable, str(SCRIPTS / script), *args]
    print("$", " ".join(cmd))
    subprocess.run(cmd, check=True)


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
    run_py("gen_frontend_config.py")

    # 扫描 + 局部补数
    run_py("scan_funds.py")
    run_py("enrich_data.py", "--codes", code)
    run_py("fill_missing.py", "--codes", code)
    run_py("refresh_purchase.py", "--codes", code)
    if to_cat in ("active", "global_other"):
        run_py("fetch_holdings.py", "--codes", code)

    print("🎉 add 完成")


def cmd_move(args):
    run_py(
        "reclassify_fund.py",
        "--keyword", args.keyword,
        "--from", args.from_cat,
        "--to", args.to_cat,
        *( ["--no-holdings"] if args.no_holdings else [] ),
        *( ["--no-whitelist"] if args.no_whitelist else [] ),
    )
    run_py("gen_frontend_config.py")


def cmd_refresh(args):
    if args.codes:
        run_py("fill_missing.py", "--codes", args.codes)
        run_py("refresh_purchase.py", "--codes", args.codes)
    else:
        run_py("fill_missing.py")
        run_py("refresh_purchase.py")


def cmd_sync(_args):
    run_py("scan_funds.py")
    run_py("enrich_data.py")
    run_py("fill_missing.py")
    run_py("refresh_purchase.py")
    run_py("fetch_holdings.py")
    run_py("gen_frontend_config.py")


def _all_share_codes() -> set:
    codes = set()
    for cat in CATS:
        fp = DATA / f"{cat}.json"
        if not fp.exists():
            continue
        d = json.loads(fp.read_text(encoding="utf-8"))
        for s in d.get("series", []):
            for sh in s.get("shares", []):
                c = sh.get("code")
                if c:
                    codes.add(c)
    return codes


def _parse_iso(s: str):
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


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
            if not (DATA / "holdings" / f"{code}.json").exists():
                errors.append(f"passive_override(active) 缺少 holdings 文件: {code}")

    # 3) default_share_code 必须在 shares 中
    for cat in CATS:
        fp = DATA / f"{cat}.json"
        if not fp.exists():
            continue
        d = json.loads(fp.read_text(encoding="utf-8"))
        for s in d.get("series", []):
            default_code = s.get("default_share_code")
            share_codes = {sh.get("code") for sh in s.get("shares", [])}
            if default_code and default_code not in share_codes:
                errors.append(f"{cat}/{s.get('display_name','?')} default_share_code 无效: {default_code}")

    # 4) meta 与各数据 generated_at 差异 < 1 分钟
    meta_fp = DATA / "meta.json"
    if meta_fp.exists():
        meta = json.loads(meta_fp.read_text(encoding="utf-8"))
        t_meta = _parse_iso(meta.get("generated_at", ""))
        if t_meta:
            for cat in CATS:
                fp = DATA / f"{cat}.json"
                if not fp.exists():
                    continue
                d = json.loads(fp.read_text(encoding="utf-8"))
                t = _parse_iso(d.get("generated_at", ""))
                if t and abs((t - t_meta).total_seconds()) > 60:
                    errors.append(f"generated_at 差异>60s: {cat} ({d.get('generated_at')}) vs meta ({meta.get('generated_at')})")

    if errors:
        print("❌ 一致性校验失败：")
        for e in errors:
            print(" -", e)
        raise SystemExit(1)

    print("✅ 一致性校验通过")


def main():
    p = argparse.ArgumentParser(description="QDII Tracker 统一命令")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_add = sub.add_parser("add", help="新增/强制纳入一只基金")
    p_add.add_argument("--code", required=True)
    p_add.add_argument("--to", required=True, choices=CATS)
    p_add.add_argument("--keyword", help="可选：加入 active_whitelist 的关键词")
    p_add.set_defaults(func=cmd_add)

    p_move = sub.add_parser("move", help="移动分类")
    p_move.add_argument("--keyword", required=True)
    p_move.add_argument("--from", dest="from_cat", required=True, choices=CATS)
    p_move.add_argument("--to", dest="to_cat", required=True, choices=CATS)
    p_move.add_argument("--no-holdings", action="store_true")
    p_move.add_argument("--no-whitelist", action="store_true")
    p_move.set_defaults(func=cmd_move)

    p_refresh = sub.add_parser("refresh", help="增量刷新")
    p_refresh.add_argument("--codes", help="逗号分隔，仅刷新这些代码")
    p_refresh.set_defaults(func=cmd_refresh)

    p_sync = sub.add_parser("sync", help="全量同步")
    p_sync.set_defaults(func=cmd_sync)

    p_check = sub.add_parser("check", help="一致性校验")
    p_check.set_defaults(func=cmd_check)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
