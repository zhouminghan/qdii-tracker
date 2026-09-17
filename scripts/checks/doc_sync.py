#!/usr/bin/env python3
"""
doc_sync.py — 文档自动同步（防止信息滞后）

从「真实状态」（git 追踪文件 + fundctl.py 子命令）推导文档中可自动生成的部分，
在每次提交前（.githooks/pre-commit）或 CI（fundctl.py check --agent-rules）中执行：

  --fix   同步 README.md 的目录树 + 命令列表（标记块内）
  --check 只检查：目录树/命令是否滞后、INDEX/AGENTS.md 引用是否失效、
          pipeline/checks 是否出现了 AGENTS.md 未登记的新模块

设计原则：
  - 能自动推导的（目录树、命令）→ 自动改写（--fix）
  - 语义化的（INDEX 路由说明、AGENTS.md 规则）→ 只校验并报错（--check），
    避免用脚本覆盖人手写的语义说明。
  - 标记块：文档里用 <!-- DOCSYNC START: xxx --> / <!-- DOCSYNC END: xxx -->
    包住自动生成区，其余内容一律不动。
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_DIR = ROOT / "scripts"

# ─────────────────────────────────────────────────────────
# 目录树注释（README 目录树中每个一级目录的说明）
# ─────────────────────────────────────────────────────────
TREE_ANNOTATIONS = {
    ".github": "CI 工作流（deploy-pages / update-data / ci）",
    ".githooks": "本地 pre-commit 钩子（提交前自动 doc_sync）",
    "scripts": "数据流水线（Python）",
    "config": "基金分类 SSOT 配置",
    "web": "前端（纯静态）",
    "knowledge": "解释记忆 — Agent 知识库",
    "test": "测试与 UI 回归（pytest + Playwright）",
}

MARKERS = {
    "tree": ("<!-- DOCSYNC START: tree -->", "<!-- DOCSYNC END: tree -->"),
    "commands": ("<!-- DOCSYNC START: commands -->", "<!-- DOCSYNC END: commands -->"),
}


# ─────────────────────────────────────────────────────────
# 真实状态采集
# ─────────────────────────────────────────────────────────
def tracked_files():
    """返回即将进入提交的文件相对路径列表（已追踪 + 暂存 + 未忽略的未追踪）；
    git 不可用时降级为 os.walk。"""
    try:
        out = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
            capture_output=True, text=True, cwd=ROOT, timeout=10,
        )
        if out.returncode == 0:
            return [l for l in out.stdout.splitlines() if l.strip()]
    except (OSError, subprocess.SubprocessError):
        pass

    files = []
    ignore_dirs = {".git", "__pycache__", ".venv", "venv", ".pytest_cache",
                   ".mypy_cache", ".ruff_cache", ".agents", "node_modules"}
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in ignore_dirs and not d.startswith(".")]
        for fn in filenames:
            files.append(os.path.relpath(os.path.join(dirpath, fn), ROOT))
    return files


def fundctl_commands():
    """从 fundctl.py --help 解析子命令名 + 帮助文本。"""
    try:
        out = subprocess.run(
            ["python3", "fundctl.py", "--help"],
            capture_output=True, text=True, cwd=SCRIPTS_DIR, timeout=15,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    if out.returncode != 0:
        return []
    cmds = []
    in_pos = False
    for line in out.stdout.splitlines():
        if "positional arguments:" in line:
            in_pos = True
            continue
        if in_pos:
            if not line.strip() or not line.startswith(" "):
                # 遇到空行或回退缩进（如 options:）则结束
                if line.strip() and not line.startswith(" "):
                    break
                if not line.strip():
                    break
            stripped = line.strip()
            if "{" in stripped:
                continue
            parts = stripped.split(None, 1)
            if len(parts) == 2 and parts[0].isalnum():
                cmds.append((parts[0], parts[1].strip()))
    return cmds


# ─────────────────────────────────────────────────────────
# 生成内容
# ─────────────────────────────────────────────────────────
def build_tree():
    """按一级目录 → 二级条目聚合，生成 README 目录树文本。"""
    top = {}
    root_files = []
    for f in tracked_files():
        parts = f.split("/")
        if parts[-1] == "__init__.py":
            continue
        if len(parts) == 1:
            root_files.append(f)
            continue
        d0 = parts[0]
        entry = top.setdefault(d0, {"dirs": set(), "files": []})
        if len(parts) == 2:
            entry["files"].append(parts[1])
        else:
            entry["dirs"].add(parts[1])

    lines = ["qdii-tracker/"]
    order = [".github", ".githooks", "scripts", "config", "web", "knowledge", "test"]
    dirs = [d for d in order if d in top]
    dirs += [d for d in sorted(top) if d not in order]

    for idx, d in enumerate(dirs):
        ann = TREE_ANNOTATIONS.get(d, "")
        suffix = f"    # {ann}" if ann else ""
        is_last_top = idx == len(dirs) - 1 and not root_files
        branch = "└──" if is_last_top else "├──"
        lines.append(f"{branch} {d}/{suffix}")
        entry = top[d]
        items = sorted(entry["dirs"]) + sorted(entry["files"])
        for j, it in enumerate(items):
            is_dir = it in entry["dirs"]
            sub_branch = "└──" if j == len(items) - 1 else "├──"
            prefix = "    " if is_last_top else "│   "
            lines.append(f"{prefix}{sub_branch} {it}{'/' if is_dir else ''}")

    for i, f in enumerate(sorted(root_files)):
        branch = "└──" if i == len(root_files) - 1 else "├──"
        lines.append(f"{branch} {f}")
    return "\n".join(lines)


def render_commands():
    lines = []
    for name, help_text in fundctl_commands():
        lines.append(f"python3 fundctl.py {name:<12} # {help_text}")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────
# 标记块替换
# ─────────────────────────────────────────────────────────
def _replace_block(content, key, new_body):
    start_marker, end_marker = MARKERS[key]
    if start_marker not in content or end_marker not in content:
        return None, f"缺少标记 {start_marker} / {end_marker}"
    left = content.split(start_marker)[0]
    right = content.split(end_marker)[1]
    return left + start_marker + "\n" + new_body + "\n" + end_marker + right, None


def fix_readme():
    """同步 README.md 的目录树 + 命令列表标记块。"""
    fp = ROOT / "README.md"
    content = fp.read_text(encoding="utf-8")
    errors = []

    tree_body = "```text\n" + build_tree() + "\n```"
    content, err = _replace_block(content, "tree", tree_body)
    if err:
        errors.append(err)

    cmd_body = "```bash\n" + render_commands() + "\n```"
    content, err = _replace_block(content, "commands", cmd_body)
    if err:
        errors.append(err)

    fp.write_text(content, encoding="utf-8")
    return errors


# ─────────────────────────────────────────────────────────
# 校验（只读，不写）
# ─────────────────────────────────────────────────────────
def check_index():
    """校验 knowledge/INDEX.md 路由表引用的文件都存在。"""
    fp = ROOT / "knowledge" / "INDEX.md"
    if not fp.exists():
        return [f"knowledge/INDEX.md 不存在"]
    content = fp.read_text(encoding="utf-8")
    errors = []
    import re
    # 路由表 / 使用顺序里 `xxx.md` 形式引用；相对 knowledge/ 或项目根解析
    for ref in re.findall(r"`([a-zA-Z0-9_/.-]+\.md)`", content):
        candidates = [ROOT / "knowledge" / ref, ROOT / ref]
        if not any(c.exists() for c in candidates):
            errors.append(f"INDEX.md 引用的文件不存在: {ref}")
    return errors


def check_agents_modules():
    """校验 AGENTS.md 中登记的 pipeline/checks 模块与实际代码一致（防新模块漏登记）。"""
    fp = ROOT / "AGENTS.md"
    if not fp.exists():
        return ["AGENTS.md 不存在"]
    content = fp.read_text(encoding="utf-8")
    errors = []
    import re
    for prefix in ("pipeline", "checks", "core", "sources"):
        real = {
            p.stem for p in (SCRIPTS_DIR / prefix).glob("*.py")
            if p.name != "__init__.py"
        }
        for stem in sorted(real):
            # sources 结构注释里写 akshare/eastmoney/xueqiu（不带 _source 后缀）
            mention = stem[: -len("_source")] if prefix == "sources" and stem.endswith("_source") else stem
            if not re.search(rf"\b{re.escape(mention)}\b", content):
                errors.append(f"AGENTS.md 未登记模块: {prefix}/{stem}.py")
    return errors


def run_check():
    """只读校验，返回错误列表。"""
    errors = []
    # README 标记块是否与真实状态一致（比较生成结果）
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for key in ("tree", "commands"):
        start_marker, end_marker = MARKERS[key]
        if start_marker not in readme or end_marker not in readme:
            errors.append(f"README.md 缺少标记 {start_marker}")
            continue
        current = readme.split(start_marker)[1].split(end_marker)[0].strip()
        if key == "tree":
            expected = "```text\n" + build_tree() + "\n```"
        else:
            expected = "```bash\n" + render_commands() + "\n```"
        if current != expected.strip():
            errors.append(f"README.md 的 {key} 标记块已滞后（请运行 doc_sync.py --fix）")
    errors.extend(check_index())
    errors.extend(check_agents_modules())
    return errors


def main():
    ap = argparse.ArgumentParser(description="文档自动同步")
    ap.add_argument("--check", action="store_true", help="只检查，不写文件")
    ap.add_argument("--fix", action="store_true", help="同步 README 标记块")
    args = ap.parse_args()

    if not args.check and not args.fix:
        args.fix = True

    if args.fix:
        errors = fix_readme()
        for e in errors:
            print(f"  ⚠ {e}")
        print("✅ doc_sync --fix 完成（README 目录树 + 命令列表已同步）")

    if args.check:
        errors = run_check()
        if errors:
            print("❌ 文档同步校验失败：")
            for e in errors:
                print(f"  - {e}")
            raise SystemExit(1)
        print("✅ 文档同步校验通过")


if __name__ == "__main__":
    main()
