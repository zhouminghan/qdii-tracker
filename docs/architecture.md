# 模块边界契约

> 每个模块的输入/输出文件、依赖关系。`pipeline/` = 数据生产链路，`checks/` = 质量门禁+诊断+辅助。
> 本表是脚本模块契约的权威来源；新增/删除 `scripts/pipeline/*.py` 或 `scripts/checks/*.py`
> 必须同步更新本表（由 `check_agent_rules.py` 机器校验双向一致）。

## pipeline/ — 数据生产链路

### 1. scan.py — 扫描分类

| 属性 | 内容 |
|------|------|
| **职责** | 从 AKShare 获取全量基金，按板块自动分类，归组成 series + shares 结构 |
| **输入文件** | `config/funds.json`（分类规则 SSOT） |
| **输出文件** | `web/data/{sp500,nasdaq_passive,active,global_index,global_other,etf}.json`、`web/data/meta.json` |
| **依赖** | `core.constants`、`core.utils`、`core.config_loader`、`sources.akshare_source` |

### 2. enrich.py — 批量丰富

| 属性 | 内容 |
|------|------|
| **职责** | 批量拉取涨跌幅/限额/申购状态，逐只拉取规模/经理/成立时间/费率 |
| **输入文件** | `web/data/{cat}.json`（6 个分类） |
| **输出文件** | 同文件覆写 |
| **依赖** | `core.constants`、`core.utils`、`sources.akshare_source`、`sources.eastmoney_source`、`sources.xueqiu_source`、`sources.ths_source` |

### 3. fill.py — 补全缺失

| 属性 | 内容 |
|------|------|
| **职责** | 两阶段：Pass 1 用 lsjz+pzd 双源并行补净值/收益（4 线程），并由 `_compute_period_returns` 在无 equityReturn 时用单位净值兜底 YTD/成立来；Pass 1 后若无缺失字段则跳过第二批。第二批按需运行 Pass 2（F10 基础信息）、Pass 2b（OTC 申赎规则）、Pass 3（chg_ytd）、Pass 4（chg_since_inception）。最后按份额刷新申购状态（美元份额同样追踪 buy_status_history），并应用 `config/purchase-overrides.json` 的人工平台核验。`_fill_etf_prices` 每日刷新 ETF 场内价/涨跌/规模并重算 series_scale/total_scale。支持 `--scope otc|etf`（场外/场内拆分）与 `--codes`（单基金） |
| **输入文件** | `web/data/{cat}.json`（6 个分类）、`config/purchase-overrides.json`（可选份额级人工状态） |
| **输出文件** | 同文件覆写 + `web/data/meta.json`（bump_generated_at） |
| **依赖** | `core.constants`、`core.utils`、`sources.eastmoney_source`、`sources.akshare_source`、`sources.ths_source` |

### 4. holdings.py — 持仓抓取

| 属性 | 内容 |
|------|------|
| **职责** | 逐只抓取主动基金 + 全球/其他 QDII 的 Top10 重仓股 |
| **输入文件** | `web/data/{active,global_other}.json`（仅 HOLDINGS_CATEGORIES） |
| **输出文件** | `web/data/holdings/{code}.json`（每只一个文件） |
| **依赖** | `core.constants`、`core.utils`、`core.config_loader`、`sources.akshare_source` |

### 5. reclassify.py — 增量重分类

| 属性 | 内容 |
|------|------|
| **职责** | 将一只基金从一个板块移到另一个板块（增量，避免全量流水线 8-10 分钟） |
| **输入文件** | `web/data/{from_cat}.json`、`web/data/{to_cat}.json`、`config/funds.json` |
| **输出文件** | 同上文件覆写 + `web/data/meta.json` + `config/funds.json`（白名单更新） |
| **依赖** | `core.constants`、`core.utils`、`core.config_loader`、`sources.akshare_source` |

### 6. performance.py — 历史净值收益补算

| 属性 | 内容 |
|------|------|
| **职责** | 对仍缺失的区间收益，优先读取本地 `nav-history/{code}.json`，缺失时抓取 pingzhongdata 历史，按日历区间补算 1 周至 3 年、今年来和成立来收益；只填充 `null`，不覆盖已有公开值 |
| **输入文件** | `web/data/{cat}.json`、`web/data/nav-history/{code}.json`、天天基金 pingzhongdata |
| **输出文件** | 六个分类 JSON、`web/data/meta.json` |
| **依赖** | `core.constants`、`core.utils`、`sources.eastmoney_source` |
| **调用方** | `fundctl.py refresh/sync`、`update-data.yml` |

### 7. nav_history.py — 历史净值文件

| 属性 | 内容 |
|------|------|
| **职责** | 为每只默认份额生成 `nav-history/{code}.json` 扁平数组（dates/navs）。全量走 pingzhongdata 成立以来序列；增量（`--incremental`）读现有文件用 lsjz 追加新日期，nav_date 永不回退；文件缺失自动退回全量 |
| **输入文件** | `web/data/{cat}.json`（默认份额代码） |
| **输出文件** | `web/data/nav-history/{code}.json` |
| **依赖** | `core.constants`、`core.utils`、`sources.eastmoney_source` |
| **调用方** | `fundctl.py refresh`（增量）/ `sync`（全量） |

### 8. premium_history.py — 场内 ETF 历史溢价

| 属性 | 内容 |
|------|------|
| **职责** | 按日期对齐 ETF 日 K 收盘价与当日净值，计算历史溢价曲线（历史 IOPV 不公开，用历史净值替代盘中 IOPV，与前端实时溢价口径一致） |
| **输入文件** | `web/data/etf.json`（场内 ETF 代码） |
| **输出文件** | `web/data/etf-premium-history.json` |
| **依赖** | `core.constants`、`core.utils`、`sources.eastmoney_source` |
| **调用方** | `fundctl.py sync` |

### 9. kline_history.py — 指数 / ETF / 外汇日 K

| 属性 | 内容 |
|------|------|
| **职责** | 生成指数、上海金、场内 ETF、外汇的日 K 扁平数组（dates/open/high/low/close/volume）；全量从 1990 年起抓取，增量只追加比最后日期更新的点。周/月 K 由前端按日 K 聚合 |
| **输入文件** | 东财 push2his 日 K、新浪、中行外汇、腾讯（多源降级） |
| **输出文件** | `web/data/index-kline/*.json`、`web/data/etf-kline/*.json`、`web/data/fx-kline/*.json` |
| **依赖** | `core.constants`、`core.utils` |
| **调用方** | `fundctl.py refresh`（增量）/ `sync`（全量） |

### 10. public_catalog.py — 公共目录契约

| 属性 | 内容 |
|------|------|
| **职责** | 汇总六个分类 JSON、公司品牌配置、人工额度核验和公告自动识别结果，生成带 schema/status/quality 的前端唯一入口；为每个 share 补充 `limit_scope`、渠道额度、币种和来源字段 |
| **输入文件** | `web/data/{CATEGORIES}.json`、`web/data/meta.json`、`web/data/limit-notices.json`、`config/funds.json`、`config/limit-scopes.json` |
| **输出文件** | `web/data/catalog.json` |
| **依赖** | `core.constants`、`core.utils` |

### 11. market_temperature.py — 市场温度评分

| 属性 | 内容 |
|------|------|
| **职责** | 抓取纳指趋势 / VIX / 10 年期美债 / 美元指数，按可配置阈值打分并加权，生成红绿灯信号 |
| **输入文件** | 新浪 `.NDX`、Yahoo `^VIX`、东财中美国债收益率、东财美元指数（失败时复用旧快照） |
| **输出文件** | `web/data/market-temperature.json`（含 `weights` 与 `coverage`；缺失数据标记 degraded） |
| **依赖** | `core.constants`、`core.utils`、`akshare`、`requests`、`sources.treasury_source`（函数内惰性导入） |

### 12. nasdaq_history.py — 纳指历史图谱

| 属性 | 内容 |
|------|------|
| **职责** | 抓取纳斯达克 100 指数（^NDX）日线并按月聚合，计算逐年收益/日线收盘最大回撤/峰谷月份、YTD、完整月份热力矩阵、5/10/20 年与全长月份排行榜及谷值月份分布；未结束月份不参与季节性统计；数据日期倒退时保留旧快照 |
| **输入文件** | Yahoo Finance `^NDX`（分段日线，429 退避重试）、新浪 `.NDX`（同一指数身份的多源降级；失败时复用旧快照） |
| **输出文件** | `web/data/nasdaq-history.json`（`index.symbol = ^NDX`、`as_of`、`drawdown_basis`、`ranking.20y`） |
| **依赖** | `core.constants`、`core.utils`、`requests`、`akshare`（兜底源） |

### 13. cnn_sentiment.py — CNN 恐慌与贪婪

| 属性 | 内容 |
|------|------|
| **职责** | 抓取 CNN 恐慌贪婪指数（0-100）与历史序列，分档为五级情绪并输出时间序列 |
| **输入文件** | CNN dataviz 接口（需带 Origin/Referer 请求头；失败时复用旧快照） |
| **输出文件** | `web/data/cnn-fear-greed.json` |
| **依赖** | `core.constants`、`core.utils`、`requests` |

### 14. brand_gold.py — 品牌实物金价

| 属性 | 内容 |
|------|------|
| **职责** | 抓取证券之星金条金币报价页，解析周大福/老凤祥/中国黄金等品牌的足金饰品与投资金条挂牌价 |
| **输入文件** | 证券之星 `quote.stockstar.com/gold/salegold.shtml`（GBK 服务端渲染；失败时复用旧快照） |
| **输出文件** | `web/data/brand-gold.json` |
| **依赖** | `core.constants`、`core.utils`、`requests` |

### 15. ndx_pe.py — 纳指100 市盈率

| 属性 | 内容 |
|------|------|
| **职责** | 抓取 Siblis Research 免费 API 的 NDX trailing PE 月末快照，明确输出 Nasdaq-100 + TTM + 月度口径；失败时保留旧值 |
| **输入文件** | Siblis `api/v1/NDX/pe-trailing`（免费档仅月末快照；失败时复用旧快照） |
| **输出文件** | `web/data/ndx-pe.json`（`index`、`index_symbol`、`pe_type`、`frequency`、`observation_period`、`date`） |
| **依赖** | `core.constants`、`core.utils`、`requests` |

### 16. macro_rates.py — 宏观利率

| 属性 | 内容 |
|------|------|
| **职责** | 抓取美国国债 2/10/30 年收益率最新值，写入宏观利率数据；优先美国财政部官方 CSV，回退 FRED，再回退东方财富 |
| **输入文件** | 美国财政部 daily_treasury_yield_curve CSV、FRED DGS2/DGS10/DGS30、akshare `bond_zh_us_rate`（全部失败时复用旧快照） |
| **输出文件** | `web/data/macro-rates.json` |
| **依赖** | `core.constants`、`core.utils`、`sources.treasury_source` |

### 17. fx_spot.py — 实时汇率快照

| 属性 | 内容 |
|------|------|
| **职责** | 从新浪财经外汇报价抓取 USD/CNY、USD/CNH、USD/JPY、USD/HKD、CNY/HKD 即期报价，写入 `fx-spot.json`；免密钥，失败保留旧快照 |
| **输入文件** | 新浪财经 `hq.sinajs.cn`（需 Referer，GBK 解码） |
| **输出文件** | `web/data/fx-spot.json` |
| **依赖** | `core.constants`、`core.utils`、`requests` |
| **调用方** | `update-data.yml`；`market_snapshot.py` 读取 |

### 18. gold_spot.py — 现货黄金与上海金实时快照

| 属性 | 内容 |
|------|------|
| **职责** | 从金投网 `JO_71` 抓取上海金 Au9999（元/克），从新浪 `hf_XAU` 抓取伦敦金现货 XAU/USD；写入 `gold-spot.json`，失败保留旧快照 |
| **输入文件** | 金投网 `api.jijinhao.com`、新浪财经 `hq.sinajs.cn` |
| **输出文件** | `web/data/gold-spot.json` |
| **依赖** | `core.constants`、`core.utils`、`requests` |
| **调用方** | `update-data.yml`；`market_snapshot.py` 读取 |

### 19. market_snapshot.py — 首屏行情本地快照

| 属性 | 内容 |
|------|------|
| **职责** | 纯离线汇总指数、科技股、外汇、黄金、宏观、温度、ETF 溢价与场外净值，生成首屏可直接渲染的本地快照；不联网、不伪造实时值，缺失字段写 `null`；优先读取 `fx-spot.json` / `gold-spot.json` 的独立实时报价，缺失时回退 K 线与 `au9999 * 31.1034768 / USDCNH` 折算；只有独立 XAU 存在时才计算国内溢价 |
| **输入文件** | `web/data/meta.json`、`web/data/*.json`、`web/data/fx-spot.json`、`web/data/gold-spot.json`、`web/data/index-kline/*.json`、`web/data/fx-kline/*.json`、`web/data/etf-premium-history.json` |
| **输出文件** | `web/data/market-snapshot.json` |
| **依赖** | `core.constants`、`core.gold`、`core.utils` |
| **调用方** | `scripts/checks/build_snapshot.py`；由 `update-data.yml` 每个工作日生成并随 `web/data/` 发布 |

### 20. limit_notices.py — 共用申购限额公告扫描

| 属性 | 内容 |
|------|------|
| **职责** | 扫描多份额基金的公开公告，只提取正文明确出现“多份额合计”或“合并计算”的共用额度；按渠道记录金额、是否含定投和生效日 |
| **输入文件** | 东方财富基金公告列表 API、公告正文 API、公告 PDF |
| **输出文件** | `web/data/limit-notices.json` |
| **依赖** | `core.constants`、`core.utils`、`requests`、`pypdf` |
| **调用方** | `fundctl.py limits`；全量 `sync` 在生成 catalog 前执行 |

---

## checks/ — 质量门禁 + 诊断 + 辅助

### 1. verify_data.py — 黄金样例校验

| 属性 | 内容 |
|------|------|
| **职责** | 读取 `scripts/checks/golden-fixtures.json` 中的 JSON fixtures，与 `web/data/*.json` 逐条核对 |
| **输入文件** | `scripts/checks/golden-fixtures.json`、`web/data/*.json` |
| **输出文件** | 无（返回错误列表） |
| **依赖** | `core.constants` |

### 2. cross_validate.py — 跨源交叉验证

| 属性 | 内容 |
|------|------|
| **职责** | 对比 lsjz（天天基金）和 pzd（pingzhongdata）的净值，偏差 > 0.5% 标记异常 |
| **输入文件** | `web/data/*.json` |
| **输出文件** | 无（返回异常列表） |
| **依赖** | `core.constants`、`core.utils`、`sources.eastmoney_source` |

### 3. diagnose.py — 诊断引擎

| 属性 | 内容 |
|------|------|
| **职责** | 检查 missing_nav / buy_status_anomaly / nav_regression / fee_anomalies，支持 --auto-fix |
| **输入文件** | `web/data/*.json`（除 meta.json） |
| **输出文件** | 无（只输出诊断报告；--auto-fix 时调 `fundctl.py refresh` 修复） |
| **依赖** | `core.constants` |

### 4. architecture_lint.py — 目录纪律与 import 方向校验

| 属性 | 内容 |
|------|------|
| **职责** | 校验 `web/` 目录结构符合白名单规则，并校验 `scripts/` 的分层 import 方向（core ← sources ← pipeline ← checks，禁止向上/同级横向） |
| **输入文件** | `web/` 目录、`scripts/` 源码 |
| **输出文件** | 无（返回错误列表） |
| **依赖** | `core.constants` |

### 5. verify_purchase.py — 申购状态/限额/历史一致性校验

| 属性 | 内容 |
|------|------|
| **职责** | 校验 buy_status / daily_limit / buy_status_history 语义一致性：ETF 历史必空、无 1e11 哨兵值、历史尾条与当前状态一致（含美元份额）（防 G015/G016 复发） |
| **输入文件** | `web/data/*.json` |
| **输出文件** | 无（返回错误列表） |
| **依赖** | `core.constants` |

### 6. check_agent_rules.py — Agent 规则机器验证

| 属性 | 内容 |
|------|------|
| **职责** | 校验 docs/ ↔ AGENTS.md ↔ 代码 的一致性：docs 文件完整性、architecture.md 模块登记有效性、gotchas 引用有效性、AGENTS.md 命令有效性、README 目录树、Skills 引用、doc_sync 同步 |
| **输入文件** | `docs/`、`AGENTS.md`、`README.md`、`scripts/` |
| **输出文件** | 无（返回错误列表，失败 exit 1） |
| **依赖** | `checks.doc_sync`（函数内惰性导入） |
| **调用方** | `fundctl.py check --agent-rules` |

### 7. doc_sync.py — 文档自动同步

| 属性 | 内容 |
|------|------|
| **职责** | 从真实状态（git 追踪文件 + fundctl.py 子命令）推导 README 目录树与命令列表（`--fix` 写入标记块），并校验 AGENTS.md 是否漏登记 pipeline/checks/core/sources 模块（`--check`） |
| **输入文件** | `README.md`、`AGENTS.md`、git 追踪文件 |
| **输出文件** | `README.md`（标记块内） |
| **依赖** | 标准库（无兄弟模块依赖） |
| **调用方** | `.githooks/pre-commit`；`fundctl.py check --agent-rules`（Layer G） |

### 8. build_snapshot.py — 每日快照与 RSS

| 属性 | 内容 |
|------|------|
| **职责** | 纯离线汇总生成 `snapshot.json`、`market-snapshot.json`、`catalog.json`、`holdings-index.json` 与 `feed.rss` |
| **输入文件** | `web/data/{CATEGORIES}.json`、`web/data/meta.json`、`web/data/holdings/*.json` |
| **输出文件** | `web/data/snapshot.json`、`web/data/market-snapshot.json`、`web/data/catalog.json`、`web/data/holdings-index.json`、`web/feed.rss` |
| **依赖** | `core.constants`、`core.utils`、`pipeline.market_snapshot`、`pipeline.public_catalog` |
| **调用方** | `update-data.yml`（每次数据更新后） |

---

## 依赖关系图

### pipeline/ （数据生产）

```text
scan.py ────────────► core.constants, core.utils, core.config_loader, sources.akshare_source
enrich.py ──────────► core.constants, core.utils, sources.akshare_source, sources.eastmoney_source, sources.xueqiu_source, sources.ths_source
fill.py ────────────► core.constants, core.utils, sources.eastmoney_source, sources.akshare_source, sources.ths_source
holdings.py ────────► core.constants, core.utils, core.config_loader, sources.akshare_source
reclassify.py ──────► core.constants, core.utils, core.config_loader, sources.akshare_source
performance.py ─────► core.constants, core.utils, sources.eastmoney_source
nav_history.py ─────► core.constants, core.utils, sources.eastmoney_source
premium_history.py ─► core.constants, core.utils, sources.eastmoney_source
kline_history.py ───► core.constants, core.utils
public_catalog.py ──► core.constants, core.utils
market_temperature.py ► core.constants, core.utils, akshare, requests, sources.treasury_source
nasdaq_history.py ──► core.constants, core.utils, requests, akshare
cnn_sentiment.py ───► core.constants, core.utils, requests
brand_gold.py ──────► core.constants, core.utils, requests
ndx_pe.py ──────────► core.constants, core.utils, requests
macro_rates.py ─────► core.constants, core.utils, sources.treasury_source
fx_spot.py ─────────► core.constants, core.utils, requests
gold_spot.py ───────► core.constants, core.utils, requests
market_snapshot.py ─► core.constants, core.gold, core.utils
limit_notices.py ───► core.constants, core.utils, requests, pypdf
```

### checks/ （质量门禁）

```text
verify_data.py ─────────► core.constants
cross_validate.py ──────► core.constants, core.utils, sources.eastmoney_source
diagnose.py ────────────► core.constants
architecture_lint.py ───► core.constants
verify_purchase.py ─────► core.constants
check_agent_rules.py ───► checks.doc_sync（函数内惰性导入）
doc_sync.py ────────────► (独立)
build_snapshot.py ──────► core.constants, core.utils, pipeline.market_snapshot, pipeline.public_catalog
```

> 注：`checks/` 模块通过 `fundctl.py` 统一调用；除 `build_snapshot → pipeline` 与
> `check_agent_rules → doc_sync` 两条已显式标注的方向外，checks 不依赖其他 checks 兄弟模块。

## frontend/ — Vue 应用

```text
pages/
  FundsPage      -> catalog.json + holdings + nav-history
  MarketPage     -> market-snapshot + nasdaq-history + fear-greed
  PortfolioPage  -> catalog.json + Dexie(positions/trades)
  ResearchPage   -> knowledge.ts + Dexie(notes/watchlist/strategyLogs/noteHistory)

stores/
  data           -> 公共 JSON 唯一加载入口
  settings       -> 主题、涨跌配色、收藏
  portfolio      -> 持仓/交易计算与持久化
  research       -> 笔记/观察/策略
```

依赖方向固定为 `pages → features/widgets/stores → shared/infrastructure/lib/components`。
`shared` 不依赖页面；页面不得直接操作 IndexedDB 或猜测公共数据契约。

## 数据流

```text
sources/ → pipeline/ → web/data/*.json
web/data/*.json → public_catalog.py → catalog.json
catalog.json + market-snapshot.json → Vue stores → pages/components
pages/components → Dexie personal data → JSON backup
```
