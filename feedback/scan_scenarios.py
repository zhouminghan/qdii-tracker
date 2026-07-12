#!/usr/bin/env python3
"""
feedback/scan_scenarios.py — 改动 ↔ 回归场景联动扫描（Harness 反馈层的自动提示机制）

用途（解决的真实缺口）：
    ui_scenarios/*.yaml 是"工具无关声明式"契约，本身不能被这个脚本自动执行
    （执行时由 Agent 现场发现浏览器自动化工具去驱动，AGENT.md 规则29已定）。
    但"改了这个文件，该重跑哪几个场景"这件事本身是可以自动发现的——
    每个场景文件的 origin.fixed_in 字段记录了它对应哪个源文件的哪次修复/重构。

    没有这个脚本之前，"这次改动是否触发已固化场景"完全依赖人/AI记住
    AGENT.md 规则32（固化检查点）,记忆会漂移——这正是 Harness Engineering
    警告的"看起来跑通了就等于任务完成"的反面案例：可能改了 screenshot.js
    却忘了那里有 3 个已固化的回归契约。

工作方式：
    1. 用 git diff 拿到当前未提交（working tree + staged）改动的文件列表
    2. 遍历 ui_scenarios/*.yaml，解析每条的 origin.fixed_in 字段
    3. 若改动文件命中某场景的 fixed_in（子串匹配，因为 fixed_in 可能只写到函数级），
       记录为"关联场景"
    4. 返回 {改动文件: [场景文件名, ...]} 的映射，由调用方决定怎么呈现
       （fundctl.py check 用它做 non-blocking 提示；不阻断校验流程）

设计原则：
    - non-blocking：这只是提示，不是门禁——UI 场景需要人/Agent 现场跑浏览器工具，
      脚本自己判断不了"跑没跑"，只能提示"建议跑"
    - 尽量少依赖：不引入 yaml 解析库，用简单文本匹配抓 fixed_in 字段
      （场景文件格式简单，没必要为此引入 PyYAML 依赖）

用法：
    python3 feedback/scan_scenarios.py                # 独立运行，打印当前改动的关联场景
    from feedback.scan_scenarios import find_related_scenarios  # 被 fundctl.py check 调用
"""
import re
import subprocess
import sys
from pathlib import Path

FEEDBACK_DIR = Path(__file__).parent
ROOT_DIR = FEEDBACK_DIR.parent
SCENARIOS_DIR = FEEDBACK_DIR / "ui_scenarios"

_FIXED_IN_RE = re.compile(
    r'fixed_in:\s*["\']?(.+?)(?=\n\S|\Z)', re.DOTALL
)


def _get_changed_files() -> list:
    """git diff 拿working tree + staged改动的文件列表（相对项目根目录路径）。"""
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD"],
            cwd=ROOT_DIR, capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return []
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]
    except (subprocess.SubprocessError, OSError):
        return []


def _extract_fixed_in(yaml_path: Path) -> str:
    """从场景 yaml 文件中提取 origin.fixed_in 字段值（简单正则，不引入 PyYAML）。"""
    try:
        text = yaml_path.read_text(encoding="utf-8")
    except OSError:
        return ""
    m = _FIXED_IN_RE.search(text)
    return m.group(1).strip() if m else ""


def find_related_scenarios(changed_files: list = None) -> dict:
    """
    返回 {改动文件路径: [关联场景文件名, ...]} 的映射。
    changed_files 为 None 时自动用 git diff 获取；传入空列表则永远返回空字典
    （方便测试时显式控制输入，不依赖真实 git 状态）。
    """
    if changed_files is None:
        changed_files = _get_changed_files()
    if not changed_files or not SCENARIOS_DIR.exists():
        return {}

    scenario_fixed_in = {}
    for yaml_path in SCENARIOS_DIR.glob("*.yaml"):
        if yaml_path.name.startswith("_"):
            continue  # 跳过 _TEMPLATE.yaml
        fixed_in = _extract_fixed_in(yaml_path)
        if fixed_in:
            scenario_fixed_in[yaml_path.name] = fixed_in

    related = {}
    for changed_file in changed_files:
        matched = []
        for scenario_name, fixed_in in scenario_fixed_in.items():
            # 子串匹配：fixed_in 可能是 "web/js/screenshot.js snapPng()" 这种带函数名的写法，
            # 只要改动文件路径是 fixed_in 的前缀子串即可命中
            if changed_file in fixed_in or fixed_in.startswith(changed_file):
                matched.append(scenario_name)
        if matched:
            related[changed_file] = sorted(matched)

    return related


def main():
    related = find_related_scenarios()
    if not related:
        print("✅ 当前改动未匹配到任何已固化的回归场景（或无未提交改动）")
        return
    print("💡 当前改动关联以下已固化回归场景，建议重跑确认：")
    for changed_file, scenarios in related.items():
        print(f"  {changed_file}")
        for sc in scenarios:
            print(f"    → {sc}")


if __name__ == "__main__":
    main()
