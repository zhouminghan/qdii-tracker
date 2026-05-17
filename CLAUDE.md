# QDII Tracker — 项目规范

> 本文件是 AI 辅助开发时的全局上下文，定义架构、约定、数据流和改动规则。
> 任何 AI（Claude Code / Copilot 等）在修改本项目前必须先读此文件。

---

## 📐 项目定位

美股 QDII 基金追踪看板 —— 纯静态部署、零后端运行时。
数据由 Python 流水线（GitHub Actions）定时抓取，前端直接消费 `web/data/*.json`。
**仅自用场景**：仅 GitHub Pages 一种部署方式，无数据库、无 Docker、无任何长驻服务。

在线地址：https://zhouminghan.github.io/qdii-tracker/

---

## 🏗️ 架构总览

```
                    ┌─────────────────────┐
                    │   数据源（公开接口）   │
                    │  AKShare / 天天基金   │
                    │  雪球 / 腾讯财经      │
                    └─────────┬───────────┘
                              │ Python 脚本（定时）
                              ▼
┌──────────────────────────────────────────────────┐
│  scripts/                                        │
│  ① scan_funds.py     → web/data/{5个分类}.json   │
│  ② enrich_data.py    → 补规模/费率/经理/收益      │
│  ③ fill_missing.py   → 补净值/YTD/历史收益        │
│  ④ fetch_holdings.py → web/data/holdings/*.json  │
│  ⑤ fetch_stocks.py   → web/data/us_stocks.json  │
│  ⑥ calc_estimate.py  → web/data/estimates.json  │
└──────────────────────────────────────────────────┘
                              │ 静态 JSON
                              ▼
┌──────────────────────────────────────────────────┐
│  web/index.html  （单文件前端，~2400 行）          │
│  · Tailwind 本地化 + Vanilla JS                   │
│  · 三层数据：静态 JSON 为主 + 前端 JSONP 兜底 + 前端实时刷新 │
│  · 场外/场内双 Tab · 分组 Chips · 展开行 · Modal  │
└──────────────────────────────────────────────────┘
```

### 三层数据策略

| 层级                         | 来源                                                                            | 作用                                         |
| ---------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| **静态层（权威）**     | GitHub Actions 工作日 08:30/17:30/22:30 + 每月 2 日 02:00 →`web/data/*.json` | 所有基金规模/净值/持仓/估值以此为准          |
| **动态层（兜底）**     | 前端直接调 fundgz / 腾讯行情                                                    | 仅在"仓库数据落后于今日"时补拉               |
| **实时层（前端刷新）** | 前端调 fundmobapi / 前端重算估值                                                | 申购状态/日限额/主动基金估值，每次刷新都重算 |

### 数据版本号机制

前端加载数据时：

1. 先拉 `meta.json`（`?t=Date.now()` 强破缓存），取其 `generated_at` 字段
2. 后续所有数据 JSON 用 `?v=${meta.generated_at}` 作版本号
3. Actions 推新数据 → `generated_at` 变 → 所有 JSON 的 query 变 → 浏览器/Pages CDN 自动失效
4. 数据没变时 query 不变，命中缓存秒开

---

## 📂 目录结构与职责

```
qdii-tracker/
├── CLAUDE.md                  ← 你正在读的文件
├── README.md                  ← 项目说明 + 分类规则
├── .gitignore
│
├── .github/workflows/
│   ├── deploy-pages.yml       ← Pages 部署
│   └── update-data.yml        ← 定时数据更新
│
├── docs/
│   └── ADDING-FUNDS.md        ← 新增基金操作手册
│
├── scripts/
│   ├── scan_funds.py          ← ① 扫描全量 QDII + 自动分类
│   ├── enrich_data.py         ← ② 补规模/费率/经理/收益
│   ├── fill_missing.py        ← ③ 补净值/YTD/历史收益
│   ├── refresh_purchase.py    ← ④ 补申购状态/限额（轻量）
│   ├── fetch_holdings.py      ← ⑤ 抓 Top10 重仓（active + global_other）
│   ├── fetch_stocks.py        ← ⑥ 抓持仓股票实时行情
│   ├── calc_estimate.py       ← ⑦ 算主动基金实时估值
│   └── requirements.txt       ← Python 依赖
│
└── web/
    ├── index.html             ← 单文件前端（HTML + CSS + JS 全内联）
    ├── tailwind.min.js         ← 本地化 Tailwind（避免 CDN 白屏，267KB）
    ├── .nojekyll               ← 禁用 GitHub Pages Jekyll 解析
    └── data/
        ├── sp500.json         ← 场外·标普500
        ├── nasdaq_passive.json← 场外·纳指100
        ├── active.json        ← 场外·美股主动精选
        ├── global_other.json  ← 场外·全球/其他QDII
        ├── etf.json           ← 场内ETF
        ├── us_stocks.json     ← 持仓股票行情
        ├── estimates.json     ← 主动基金估值（NEW）
        ├── meta.json          ← 扫描元信息
        └── holdings/          ← 54只基金持仓详情
            └── {code}.json
```

---

## 🔀 数据流水线（7 步，顺序执行）

| 步骤 | 脚本                    | 输入                  | 输出             | 耗时  |
| ---- | ----------------------- | --------------------- | ---------------- | ----- |
| ①   | `scan_funds.py`       | AKShare 全量基金      | 5 个分类 JSON    | ~2min |
| ②   | `enrich_data.py`      | 分类 JSON             | 补规模/费率/经理 | ~5min |
| ③   | `fill_missing.py`     | 分类 JSON             | 补净值/YTD       | ~2min |
| ④   | `refresh_purchase.py` | 分类 JSON             | 补申购状态/限额  | ~30s  |
| ⑤   | `fetch_holdings.py`   | active + global_other | holdings/*.json  | ~2min |
| ⑥   | `fetch_stocks.py`     | holdings/*.json       | us_stocks.json   | ~3min |
| ⑦   | `calc_estimate.py`    | holdings + us_stocks  | estimates.json   | ~5s   |

**增量更新**（每工作日 08:30 / 17:30 / 22:30 北京时间）跑 ③④⑥⑦⑤（fill_missing → refresh_purchase → fetch_stocks → calc_estimate → enrich_data）。
**完整流水线**（每月 2 日 02:00 北京时间）跑 ①-⑦。

注：QDII 净值 T+1 披露——T 日美股收盘后，基金公司于 T+1 日北京时间晚间陆续披露。22:30 那轮最关键，覆盖绝大多数 QDII 净值。

---

## 📊 数据源接口

| 数据源   | 接口                              | 用途                                                    | 调用方            |
| -------- | --------------------------------- | ------------------------------------------------------- | ----------------- |
| AKShare  | `fund_name_em()`                | 全量基金列表                                            | 后端              |
| AKShare  | `fund_open_fund_rank_em()`      | 排行榜（净值/收益）                                     | 后端              |
| AKShare  | `fund_purchase_em()`            | 申购状态/日限额（后端兜底，前端直连 fundmobapi 更实时） | 后端+前端         |
| AKShare  | `fund_portfolio_hold_em()`      | Top10 重仓                                              | 后端              |
| AKShare  | `fund_open_fund_info_em()`      | 累计收益率                                              | 后端              |
| AKShare  | `stock_us/hk/a_spot_em()`       | 美股/港股/A股行情                                       | 后端              |
| 天天基金 | `pingzhongdata/{code}.js`       | 净值曲线                                                | 后端+前端         |
| 天天基金 | `fundgz.1234567.com.cn`         | 最新真实净值                                            | 前端兜底          |
| 天天基金 | `fundmobapi.eastmoney.com`      | 申购状态/日限额（移动端 JSONP）                         | 前端实时+后端兜底 |
| 雪球     | `fund_individual_basic_info_xq` | 规模/费率                                               | 后端              |
| 腾讯财经 | `qt.gtimg.cn`                   | ETF/股票实时行情                                        | 前端动态          |

---

## 🧮 主动基金估值引擎

### 核心公式

```
估值影响(%) = Σ(持仓权重% × 该持仓涨跌幅%) / 100 + 仓位比例 × 汇率变动% / 100
```

与 FundDrift（fund.this52.cn）同源公式，区别：

- FundDrift 后端实时计算，前端只展示
- 本项目由 `calc_estimate.py` 离线预计算 → `estimates.json`，前端动态刷新时用 `fetchStocksLive()` 重算

### 估值数据结构 (`estimates.json`)

```json
{
  "generated_at": "2026-05-17T22:30:00",
  "fx_change": -0.08,
  "funds": {
    "270023": {
      "name": "广发全球精选股票",
      "code": "270023",
      "estimated_impact": 0.69,
      "total_weight": 66.95,
      "stock_ratio": 90.0,
      "stock_contribution": 0.76,
      "fx_contribution": -0.07,
      "top_movers": [
        {"name": "英伟达", "weight": 20.16, "change": 2.11, "impact": 0.43},
        {"name": "苹果", "weight": 17.73, "change": 0.51, "impact": 0.09}
      ],
      "unmatched_codes": ["PLTR"]
    }
  }
}
```

### 前端动态估值

前端在 `refreshLive()` 时，对有持仓数据的基金：

1. 调 `fetchStocksLive()` 拿实时行情
2. 用同公式在前端重算 `estimated_impact`
3. 显示在列表行和详情 Modal 里

---

## 🎨 前端约定

### 单文件架构

- **所有 HTML / CSS / JS 都在 `web/index.html`**，不拆分文件
- CSS 用 Tailwind 本地化（`tailwind.min.js`）+ `<style>` 自定义，不依赖外部 CDN
- JS 用 `<script>` 内联，不使用构建工具

### 配色（A 股口径）

- **红涨绿跌**：`.up { color: #dc2626; }` / `.down { color: #16a34a; }`
- 全站统一，与美股习惯相反

### 份额排序

币种（人民币 < 美元）→ 份额类型（A < C < E < F）→ 代码

### 估值显示规则

估值**仅美股主动基金**（active 分组）显示，其他分组不展示。

| 基金类型                         | 列表行显示                             | 来源                         |
| -------------------------------- | -------------------------------------- | ---------------------------- |
| 被动指数（sp500/nasdaq_passive） | 官方净值 + 日涨跌                      | fundgz / data.json           |
| 美股主动基金（active）           | 官方净值 +**估值列**（单独一列） | calc_estimate + 前端动态重算 |
| 全球/其他 QDII（global_other）   | 官方净值 + 日涨跌（无估值）            | fundgz / data.json           |
| 场内 ETF                         | 实时价格 + 涨跌幅                      | 腾讯行情                     |

估值列在"净值"和"近1月"之间，标注"估"字样 + 估值日期，明确告诉用户这不是官方净值。
前端 `refreshLive()` 会动态拉取持仓股票实时行情并重算估值，确保打开页面即最新。
估值列仅在选择"主动"Chip 时显示，其他分组通过 CSS `hide-est` 类隐藏整列（含表头和数据行）。
持仓详情弹窗显示实时涨跌（按持仓股票所属市场取实时行情），汇总条展示持仓只数/Top10占比/重仓股数。
弹窗打开后盘中自动每 5 分钟刷新持仓行情（`DETAIL_REFRESH_TIMER`），关闭弹窗时清理。

---

## ⚙️ 改动规则

### 新增基金

遵循 `docs/ADDING-FUNDS.md`，核心三步：写骨架 → 跑脚本 → 验证。

### 修改脚本

1. 所有脚本**直接读写 `web/data/`**，不维护中间副本
2. 失败静默降级，不中断整条流水线
3. 限速：逐只调用时 `time.sleep(0.2~0.3)`
4. 输出文件用 `ensure_ascii=False, indent=2`

### 修改前端

1. 只改 `web/index.html`，不引入新文件
2. 新功能用函数封装，不污染全局
3. 动态数据拉取必须有降级方案（静态 JSON 兜底）
4. fundgz 有 5 分钟限频冷却，ETF 走腾讯不受影响

### 修改流水线

- 修改/新增脚本时，需同步更新 `.github/workflows/update-data.yml` 中的步骤
- 新增脚本要追加到 incremental 或 full 对应的步骤列表里
- 增量/完整 模式都要覆盖

---

## 🔧 关键技术决策

| 决策                            | 原因                                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| 单文件前端                      | 零构建部署到 GitHub Pages，简单可靠                                   |
| 三层数据                        | 解决 Actions 日频 vs 用户实时需求的矛盾（静态权威 + 兜底 + 实时刷新） |
| fundgz 限频保护                 | 被封 514 后设 5 分钟冷却，用户体验不中断                              |
| 份额归组                        | A/C/E/F 只是费率不同，持仓/走势完全一样                               |
| 纯静态部署                      | 无服务器成本，Public repo Actions 完全免费、无分钟限制                |
| 估值预计算 + 前端重算           | 预算结果进 JSON 保底；前端有实时行情时重算更准                        |
| 数据版本号（meta.generated_at） | 静态 JSON 缓存友好：数据没变命中缓存秒开，变了自动失效                |
| Tailwind 本地化                 | 避免 cdn.tailwindcss.com 国内白屏，离线也能用                         |

---

## 📋 分类规则速查

| category           | 适用                            | 场景                   |
| ------------------ | ------------------------------- | ---------------------- |
| `sp500`          | 跟踪标普 500 的场外指数基金     | 被动                   |
| `nasdaq_passive` | 跟踪纳指 100 的场外被动指数基金 | 被动                   |
| `active`         | 美股主动基金（白名单精选）      | 主动 → 有持仓 + 估值  |
| `global_other`   | 其他全球型 QDII                 | 主动 → 有持仓，无估值 |
| `etf`            | 场内跨境 ETF（513/159 等）      | 场内                   |

---

## 🚫 禁止事项

1. **不要在 `web/` 下创建新文件**（除 `web/data/` 下的 JSON、`tailwind.min.js`、`.nojekyll`）
2. **不要引入 npm / webpack / vite 等构建工具**
3. **不要修改已有 JSON 数据的手工字段**（脚本会覆盖）
4. **不要删除 `web/data/holdings/` 下的 JSON**（脚本只增不删）
5. **不要把 API Key 写进代码**（当前全部是公开接口，无需鉴权）
6. **不要改动 A 股红涨绿跌配色**
