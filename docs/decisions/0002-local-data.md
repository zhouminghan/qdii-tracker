# ADR-0002：本地个人数据

## 状态

已采纳，2026-11-14。

## 背景

个人资产和研究数据只允许保存在浏览器。现有 Portfolio 使用单个 `localStorage` JSON，缺少 schema 版本迁移、事务和恢复保护。

## 候选方案

- 继续使用 `localStorage`。
- IndexedDB + Dexie。
- 引入云端同步或账号系统。

## 评估

`localStorage` 同步、容量小且写入不是事务性的。Dexie 为 IndexedDB 提供版本迁移和事务 API，满足持仓、交易、研究笔记、观察清单与策略记录的长期扩展。云端方案违反当前无后端、无账号、无同步约束。

## 决定

采用 Dexie。数据库 `qdii-tracker` 当前版本为 1，表为：

- `positions`
- `trades`
- `notes`
- `watchlist`
- `strategyLogs`
- `meta`

首次打开时把旧 `qdii-portfolio-v1` 数据迁移到 IndexedDB。导出生成带 schema 版本的 JSON；导入先完整校验，再在事务中替换数据。恢复失败不修改现有数据。

## 影响

- 个人数据不上传。
- 用户可在设置中执行导出、校验导入和清空数据。
- IndexedDB 不可用时显示明确错误，不静默丢弃数据。
