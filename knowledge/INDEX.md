# QDII Tracker — 知识目录总索引

> 读者：AI Agent。给 AI 导航用的，不是给人类看的 README。

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
| Agent 治理 | AGENT.md（操作协议已内联：fund-ops / code-change） | 根目录 |

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
| 为什么做这个架构决策 | → 见 `gotchas.md`（关键决策沉淀为 gotcha 条目） |
| 踩过的坑 / 已知限制 | → `gotchas.md` |
| 数据从哪来 / API 降级策略 | → `data-sources.md` |
| 模块读写哪些文件 | → `pipeline-contracts.md` |
| web/data JSON 字段含义 | → `data-schema.md` |
| 黄金样例校验格式 | → `golden-fixtures.md` |
| 代码结构查询（结构记忆） | → `codegraph_explore`（CodeGraph MCP） |
| Agent 行为约束 | → `AGENT.md` (根目录) |
| 完整功能描述 | → `README.md` (根目录) |

**代码知识库双层架构**：`.codegraph/` = 结构记忆（自动维护，save→sync），`knowledge/` = 解释记忆（gotchas + data-sources + pipeline-contracts，人+AI 协作维护）。Agent 启动 → `AGENT.md` → `knowledge/INDEX.md` → `codegraph_explore`。
