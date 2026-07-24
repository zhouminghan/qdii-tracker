# QDII Tracker — 知识目录总索引

> 读者：AI Agent（Claude Code Opus 4.5）。给 AI 导航用的，不是给人类看的 README。

## 项目一句话

**美股 QDII 基金追踪看板** — 纯静态 GitHub Pages 部署，Python 数据流水线 + Vanilla JS 前端，零后端。

## 技术栈速览

| 层 | 技术 | 文件范围 |
|----|------|----------|
| 数据流水线 | Python 3.11 + AKShare + requests + pandas | `scripts/` |
| 数据源 | AKShare / 东方财富天天基金 / 雪球 | `scripts/sources/` |
| 数据层 | JSON (静态文件，前端 fetch) | `web/data/` |
| 前端 | Vanilla JS + Tailwind CSS + html-to-image CDN | `web/` |
| 配置 SSOT | JSON (`config/funds.json`) | `config/` |
| CI/CD | GitHub Actions | `.github/workflows/` |
| Agent 治理 | AGENT.md + MEMORY.md + Skills + Hooks + feedback/ | 根目录 |

## 关键文件速查表（10 个最核心文件）

| 文件 | 作用 | 类别 |
|------|------|------|
| `scripts/fundctl.py` | 统一 CLI 入口（add/move/refresh/sync/check/diagnose） | 数据 |
| `scripts/pipeline/scan.py` | 全量扫描 QDII 基金，按规则分类、归组系列 | 数据 |
| `scripts/pipeline/fill.py` | 净值/收益/YTD 补全（lsjz+pzd 双源，ThreadPoolExecutor 并行） | 数据 |
| `web/js/main.js` | 前端主逻辑：STATE 管理、renderCategory、走势图、Modal | 前端 |
| `web/js/utils.js` | 公共 deep module：jsonpFetch/openModal/closeModal/classifyBuyStatus | 前端 |
| `web/js/screenshot.js` | 截图分享：cloneNode 离屏渲染 → html-to-image → PNG 导出 | 前端 |
| `web/js/idle-scheduler.js` | 智能空闲调度器：页面不可见/无交互时自动暂停轮询 | 前端 |
| `config/funds.json` | 分类规则 SSOT（exclude_keywords/force_include/company_brand 等） | 配置 |
| `web/js/config.js` | 前端常量（DATA_CATEGORIES/GROUP_META/COMPANY_BRAND 等） | 前端 |
| `scripts/core/constants.py` | Python 常量（CATEGORIES/HOLDINGS_CATEGORIES/路径/排序规则） | 数据 |

## ASCII 架构全景图

```
                    ┌─────────────────────────────────┐
                    │   config/funds.json (SSOT)       │
                    │   分类规则 / 强制纳入 / 品牌色    │
                    └─────────────┬───────────────────┘
                                  │ 配置加载
                                  ▼
┌──────────────────────────────────────────────────────────────┐
│                    Python 数据流水线                           │
│                                                              │
│  fundctl.py ── unified CLI ──┐                               │
│                               ▼                               │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────────┐ │
│  │ ① scan   │──▶│ ② enrich │──▶│ ③ fill   │──▶│ ④ holdings │ │
│  │ AKShare  │   │ 雪球逐只  │   │ 天天基金  │   │ AKShare    │ │
│  │ 全量分拣  │   │ 规模费率  │   │ lsjz+pzd  │   │ Top10持股  │ │
│  └──────────┘   └──────────┘   └──────────┘   └────────────┘ │
│       │              │              │              │          │
│       ▼              ▼              ▼              ▼          │
│  ┌─────────────────────────────────────────────────────┐     │
│  │              web/data/*.json (JSON 数据层)            │     │
│  │  sp500.json / nasdaq_passive.json / active.json     │     │
│  │  global_index.json / global_other.json / etf.json    │     │
│  │  meta.json / holdings/*.json                        │     │
│  └──────────────────────┬──────────────────────────────┘     │
│                         │ Python → 前端                        │
└─────────────────────────┼────────────────────────────────────┘
                          │ fetch JSON (首屏 0 外部请求)
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                   Vanilla JS 前端 (web/)                       │
│                                                              │
│  index.html ──▶ STATE.data[cat] ── 唯一数据源                 │
│                    │                                         │
│   ┌────────────────┼──────────────────────┐                  │
│   ▼                ▼                      ▼                  │
│  main.js      offshore-live-     market-indices.js           │
│  主渲染        nav.js            市场参照系                    │
│  Modal/走势   场外实时净值        指标卡+日K                   │
│               (lsjz→pzd兜底)                                  │
│                                                              │
│  etf-premium.js    screenshot.js    idle-scheduler.js        │
│   ETF 溢价率       截图分享          智能调度                  │
│                                                              │
│  config.js (纯常量) + utils.js (纯函数)                       │
│  app.css + tailwind.css (样式)                               │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
              GitHub Pages 静态托管
```

## 知识分区速查表

| 你在找什么 | 去这里 |
|-----------|--------|
| 为什么做这个架构决策 | → [`adr/`](adr/) (6 篇 ADR) |
| 某个模块怎么工作 | → [`modules/`](modules/) (10 篇模块手册) |
| 踩过的坑 / 已知限制 | → [`gotchas.md`](gotchas.md) |
| 项目架构全景 | → [`architecture.md`](architecture.md) |
| 数据从哪来 | → [`data-sources.md`](data-sources.md) |
| Agent 行为约束 | → `AGENT.md` (根目录) |
| 动态/最近变更 | → `MEMORY.md` (根目录) |
| 完整功能描述 | → `README.md` (根目录) |

## 核心概念速查

### STATE（前端唯一数据源）
- `STATE.data[cat]` = 前端读取 JSON 后存入内存的唯一数据源
- `offshore-live-nav` / `etf-premium` 轮询结果直接原地写 STATE（无事件总线）
- 写回后调 `renderCategory(tab)` 触发全量重渲

### 分类体系（6 大类）
| 分类 | JSON 文件 | 说明 |
|------|-----------|------|
| sp500 | `sp500.json` | 标普500 指数（场外） |
| nasdaq_passive | `nasdaq_passive.json` | 纳指100 指数（场外） |
| active | `active.json` | 美股主动（场外，白名单精选） |
| global_index | `global_index.json` | 全球非美指数（场外，白名单） |
| global_other | `global_other.json` | 全球/其他 QDII（场外） |
| etf | `etf.json` | 场内 ETF |

### 数据源
| 数据源 | Python 层 | 提供数据 |
|--------|-----------|----------|
| AKShare | `sources/akshare_source.py` | 全量基金名册 / 涨跌幅 / 申购状态 / ETF 场内价 / 累计收益 / 持仓 |
| 东方财富/天天基金 | `sources/eastmoney_source.py` | 净值(lsjz) / 历史收益(pzd) / F10 概况 / 费率 / 买卖规则 |
| 雪球 | `sources/xueqiu_source.py` | 基础信息(规模/经理/成立) / 费率详情 |

### 轮询调度（前端实时性）
- **idle-scheduler.js**：统一调度器，页面隐藏/空闲自动暂停
- **offshore-live-nav.js**：场外实时净值 5 档分时调度（lsjz→pzd 兜底）
- **etf-premium.js**：场内 ETF 溢价率（盘中 60s）
- **market-indices.js**：市场参照系 5 张指标卡（盘中 60s/盘后 5min）

### 深模块（收拢重复代码的核心抽象）
| 模块 | 位置 | 收拢 |
|------|------|------|
| `jsonpFetch()` | `web/js/utils.js` | 7 处 `<script>` JSONP 样板 |
| `openModal()`/`closeModal()` | `web/js/utils.js` | 3 套 Modal 生命周期 |
| `classifyBuyStatus()` | `web/js/utils.js` | 2 处申购状态判断 |
| `calc_series_scale()` | `scripts/core/utils.py` | 2 处规模计算 |
| `fetch_and_save_holdings()` | `scripts/core/utils.py` | 2 处持仓抓取链 |
