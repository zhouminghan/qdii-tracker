#!/usr/bin/env python3
"""
scripts/architecture_lint.py — 目录纪律强制校验

用途：
    把 AGENT.md 第11条"目录纪律"从文字声明变成脚本强制校验：
    web/ 目录只能包含约定的产物类型，不能被前端调试文件、临时脚本、
    误放的数据文件污染——这类"改一处、无声无息扩散"的目录腐化，
    人眼 review 容易漏，脚本校验成本几乎为零。

校验规则（对应 AGENT.md 第11条）：
    web/ 顶层仅允许：
        - index.html（唯一入口）
        - robots.txt / sitemap.xml（SEO 静态文件）
        - .nojekyll（GitHub Pages 标记文件）
    web/data/  仅允许 *.json（+ holdings/ 子目录，同样仅 *.json）
    web/js/    仅允许 *.js
    web/css/   仅允许 *.css

设计原则：
    - 只做「结构」校验，不做内容语义校验（内容校验交给 feedback/verify_data.py）
    - 白名单机制：未列入允许列表的顶层文件/目录一律报错，防止"忘了加规则"导致漏检
    - 可独立运行，也可被 fundctl.py check 调用

用法：
    python3 scripts/architecture_lint.py          # 独立运行（从项目根目录）
    from architecture_lint import run_lint         # 被 fundctl.py check 调用
"""
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent
WEB_DIR = ROOT_DIR / "web"

# web/ 顶层允许的文件名（精确匹配）
WEB_TOP_ALLOWED_FILES = {"index.html", "robots.txt", "sitemap.xml", ".nojekyll"}
# web/ 顶层允许的子目录名
WEB_TOP_ALLOWED_DIRS = {"data", "js", "css"}

# 各子目录允许的文件扩展名
SUBDIR_ALLOWED_EXT = {
    "data": {".json"},
    "js": {".js"},
    "css": {".css"},
}


def _check_top_level() -> list:
    """校验 web/ 顶层：文件必须在白名单，目录必须在白名单。"""
    errors = []
    if not WEB_DIR.exists():
        return [f"web/ 目录不存在: {WEB_DIR}"]

    for entry in WEB_DIR.iterdir():
        if entry.is_dir():
            if entry.name not in WEB_TOP_ALLOWED_DIRS:
                errors.append(f"web/{entry.name}/ 不在允许的子目录白名单 {WEB_TOP_ALLOWED_DIRS}")
        else:
            if entry.name not in WEB_TOP_ALLOWED_FILES:
                errors.append(f"web/{entry.name} 不在允许的顶层文件白名单 {WEB_TOP_ALLOWED_FILES}")
    return errors


def _check_subdir(name: str, allowed_ext: set) -> list:
    """校验子目录内文件扩展名；data/ 允许 holdings/ 子目录（同样只能放 .json）。"""
    errors = []
    subdir = WEB_DIR / name
    if not subdir.exists():
        return errors  # 子目录本身不存在不算错误（不同环境可能未生成）

    for entry in subdir.iterdir():
        if entry.is_dir():
            # 仅 data/holdings/ 这种一层子目录豁免，其内容仍需是 .json
            if name == "data" and entry.name == "holdings":
                for sub_entry in entry.iterdir():
                    if sub_entry.is_file() and sub_entry.suffix not in allowed_ext:
                        errors.append(
                            f"web/{name}/holdings/{sub_entry.name} 扩展名不在允许列表 {allowed_ext}"
                        )
                continue
            errors.append(f"web/{name}/{entry.name}/ 出现未预期的子目录")
        elif entry.is_file():
            if entry.suffix not in allowed_ext:
                errors.append(f"web/{name}/{entry.name} 扩展名不在允许列表 {allowed_ext}")
    return errors


def run_lint() -> list:
    """执行全部校验，返回错误列表（空列表 = 全部通过）。"""
    errors = []
    errors.extend(_check_top_level())
    for subdir, allowed_ext in SUBDIR_ALLOWED_EXT.items():
        errors.extend(_check_subdir(subdir, allowed_ext))
    return errors


def main():
    errors = run_lint()
    if errors:
        print("❌ 目录纪律校验失败（AGENT.md 第11条）：")
        for e in errors:
            print(" -", e)
        raise SystemExit(1)
    print("✅ 目录纪律校验通过")


if __name__ == "__main__":
    main()
