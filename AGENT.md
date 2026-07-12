# QDII Tracker

> 仅记录代码无法推断的约束与决策。架构 + 功能 + 命令见 README。

## Commands

```bash
cd scripts && python3 fundctl.py sync    # 完整流水线（scan→enrich→fill→holdings）
cd scripts && python3 fundctl.py refresh  # 增量更新（fill）
cd scripts && python3 fundctl.py add --code 008888 --to active --keyword "基金名"
cd scripts && python3 fundctl.py check    # 一致性校验
cd ../web && python3 -m http.server 8765  # 本地开发
```

## Critical Rules

### 数据流水线
1. **scan 后必须接 enrich + fill**，否则覆盖丢失已有数据
2. **数据文件不写时间戳**：仅 `meta.json` 保留 `generated_at`
3. **写盘前 normalize**：`{cat}.json` → `normalize_share_keys()`；模板在 `core/constants.py`
4. **nav_date 永不回退**：lsjz 失败保留旧值，禁用 `datetime.now()` 推算
5. **force_include 不继承子类**：A/C/美元逐一加入；跨分类挪动：(a) 全量子类加 → (b) scan 后检查残留 → (c) enrich+fill
6. **LOF chg_ytd 兜底**：取同系列兄弟份额（A/C 差异 <1%）
7. **ETF 无申购历史**：`_update_history()` 跳过 `"场内"` 状态

### 部署
8. **禁止 CI 内嵌部署**：仅 commit+push → `gh workflow run deploy-pages.yml --ref main`
9. **不改既有 UI**：红涨绿跌、主动基红色警告 —— 别动配色
10. **版本戳**：`deploy-pages.yml` 自动 bump，新增 JS/CSS 写 `?v=placeholder`
11. **目录纪律**：`web/` 仅 `data/*.json`、`js/*.js`、`css/*.css`、`.nojekyll`

### 截图分享
12. **screenshot.js**：IIFE，`html-to-image` CDN 懒加载；CSS 独立 `app.css`
13. **卡片结构**：外层 `.ss-phone-wrap`（唯一带边框）+ 内层 `.ss-inner` × 2（市场卡 + 表格，无边框）
14. **宽度自适应**：wrap → `fit-content` / `min-width: min(240px, 92vw)` / `max-width: 100%`；dialog 跟随 wrap 动态扩展，`rAF` 同步 `style.width`
15. **7 风格 × 3 布局**：CSS class `ss-style-*` / `ss-layout-*`；风格影响配色，布局影响 padding/spacing
16. **净值列**：三行布局（净值 + 涨跌幅），日期提取到表头 th 副标题（分组内取众数 `nav_date`）
17. **列筛选**：`locked: true` 列（基金名称）不在面板显示；`sortable: true` 列可排序
18. **表头对齐**：跟随数据列 — 申购居中（`.ss-th-status`），数字列右对齐（`.ss-th-num`），其他左对齐
19. **窄屏适配**：`.ss-chip-group` / `.ss-col-grid` 设 `min-width: 0` 允许换行；外层 `#ss-modal` `overflow: auto` 页面级滚动
20. **iOS**：截前移除 `backdrop-filter`，`navigator.share()` 存相册
21. **申购历史**：`_update_history()` → `buy_status_history[]`；同状态只刷日期，变化 push 新条目
22. **calcLimit()** 按分组分别求和；**flattenByGroup()** 取默认份额，不展开 A/C

### 实时轮询
23. **idle-scheduler**：页面隐藏/空闲自动暂停，恢复 catch-up；所有轮询模块共用
24. **offshore-live-nav**：lsjz → pingzhongdata 兜底；settled 90min 静默；失败 15/30/60min 退避
25. **etf-premium**：盘中 60s / 午休 120s / settled 24h 静默
26. **market-indices**：盘中 60s / 盘后 5min / 周末 30min

## Harness（验收基础设施）

> 目录：`harness/`，跟 `scripts/`、`web/` 平级——专门存放"这个项目的验收真理"，
> 不属于任何产品代码树。`scripts/` 保持纯数据流水线心智，不被验收逻辑污染。

```
harness/
├── golden_fixtures.json      # 数据侧黄金样例：人工标注「这只基金应该长什么样」
├── verify_data.py             # 纯 Python 确定性校验，比对 golden_fixtures 与 web/data/*.json
└── ui_scenarios/
    ├── _TEMPLATE.yaml         # 声明式场景模板（复制改写，不要直接编辑）
    └── <场景名>.yaml           # 真实固化的 UI 回归场景
```

### 核心原则

27. **数据侧确定性、UI 侧工具无关**：`verify_data.py` 是纯 Python，无浏览器依赖，直接跑；
    `ui_scenarios/*.yaml` 只声明"打开什么页面 → 做什么交互 → 断言什么 DOM 属性等于什么值"，
    不锁定 Playwright/Selenium/任何具体工具——执行时由 Agent 现场发现环境里可用的浏览器自动化工具去驱动。
28. **空 fixtures/无场景 = 通过**：骨架阶段允许空跑，不阻塞现有流程；`fundctl.py check` 后续接入
    `verify_data.run_verification()` 时，空列表视为通过。
29. **信任模型：只固化「已验证通过」的结果，不盲信 diff**：往 `golden_fixtures.json` /
    `ui_scenarios/*.yaml` 写期望值前，必须先跑一次实际验证（截图确认/断言跑绿），
    捕获那个已确认对的值——绝不能"代码刚改完就直接拿渲染结果当基准"，
    那是在把 bug 固化成"正确答案"（对应 harness.md 提到的 reward hacking 风险）。

### 固化检查点（每次修 bug / 加功能，验收通过后必须过一遍）

30. 问自己：**这个场景值得变成永久回归项吗？**（判断标准：属于容易再犯的边界情况 / 之前踩过坑 / 
    改动触碰了分类规则或视觉配色联动这类"改一处、影响多处"的逻辑）
    - 是 → 数据侧加一条 `golden_fixtures.json` fixture；UI 侧复制 `_TEMPLATE.yaml` 写一个新场景文件
    - 否 → 说明为什么不需要（比如纯样式微调、一次性数据修正），继续收尾
    - 这一步是流程收尾的强制环节，不是可选项——没有配套「命令」，靠这条规则本身约束执行。
