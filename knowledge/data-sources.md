# 数据源层

> 三个数据源各自：API 端点清单、调用位置、返回字段、已知限制、降级策略。

## 1. AKShare 数据源

**文件**：`scripts/sources/akshare_source.py`

### API 端点清单

| 函数 | AKShare API | 返回数据 | 批量/逐只 |
|------|------------|----------|-----------|
| `fetch_rank_data()` | `ak.fund_open_fund_rank_em(symbol="全部")` | 全量涨跌幅排名（nav/chg_1m/chg_ytd 等） | 全量批量 |
| `fetch_purchase_data()` | `ak.fund_purchase_em()` | 全量申购状态/限额 | 全量批量 |
| `fetch_etf_data()` | `ak.fund_etf_spot_em()` | ETF 场内价/规模 | 全量批量 |
| `fetch_fund_names()` | `ak.fund_name_em()` | 全量基金名称表 | 全量批量 |
| `fetch_ytd(code)` | `ak.fund_open_fund_info_em(symbol=code, indicator="累计收益率走势")` | YTD 收益率 | 逐只 |
| `fetch_inception_return(code)` | `ak.fund_open_fund_info_em(symbol=code, indicator="累计收益率走势")` | 成立来收益 | 逐只 |
| `fetch_holdings(code)` | `ak.fund_portfolio_hold_em(symbol=code, date=year)` | Top10 重仓股 | 逐只 |

### 调用位置
- `fetch_rank_data()` → `enrich.py:38`、`fill.py:_refresh_purchase_status()` (line 341)
- `fetch_purchase_data()` → `enrich.py:39`、`fill.py:_refresh_purchase_status()` (line 340)
- `fetch_etf_data()` → `enrich.py:40`、`fill.py:_fill_etf_prices()` (line 322)
- `fetch_fund_names()` → `scan.py:294`
- `fetch_ytd()` → `fill.py:_fill_ytd()` (line 266-281)
- `fetch_inception_return()` → `fill.py:_fill_inception()` (line 284-302)
- `fetch_holdings()` → `holdings.py:60`、`reclassify.py:68`

### 速率限制 / 已知坑点
- 逐只接口（ytd/inception）较慢，需控制频率
- `fetch_holdings` 返回的股市代码需配合市场检测（`utils.js:detectMarketPrefix()`）才能在腾讯行情接口正确查询

---

## 2. 东方财富数据源

**文件**：`scripts/sources/eastmoney_source.py`

### API 端点清单

| 函数 | 端点 | 返回数据 | 调用方式 |
|------|------|----------|----------|
| `fetch_lsjz(code)` | `api.fund.eastmoney.com/f10/lsjz` | 最新净值/日期/日涨跌（JSONP） | requests |
| `fetch_pzd(code)` | `fund.eastmoney.com/pingzhongdata/{code}.js` | 历史收益（chg_1m/3m/6m/1y）+ 备选净值 | requests |
| `fetch_f10(code)` | `fundf10.eastmoney.com/jbgk_{code}.html` + 费率页 | 成立日期/经理/规模/管理费/托管费/销售服务费/申购费率 | requests + regex |
| `fetch_fee_rules(code)` | `fundf10.eastmoney.com/jjfl_{code}.html` | 买入/卖出费率详情（多档条件+费率） | requests + regex |

### 调用位置
- `fetch_lsjz()` → `enrich.py:109`（ETF nav_date 回填）、`fill.py:_fetch_lsjz_pzd()` (line 95) — 作为 pzd 的补充源
- `fetch_pzd()` → `fill.py:_fetch_lsjz_pzd()` (line 97) — Pass 1 主力
- `fetch_f10()` → `fill.py:_fetch_f10_wrapped()` (line 102) — Pass 2
- `fetch_fee_rules()` → `fill.py:_fill_basic_info()` (line 251) — Pass 2b

### 降级策略
- **lsjz → pzd 兜底**（后端）：`fill.py:186-193` — lsjz 失败时用 pzd 的净值数据；两者都有时 lsjz 覆盖 pzd 的 nav/nav_date/daily_change
- **lsjz → pzd 兜底**（前端）：`offshore-live-nav.js` — 场外实时净值拉取优先调 lsjz，失败后降级调 pzd

### 已知限制
- 天天基金 API 对 GitHub Pages 跨站来源可能限制访问（本地正常但远端 `ERR_EMPTY_RESPONSE`）
- `fetch_f10` 用正则解析 HTML（无 API，页面结构变化可能导致解析失败）
- `fetch_pzd` 用正则从 JS 变量中提取（数据结构变化可能影响）

---

## 3. 雪球数据源

**文件**：`scripts/sources/xueqiu_source.py`

### API 端点清单

| 函数 | AKShare 包装的雪球接口 | 返回数据 |
|------|------------------------|----------|
| `fetch_basic_info(code)` | `ak.fund_individual_basic_info_xq(symbol=code)` | 规模/经理/成立时间/基金公司/基金类型/基金全称 |
| `fetch_fee_detail(code)` | `ak.fund_individual_detail_info_xq(symbol=code)` | 买入规则/卖出规则/免费持有天数/管理费/托管费/首档买入费率/最高卖出费率 |

### 调用位置
- `fetch_basic_info()` → `enrich.py:64`（逐只调用，`time.sleep(0.2)` 限速）
- `fetch_fee_detail()` → `enrich.py:66`（逐只调用）

### 已知限制
- 逐只接口，全量 enrich 约 5 分钟
- 每秒 1 次调用速率控制（防止反爬）
- 雪球接口偶尔波动返回空数据，enrich 有 `error` 字段兜底

---

## 前端数据源（实时行情 — JSONP）

| 模块 | 端点（腾讯行情） | 数据 | 调用方式 |
|------|-----------------|------|----------|
| `market-indices.js` | `qt.gtimg.cn/q=usINDU,usSPX,usIXIC,usNDX,usUSDCNY` | 道琼斯/标普500/纳指综合/纳指100/美元汇率 | `jsonpFetch(url, {usesCallback:false})` |
| `etf-premium.js` | `qt.gtimg.cn/q=shXXXXXX,szXXXXXX` | ETF 场内价/IOPV/涨跌 | `jsonpFetch(url, {usesCallback:false})` |
| `market-trend.js` | `push2his.eastmoney.com/api/qt/stock/kline/get` (→ push2 兜底) | 日K线数据 | `jsonpFetch(cbName=>url, {usesCallback:true})` |
| `offshore-live-nav.js` | `api.fund.eastmoney.com/f10/lsjz` (→ pzd 兜底) | 场外最新净值 | `jsonpFetch(cbName=>url, {usesCallback:true})` |
