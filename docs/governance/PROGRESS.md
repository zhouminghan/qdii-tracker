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
- **批次 7 · 标注 audit.md 为历史快照**：在 `docs/audit.md` 顶部标注 Vue 迁移前
  历史审计，当前架构指向 architecture.md / governance/ARCHITECTURE-MAP.md。
  验证：`check --offline --agent-rules` 全绿（纯 docs）。
- **批次 8 · 收敛 config/funds.json 读取入口**：`public_catalog.py` 的品牌配置
  改经 `core.config_loader.get_config()` 读取，消除绕过 SSOT 的直接 `json.load`。
  验证：`check --offline --agent-rules` 全绿 + `pytest` 136 passed。
- **批次 9 · CLI 入口去重依赖**：`fundctl.py` 改为按命令惰性导入 pipeline/checks，
  `core/utils.py` 用 stdlib `zoneinfo` 替换 `pytz`；`check --offline` 与 `--help`
  现在仅需标准库即可运行（无需 requests/akshare/pypdf/pandas/pytz）。
  验证：系统 python3 可跑 `--help` + `check --offline`；venv 全绿 + `pytest` 136 passed。
- **批次 10 · 统一 HTTP 获取带重试**：`brand_gold` / `ndx_pe` / `market_temperature` /
  `treasury_source` 的裸 `requests.get` 收敛到 `core.utils.requests_get`（统一重试/退避），
  移除顶层 `import requests`；同步更新测试与 architecture.md 依赖清单。
  验证：`check --offline --agent-rules` 全绿 + `pytest` 136 passed。
- **批次 11 · 删除 orphaned 黄金逻辑，单一事实源**：`OZ_TO_GRAM` 移入
  `core/constants.py`；删除运行时零调用方的 `core/gold.py` 与其测试，
  `market_snapshot.py` 为黄金折算的唯一实现。
  验证：`check --offline --agent-rules` 全绿 + `pytest` 132 passed。
- **批次 12 · 收敛 FRED CSV 解析**：`parse_fred_series` 统一为
  `sources/treasury_source.py` 的 raw 实现，`market_temperature` 改复用，
  宏观利率消费端按需 round(2) 保持原输出。
  验证：`check --offline --agent-rules` 全绿 + `pytest` 132 passed。
- **批次 13 · 补核心工具单测**：为 `core.utils.requests_get`（200/5xx 重试/
  4xx 永久失败/DNS 永久失败）与 `core.config_loader`（校验/读取/落盘回环）
  补确定性单测，锁定两个权威模块的行为契约。
  验证：`check --offline --agent-rules` 全绿 + `pytest` 141 passed。
- **批次 14 · 补 key 归一化与时间戳单测**：为 `normalize_share_keys` /
  `normalize_holdings_keys`（G010 防 diff 噪音契约）与 `bump_generated_at`
  补确定性单测。
  验证：`check --offline --agent-rules` 全绿 + `pytest` 144 passed。
- **批次 15 · 补黄金折算运行时单测**：为 `market_snapshot._build_gold` 的
  XAU×USDCNH÷OZ 折算与国内溢价公式补确定性单测（mocked 数据源），并覆盖
  `_round`/`_scalar` 精度契约。
  验证：`check --offline --agent-rules` 全绿 + `pytest` 146 passed。
- **批次 16 · 修正重复决策编号**：`docs/decisions/0003-notes-storage.md`
  重编号为 `0005-notes-storage.md`，消除与 chromium-only-testing 的 `0003` 撞号。
  验证：`check --offline --agent-rules` 全绿（纯 docs）。
- **批次 17 · 决议跨栈单一权威来源**：新增 `docs/decisions/0006-cross-stack-single-source.md`，
  固化「黄金折算=Python SSOT、DCA 阶梯=前端 SSOT」，并记录 hot-path `_finite`/`_to_float`
  轻量变体为有意保留；清空「待确认」。
  验证：`check --offline --agent-rules` 全绿（纯 docs）。

## 当前状态

- 批次 1–17 已完成并独立提交。
- P0/P1/P2/待确认 已全部清空或决议。
- 前端 T0 已验证：`vue-tsc --noEmit` 通过、ESLint 0 error（1 个既有 warning：
  AppHeader.vue 属性顺序）、Vitest 16 文件 65 测试全过。
