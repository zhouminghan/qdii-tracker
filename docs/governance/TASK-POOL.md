# 优化任务池

> 优先级：P0 立即 / P1 近期 / P2 常规 / 待确认。
> 每条含：ID、目标、方案、验收。已完成的移入 PROGRESS.md。

## P1（近期）

- **DEV-3 补全 architecture.md pipeline 契约**：为 `premium_history` / `nav_history` /
  `kline_history` 补模块契约，修正 checks/pipeline 章节编号错乱与重复。
- **DUP-3 黄金公式收敛**：评估 `market_snapshot.py` 与 `core/gold.py` 的精度差异
  （`round(...,6)` vs `round(...,2)`），在不改变产出的前提下消除平行公式。
- **DEV-5 Python import 方向 lint**：新增 AST 检查，禁止 `sources → pipeline`、
  `core → pipeline/sources/checks`、以及 pipeline 模块间横向 import。

## P2（常规）

- **DEV-1 修正重复决策编号**：将 `0003-notes-storage.md` 重编号为 0005（待主树笔记
  改动合并后再执行，避免改名冲突）。
- **DEV-4 归档/标注 audit.md**：标注为历史审计快照，或迁移到 `docs/governance/` 归档区。
- **market_temperature 横向耦合**：把 `fetch_treasury` 下沉到 `sources` 或 `core`，
  移除 `from pipeline.macro_rates` 的惰性 import。

## 待确认

- **跨栈业务规则的唯一事实源**（DCA 阶梯、黄金折算）：运行时期望前端实时计算、
  数据由 Python 离线产出。若未来要求「单一权威来源」，需在「Python 生成 JSON 供前端
  消费」与「前端唯一实现 + 契约测试」之间做产品决策；当前按前端唯一实现收敛。
