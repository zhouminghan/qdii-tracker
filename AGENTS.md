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
```

**覆盖关键词**：加/删/移除/调整分类/诊断/修复/检查数据/有没有异常

| 意图 | 命令 |
|------|------|
| 新增基金 | `fundctl.py add --code X --to Y [--keyword K]` |
| 删除基金 | `fundctl.py remove --code X`（执行前向用户确认代码和名称，不可逆） |
| 调整分类 | `fundctl.py move --keyword K --from A --to B` |
| 诊断/检查 | `fundctl.py diagnose [--cat C]` / `fundctl.py check` |

### 2. 代码修改（scripts/ web/ config/）

```
修改任何代码文件
  → ❶ blast-radius（grep 影响面 + `docs/architecture.md`）
  → ❷ 修改
  → ❸ fundctl.py check → 文档同步
```

改中约束（按触及模块）：
- `scan.py` 改后 MUST 接 `enrich + fill`
- `enrich.py`：`--codes` 时只更新选中代码，不批量覆盖其它基金的申购状态/涨跌幅（否则 `fill --codes` 的历史追踪对不上）
- `fill.py`：nav_date 永不回退，lsjz 失败保留旧值；美元份额已纳入 `buy_status_history` 追踪；ETF 规模/场内价/涨跌随每日 fill 刷新（`_fill_etf_prices` 重算 `series_scale`/`total_scale`）
- `checks/verify_data.py`：fixtures 格式变更 → 同步 `scripts/checks/golden-fixtures.json`
- `core/constants.py`：改 CATEGORIES → 必须重跑全量 `sync`
- `config/funds.json`：禁止直接编辑，走 `fundctl.py`
- `web/js|css` 新文件 → `index.html` 加 `?v=` 版本戳
- `web/js/screenshot.js` 改后浏览器验证 PNG 正常
- `web/css/app.css` 改后检查暗色/玻璃态/响应式
- `web/index.html` 新增 Tailwind 类前先确认在 `tailwind.css` 产物里已存在；缺失类在 `app.css` 用自定义类补齐（踩坑：`flex-1`/`md:flex`/`list-decimal`/`w-36` 等会静默失效）

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

- `fundctl.py check` 必须全绿才算完成
- nav_date 永不回退（lsjz 失败保留旧值）
- scan 后必须接 enrich + fill
- 禁止直接改 `config/funds.json`（通过 fund-ops Skill + fundctl.py）
- **提交/推送需确认**：任何 `git commit` / `git push` / 部署触发前，必须先向用户说明改动范围（哪些文件、为什么）并取得明确确认；未确认前只停留在工作区改动，不 `git add` / `commit` / `push`
- **文档不滞后**：README 目录树 / 命令列表由 `doc_sync.py` 从真实状态自动生成；提交前 pre-commit 钩子自动 `--fix`，推送前 pre-push 钩子本地跑门禁，CI 用 `--check` 强制校验
- 部署（确认后执行）：commit+push → `gh workflow run deploy-pages.yml --ref main`
- 版本戳：本地 `?v=dev`（占位），部署时 `deploy-pages.yml` 自动 `stamp_asset_version.py --version ${GITHUB_SHA::12}` 替换为 commit SHA，无需手动改

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
> 现在这套「自动联动」已经**机器化**：`scripts/checks/doc_sync.py` 从 git 追踪文件 + `fundctl.py --help` 推导 README 目录树与命令列表（标记块内自动改写），并校验 AGENTS.md 模块登记是否滞后。本地由 `.githooks/pre-commit` 在每次 commit 前自动 `--fix`，CI 由 `ci.yml` 跑 `check --agent-rules` 强制 `--check`。

## Commands

```bash
cd scripts && python3 fundctl.py add --code X --to Y          # 新增
cd scripts && python3 fundctl.py remove --code X               # 删除
cd scripts && python3 fundctl.py move --keyword X --from A --to B  # 调分类
cd scripts && python3 fundctl.py refresh --scope otc|etf [--codes X,Y]  # 增量刷新（可按场外/场内拆分 + 单基金）
cd scripts && python3 fundctl.py sync                           # 全量同步
cd scripts && python3 fundctl.py check                          # 门禁（7层）
cd scripts && python3 fundctl.py check --offline                # 门禁（跳过 Layer 6 跨源验证，断网/CI 用）
cd scripts && python3 fundctl.py diagnose --auto-fix            # 诊断修复
cd scripts && python3 fundctl.py probe                          # 数据源适配层探针
cd scripts && python3 checks/doc_sync.py --fix                  # 文档自动同步（README 目录树/命令）
cd test && python3 run_ui_scenarios.py                          # UI 回归场景
./scripts/setup_hooks.sh                                        # 启用 pre-commit 文档同步
cd ../web && python3 -m http.server 8765                        # 本地开发
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
```

与 CI 的 `ci.yml` 对齐，把「推到远端才发现」的问题前置到本地。

## 操作协议（原 fund-ops / code-change Skills，已内联）

> CodeBuddy 时代的 `.codebuddy/skills/` 已移除，两个 Skill 的流程内联到本文件，
> 与「任务路由」对应，避免重复维护。

## 代码结构

```
scripts/
├── fundctl.py            ← 统一入口
├── core/                 ← 基础设施（constants / utils / config_loader）
├── sources/              ← 数据源适配（akshare / eastmoney / xueqiu / ths）
├── pipeline/             ← 数据生产链路（scan / enrich / fill / holdings / reclassify / codegen / sparklines / premium_history / nav_history / market_temperature）
└── checks/               ← 质量门禁（verify_data / verify_purchase / cross_validate / diagnose / architecture_lint / scan_scenarios / stamp_asset_version / check_agent_rules / doc_sync / build_snapshot）

test/                     ← 测试与回归（test_utils.py 单测 + ui_scenarios/ 声明式 UI 回归，Playwright 执行）
.github/workflows/        ← ci.yml（单测+门禁，UI 回归仅本地）/ update-data.yml（数据）/ deploy-pages.yml（部署）
.githooks/pre-commit      ← 提交前自动 doc_sync
```

## 文档结构

```
docs/
├── gotchas.md            # 踩坑记录 + 生命周期（最高价值：硬踩的坑）
└── architecture.md       # 模块输入/输出契约（人读；机器校验直接读代码 docstring）

scripts/checks/
└── golden-fixtures.json  # 黄金样例（checks/verify_data.py 直接读取，纯 JSON）
```

## 前端结构

```
web/
├── index.html            # 五 Tab（场外/场内/投资知识/我的组合/市场温度）+ 站内搜索 + 表头吸顶
├── css/
│   ├── app.css           # 自定义样式 + 暗色 token（zinc 中性）+ 补齐 tailwind 缺失类
│   └── tailwind.css      # Tailwind 构建产物（只含原应用用到的部分工具类）
└── js/
    ├── config.js         # 全局常量（AUTO-GENERATED 段由 codegen.py 维护）
    ├── utils.js          # 工具函数（JSONP / 格式化 / Modal）
    ├── render-trend.js   # 历史净值走势图（SVG + Crosshair + JSONP）
    ├── main.js           # 主渲染 + Tab 切换 + 搜索 + 吸顶 + 投资知识筛选
    ├── portfolio.js      # 我的组合（持仓/盈亏/配比，localStorage + 本地种子文件）
    ├── market-temperature.js # 市场温度（红绿灯 + 四指标打分，读 web/data/market-temperature.json）
    ├── bj-clock.js       # 顶栏北京时间（精确到秒，tabular-nums 防跳动）
    └── screenshot.js     # 截图分享
```
