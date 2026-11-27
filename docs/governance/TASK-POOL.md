# 优化任务池

> 优先级：P0 立即 / P1 近期 / P2 常规 / 待确认。
> 每条含：ID、目标、方案、验收。已完成的移入 PROGRESS.md。

## P1（近期）

（暂无）

## P2（常规）

- **HTTP 获取（3 处有意保留裸 `requests.get`）**：`cnn_sentiment`（418 bot 诊断语义）、
  `limit_notices`（`lru_cache` + raise-on-failure 防缓存瞬时失败 + params + PDF）、
  `nasdaq_history`（自定义 429 退避 + params）。均经评估确认迁移会改变语义，记录为有意例外。

## 待确认

- **跨栈业务规则的唯一事实源**（DCA 阶梯、黄金折算）：运行时期望前端实时计算、
  数据由 Python 离线产出。若未来要求「单一权威来源」，需在「Python 生成 JSON 供前端
  消费」与「前端唯一实现 + 契约测试」之间做产品决策；当前按前端唯一实现收敛。
