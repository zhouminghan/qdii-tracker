# QDII Tracker

> **代码优先架构**：`docs/`（人读文档）+ `scripts/`（可执行代码，契约以 docstring 为准）。
> 功能概览：[README](./README.md)

## 任务路由

收到任务 → 判断属于哪类 → 走对应路径。3 条路由，不跨。

### 1. 基金操作（add / delete / move / check / fix）

```
用户任何基金操作意图 
  → ❶ 识别操作类型（禁止直接改 config/funds.json）
  → ❷ 按 add/remove/move/diagnose/check 调用 fundctl.py
  → ❸ 自动 3 轮循环：执行 → check → 失败则 diagnose+fix → re-check（最多 3 轮，中途不打断用户）
  → ❹ 一次性汇报结果（不在循环中间问用户）
  → ❺ 3 轮仍未全绿 → 停下，一次性汇报失败原因、已试修复与建议，不自动继续
```

`remove` 的不可逆确认在进入 ❸ 循环前一次性完成，循环内不再打断。

**覆盖关键词**：加/删/移除/调整分类/诊断/修复/检查数据/有没有异常

| 意图 | 命令 |
|------|------|
| 新增基金 | `fundctl.py add --code X --to Y [--keyword K]` |
| 删除基金 | `fundctl.py remove --code X`（执行前向用户确认代码和名称，不可逆） |
| 调整分类 | `fundctl.py move --keyword K --from A --to B` |
| 诊断/检查 | `fundctl.py diagnose [--cat C]` / `fundctl.py check` |

### 2. 代码修改（scripts/ frontend/ config/）

```
修改任何代码文件
  → ❶ blast-radius（grep 影响面 + `docs/architecture.md`）
  → ❷ 修改
  → ❸ fundctl.py check + frontend checks → 文档同步
```

改中约束（按触及模块）：
- `scan.py` 改后 MUST 接 `enrich + fill`
- `enrich.py`：`--codes` 时只更新选中代码，不批量覆盖其它基金的申购状态/涨跌幅（否则 `fill --codes` 的历史追踪对不上）
- `fill.py`：nav_date 永不回退，lsjz 失败保留旧值；美元份额已纳入 `buy_status_history` 追踪；ETF 规模/场内价/涨跌随每日 fill 刷新（`_fill_etf_prices` 重算 `series_scale`/`total_scale`）
- `checks/verify_data.py`：fixtures 格式变更 → 同步 `scripts/checks/golden-fixtures.json`
- `core/constants.py`：改 CATEGORIES → 必须重跑全量 `sync`
- `config/funds.json`：禁止直接编辑，走 `fundctl.py`
- `frontend/src` 是唯一前端源码；`web/index.html` 与 `web/assets/` 是 Vite 产物，不直接编辑
- 前端改动默认只跑 `npm run test:t0`；涉及交互/布局/主题时只跑受影响的 Chromium 用例。T2/T3 属于本地发布前按需回归，不作为每次改动的默认门禁
- 浏览器支持范围仅为 Chromium/Chrome；禁止主动安装 Firefox/WebKit，也禁止因缺少它们阻塞验收
- 公共数据契约改 `pipeline/public_catalog.py`，同步 `docs/data-contract.md` 与前端类型
- 本地个人数据结构改 `frontend/src/shared/infrastructure/local-db.ts` → 必须递增 Dexie 版本并测迁移/备份恢复
- `html-to-image` PNG 导出改动 → 浏览器验证 PNG 非空且可下载

### 3. 知识查询 / 经验沉淀

```
查询："XX 在哪/怎么实现"
  → 源码 grep（踩坑见 docs/gotchas.md，模块契约见 docs/architecture.md）

沉淀："记下来/这个教训/更新文档"
  → 判断去处：
    - 踩坑经验 → docs/gotchas.md
    - 架构/契约变更 → docs/architecture.md
    - 行为规则 → AGENTS.md（人审后写入）
```

## 关键边界（不可协商）

- `fundctl.py check` 必须全绿才算完成（限涉及 `scripts/` / `config/` / 数据产出的改动；纯 `docs/` 改动走文档校验；纯前端改动必须 T0 + 受影响交互测试）
- nav_date 永不回退（lsjz 失败保留旧值）
- scan 后必须接 enrich + fill
- 禁止直接改 `config/funds.json`（一律走 `fundctl.py`）
- **本地提交**：`fundctl.py check` 全绿后可直接 `git add` / `git commit` 留检查点，不需要逐批确认。
- **推送前必须确认**：任何 `git push` / 部署触发前，必须先向用户说明本批次改动范围（哪些文件、为什么、验证结果）并取得明确确认；上一批次的推送确认不自动延续到新批次。多个改动先攒成一批，全部改完并验证后再统一确认，不要每改一处就 `git push`。未确认前不 `git push`。
- **文档不滞后**：README 目录树 / 命令列表由 `doc_sync.py` 从真实状态自动生成；提交前 pre-commit 钩子自动 `--fix`。文档校验属于本地开发流程，不再由 GitHub Actions 自动执行
- 部署（确认后执行）：commit+push → `gh workflow run deploy-pages.yml --ref main`
- 前端资源版本：Vite 生产构建自动生成内容哈希，部署 workflow 执行 `npm ci && npm run build`
- GitHub Actions 不安装浏览器、不执行测试或 Playwright；测试只在本机按需执行
- Commit 使用语义化前缀：`feat:` / `fix:` / `refactor:` / `test:` / `docs:` / `chore:`
- `.gitignore` 必须覆盖依赖、构建产物、浏览器缓存/profile、trace、测试报告、视觉基线、截图和本地日志；必要测试源码可提交
- `harness/state.json` 只持久化阶段、任务、验证证据和代码 SHA，不写机器路径或临时日志

### 浏览器与分级测试

| 等级 | 范围 | 命令 |
|------|------|------|
| T0 | 类型、Lint、Vitest、相关 Python 单测 | `npm run test:t0` |
| T1 | 当前变更涉及的 Chromium 桌面交互 | `npm run test:t1` |
| T2 | 跨模块、IndexedDB、契约、桌面交互 | `npm run test:t2` |
| T3 | 全部核心交互、桌面/移动、axe、构建 smoke | `npm run test:t3` |
| Visual | 本地视觉基线对比（基线不提交） | `npm run test:visual` |

默认小修改只跑 T0；用户交互修改跑 T0 + 受影响 T1 用例；公共组件/数据/存储按需扩大范围。T2/T3 只在发布前或高风险改动时本地按需执行，避免每次改动都跑完整矩阵。

### 自动联动（docs ↔ Agent ↔ README）

以下规则**自动执行**，无需用户显式触发：

| 触发事件 | 自动动作 |
|----------|----------|
| 修改代码文件 | 检查 `docs/` 中引用该模块的文件是否需同步更新 |
| 修改 `docs/` 文件 | 检查是否影响 Skills 定义和 AGENTS.md 规则 |
| 新增/删除/改名文件 | **自动更新** `README.md` 目录树 |
| 功能/流程/命令变更 | **自动更新** `README.md` 核心功能描述 + 命令列表 |
| 踩坑 ≥3 次同一模式 | 提示"是否追加到 AGENTS.md 关键边界？" |

> 原理：机器消费的黄金样例是 `scripts/checks/golden-fixtures.json`（真 JSON，不走 Markdown），人读文档收敛在 `docs/`（踩坑日志 + 架构契约），行为规则在 AGENTS.md。代码变了→契约/坑可能过期→自动提醒同步。文件结构变了→README 自动同步。
>
> 现在这套「自动联动」已经**机器化**：`scripts/checks/doc_sync.py` 从 git 追踪文件 + `fundctl.py --help` 推导 README 目录树与命令列表（标记块内自动改写），并校验 AGENTS.md 模块登记是否滞后。本地由 `.githooks/pre-commit` 在每次 commit 前自动 `--fix`；不再由 GitHub Actions 自动跑测试门禁。

## Commands

```bash
cd scripts && python3 fundctl.py add --code X --to Y          # 新增
cd scripts && python3 fundctl.py remove --code X               # 删除
cd scripts && python3 fundctl.py move --keyword X --from A --to B  # 调分类
cd scripts && python3 fundctl.py refresh --scope otc|etf [--codes X,Y]  # 增量刷新（可按场外/场内拆分 + 单基金）
cd scripts && python3 fundctl.py sync                           # 全量同步
cd scripts && python3 fundctl.py nasdaq                         # 刷新纳指 40 年历史图谱数据
cd scripts && python3 fundctl.py sentiment                      # 刷新 CNN 恐慌贪婪指数
cd scripts && python3 fundctl.py check                          # 门禁（7层）
cd scripts && python3 fundctl.py check --offline                # 门禁（跳过 Layer 6 跨源验证，断网时用）
cd scripts && python3 fundctl.py diagnose --auto-fix            # 诊断修复
cd scripts && python3 fundctl.py probe                          # 数据源适配层探针
cd scripts && python3 fundctl.py catalog                        # 生成前端公共目录契约
cd scripts && python3 checks/doc_sync.py --fix                  # 文档自动同步（README 目录树/命令）
npm ci && npm run test:t0                                      # T0：类型 + lint + 单测
npm run test:t1                                                 # T1：Chromium 受影响交互
npm run test:t2                                                 # T2：Chromium 桌面集成/视觉
npm run test:t3                                                 # T3：Chromium 桌面 + 移动完整回归
npm run test:visual:update                                      # 本地生成视觉基线（不提交）
npm run dev                                                     # Vite 本地开发（8765）
./scripts/setup_hooks.sh                                        # 启用 pre-commit 文档同步
```

## 门禁

```bash
cd scripts && python3 fundctl.py check    # Layer 0-6: nav_date→配置→lint→fixtures→一致性(含申购/限额)→文档→交叉验证
```

不绿不提交。

## 本地推送前门禁

`.githooks/pre-push` 会在每次 `git push` 前自动执行（启用方式同 `./scripts/setup_hooks.sh`）：

```bash
python3 -m pytest test/ -q                          # 单元测试（未装 pytest 则提示跳过）
cd scripts && python3 fundctl.py check --offline --agent-rules  # 数据 + Agent + 文档门禁
npm run check                                        # TypeScript + lint + Vitest + build
```

> 门禁通过只代表「可以推送」，不代表已获得推送授权；`git push` 前仍需用户明确确认。

## GitHub Actions 边界

- `update-data.yml` 只做 Python 数据采集、Layer 0–6、JSON/RSS/快照生成与数据提交。
- `deploy-pages.yml` 只允许执行部署所必需的前端构建与 Pages 发布。
- 不再保留自动测试 workflow；Python/前端测试、Playwright、视觉回归只在本机按需执行。
- Python 依赖使用 `setup-python` + `requirements.txt` 缓存；前端使用 `setup-node` + lockfile 缓存。

## Git 与 Harness

- 不提交 `node_modules/`、`web/assets/`、coverage、pytest/Playwright 缓存、trace、测试报告、视觉基线、验收截图、本地浏览器 profile 和日志。
- 必要测试源码（单测、E2E 脚本、fixture 代码）可以提交；测试产物与截图不提交。
- `harness/state.json` 记录任务状态、验证证据和代码 SHA，不记录机器路径或运行日志。
- 不重写历史、不强推、不删除现有分支/Tag；远程操作必须获得明确授权。

## 代码结构

```
scripts/
├── fundctl.py            ← 统一入口
├── core/                 ← 基础设施（constants / utils / config_loader / dca_strategy / gold）
├── sources/              ← 数据源适配（akshare / eastmoney / xueqiu / ths）
├── pipeline/             ← 数据生产链路（scan / enrich / fill / performance / holdings / reclassify / public_catalog / premium_history / nav_history / kline_history / market_temperature / nasdaq_history / cnn_sentiment / brand_gold / ndx_pe / macro_rates / market_snapshot）
└── checks/               ← 质量门禁（verify_data / verify_purchase / cross_validate / diagnose / architecture_lint / stamp_asset_version / check_agent_rules / doc_sync / build_snapshot）

frontend/                 ← Vue 3 + TypeScript 源码（app / pages / widgets / features / entities / shared）
test/                     ← Python 单测 + frontend/ 单测 + e2e/ Playwright
.github/workflows/        ← update-data.yml（数据）/ deploy-pages.yml（构建并部署）
.githooks/pre-commit      ← 提交前自动 doc_sync
```

## 文档结构

```
docs/
├── gotchas.md            # 踩坑记录 + 生命周期（最高价值：硬踩的坑）
├── architecture.md       # 模块输入/输出契约（人读；机器校验直接读代码 docstring）
├── data-contract.md      # 公共 JSON 与前端消费契约
├── data-sources.md       # 数据源与更新机制
├── audit.md              # 迁移前审计
└── decisions/            # ADR

scripts/checks/
└── golden-fixtures.json  # 黄金样例（checks/verify_data.py 直接读取，纯 JSON）
```

## 前端结构

```
frontend/
├── index.html            # Vite 入口
├── public/               # manifest / icon / service worker
└── src/
    ├── pages/            # Market / Funds / Portfolio / Research
    ├── widgets/          # 全局壳、导航、设置
    ├── features/         # 基金表格/详情、知识内容
    ├── shared/           # 数据访问、Dexie、格式化、通用组件
    ├── stores/           # Pinia 数据/设置/资产/研究状态
    ├── styles/           # Design tokens 与响应式样式
    └── types/            # 公共与本地数据契约

web/
├── data/                 # Python 生成的公共 JSON
├── index.html            # Vite 构建产物
└── assets/               # Vite 内容哈希资源（不提交）
```
