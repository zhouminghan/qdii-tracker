# QDII Tracker

> **双引擎架构**：`knowledge/`（解释记忆）+ `scripts/`（可执行代码）。结构记忆：`.codegraph/`。
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
  → ❶ blast-radius（codegraph_explore 确认影响范围）
  → ❷ 修改
  → ❸ fundctl.py check → 文档同步
```

改中约束（按触及模块）：
- `scan.py` 改后 MUST 接 `enrich + fill`
- `fill.py`：nav_date 永不回退，lsjz 失败保留旧值
- `checks/verify_data.py`：fixtures 格式变更 → 同步 `knowledge/golden-fixtures.md`
- `core/constants.py`：改 CATEGORIES → 必须重跑全量 `sync`
- `config/funds.json`：禁止直接编辑，走 `fundctl.py`
- `web/js|css` 新文件 → `index.html` 加 `?v=` 版本戳
- `web/js/screenshot.js` 改后浏览器验证 PNG 正常
- `web/css/app.css` 改后检查暗色/玻璃态/响应式

### 3. 知识查询 / 经验沉淀

```
查询："XX 在哪/怎么实现" 
  → codegraph_explore → knowledge/INDEX.md → 源码 grep

沉淀："记下来/这个教训/更新文档"
  → 判断去处：
    - 踩坑经验 → knowledge/gotchas.md
    - 行为规则 → AGENTS.md（人审后写入）
```

## 关键边界（不可协商）

- `fundctl.py check` 必须全绿才算完成
- nav_date 永不回退（lsjz 失败保留旧值）
- scan 后必须接 enrich + fill
- 禁止直接改 `config/funds.json`（通过 fund-ops Skill + fundctl.py）
- 部署：commit+push → `gh workflow run deploy-pages.yml --ref main`
- 版本戳：本地 `?v=dev`（占位），部署时 `deploy-pages.yml` 自动 `stamp_asset_version.py --version ${GITHUB_SHA::12}` 替换为 commit SHA，无需手动改

### 自动联动（knowledge ↔ Agent ↔ README）

以下规则**自动执行**，无需用户显式触发：

| 触发事件 | 自动动作 |
|----------|----------|
| 修改代码文件 | 检查 `knowledge/` 中引用该模块的文件是否需同步更新 |
| 修改 `knowledge/` 文件 | 检查是否影响 Skills 定义和 AGENTS.md 规则 |
| 新增/删除/改名文件 | **自动更新** `README.md` 目录树 + `knowledge/INDEX.md` 分区速查表 |
| 功能/流程/命令变更 | **自动更新** `README.md` 核心功能描述 + 命令列表 |
| 踩坑 ≥3 次同一模式 | 提示"是否追加到 AGENTS.md 关键边界？" |

> 原理：knowledge/ 是「解释记忆」、Skills 是「行为指令」。代码变了→记忆可能过期→自动提醒同步。文件结构变了→README 和 INDEX 自动同步。

## Commands

```bash
cd scripts && python3 fundctl.py add --code X --to Y          # 新增
cd scripts && python3 fundctl.py remove --code X               # 删除
cd scripts && python3 fundctl.py move --keyword X --from A --to B  # 调分类
cd scripts && python3 fundctl.py refresh                        # 增量刷新
cd scripts && python3 fundctl.py sync                           # 全量同步
cd scripts && python3 fundctl.py check                          # 门禁（7层）
cd scripts && python3 fundctl.py diagnose --auto-fix            # 诊断修复
cd ../web && python3 -m http.server 8765                        # 本地开发
```

## 门禁

```bash
cd scripts && python3 fundctl.py check    # Layer 0-6: nav_date→配置→lint→fixtures→一致性→文档→交叉验证
```

不绿不提交。

## 操作协议（原 fund-ops / code-change Skills，已内联）

> CodeBuddy 时代的 `.codebuddy/skills/` 已移除，两个 Skill 的流程内联到本文件，
> 与「任务路由」对应，避免重复维护。

## 代码结构

```
scripts/
├── fundctl.py            ← 统一入口
├── core/                 ← 基础设施（constants / utils / config_loader）
├── sources/              ← 数据源适配（akshare / eastmoney / xueqiu）
├── pipeline/             ← 数据生产链路（scan / enrich / fill / holdings / reclassify / codegen）
└── checks/               ← 质量门禁（verify_data / cross_validate / diagnose / architecture_lint / scan_scenarios / stamp_asset_version）
```

## 知识库结构

```
knowledge/
├── INDEX.md              # 总索引 + 架构全景
├── gotchas.md            # 踩坑记录 + 生命周期
├── pipeline-contracts.md # 模块输入/输出契约（check Layer 5 依赖）
├── data-sources.md       # 数据源 + API端点 + 降级策略
├── data-schema.md        # web/data JSON 字段定义
└── golden-fixtures.md    # 黄金样例（checks/verify_data.py 读取）
```

## 前端结构

```
web/
├── index.html
├── css/
│   ├── app.css           # 自定义样式（Graphite Dark 暗色主题）
│   └── tailwind.css      # Tailwind 构建产物
└── js/
    ├── config.js         # 全局常量（AUTO-GENERATED 段由 codegen.py 维护）
    ├── utils.js          # 工具函数（JSONP / 格式化 / Modal）
    ├── render-trend.js   # 历史净值走势图（SVG + Crosshair + JSONP）
    ├── main.js           # 主渲染逻辑（1274 行）
    └── screenshot.js     # 截图分享
```
