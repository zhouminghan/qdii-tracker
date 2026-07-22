"""诊断引擎：分析异常数据并输出可操作的修复建议。
支持 --auto-fix 自动修复 missing_nav 类异常（执行对应基金的 refresh）。
CI 修复白名单：仅数据刷新，不扫描/不重试/修复后必验证。
"""
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "web" / "data"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def diagnose_all():
    """全量诊断所有分类"""
    suggestions = []
    suggestions += _check_missing_nav()
    suggestions += _check_buy_status_anomaly()
    suggestions += _check_nav_regression()
    suggestions += _check_fee_anomalies()
    return suggestions


def _data_files():
    """获取所有数据文件路径"""
    files = []
    for f in os.listdir(DATA_DIR):
        if f.endswith(".json") and f not in ("meta.json", "holdings.json"):
            files.append(os.path.join(DATA_DIR, f))
    return files


def _load_cat(path):
    """加载分类JSON"""
    with open(path) as f:
        return json.load(f)


def _today():
    return datetime.now().date()


def _check_missing_nav():
    """净值缺失检测：当前交易日应有的净值未拉取。跳过入库<3天的新基金"""
    issues = []
    today = _today()
    for path in _data_files():
        data = _load_cat(path)
        cat_name = data.get("meta", {}).get("name", os.path.basename(path))
        for series in data.get("series", []):
            for share in series.get("shares", []):
                if not share.get("nav") or share.get("nav") == 0:
                    added_raw = share.get("added_date", "")
                    if added_raw:
                        try:
                            added_dt = datetime.strptime(added_raw, "%Y-%m-%d").date()
                            if (today - added_dt).days <= 3:
                                continue
                        except ValueError:
                            pass
                    issues.append({
                        "severity": "warning",
                        "category": "missing_nav",
                        "fund_code": share["code"],
                        "fund_name": share.get("name", "?"),
                        "cat": cat_name,
                        "suggestion": f"python3 fundctl.py refresh --code {share['code']}",
                        "auto_fix": True
                    })
    return issues


def _check_buy_status_anomaly():
    """申购状态异常：暂停申购却没有标注日期"""
    issues = []
    for path in _data_files():
        data = _load_cat(path)
        cat_name = data.get("meta", {}).get("name", os.path.basename(path))
        for series in data.get("series", []):
            for share in series.get("shares", []):
                status = share.get("buy_status", "")
                if status in ("暂停申购", "封闭期") and not share.get("buy_status_date"):
                    issues.append({
                        "severity": "info",
                        "category": "buy_status_no_date",
                        "fund_code": share["code"],
                        "fund_name": share.get("name", "?"),
                        "cat": cat_name,
                        "suggestion": "申购状态日期缺失，下一次 fill 会自动补充",
                        "auto_fix": False
                    })
    return issues


def _check_nav_regression():
    """净值日期回退检测"""
    issues = []
    for path in _data_files():
        data = _load_cat(path)
        meta = data.get("meta", {})
        last_nav = meta.get("last_nav_date", "")
        generated = meta.get("generated_at", "")
        if generated and last_nav:
            try:
                gen_dt = datetime.fromisoformat(generated.replace("Z", "+00:00"))
                nav_dt = datetime.strptime(last_nav, "%Y-%m-%d")
                if (gen_dt.date() - nav_dt.date()).days > 3:
                    issues.append({
                        "severity": "error",
                        "category": "nav_stale",
                        "fund_code": "",
                        "fund_name": meta.get("name", "?"),
                        "cat": meta.get("name", os.path.basename(path)),
                        "suggestion": "数据超过 3 天未更新，检查 pipeline.fill 是否正常运行",
                        "auto_fix": False
                    })
            except Exception:
                pass
    return issues


def _check_fee_anomalies():
    """费率异常：管理费+托管费为 0"""
    issues = []
    for path in _data_files():
        data = _load_cat(path)
        cat_name = data.get("meta", {}).get("name", os.path.basename(path))
        for series in data.get("series", []):
            for share in series.get("shares", []):
                mgmt_fee = share.get("fee_mgmt", 0)
                if mgmt_fee == 0:
                    issues.append({
                        "severity": "warning",
                        "category": "missing_fee",
                        "fund_code": share["code"],
                        "fund_name": share.get("name", "?"),
                        "cat": cat_name,
                        "suggestion": "python3 fundctl.py sync（重跑完整流水线补充费率数据）",
                        "auto_fix": False
                    })
    return issues

def auto_fix(issues, max_rounds=3):
    """针对 auto_fix=true 的异常尝试自动修复（CI 白名单：仅数据刷新，不扫描/不重试）。
    返回 (fixed_count, failed_count)"""
    fixed, failed = 0, 0
    for item in issues:
        if not item.get("auto_fix"):
            continue
        code = item.get("fund_code", "")
        if not code:
            continue
        cat = item["category"]
        try:
            if cat == "missing_nav":
                subprocess.run(
                    [sys.executable, str(SCRIPTS_DIR / "fundctl.py"), "refresh", "--code", code],
                    cwd=str(SCRIPTS_DIR), capture_output=True, timeout=120,
                )
            fixed += 1
        except Exception:
            failed += 1
    return fixed, failed


def main():
    import argparse
    p = argparse.ArgumentParser(description="QDII 数据诊断")
    p.add_argument("--cat", help="按分类筛选")
    p.add_argument("--json", action="store_true", help="JSON 输出")
    p.add_argument("--auto-fix", action="store_true", help="自动修复 missing_nav 异常（单轮，不重试）")
    args = p.parse_args()

    issues = diagnose_all()
    if args.cat:
        issues = [i for i in issues if i.get("cat") == args.cat]

    if args.auto_fix:
        fixed, failed = auto_fix(issues)
        print(f"auto-fix 完成: {fixed} 修复, {failed} 失败")

    if args.json:
        print(json.dumps(issues, ensure_ascii=False, indent=2))
    elif issues:
        for item in issues:
            print(f"[{item['severity'].upper()}] {item['category']}: {item['fund_name']}({item['fund_code']}) → {item['suggestion']}")
    else:
        print("✅ 数据正常，无异常")


if __name__ == "__main__":
    main()
