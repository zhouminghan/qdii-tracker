# fill-pipeline — 净值/收益/YTD 补全

**文件**：`scripts/pipeline/fill.py`
**上游**：`enrich.py`（必须在 enrich 之后运行）
**下游**：`holdings.py`
**updated**：2026-07-24

## 入口
```python
from pipeline import fill
fill.main()          # 全量
fill.main(['--codes', '002891,000041'])  # 仅指定基金
```
主入口：`fill.py:main()` (line 123-143)

## 核心流程

### Pass 1：净值 + 历史收益 (line 157-211)
- lsjz + pzd 双源：`_fetch_lsjz_pzd(code)` (line 92-98)
- `ThreadPoolExecutor(max_workers=4)` 并行，`BoundedSemaphore(4)` 防反爬
- lsjz 覆盖 pzd 的 nav/nav_date/daily_change，pzd 提供历史收益
- ETF 跳过 nav/daily_change（用场内价替代）
- nav_date 防回退：只前进不后退

### Pass 2：F10 基础信息 (line 214-261)
- 目标：scale/established/manager/sale_service_fee/mgmt_fee/custody_fee/first_buy_rate 为空的基金
- Pass 2b (line 242-261)：buy_rules/sell_rules 补充（串行）

### Pass 3：YTD (line 264-281)
- `fetch_ytd(code)` — AKShare 累计收益率走势 → 推算 YTD

### Pass 4：成立来收益 (line 284-302)
- `fetch_inception_return(code)` — AKShare 累计收益率走势 → 最后一条

### ETF 场内价 (line 319-335)
- `fetch_etf_data()` 批量 + 写回 etf.json

### 申购状态刷新 (line 338-361)
- `fetch_purchase_data()` + `fetch_rank_data()` → 更新 buy_status/daily_limit
- `_update_history()` → 追加到 buy_status_history 数组

## 关键函数表

| 函数 | 行号 | 作用 |
|------|------|------|
| `main()` | 123 | 全量补全主流程 |
| `_fill_nav_and_returns()` | 157 | Pass 1: ThreadPool 并行拉取净值 |
| `_fill_basic_info()` | 214 | Pass 2: F10 + 2b: 买卖规则 |
| `_fill_ytd()` | 264 | Pass 3: YTD |
| `_fill_inception()` | 284 | Pass 4: 成立来收益 |
| `_write_back()` | 305 | 写回各分类 JSON + bump meta |
| `_fill_etf_prices()` | 319 | ETF 场内价 |
| `_refresh_purchase_status()` | 338 | 申购状态 + 历史追踪 |
| `merge_share_data()` | 43 | 合并 pzd 数据（含防回退逻辑） |
| `_update_history()` | 19 | 申购变更历史追踪 |

## 数据依赖

| 读文件 | 写文件 | 外部 API |
|--------|--------|----------|
| `web/data/{cat}.json` (6 个) | `web/data/{cat}.json` (6 个) | `fetch_lsjz()` — 天天基金 lsjz API |
| | `web/data/meta.json` | `fetch_pzd()` — 天天基金 pzd JS |
| | | `fetch_f10()` — 天天基金 F10 概况+费率 |
| | | `fetch_fee_rules()` — 天天基金 费率详情 |
| | | `fetch_ytd()` — AKShare 累计收益率走势 |
| | | `fetch_inception_return()` — AKShare 累计收益率走势 |
| | | `fetch_etf_data()` — AKShare ETF 场内 |
| | | `fetch_purchase_data()` — AKShare 申购状态 |
| | | `fetch_rank_data()` — AKShare 涨跌幅 |

## 约束
- nav_date 永不回退：lsjz 失败保留旧值
- ETF 不为空覆盖 nav/nav_date/daily_change（ETF_SKIP_FIELDS）
- 写盘前 `normalize_share_keys()` 保证 key 顺序一致
- 申购历史：状态和额度都没变则保持原日期不写入
