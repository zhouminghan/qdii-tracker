# 架构地图

> 本文件是治理程序的事实基线，随每批重构更新。生成日期：2026-11-27。

## 1. 技术栈

- 前端：Vue 3 + TypeScript + Vite + Pinia + Vue Router；TanStack Table（部分）、
  Apache ECharts、Dexie/IndexedDB、html-to-image、Lucide 图标。
- 测试：Vitest + Vue Test Utils + Playwright（仅 Chromium）+ axe-core。
- 数据：Python + AKShare / 东方财富 / 雪球 / 天天基金 / 新浪 / Yahoo 等公开源，
  产出静态 JSON 到 `web/data/`，GitHub Pages 纯静态部署。

## 2. 模块地图与依赖方向

```text
scripts/core/        基础常量与纯函数（constants, utils, config_loader, gold, dca_strategy）
scripts/sources/     外部数据源适配（akshare/eastmoney/xueqiu/ths）→ 仅依赖 core
scripts/pipeline/    数据生产链路 → 依赖 core + sources
scripts/checks/      质量门禁与诊断 → 大多独立；build_snapshot → pipeline
frontend/src/        页面 → features/widgets/stores → shared/ → types
web/data/            数据层（pipeline 输出，前端只读）
config/              业务配置 SSOT（funds.json 经 fundctl 变更）
```

依赖方向：`sources → core`、`pipeline → {core, sources}`、`checks → {core, pipeline}`、
前端 `pages → features/widgets/stores → shared → types`。`shared` 不依赖页面。

### 已知依赖异常

- `pipeline/market_temperature.py:222` 在函数内惰性 `from pipeline.macro_rates import
  fetch_treasury`：pipeline 模块间的隐式横向耦合，应收敛到 `sources` 或 `core`。
- `checks/build_snapshot.py:19` 直接 `from pipeline import market_snapshot, public_catalog`：
  这是「checks 消费 pipeline」的方向，语义成立，但未在契约中显式标注为唯一允许方向。

## 3. 状态所有权地图

| 状态 | 权威来源（SSOT） | 写路径 |
|------|------------------|--------|
| 基金分类/白名单/品牌/被动覆盖 | `config/funds.json` | 仅 `fundctl.py`（经 `core.config_loader`） |
| 人工限购核验 | `config/limit-scopes.json` | `public_catalog.py` 读取 |
| 人工申购状态覆盖 | `config/purchase-overrides.json` | `fill.py` 读取 |
| 分类/净值/申购/规模等公开数据 | `web/data/{CATEGORIES}.json` | pipeline（scan/enrich/fill 等） |
| 前端基金唯一入口 | `web/data/catalog.json` | `public_catalog.py` 生成 |
| 首屏行情 | `web/data/market-snapshot.json` | `market_snapshot.py`（经 build_snapshot） |
| 校验黄金样例 | `scripts/checks/golden-fixtures.json` | `verify_data.py` 读取 |
| 个人持仓/交易/笔记 | 浏览器 IndexedDB `qdii-tracker` | `shared/infrastructure/local-db.ts` |
| 主题/涨跌配色/收藏 | localStorage `qdii-settings-v2` | `stores/settings.ts` |
| 人读数据契约 | `docs/data-contract.md` | 与 `public_catalog.py`、`types/data.ts` 同步 |

## 4. 数据流

```text
sources → pipeline → web/data/*.json
  → public_catalog.py → catalog.json
  → market_snapshot.py → market-snapshot.json
catalog.json + market-snapshot.json → Vue stores → pages/components
pages/components → Dexie 个人数据 → JSON 备份
```

## 5. 重复实现清单

| ID | 语义 | 位置 A（权威/运行时） | 位置 B（平行实现） | 处置 |
|----|------|----------------------|--------------------|------|
| DUP-1 | 黄金折算常数 `31.1034768` | `core/gold.py`（纯函数+测试） | `pipeline/market_snapshot.py:22` 内联常量 | 待：market_snapshot 改从 core.gold 导入常数 |
| DUP-2 | VIX/PE 阶梯定投规则 | `frontend/src/shared/lib/dca.ts`（运行时） | `core/dca_strategy.py`（零运行时调用方） | 待：删除 Python 侧，前端为唯一实现 |
| DUP-3 | 黄金折算 `XAU*USDCNH/OZ` | `pipeline/market_snapshot.py`（运行时） | `core/gold.py:gold_cny_per_gram`（仅测试用） | 待：与 DUP-1 一并收敛 |

已收敛（既往批次）：`calc_series_scale`、`fetch_and_save_holdings`、
`normalize_share_keys`/`normalize_holdings_keys`、`to_float` 均已收拢到 `core/utils.py`。

## 6. 规范偏离清单

| ID | 偏离 | 位置 | 处置 |
|----|------|------|------|
| DEV-1 | 两个 `0003` 决策编号并存 | `docs/decisions/0003-notes-storage.md` 与 `0003-chromium-only-testing.md` | 待确认（与主树在途笔记改动纠缠，避免此刻改名冲突） |
| DEV-2 | 死代码仍登记 | `scripts/checks/stamp_asset_version.py` 无调用方，仍列于 architecture.md / AGENTS.md | 批次 1 删除 |
| DEV-3 | `architecture.md` 缺 3 个 pipeline 契约 | `premium_history` / `nav_history` / `kline_history` 未登记；章节编号错乱/重复 | 待补 |
| DEV-4 | `docs/audit.md` 过期 | 仍描述 Vanilla JS 旧架构（2026-11-14 快照） | 待归档或标注历史 |
| DEV-5 | 无 import 边界机器约束 | `architecture_lint.py` 只校验 `web/` 目录，Python import 方向无 AST 检查 | 待：新增 import 方向 lint |
