# 治理进度

## 基线（2026-11-27）

- 分支：`codex/architecture-governance`（隔离 worktree，主树未提交改动未触碰）。
- 基线验证：`fundctl.py check --offline --agent-rules` 全绿；`pytest test/` 140 passed。
- 起始提交：`0c5fee9 chore: record mobile hit-target verification`。
- 提交历史：`git log --oneline codex/architecture-governance`。

## 已完成的批次

- **批次 1 · 删除死代码 `stamp_asset_version`**：删除零调用方的旧版本戳工具，
  同步 `architecture.md` / `gotchas.md` G014 归档 / AGENTS.md 模块登记。
  验证：`check --offline --agent-rules` 全绿 + `pytest` 140 passed。
- **批次 2 · 黄金常数单一事实源 + 删除 DCA 平行实现**：`market_snapshot.py` 从
  `core.gold` 导入 `OZ_TO_GRAM`；删除零运行时调用方的 `core/dca_strategy.py`
  与 `test/test_dca_strategy.py`，前端 `dca.ts` 为唯一实现；同步
  `cnn_sentiment.py` 注释与 AGENTS.md 登记。
  验证：`check --offline --agent-rules` 全绿 + `pytest` 133 passed。

## 当前状态

- 批次 1、2 已完成并独立提交。
- 下一步见 `docs/governance/TASK-POOL.md`（P1：补全 architecture.md pipeline 契约）。
