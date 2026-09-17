# QDII Tracker — 知识目录（Agent 路由入口）

> 读者：AI Agent。按「问题 → 文件」路由；架构、功能、目录树以 [README](../README.md) 为准。

## 项目一句话

美股 QDII 基金追踪看板 —— 纯静态 GitHub Pages，Python 数据流水线 + Vanilla JS 前端，零后端。

## 路由速查

| 你在找什么 | 去这里 |
|-----------|--------|
| 踩过的坑 / 已知限制 / 关键决策 | `gotchas.md` |
| 数据从哪来 / API 端点 / 降级策略 | `data-sources.md` |
| 模块读写哪些文件 / 依赖关系 | `pipeline-contracts.md` |
| `web/data` JSON 字段含义 | `data-schema.md` |
| 黄金样例校验格式 | `golden-fixtures.md` |
| 架构 / 功能 / 部署 | `../README.md` |
| Agent 行为规则 / 命令 / 关键边界 | `../AGENTS.md` |
| 定位某段代码 | 源码 `grep` + `pipeline-contracts.md` |

## 使用顺序

`AGENTS.md`（规则与边界）→ 本页（路由）→ 上表对应文件 → 源码 `grep` 定位细节。
