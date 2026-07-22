"""诊断引擎：分析异常数据并输出可操作的修复建议"""
import json
import os
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "web" / "data"


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
