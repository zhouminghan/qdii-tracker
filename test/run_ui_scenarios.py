#!/usr/bin/env python3
"""
run_ui_scenarios.py — 声明式 UI 回归场景执行器（Playwright）

执行 test/ui_scenarios/*.yaml（文件名前缀 _ 的为模板，跳过）。
每个场景描述「打开页面 → 交互 → 断言」，工具无关、声明式；
本执行器把它落到 Playwright + Chromium 上，让人和 CI 都能复现同一份回归契约。

用法：
  python test/run_ui_scenarios.py                  # 跑全部场景
  python test/run_ui_scenarios.py --scenario buy-tooltip-auto-flip
  python test/run_ui_scenarios.py --list           # 只列出场景

断言语义：
  - 精确断言（computedStyle/boundingRect/textContent/id/style/classList/eval）
    按字符串相等判定，布尔值归一化为 true/false。
  - 模糊断言（expected 含 ~ ± 或 误差 范围 非 （ 允许 等字样）只报告实测值，
    需要人工/Agent 核对，不判失败——这类期望值本身就是"近似描述"。
"""
import argparse
import http.server
import json
import re
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "web"
SCEN_DIR = Path(__file__).resolve().parent / "ui_scenarios"

FUZZY_MARKERS = ["~", "±", "或", "误差", "范围", "非", "（", "允许", "按出现顺序", "→"]


def start_server():
    """在 127.0.0.1 随机端口起一个只读静态服务器（根目录 = 项目根），
    这样场景里的 `open: web/index.html` 会映射到 http://host:port/web/index.html，
    页面内部的相对路径 ./data ./js ./css 也随之正确解析。"""
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(ROOT), **kw)

        def log_message(self, *a):
            pass

    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{port}"


def load_scenarios():
    files = sorted(SCEN_DIR.glob("*.yaml"))
    return [f for f in files if not f.name.startswith("_")]


def run_steps(page, steps, base_url):
    for step in steps:
        for action, value in step.items():
            if action == "open":
                page.goto(base_url + "/" + value.lstrip("/"), wait_until="load")
                # 等首屏数据渲染完成（分组 chips 出现），避免异步 fetch 竞态
                try:
                    page.wait_for_function(
                        "document.querySelectorAll('#offshore-chips .chip').length > 0"
                        " || document.querySelectorAll('#etf-chips .chip').length > 0",
                        timeout=15000,
                    )
                except Exception:  # noqa: BLE001
                    page.wait_for_timeout(2000)
            elif action == "click":
                page.click(value, timeout=8000)
            elif action == "fill":
                page.fill(value["selector"], value["value"], timeout=8000)
            elif action == "eval":
                js = value
                if re.search(r"\bawait\b", js):
                    js = f"(async () => {{\n{js}\n}})()"
                page.evaluate(js)
            elif action == "wait":
                page.wait_for_timeout(int(re.sub(r"\D", "", str(value)) or 0))
            elif action == "wait_for":
                _wait_for(page, value)
            elif action == "assert_and_close":
                _assert_and_close(page, value)
            else:
                raise ValueError(f"未知步骤类型: {action}")


def _wait_for(page, value):
    v = str(value).strip()
    if re.fullmatch(r"\d+\s*ms", v):
        page.wait_for_timeout(int(re.sub(r"\D", "", v)))
    elif v.startswith("(") and "=>" in v:
        page.wait_for_function(v, timeout=15000)
    else:
        page.wait_for_selector(v, timeout=15000)


def _assert_and_close(page, value):
    """语义步骤：断言弹窗已打开，再按描述的方式关闭。
    支持 'closeX via Escape key' / 'closeX via click on <selector>'。"""
    v = str(value)
    if "via" not in v:
        raise ValueError(f"无法解析 assert_and_close: {value}")
    method = v.split("via", 1)[1].strip()
    if "Escape" in method:
        page.keyboard.press("Escape")
    elif "click on" in method:
        sel = method.split("click on", 1)[1].strip()
        # 遮罩点击应落在 backdrop 本身而非居中的弹窗内容上；
        # 直接用元素 .click()，保证 e.target 就是遮罩节点，触发 close 回调。
        page.locator(f"{sel}:visible").first.evaluate("el => el.click()")
    else:
        raise ValueError(f"未知关闭方式: {method}")
    page.wait_for_timeout(250)


def _norm(actual):
    if isinstance(actual, bool):
        return "true" if actual else "false"
    if actual is None:
        return "None"
    return str(actual)


def eval_property(page, selector, prop):
    prop = prop.strip()
    sel = selector.strip()

    # window 上的 JS 表达式 / eval(...)
    if sel == "window":
        js = prop
        if js.startswith("eval(") and js.endswith(")"):
            js = js[len("eval("):-1]
        return page.evaluate(js)

    # 函数选择器：() => ... 直接求值即被测值
    if "=>" in sel or sel.startswith("function"):
        return page.evaluate(sel)

    # JS 表达式选择器：document.body / document.activeElement 等，先求值得到元素再取属性
    if sel.startswith(("document.", "window.")):
        expr = sel
        if prop.startswith("eval(") and prop.endswith(")"):
            return page.evaluate(prop[len("eval("):-1])
        if prop.startswith("computedStyle."):
            return page.evaluate(f"getComputedStyle({expr}).{prop[len('computedStyle.'):]}")
        if prop.startswith("boundingRect."):
            return page.evaluate(f"({expr}).getBoundingClientRect().{prop[len('boundingRect.'):]}")
        if prop.startswith("style."):
            return page.evaluate(f"({expr}).style.{prop[len('style.'):]}")
        if prop == "textContent":
            return page.evaluate(f"({expr}).textContent")
        if prop == "id":
            return page.evaluate(f"({expr}).id")
        if prop.startswith("classList.contains("):
            return page.evaluate(f"({expr}).{prop}")
        return page.evaluate(expr)

    # CSS 选择器路径
    sel_json = json.dumps(sel)
    if prop.startswith("eval(") and prop.endswith(")"):
        return page.evaluate(prop[len("eval("):-1])
    if prop.startswith("computedStyle."):
        return page.evaluate(f"getComputedStyle(document.querySelector({sel_json})).{prop[len('computedStyle.'):]}")
    if prop.startswith("boundingRect."):
        return page.evaluate(f"document.querySelector({sel_json}).getBoundingClientRect().{prop[len('boundingRect.'):]}")
    if prop.startswith("style."):
        return page.evaluate(f"document.querySelector({sel_json}).style.{prop[len('style.'):]}")
    if prop == "textContent":
        return page.evaluate(f"document.querySelector({sel_json}).textContent")
    if prop == "id":
        return page.evaluate(f"document.querySelector({sel_json}).id")
    if "className" in prop and "textContent" in prop:
        return page.evaluate(
            f"Array.from(document.querySelectorAll({sel_json})).map(e => e.className + ':' + e.textContent.trim())"
        )
    if prop.startswith("classList.contains("):
        return page.evaluate(f"document.querySelector({sel_json}).{prop}")
    # 兜底：当作元素属性访问
    return page.evaluate(f"document.querySelector({sel_json}).{prop}")


def is_fuzzy(expected, prop=""):
    return any(m in expected for m in FUZZY_MARKERS) or "按出现顺序" in prop


def run_asserts(page, asserts, prefix=""):
    """执行一组断言，返回失败条数。"""
    failures = 0
    for a in asserts:
        selector = a.get("selector")
        prop = a.get("property", "")
        expected = str(a.get("expected", "")).strip()
        note = a.get("note", "")
        try:
            actual = eval_property(page, selector, prop)
        except Exception as e:  # noqa: BLE001
            print(f"  ✗{prefix} [{selector}] {prop} → 执行失败: {e}")
            failures += 1
            continue

        if is_fuzzy(expected, prop):
            print(f"  ?{prefix} [{selector}] {prop} = {actual!r}（期望：{expected}，人工核对）")
            continue

        got = _norm(actual)
        ok = got == expected
        mark = "✓" if ok else "✗"
        if not ok:
            failures += 1
        extra = f"   # {note}" if note else ""
        print(f"  {mark}{prefix} [{selector}] {prop} = {got}（期望 {expected}）{extra}")
    return failures


def run_scenario(scen_file, page, base_url):
    import yaml
    sc = yaml.safe_load(scen_file.read_text(encoding="utf-8"))
    name = sc.get("scenario", scen_file.stem)
    print(f"\n▶ {name}")

    steps = sc.get("steps", [])
    asserts = sc.get("assert", [])
    for_each = next((s for s in steps if "for_each_style" in s), None)
    normal_steps = [s for s in steps if "for_each_style" not in s]

    try:
        if for_each:
            run_steps(page, normal_steps, base_url)
            failures = 0
            styles = for_each["for_each_style"]
            click_tpl = for_each.get("click", "")
            for style in styles:
                page.click(click_tpl.replace("{style}", style), timeout=8000)
                page.wait_for_timeout(200)
                failures += run_asserts(page, asserts, prefix=f"[{style}]")
            return failures
        run_steps(page, normal_steps, base_url)
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ 步骤执行失败（场景跳过）: {e}")
        return 1

    return run_asserts(page, asserts)


def main():
    ap = argparse.ArgumentParser(description="UI 回归场景执行器")
    ap.add_argument("--scenario", help="只跑某个场景（文件名 stem）")
    ap.add_argument("--list", action="store_true", help="只列出场景")
    args = ap.parse_args()

    scenarios = load_scenarios()
    if args.list:
        for f in scenarios:
            print(f.stem)
        return 0

    if args.scenario:
        scenarios = [f for f in scenarios if f.stem == args.scenario]
        if not scenarios:
            print(f"❌ 未找到场景: {args.scenario}")
            return 1

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("❌ 缺少 playwright（仅本地 UI 回归需要）：")
        print("   pip install -r scripts/requirements-ui.txt && python -m playwright install chromium")
        return 2

    server, base_url = start_server()
    total_fail = 0
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            for f in scenarios:
                total_fail += run_scenario(f, page, base_url)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

    if total_fail:
        print(f"\n❌ UI 回归失败：{total_fail} 条断言不通过")
        return 1
    print("\n✅ 所有 UI 回归场景通过（模糊断言已标注为人工核对）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
