# QDII Tracker

> **代码优先架构**：`docs/`（人读文档）+ `scripts/`（可执行代码，契约以 docstring 为准）。
> 功能概览：[README](./README.md)

## 编码原则

1️⃣ 不保留向后兼容：过时东西直接删，别写迁移脚本和回退方案。
2️⃣ 极简主义：选满足当前需求的最简实现，绝不搞“预防性抽象”。
3️⃣ 小步快跑：先跑通最小端到端版本，别为了臆想的未来去拆当前能跑的架构。
4️⃣ 模块化：组件保持独立，关注点分离清楚。
5️⃣ 别造轮子：优先用成熟的、有人维护的第三方库。
6️⃣ 先查再写：动手前先翻翻项目里已有的依赖，别想当然瞎引包。
7️⃣ 架构要有远见：绝不接受“先凑合，以后再说”的临时屎山。
8️⃣ 抄作业：先看成熟产品怎么解决，用验证过的模式，别从零发明。

> 第 1 条只约束代码。`web/data/`、`config/funds.json`、浏览器 IndexedDB（`local-db.ts`）属于数据/数据库层级——本地化只为降本，不是“可随手删”。数据没有“过时”一说，不适用第 1 条；结构变更须走 `fundctl.py`，`local-db.ts` 须递增 Dexie 版本并测迁移。

## 任务路由

三类任务，不跨：
- **基金操作**（加/删/调分类/诊断/检查）→ 一律走 `fundctl.py`，禁止直接改 `config/funds.json`；自动 3 轮「执行 → check → 失败则 diagnose+fix → re-check」，循环内不打断、一次性汇报；`remove` 的不可逆确认在循环前完成。
- **代码修改**（scripts/frontend/config）→ 先 blast-radius（grep + `docs/architecture.md`），改后 `fundctl.py check` + 前端检查 + 文档同步。
- **知识查询/沉淀** → 源码 grep；踩坑沉淀到 `docs/gotchas.md`，契约到 `docs/architecture.md`，行为规则到 AGENTS.md（人审后写入）。

## 关键边界

- `fundctl.py check` 全绿才算完成（纯 docs 改走文档校验；纯前端改 T0 + 受影响交互测试）。
- `nav_date` 永不回退；`scan` 后必须接 `enrich` + `fill`；禁止直接改 `config/funds.json`。
- 前端源码只在 `frontend/src`；`web/` 是 Vite 产物，不直接编辑。
- 改中约束：`verify_data` fixtures 变更同步 `golden-fixtures.json`；`constants` 改 `CATEGORIES` 重跑全量 `sync`；`public_catalog` 改同步 `docs/data-contract.md` 与前端类型。
- 浏览器仅 Chromium/Chrome，禁装 Firefox/WebKit；测试只在本机按需跑。
- 本地提交：check 全绿后可自行 commit；推送/部署前必须向用户说明改动范围与验证结果，未确认不 `git push`。
- Commit 语义化前缀；`.gitignore` 覆盖依赖/产物/缓存/trace/报告/基线/截图/日志。
- `harness/state.json` 只存阶段、任务、证据、SHA，不存机器路径或日志。
- 文档不滞后：文件增删/改名、命令变更由 `doc_sync.py --fix` 自动同步 README，pre-commit 自动执行；同一坑复发 ≥3 次 → 提示升级为 AGENTS.md 硬规则。

## 测试分级

| 等级 | 范围 | 命令 |
|------|------|------|
| T0 | 类型/Lint/Vitest/相关 Python 单测 | `npm run test:t0` |
| T1 | 变更涉及的 Chromium 桌面交互 | `npm run test:t1` |
| T2 | 跨模块/IndexedDB/契约/桌面交互 | `npm run test:t2` |
| T3 | 全部核心交互/桌面+移动/axe/build smoke | `npm run test:t3` |
| Visual | 本地视觉基线（不提交） | `npm run test:visual` |

默认小改只跑 T0；交互改跑 T0 + 受影响 T1；公共组件/数据/存储按需扩大。T2/T3 仅发布前或高风险时本地跑。

## Commands

```bash
cd scripts && python3 fundctl.py add --code X --to Y          # 新增
cd scripts && python3 fundctl.py remove --code X               # 删除
cd scripts && python3 fundctl.py move --keyword X --from A --to B  # 调分类
cd scripts && python3 fundctl.py refresh --scope otc|etf [--codes X,Y]  # 增量刷新
cd scripts && python3 fundctl.py sync                           # 全量同步
cd scripts && python3 fundctl.py nasdaq                         # 纳指历史
cd scripts && python3 fundctl.py sentiment                      # CNN 恐慌贪婪
cd scripts && python3 fundctl.py check                          # 门禁（7层）
cd scripts && python3 fundctl.py check --offline                # 门禁（断网）
cd scripts && python3 fundctl.py diagnose --auto-fix            # 诊断修复
cd scripts && python3 fundctl.py probe                          # 数据源探针
cd scripts && python3 fundctl.py catalog                        # 生成 catalog
cd scripts && python3 checks/doc_sync.py --fix                  # 文档自动同步
npm ci && npm run test:t0                                      # T0
npm run test:t1                                                 # T1
npm run test:t2                                                 # T2
npm run test:t3                                                 # T3
npm run test:visual:update                                      # 视觉基线
npm run dev                                                     # Vite 开发（8765）
./scripts/setup_hooks.sh                                        # 启用 pre-commit
```

## 门禁与推送前

- 门禁：`cd scripts && python3 fundctl.py check`（Layer 0-6），不绿不提交。
- 推送前 `.githooks/pre-push` 自动跑：`pytest test/` + `fundctl.py check --offline --agent-rules` + `npm run check`。门禁通过 ≠ 已授权，`git push` 前仍需用户确认。

## GitHub Actions

- `update-data.yml`：数据采集 + Layer 0-6 + JSON/RSS/快照 + 数据提交。
- `deploy-pages.yml`：`npm ci && npm run build` + Pages 发布。
- 无自动测试 workflow；测试/Playwright/视觉只在本机按需。Python 用 setup-python + requirements，前端用 setup-node + lockfile。

## Git 与 Harness

- 不提交 node_modules/web/assets/coverage/缓存/trace/报告/基线/截图/profile/日志；必要测试源码可提交，产物不提交。
- 不重写历史/强推/删分支 Tag；远程操作须明确授权。

## 模块登记

```text
scripts/core: constants utils config_loader dca_strategy gold
scripts/sources: akshare eastmoney xueqiu ths
scripts/pipeline: scan enrich fill performance holdings reclassify public_catalog premium_history nav_history kline_history market_temperature nasdaq_history cnn_sentiment brand_gold fx_spot gold_spot ndx_pe macro_rates market_snapshot limit_notices
scripts/checks: verify_data verify_purchase cross_validate diagnose architecture_lint stamp_asset_version check_agent_rules doc_sync build_snapshot
frontend: Vue 3 + TypeScript（pages/widgets/features/shared/stores/types）
```
