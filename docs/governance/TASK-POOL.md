# 优化任务池

> 优先级：P0 立即 / P1 近期 / P2 常规 / 待确认。
> 每条含：ID、目标、方案、验收。已完成的移入 PROGRESS.md。

## P1（近期）

（暂无）

## P2（常规）

- **HTTP 获取收敛（剩余 3 处）**：`cnn_sentiment`（418 bot 语义）、
  `limit_notices`（PDF 二进制 + 多 API）、`nasdaq_history`（自定义 429 退避 + params）
  仍用裸 `requests.get`；需逐处评估后迁移到 `requests_get`（必要时为其增加 `params`）。
- **DEV-1 修正重复决策编号**：将 `0003-notes-storage.md` 重编号为 0005（待主树笔记
  改动合并后再执行，避免改名冲突）。
- ~~market_temperature 横向耦合~~：✅已下沉（批次 5）。

## 待确认

- **跨栈业务规则的唯一事实源**（DCA 阶梯、黄金折算）：运行时期望前端实时计算、
  数据由 Python 离线产出。若未来要求「单一权威来源」，需在「Python 生成 JSON 供前端
  消费」与「前端唯一实现 + 契约测试」之间做产品决策；当前按前端唯一实现收敛。
