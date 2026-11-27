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
- **批次 3 · 补全并强制 architecture.md 契约**：重写 `docs/architecture.md`，
  pipeline 17→20、checks 5→8 全量登记，统一顺序编号并修正依赖列表；
  在 `check_agent_rules.py` 新增 Layer B2 反向完整性校验（漏登记即失败）。
  验证：`check --offline --agent-rules` 全绿（含 Layer B2）+ `pytest` 133 passed。
- **批次 4 · 强制 import 分层方向**：`architecture_lint.py` 新增 AST 依赖方向校验
  （core ← sources ← pipeline ← checks，既有横向耦合 allowlist），并加回归单测。
  验证：`check --offline --agent-rules` 全绿 + `pytest` 135 passed。
- **批次 5 · 下沉美债抓取链，消除 pipeline 横向耦合**：把财政部→FRED→东方财富
  抓取链从 `pipeline/macro_rates.py` 下沉到 `sources/treasury_source.py`；
  `macro_rates` 与 `market_temperature` 改向下依赖 sources；移除 import lint 的
  pipeline→pipeline allowlist（分层约束收紧）。
  验证：`check --offline --agent-rules` 全绿（import lint 收紧后仍 0 违例）+ `pytest` 135 passed。
- **批次 6 · 统一 JSON 原子写入**：为 `core/utils.write_json` 增加 `compact` 模式，
  并把 `fundctl.py` / `build_snapshot.py` / `market_snapshot.py` / `public_catalog.py`
  中手写的 `write_text(json.dumps(...))` 收敛到原子写入工具（目录文件保持紧凑格式）。
  验证：`check --offline --agent-rules` 全绿 + `pytest` 136 passed。

## 当前状态

- 批次 1–6 已完成并独立提交。
- 下一步见 `docs/governance/TASK-POOL.md`（P1：黄金公式精度收敛、FRED 解析收敛）。
