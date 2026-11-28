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

（已决议：见 `docs/decisions/0006-cross-stack-single-source.md`——黄金折算为
Python SSOT，DCA 阶梯为前端 SSOT，每种规则仅一份实现与契约测试。）
