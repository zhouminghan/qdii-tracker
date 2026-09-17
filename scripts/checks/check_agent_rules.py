"""
Agent 规则机器验证：检查 knowledge/ ↔ AGENTS.md ↔ Skills ↔ 代码的一致性。
被 fundctl.py check --agent-rules 调用。
"""
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
KNOWLEDGE_DIR = ROOT / "knowledge"
# Skills 已内联到 AGENTS.md（CodeBuddy→Codex 清理），此处保留可扩展目录：
# 若未来重新拆分出独立 skills，放在 .codex/skills/。
SKILLS_DIR = ROOT / ".codex" / "skills"


def _files_exist(paths):
    """批量检查文件是否存在，返回缺失列表。"""
    missing = []
    for p in paths:
        fp = ROOT / p
        if not fp.exists():
            missing.append(p)
    return missing


def _check_knowledge_files():
    """验证 knowledge/ 下所有必需文件都存在。"""
    required = [
        "knowledge/INDEX.md",
        "knowledge/gotchas.md",
        "knowledge/pipeline-contracts.md",
        "knowledge/data-sources.md",
        "knowledge/data-schema.md",
        "knowledge/golden-fixtures.md",
    ]
    return _files_exist(required)


def _check_pipeline_contracts():
    """验证 pipeline-contracts.md 中引用的模块都存在。"""
    fp = KNOWLEDGE_DIR / "pipeline-contracts.md"
    if not fp.exists():
        return ["pipeline-contracts.md not found"]
    content = fp.read_text(encoding="utf-8")
    # 提取模块名：pipeline/xxx.py 或 checks/xxx.py
    modules = re.findall(r'(?:pipeline|checks)/(\w+)\.py', content)
    errors = []
    for mod in set(modules):
        for prefix in ["pipeline", "checks"]:
            if (ROOT / "scripts" / prefix / f"{mod}.py").exists():
                break
        else:
            errors.append(f"pipeline-contracts.md 引用不存在的模块: {mod}")
    return errors


def _check_gotchas_refs():
    """验证 gotchas.md 中涉及的源文件路径有效。"""
    fp = KNOWLEDGE_DIR / "gotchas.md"
    if not fp.exists():
        return ["gotchas.md not found"]
    content = fp.read_text(encoding="utf-8")
    # 提取文件引用：path/to/file.ext
    refs = re.findall(r'`([a-zA-Z0-9_/.-]+\.[a-z]{2,4})`', content)
    errors = []
    for ref in refs:
        # 跳过明显不是文件路径的（如全大写的常量名）
        if ref.endswith(('.js', '.css', '.py', '.md', '.json', '.html')):
            # 裸文件名（不含 /）无法可靠解析到唯一路径（如 stamp_asset_version.py），跳过
            if "/" not in ref:
                continue
            full = ROOT / ref
            if not full.exists():
                errors.append(f"gotchas.md 引用不存在的文件: {ref}")
    return errors


def _check_agent_commands():
    """验证 AGENTS.md 中的命令引用在 fundctl.py 中存在。"""
    fp = ROOT / "AGENTS.md"
    if not fp.exists():
        return ["AGENTS.md not found"]
    content = fp.read_text(encoding="utf-8")
    # 提取 fundctl.py 子命令
    commands = re.findall(r'fundctl\.py\s+(\w+)', content)
    valid = set()
    try:
        result = subprocess.run(
            ["python3", str(ROOT / "scripts" / "fundctl.py"), "--help"],
            capture_output=True, text=True, timeout=5
        )
        valid = set(re.findall(r'\s+(\w+)\s+', result.stdout))
    except Exception:
        return ["无法运行 fundctl.py --help，跳过命令校验"]

    errors = []
    for cmd in set(commands):
        if cmd not in valid and cmd != "check":
            errors.append(f"AGENTS.md 引用未知命令: fundctl.py {cmd}")
    return errors


def _check_readme_tree():
    """验证 README.md 中的关键目录存在。"""
    fp = ROOT / "README.md"
    if not fp.exists():
        return ["README.md not found"]
    content = fp.read_text(encoding="utf-8")
    # 提取目录树中一级条目（行首 ├── / └──，无缩进），区分目录与文件
    tree_entries = []
    for m in re.finditer(r'^[├└]──\s+(\S+)', content, re.M):
        entry = m.group(1)
        tree_entries.append((entry.rstrip("/"), entry.endswith("/")))

    # 需要存在的一级目录（固定清单）
    must_exist = [
        'scripts', 'config', 'web', 'knowledge', 'test',
    ]
    errors = []
    for d in must_exist:
        if not (ROOT / d).is_dir():
            errors.append(f"README 中的目录不存在: {d}/")
    # README 目录树里出现的一级目录也必须真实存在（防树与磁盘漂移）
    for name, is_dir in tree_entries:
        if is_dir and not (ROOT / name).is_dir():
            errors.append(f"README 目录树引用了不存在的目录: {name}/")
    return errors


def _check_doc_sync():
    """校验 README 标记块 / knowledge/INDEX / AGENTS.md 模块登记是否滞后。"""
    try:
        from checks.doc_sync import run_check
        return run_check()
    except Exception as e:  # noqa: BLE001
        return [f"doc_sync 校验异常: {e}"]


def _check_skills_refs():
    """验证 Skills 中引用的命令/文件存在。"""
    if not SKILLS_DIR.exists():
        return []  # 无独立 skills 目录时跳过（操作协议已内联到 AGENTS.md）
    errors = []
    for skill_dir in SKILLS_DIR.iterdir():
        if skill_dir.is_symlink() or skill_dir.is_dir():
            skmd = skill_dir / "SKILL.md"
            if not skmd.exists():
                continue
            content = skmd.read_text(encoding="utf-8")
            # 检查 fundctl.py 命令引用
            cmds = re.findall(r'fundctl\.py\s+(\w+)', content)
            for cmd in cmds:
                if cmd not in ("add", "remove", "move", "refresh", "sync", "check", "diagnose", "--"):
                    errors.append(f"{skill_dir.name}: 引用未知命令 fundctl.py {cmd}")
            # 检查文件路径引用（Skills 中的路径通常是相对 scripts/ 或 web/ 的）
            paths = re.findall(r'`([a-zA-Z0-9_/.-]+\.[a-z]{2,4})`', content)
            for p in paths:
                if not any(p.endswith(ext) for ext in ('.js', '.py', '.md', '.json', '.css')):
                    continue
                # 尝试多种前缀
                found = False
                for prefix in ['scripts/', 'web/', 'config/', 'knowledge/', '']:
                    if (ROOT / prefix / p).exists():
                        found = True
                        break
                if not found:
                    errors.append(f"{skill_dir.name}: 引用不存在的文件 {p}")
    return errors


def check_agent_rules():
    """运行所有 Agent 规则校验，返回错误列表。"""
    import time

    def _layer(label, fn, err_label, ok_label):
        t = time.time()
        errs = fn()
        dt = time.time() - t
        print(f"{label}（{dt:.2f}s）")
        return errs, err_label, ok_label

    all_errors = []

    errs, el, ok = _layer("Layer A: knowledge/ 文件完整性", _check_knowledge_files, "个文件缺失", "全部存在")
    if errs:
        all_errors.extend(f"knowledge 缺失: {e}" for e in errs)
        print(f"  ❌ {len(errs)} {el}")
    else:
        print(f"  ✅ {ok}")

    errs, el, ok = _layer("Layer B: pipeline-contracts.md 引用有效性", _check_pipeline_contracts, "个无效引用", "全部有效")
    if errs:
        all_errors.extend(errs)
        print(f"  ❌ {len(errs)} {el}")
    else:
        print(f"  ✅ {ok}")

    errs, el, ok = _layer("Layer C: gotchas.md 文件引用有效性", _check_gotchas_refs, "个无效引用", "全部有效")
    if errs:
        all_errors.extend(errs)
        print(f"  ❌ {len(errs)} {el}")
    else:
        print(f"  ✅ {ok}")

    errs, el, ok = _layer("Layer D: AGENTS.md 命令引用有效性", _check_agent_commands, "个无效命令", "全部有效")
    if errs:
        all_errors.extend(errs)
        print(f"  ❌ {len(errs)} {el}")
    else:
        print(f"  ✅ {ok}")

    errs, el, ok = _layer("Layer E: README.md 目录树一致性", _check_readme_tree, "个条目不匹配", "匹配")
    if errs:
        all_errors.extend(errs)
        print(f"  ❌ {len(errs)} {el}")
    else:
        print(f"  ✅ {ok}")

    errs, el, ok = _layer("Layer F: Skills 引用有效性", _check_skills_refs, "个无效引用", "全部有效")
    if errs:
        all_errors.extend(errs)
        print(f"  ❌ {len(errs)} {el}")
    else:
        print(f"  ✅ {ok}")

    errs, el, ok = _layer("Layer G: 文档同步（doc_sync --check）", _check_doc_sync, "处滞后/失效", "同步")
    if errs:
        all_errors.extend(errs)
        print(f"  ❌ {len(errs)} {el}")
    else:
        print(f"  ✅ {ok}")

    if all_errors:
        print(f"\n❌ Agent 规则校验失败: {len(all_errors)} 个问题")
        for e in all_errors:
            print(f"  - {e}")
        raise SystemExit(1)

    print("\n✅ Agent 规则校验全部通过")
