# MEMORY — 新 AI 速读入口

> readers = CLI AI Agent (Claude Code Opus 4.5)
> 这不是知识库——是压缩索引。完整知识在 `knowledge/`。

## 进入项目后，按此顺序
| 优先级 | 读什么 | 为什么 |
|--------|--------|--------|
| 1 | `AGENT.md` | 规则 + 命令 + 约束 |
| 2 | `knowledge/INDEX.md` | 由此进入完整知识：ADR / 模块手册 / gotchas / 数据源 |
| 3 | `web/js/utils.js` | 公共 deep module：jsonpFetch / openModal / classifyBuyStatus |
| 4 | `web/js/main.js` | 前端主逻辑：STATE / renderCategory |

> 架构决策 → `knowledge/adr/`（6 篇，完整背景/决策/后果）
> 模块手册 → `knowledge/modules/`（10 篇，入口/流程/函数表）
> 已知坑点 → `knowledge/gotchas.md`（含生命周期 + 源码行号）
> 数据源   → `knowledge/data-sources.md`

## 关键约定（约束速查，不存知识）
- `STATE.data[cat]` 是前端唯一数据源。轮询直接原地写 STATE
- Python 间 → `scripts/core/utils.py`；Python→前端 → JSON
- `web/js/config.js` = 纯常量；`utils.js` = 纯函数
- 详见 `knowledge/` 各模块手册

## 最近关键变更（append-only）
<!-- Agent 自动追加，仅存最近 5 条 -->

## Session 待确认（append-only）
<!-- 不确定该不该加规则的，记这里下次人审 -->
