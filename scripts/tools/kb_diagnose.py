#!/usr/bin/env python3
"""
知识库自诊断 — 对标 fundctl.py diagnose。
检测 5 类腐坏：ADR 过期 / 手册过期 / gotchas 膨胀 / 图谱退化 / 盲区积压
"""
import json
import re
import os
from datetime import datetime, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
KNOWLEDGE_DIR = PROJECT_ROOT / "knowledge"
GRAPH_DIR = KNOWLEDGE_DIR / ".graph"


def diagnose_all():
    issues = []
    issues += _check_adr_staleness()
    issues += _check_module_staleness()
    issues += _check_gotchas_bloat()
    issues += _check_graph_regression()
    issues += _check_blindspots_backlog()
    return issues


def _check_adr_staleness():
    """遍历 knowledge/adr/*.md → 提取源码引用 → 检查文件/行号有效性"""
    issues = []
    adr_dir = KNOWLEDGE_DIR / "adr"
    if not adr_dir.exists():
        return [{"severity": "info", "category": "no_adr", "suggestion": "knowledge/adr/ 目录不存在"}]

    # 只匹配以 scripts/ 或 web/ 开头的源码引用（避免匹配到 knowledge/adr/ 等路径）
    ref_pattern = re.compile(r'`((?:scripts|web)/[^`]+\.(?:py|js|css|html|json|yaml)):(\d+)`')

    for adr_file in adr_dir.glob("*.md"):
        content = adr_file.read_text()
        refs = ref_pattern.findall(content)
        if len(refs) < 2:
            # 放宽：统计所有 "源码引用" 句段的出现
            code_ref_section = re.findall(r'## 源码引用\n(.*?)(?:\n##|\Z)', content, re.DOTALL)
            ref_count = 0
            for section in code_ref_section:
                ref_count += len(re.findall(r'-\s+`', section))
            if ref_count < 2:
                issues.append({
                    "severity": "warning",
                    "category": "adr_insufficient_refs",
                    "page": str(adr_file.name),
                    "suggestion": "至少需要 2 条源码引用"
                })
        for file_ref, line_num in refs:
            full_path = PROJECT_ROOT / file_ref.strip("'\"")
            if not full_path.exists():
                issues.append({
                    "severity": "warning",
                    "category": "adr_stale_ref",
                    "page": str(adr_file.name),
                    "ref": file_ref,
                    "reason": "文件不存在"
                })
            elif line_num and line_num.isdigit():
                try:
                    file_lines = full_path.read_text().split('\n')
                    if int(line_num) > len(file_lines):
                        issues.append({
                            "severity": "warning",
                            "category": "adr_stale_ref",
                            "page": str(adr_file.name),
                            "ref": f"{file_ref}:{line_num}",
                            "reason": f"行号 {line_num} 超出范围（共 {len(file_lines)} 行）"
                        })
                except Exception:
                    pass
    return issues


def _check_module_staleness():
    """遍历 knowledge/modules/*.md → 检查 updated 字段是否 >30 天"""
    issues = []
    modules_dir = KNOWLEDGE_DIR / "modules"
    if not modules_dir.exists():
        return []

    for mod_file in modules_dir.glob("*.md"):
        content = mod_file.read_text()
        # 兼容 **updated** 和 updated 两种格式，中文冒号和英文冒号
        match = re.search(r'\*{0,2}updated\*{0,2}[：:\s]+(\d{4}-\d{2}-\d{2})', content)
        if match:
            updated = datetime.strptime(match.group(1), "%Y-%m-%d")
            days = (datetime.now() - updated).days
            if days > 30:
                issues.append({
                    "severity": "info",
                    "category": "module_stale",
                    "page": str(mod_file.name),
                    "last_updated": match.group(1),
                    "days_since_update": days
                })
        else:
            issues.append({
                "severity": "info",
                "category": "module_no_date",
                "page": str(mod_file.name),
                "suggestion": "缺少 updated 字段"
            })
    return issues


def _check_gotchas_bloat():
    """gotchas.md 条目 >30？提示按模块拆分"""
    gotchas_file = KNOWLEDGE_DIR / "gotchas.md"
    if gotchas_file.exists():
        count = len(re.findall(r'^\| G\d{3}', gotchas_file.read_text(), re.MULTILINE))
        if count > 30:
            return [{"severity": "info", "category": "gotchas_bloat",
                     "count": count, "suggestion": "建议按模块拆分为 knowledge/gotchas/*.md"}]
    return []


def _check_graph_regression():
    """对比 graph-meta.json 上次统计 → 节点/边退化 >15%？"""
    meta_file = GRAPH_DIR / "graph-meta.json"
    if not meta_file.exists():
        return [{"severity": "warning", "category": "no_graph",
                 "suggestion": "运行 code_graph.py build --full"}]
    try:
        meta = json.loads(meta_file.read_text())
    except json.JSONDecodeError:
        return [{"severity": "error", "category": "graph_meta_corrupt"}]

    prev_nodes = meta.get("prev_nodes", meta.get("nodes", 0))
    prev_edges = meta.get("prev_edges", meta.get("edges", 0))
    curr_nodes = meta.get("nodes", 0)
    curr_edges = meta.get("edges", 0)

    issues = []
    if prev_nodes > 0 and curr_nodes > 0 and (prev_nodes - curr_nodes) / prev_nodes > 0.15:
        issues.append({"severity": "error", "category": "graph_regression",
                       "detail": f"节点数 {prev_nodes}→{curr_nodes}（-{(prev_nodes-curr_nodes)/prev_nodes:.0%}），>15% 退化阈值"})
    if prev_edges > 0 and curr_edges > 0 and (prev_edges - curr_edges) / prev_edges > 0.15:
        issues.append({"severity": "error", "category": "graph_regression",
                       "detail": f"边数 {prev_edges}→{curr_edges}（-{(prev_edges-curr_edges)/prev_edges:.0%}），>15% 退化阈值"})
    return issues


def _check_blindspots_backlog():
    """Agent 反馈盲区积压 >10 条未处理？"""
    blindspots_file = GRAPH_DIR / "blindspots.json"
    if blindspots_file.exists():
        try:
            blindspots = json.loads(blindspots_file.read_text())
            pending = [b for b in blindspots if b.get("status") == "pending"]
            if len(pending) > 10:
                return [{"severity": "info", "category": "blindspots_backlog",
                         "count": len(pending), "suggestion": "抽时间处理 Agent 答不上的问题"}]
        except (json.JSONDecodeError, Exception):
            pass
    return []


def _check_directory_structure():
    """检查目录骨架是否完整"""
    issues = []
    for d in ["adr", "modules", ".graph"]:
        if not (KNOWLEDGE_DIR / d).exists():
            issues.append({"severity": "error", "category": "missing_dir",
                           "detail": f"knowledge/{d} 不存在"})
    return issues


def main():
    import argparse
    p = argparse.ArgumentParser(description="知识库自诊断")
    p.add_argument("--json", action="store_true", help="JSON 输出")
    p.add_argument("--check-adr", action="store_true", help="仅检查 ADR 结构")
    p.add_argument("--check-modules", action="store_true", help="仅检查模块手册结构")
    p.add_argument("--check-staleness", action="store_true", help="仅检查源码引用是否过期")
    p.add_argument("--check-gotchas", action="store_true", help="仅检查 gotchas")
    args = p.parse_args()

    issues = []
    if args.check_adr:
        issues += _check_adr_staleness()
    elif args.check_modules:
        issues += _check_module_staleness()
    elif args.check_staleness:
        issues += _check_adr_staleness()
        issues += _check_module_staleness()
    elif args.check_gotchas:
        issues += _check_gotchas_bloat()
    else:
        issues += _check_directory_structure()
        issues += diagnose_all()

    if args.json:
        print(json.dumps(issues, ensure_ascii=False, indent=2))
    elif issues:
        for item in issues:
            sev = item.get("severity", "info").upper()
            cat = item.get("category", "?")
            detail = item.get("detail", item.get("reason", item.get("page", item.get("suggestion", ""))))
            print(f"[{sev}] {cat}: {detail}")
        print(f"\n❌ {len(issues)} 个问题")
    else:
        print("✅ 知识库健康，无问题")


if __name__ == "__main__":
    main()
