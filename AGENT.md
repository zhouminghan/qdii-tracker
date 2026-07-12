# QDII Tracker

> 约束与规则见下。架构与部署见 README。踩坑与架构决策见 [MEMORY.md](./MEMORY.md)。

## Commands

```bash
cd scripts && python3 fundctl.py sync    # 全量：scan→enrich→fill→holdings
cd scripts && python3 fundctl.py refresh  # 增量：fill
cd scripts && python3 fundctl.py add --code 008888 --to active --keyword "关键词"
cd scripts && python3 fundctl.py check    # 一致性校验
cd ../web && python3 -m http.server 8765  # 本地开发
```

## 任务流程（每次做功能/修 bug 按这个走）

1. 检查 `.codebuddy/plans/`，有未完成的计划就续接，没有就新建
2. 读本文件（规则）、README（架构）、MEMORY（踩坑）
3. 写代码/改配置/补文档，每做完一步勾掉计划文件
4. 跑验收：`fundctl.py check`；pre-commit 通过。失败就回去改
5. 浏览器验：启 web 服务，页面交互点一遍，截图确认
6. 做得完就提交；这个场景容易再犯的 → 补一条反馈层回归

## Rules

### 数据流水线
- scan 后必接 enrich + fill，否则覆盖丢数据
- 数据文件不写时间戳，仅 meta.json 有 generated_at
- 写盘前 normalize：`{cat}.json` → `normalize_share_keys()`，模板在 `core/constants.py`
- nav_date 永不回退：lsjz 失败保留旧值
- force_include 不继承子类：A/C/美元逐一加；跨分类挪动：(a)加全量子类 → (b)scan 查残留 → (c)enrich+fill
- LOF chg_ytd 兜底：取兄弟份额（A/C 差 <1%）
- ETF 无申购历史：`_update_history()` 跳过 "场内"

### 部署
- 不干 CI 内嵌部署：commit+push → `gh workflow run deploy-pages.yml --ref main`
- 不动既有 UI：红涨绿跌、主动基红色警告
- 版本戳：`deploy-pages.yml` 自动 bump，新 JS/CSS 写 `?v=placeholder`
- web/ 只放 `data/*.json`、`js/*.js`、`css/*.css`、`.nojekyll`；脚本可验：`scripts/architecture_lint.py`

### 截图分享
- `screenshot.js` IIFE，`html-to-image` CDN 懒加载，CSS 在 `app.css`
- 卡片：外层 `.ss-phone-wrap` 唯一带边框，内层 `.ss-inner` × 2（市场卡/表格）
- 宽度：`fit-content` / `min-width: min(240px,92vw)` / `max-width:100%`；dialog 用 rAF 跟 wrap
- 净值列：净值+涨跌，日期在 th 副标题（分组众数 nav_date）
- 列筛选：locked 列不在面板显示；sortable 列可排
- 表头对齐：申购居中（.ss-th-status），数字右对齐（.ss-th-num）
- 窄屏换行：chip/col-grid 设 min-width:0；#ss-modal overflow:auto
- iOS 截图：去 backdrop-filter，navigator.share()
- 申购历史：`_update_history()` → buy_status_history[]
- snapPng() 用 cloneNode 离屏，z-index:-1 沉遮罩下；别用 left:-99999px
- 指标卡用 border 别用 box-shadow（截图显脏影）

### 实时轮询
- idle-scheduler：隐藏/空闲暂停，恢复 catch-up
- offshore-live-nav：lsjz→pingzhongdata 兜底，settled 90min 静默
- etf-premium：盘中 60s/午休 120s/settled 24h
- market-indices：盘中 60s/盘后 5min/周末 30min

## 验收（做完必跑）

- `fundctl.py check`：golden fixtures + 目录纪律 + 改动联动提示
- `git commit` 前 pre-commit hook 自动跑 `architecture_lint.py` + `verify_data.py`（不通过阻止提交）+ `scan_scenarios.py`（提示不阻断）
- 跑完如果场景值得固化 → 补 `feedback/ui_scenarios/` 下的 yaml 或 `golden_fixtures.json` 的 fixture
- `MEMORY.md` 记踩坑，改一次笔记一次
