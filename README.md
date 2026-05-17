# US Fund Tracker · 美股基金追踪看板

一个专注于**美股 QDII 基金**的追踪看板。数据来自 AKShare + 天天基金 + 雪球公开接口，纯静态部署，零后端。

🌐 **在线看板**：<https://zhouminghan.github.io/qdii-tracker/>
📦 **源码仓库**：<https://github.com/zhouminghan/qdii-tracker>
⚙️ **自动更新**：[![Update Fund Data](https://github.com/zhouminghan/qdii-tracker/actions/workflows/update-data.yml/badge.svg)](https://github.com/zhouminghan/qdii-tracker/actions/workflows/update-data.yml)

![US Fund Tracker](https://img.shields.io/badge/status-running-success) ![Data](https://img.shields.io/badge/data-static-blue) ![Deploy](https://img.shields.io/badge/deploy-GitHub%20Pages-black) ![License](https://img.shields.io/badge/license-MIT-green)

> 🚀 **想快速用起来？** 直接跳到 [👉 部署方式](#-部署方式)：GitHub Pages 零服务器、零成本、自动更新。仅自用场景，无需任何后端服务（无数据库、无 Docker）。

---

## ✨ 核心功能

- **2 大 Tab**：🏦 场外基金 / 📈 场内 ETF
- **场外 4 分组**（Chips 筛选）：标普500 / 纳指100 / 美股主动（精选 18 只白名单）/ 全球其他 QDII
- **场内 ETF 3 分组**（Chips 筛选）：标普500 / 纳指100 / 全球·其他 ETF（含美国50 等）
- **🟣 主动基金盘中估值**：基于最新一期 Top10 持仓 × 实时美股行情秒级重算，估值列显示如 `-0.37%`，跟随持仓股价变化
- **主动基金详情页**：Top10 重仓 + 当日涨跌 + 基金经理 + 业绩表现（近1月/今年来/近1年/...）+ 费率结构
- **📈 历史净值走势图**：每只基金可弹窗查看完整历史，支持 7 档区间（1月/3月/6月/今年来/1年/3年/全部），y 轴累计涨跌幅，鼠标 hover 显示日期/净值/日涨跌/区间累计；底部「加载全部历史净值」展开完整逐日列表
- **A/C/E/F/I 份额对比**：同一只基金不同份额的费率结构一目了然
- **列头排序**：规模 / 净值（按当日涨跌） / 近1月 / 今年来 / 近1年 / 成立来 / 申购状态 都可点击切换升降序
- **手动刷新按钮**：右上角一键重拉 `web/data/*.json` + 申购状态 + 估值 + 缺当日净值的基金兜底打 fundgz；交易日 15:00-22:30 每 15 分钟自动轮询
- **申购状态/日限额实时刷新**：每次打开页面 / 点刷新都重新拉 `fundmobapi.eastmoney.com`，无需等 Actions
- **持仓股票市场状态指示**：每只持仓股票按所属市场（A/HK/US）显示 ●（盘中实时）/ ○（已收盘）状态点，含**美股冬夏令时自动判定**
- **展示指标**：规模 / 净值 / 估值 / 日涨跌 / 近1月 / 今年来(YTD) / 近1年 / 成立来 / 基金经理 / 日限额 / 买卖费率 / 七姐妹含量

---

## 🏗️ 整体架构

```
┌────────────────────────────────────────────────────┐
│                   数据层（静态文件）                 │
│   web/data/                                        │
│   ├── sp500.json / nasdaq_passive.json             │
│   ├── active.json / global_other.json / etf.json   │
│   ├── holdings/{code}.json    # 主动基金 Top10 持仓 │
│   ├── us_stocks.json          # 持仓股票实时行情    │
│   ├── estimates.json          # 主动基金盘中估值    │
│   └── meta.json               # 扫描元信息+版本号   │
└──────────▲──────────────────────────┬──────────────┘
           │ 生成                     │ 读取（首屏）
┌──────────┴──────────────┐    ┌──────▼──────────────┐
│  数据流水线 (Python)     │    │  前端 (HTML/JS)      │
│  scripts/               │    │  web/index.html     │
│  ├── scan_funds.py      │    │                     │
│  ├── enrich_data.py     │    │  - 纯 Vanilla JS    │
│  ├── fill_missing.py    │◄───┼─ - Tailwind 本地化  │
│  ├── refresh_purchase.py│    │    (tailwind.min.js)│
│  ├── fetch_holdings.py  │    │  - JSONP 动态拉净值 ─┐
│  ├── fetch_stocks.py    │    │  - 腾讯 ETF 实时价 ─┤
│  └── calc_estimate.py   │    │  - 申购状态实时刷新 ─┤
└──────────▲──────────────┘    └─────────────────────┘
           │ 拉取                           动态刷新 │
┌──────────┴──────────────────────────────────────┬──┘
│               公开数据源                          │
│  AKShare（基金列表 / 排行 / 累计收益走势）        │
│  天天基金（pingzhongdata.js / F10 概况页）        │
│  雪球（美股实时行情 / 基金基础信息）             │
│  ★ fundgz.1234567.com.cn（前端 JSONP 拉最新净值）│
│  ★ fundmobapi.eastmoney.com（前端拉申购状态）    │
│  ★ qt.gtimg.cn（前端批量拉 ETF 最新价）          │
└──────────────────────────────────────────────────┘
```

> 🚀 **部署形态**：纯 GitHub Pages 静态托管，**无后端运行时、无数据库、无 Docker**。Tailwind 本地打包（`web/tailwind.min.js`），不依赖任何外部 CDN，国内访问无白屏。

**三层数据策略**：
- 🔵 **静态层（权威）**：GitHub Actions 工作日 **08:30 / 17:30 / 22:30** 三时段 + 每月 1 日全量，产出 `web/data/*.json` 快照（commit 回仓库）
- 🟢 **前端兜底**：打开页面时，对"仓库 nav_date 还不是今天"的基金兜底拉 fundgz；ETF 行情打开即拉腾讯
- 🟣 **前端实时刷新**：申购状态 / 日限额 / 主动基金估值，每次刷新页面/点手动刷新都重算（直连天天基金移动端 API）

### ⚡ 数据更新方式：**Actions 主力 + 前端智能兜底 + 前端实时刷新**

- **静态部分**：Actions 三时段定时跑 → 权威数据源，所有基金规模/净值/持仓都以此为准
- **动态部分**：前端**仅在"仓库数据落后于今日"时**调 fundgz/腾讯兜底，**打开即见最新**
- **实时部分**：申购状态 / 日限额 / 估值由前端每次直连接口刷新，无需等 Actions

| 数据类型 | 刷新方式 | 新鲜度 |
|---|---|---|
| 场外基金**最新净值 + 日期** | 🔵 Actions 22:30 写入 data.json；🟢 前端缺当日时兜底拉 `fundgz.1234567.com.cn` | 22:30 后是当日最新；盘后 15-22:30 之间前端自动补拉 |
| 场内 ETF **最新价 + 涨跌** | 🟢 前端动态拉 `qt.gtimg.cn` | 打开即最新（盘中 T+0 实时） |
| 持仓股票**当日涨跌** | 🟢 前端动态拉 `qt.gtimg.cn`（点击「📊 持仓」时） | 按各市场（A/HK/US）盘时自动判定盘中/收盘 |
| 历史净值走势（图表） | 🟢 前端动态拉 `pingzhongdata.js`（点击「📈 走势」时） | 实时拉取，覆盖基金成立至今全量 |
| **申购状态 / 日限额** | 🟣 前端实时拉 `fundmobapi.eastmoney.com`（每次刷新页面） | 几乎实时（API 是分钟级） |
| **主动基金估值（盘中）** | 🟣 前端用最新持仓行情重算 + Actions calc_estimate.py 兜底 | 盘中跟随持仓股价秒变 |
| 基金规模、基金经理、费率 | 🔵 Actions 脚本 | 每月 1 日完整更新 |
| 历史收益（近1月/YTD/1年/成立来） | 🔵 Actions 脚本 | 每个工作日 22:30 |
| 持仓（Top10 重仓） | 🔵 Actions 脚本 | 每月 1 日完整更新（季报周期披露） |

**刷新窗口**（前端兜底逻辑）：
- 交易日 15:00-22:30：**每 15 分钟**自动轮询一次，只对"仓库里还不是今日净值"的基金调 fundgz
- 22:30 之后：Actions 已跑 → 仓库就是最新 → 前端兜底队列自动为空，不再打 fundgz
- 非交易日 / 交易日 15:00 前：不轮询（没新数据）

> 这个时间表 GitHub Actions 已经配好（见 `.github/workflows/update-data.yml`），不用手动维护。

---

## 📂 目录结构

```
qdii-tracker/
├── README.md
├── CLAUDE.md                     # AI 协作上下文
├── .gitignore
│
├── scripts/                      # 数据流水线（Python）
│   ├── scan_funds.py             # [1] 扫描全量基金、分类
│   ├── enrich_data.py            # [2] 补充规模/费率/基金经理
│   ├── fill_missing.py           # [3] 补齐漏掉的净值/YTD/历史收益
│   ├── refresh_purchase.py       # [4] 申购状态 + 日限额（也可前端实时拉）
│   ├── fetch_holdings.py         # [5] 抓主动基金 Top10 重仓
│   ├── fetch_stocks.py           # [6] 抓持仓股票实时行情
│   ├── calc_estimate.py          # [7] 主动基金盘中估值（持仓 × 行情）
│   └── requirements.txt
│
├── web/                          # 前端（纯静态）
│   ├── index.html                # 单文件应用
│   ├── tailwind.min.js           # 本地化 Tailwind（避免 CDN 白屏）
│   ├── .nojekyll                 # 禁用 GitHub Pages 的 Jekyll 解析
│   └── data/                     # 前端消费的 JSON（git 追踪，也是脚本写入目标）
│       ├── sp500.json            # 🏦 场外 · 标普500
│       ├── nasdaq_passive.json   # 🏦 场外 · 纳指100
│       ├── active.json           # 🏦 场外 · 美股主动精选（白名单）
│       ├── global_other.json     # 🏦 场外 · 全球/其他 QDII
│       ├── etf.json              # 📈 场内 ETF
│       ├── us_stocks.json        # 持仓股票实时行情
│       ├── estimates.json        # 主动基金盘中估值
│       ├── meta.json             # 扫描元信息 + 数据版本号（generated_at）
│       └── holdings/{code}.json  # 主动基金 Top10 持仓
│
├── docs/                         # 运维 SOP 文档
│   └── ADDING-FUNDS.md           # 新增基金操作手册
│
└── .github/workflows/
    ├── update-data.yml           # GitHub Actions 自动更新数据（多时段 + 月初全量）
    └── deploy-pages.yml          # 发布 web/ 到 GitHub Pages
```

---

## 🧪 数据流水线原理

### [1] `scan_funds.py` — 扫描 + 分类

**输入**：AKShare `fund_name_em()` 返回的全量基金名称表（26000+ 只）

**做什么**：
1. 先判断是否 QDII（`QDII` 在基金类型里、或名字含 `(QDII`）
2. 按 **EXCLUDE_KEYWORDS** 过滤（债 / 港股 / 医疗 / 中概 / 等）
3. 按代码前缀判断场内 ETF（`159xxx / 513xxx / 510xxx`）
4. 按关键词匹配分类：
   - `标普500` → sp500
   - `纳斯达克100 / 纳指100` → nasdaq_passive
   - 其他含 `美国 / 美股 / 全球 / 海外 / 科技`：
     - 命中 **ACTIVE_WHITELIST_KEYWORDS**（18 个精选关键词）→ `active`
     - 否则 → `global_other`
5. **手动白/黑名单兜底**：`FORCE_INCLUDE_CODES` / `FORCE_EXCLUDE_CODES`（应对规则误伤的个案）
6. 按"基金公司 + 产品名"归组成"系列"（A/C/E/F 份额自动合并）

**输出**：`web/data/sp500.json` / `nasdaq_passive.json` / `active.json` / `global_other.json` / `etf.json`（框架，字段不全）

**耗时**：~30 秒（主要是 AKShare 初次抓 ETF 实时价）

---

### [2] `enrich_data.py` — 补基础信息

**输入**：上一步生成的 5 个分类 JSON

**做什么**：
1. 批量拉 `fund_em_open_fund_rank` → 获取净值、近 1 月/1 年/今年来/成立来收益
2. 批量拉 `fund_purchase_em` → 获取申购状态、日限额
3. 每只基金单独调雪球 API → 规模、基金经理、成立日、**费率详情**（A 类申购费分档、C 类销售服务费、免赎回费天数等）
4. 排序 + 计算默认份额（A 类优先，同级按规模）

**输出**：覆盖上一步的 5 个 JSON，字段填充完整

**耗时**：~5 分钟（每只基金 1 次雪球调用，150+ 只，0.2s 限速）

---

### [3] `fill_missing.py` — 补遗漏字段（3 Pass）

排行榜接口对新发基金/小众基金常有缺字段，这个脚本做三阶段补全：

| Pass | 数据源 | 补哪些字段 |
|---|---|---|
| **Pass 1** | 天天基金 `pingzhongdata.js` | **每日强制覆盖** nav / nav_date / daily_change（场外）；仅填漏 近1月/3月/6月/1年 |
| **Pass 2** | 天天基金 `F10` 概况页 HTML | 规模、成立日期、基金经理 |
| **Pass 3** | AKShare `累计收益率走势` | **今年来 YTD**（按复利公式算：`(1+last)/(1+year_start) - 1`） |

**Pass 1 设计要点**（修复了之前一个 bug）：
- 场外 QDII：**每天无条件加入 targets**，不再依赖"字段缺失"判定 —— 否则首次跑完后 nav 被锁死，新交易日再跑也不会覆盖
- nav/nav_date/daily_change 改为**强制覆盖**（仅这 3 个日频字段），其他历史收益保持"仅填漏"避免异常数据污染
- 场内 ETF：净值字段跳过（前端用 `etf_price`），只补历史收益

**关键数据共享**：三个 Pass 共享**同一组内存 dict**（避免多次磁盘读写导致覆盖）

**统一目录策略（2026-05-08 重构）**：所有脚本直接读写 `web/data/`，不再维护 `data/` 中间副本。
消除了过去"data/ 里的上游简化快照覆盖 web/data/ 完整版"的 bug。

**耗时**：~1-2 分钟

---

### [4] `refresh_purchase.py` — 申购状态 + 日限额

**输入**：5 个分类 JSON 中的所有场外基金代码

**做什么**：批量调天天基金移动端 API（`fundmobapi.eastmoney.com`），更新 `buy_status` / `sell_status` / `daily_limit` 字段。

> 💡 **前端也直接调同一个 API**：每次刷新页面、点手动刷新都会拉一次最新申购状态。所以这个脚本其实是"兜底快照"，让首屏加载就能看到正确的申购状态，而不用等前端 API 回包。

**耗时**：~30 秒

---

### [5] `fetch_holdings.py` — 主动基金持仓

**输入**：`active.json` + `global_other.json` 的默认份额代码

**做什么**：调 AKShare `fund_portfolio_hold_em` 抓每只基金最新一期的 Top10 重仓股

**输出**：`web/data/holdings/{code}.json`，格式：
```json
{
  "fund_code": "161128",
  "latest_quarter": "2025Q4",
  "holdings_count": 10,
  "total_weight": 48.5,
  "heavy_count": 3,
  "holdings": [
    {"rank": 1, "stock_code": "AAPL", "stock_name": "苹果", "weight": 9.5, "market_value": 31500}
  ]
}
```

**输出**：`web/data/holdings/{code}.json`

**耗时**：~3 分钟（40 只 × 0.3s 限速）

---

### [6] `fetch_stocks.py` — 持仓股票实时行情

**输入**：所有持仓 JSON 去重后的股票代码

**做什么**：
- 美股：AKShare `stock_us_spot_em`（分页拉全量，然后索引）
- 港股、A 股：`stock_individual_spot_xq`（雪球接口，逐只调）
- 输出 `{stock_code: {change_pct, market, price, ...}}`

**输出**：`web/data/us_stocks.json`（前端加载时用作"持仓当日涨跌"的红绿标色 + 主动基金估值的输入）

---

### [7] `calc_estimate.py` — 主动基金盘中估值

**输入**：`active.json` + `global_other.json` 的默认份额代码 + `holdings/{code}.json` + `us_stocks.json`

**做什么**：对每只主动基金，把 Top10 持仓的"个股当日涨跌 × 持仓权重"加权汇总，估算当日基金涨跌幅。

**输出**：`web/data/estimates.json`，前端读取后展示在估值列。

> 💡 **前端也会用最新行情重算一次**：打开页面/点手动刷新时，前端会用刚拉到的最新美股行情把估值再算一遍，比 Actions 写死的快照更新鲜。这个脚本是"首屏兜底"。

**耗时**：~10 秒

---

## 💻 本地开发（改代码 / 调试）

如果只是**想在本地跑跑试试**、改改前端代码调试，最简单：

```bash
# 1. 装依赖
cd scripts
pip install -r requirements.txt

# 2. 跑一次数据流水线（首次，~10 分钟）
python scan_funds.py
python enrich_data.py
python fill_missing.py
python refresh_purchase.py
python fetch_holdings.py
python fetch_stocks.py
python calc_estimate.py

# 3. 启动前端
cd ../web
python3 -m http.server 8765
# 浏览器打开 http://localhost:8765/
```

**日常增量更新**（交易日 22:30 后 QDII 净值才稳定披露）：

```bash
cd scripts
python fill_missing.py        # 更新净值 + YTD + 收益（~2 分钟）
python refresh_purchase.py    # 申购状态（~30 秒）
python fetch_stocks.py        # 更新股价（~1 分钟）
python calc_estimate.py       # 重算估值（~10 秒）
```

> 💡 真正的长期使用请看下面的**部署方式**——让 Actions 自动跑，人不用管。

---

## 🚀 部署方式

**GitHub Pages + Actions 自动更新**：免费 / 零服务器 / 自动定时刷数据。仅自用场景下没有比这更省心的方案。

---

## 🌐 GitHub Pages + Actions 自动更新

**适合**：没有服务器、希望全部免费、完全不碰命令行日常维护。

### 你将得到什么

- 一个公网可访问的网址：`https://zhouminghan.github.io/qdii-tracker/`
- **工作日三时段自动更新数据**（08:30 / 17:30 / 22:30 北京时间，覆盖早中晚，22:30 是 QDII 披露的关键窗口）
- **每月 2 日凌晨自动跑完整流水线**（更新持仓、规模、费率等慢数据）
- **想立刻更新** → GitHub 网页上点一个按钮就触发
- 配置完之后 **完全不用再碰命令行**，日常在浏览器里用即可

### 📋 首次配置步骤（一次性搞定）

#### 步骤 1 · 注册 GitHub 账号

没有就去 <https://github.com/signup> 注册，邮箱验证即可。

#### 步骤 2 · 创建仓库

1. 登录 GitHub → 右上角 "+" → **New repository**
2. 填写：
   - **Repository name**：`qdii-tracker`
   - 选择 **Public**（必须公开，私有仓库的 Pages 要付费）
   - ❌ 不勾 `Add a README file`（本地已经有了）
3. 点 **Create repository**

#### 步骤 3 · 把本地代码推到 GitHub

如果你没用过 Git，强烈建议装 [GitHub Desktop](https://desktop.github.com/)，图形化操作最简单。

**命令行版**（项目根目录 `qdii-tracker/` 打开终端）：

```bash
# 配一次身份（以后 commit 用）
git config --global user.name "你的名字"
git config --global user.email "你的邮箱@xx.com"

# 关联远程仓库（把 zhouminghan 换成你的 GitHub 用户名）
git remote add origin https://github.com/zhouminghan/qdii-tracker.git

# 推送
git push -u origin main
```

推送过程中会弹出登录窗口，用浏览器授权一下即可。

#### 步骤 4 · 启用 GitHub Pages

> ⚠️ **注意**：GitHub Pages 的 "Deploy from a branch" 模式**不支持选择 `/web` 子目录**（只有 `/ (root)` 和 `/docs` 两个选项）。本项目用的是 **GitHub Actions 部署**方式，能发布任意目录。

1. 打开仓库页面（`https://github.com/zhouminghan/qdii-tracker`）
2. 顶部 **Settings** → 左侧 **Pages**
3. **Source** 下拉选 → **`GitHub Actions`** ⚠️（不是 "Deploy from a branch"）
4. 不需要填其他内容，**关闭设置页面即可**

> 这步本质上是告诉 GitHub "我要用自己的 Actions workflow 部署 Pages"。项目里已经写好了 `.github/workflows/deploy-pages.yml`，只要 push 到 main 且 `web/` 有变动就会自动发布。

首次触发：
- 选项一（推荐）：到 **Actions** 标签 → 左侧选 **🌐 Deploy GitHub Pages** → 右边 **Run workflow** 手动跑一次
- 选项二：等下次 `web/` 下任何文件有变动 push 上来时自动触发

部署成功后在 **Settings → Pages** 顶部会看到：
```
✅ Your site is live at https://zhouminghan.github.io/qdii-tracker/
```

#### 步骤 5 · 授予 Actions 写权限（关键！）

**这步不做，自动更新会失败**（Actions 跑完发现没权限推回代码）。

1. **Settings** → 左侧 **Actions** → **General**
2. 滚到最底部 **Workflow permissions**
3. 选 ✅ **Read and write permissions**
4. 勾选 ✅ **Allow GitHub Actions to create and approve pull requests**
5. 点 **Save**

#### 步骤 6 · 手动触发一次验证

1. 仓库顶部 **Actions** 标签
2. 左侧选 **🔄 Update Fund Data**
3. 右边点 **Run workflow** 下拉按钮 → 选择 `incremental` → **Run workflow**
4. 等 3~5 分钟。看到绿色 ✅ 就表示成功了

点进跑完的这次任务可以看到每一步的日志。

#### 步骤 7 · 打开看板

访问 `https://zhouminghan.github.io/qdii-tracker/`，数据应该已经是最新的。

**完成！此后你什么都不用做**，它会自己更新。

---

### 🎯 GitHub Pages 方案的日常使用

只做两件事：

1. **打开书签看**：`https://zhouminghan.github.io/qdii-tracker/`
2. **想立刻更新数据**：
   - 进仓库 → **Actions** → **Update Fund Data** → **Run workflow** → 选 `incremental` → 等几分钟刷新网页

**手机 / iPad / 朋友也能看**：把网址发出去即可。

### ⏰ 自动更新的时间表

workflow 文件已写好（`.github/workflows/update-data.yml`），开箱即用。已配置 `concurrency: update-data` 防并发，避免手动 full 跑和定时增量同时操作 `web/data/` 导致 push 冲突。

| 触发时机 | 模式 | 做什么 | 耗时 |
|---|---|---|---|
| 🗓️ **工作日 08:30**（北京时间） | 增量 | 早间补拉昨晚遗漏的净值 + 早披露的 QDII | ~3 分钟 |
| 🗓️ **工作日 17:30** | 增量 | 午后 A 股收盘后再补一轮 | ~3 分钟 |
| 🗓️ **工作日 22:30** | 增量 | 晚间最关键一轮（绝大多数 QDII 已披露） | ~3 分钟 |
| 🗓️ **每月 2 日 02:00** | 完整 | 额外更新：基金列表、持仓、费率、规模 | ~15 分钟 |
| 🖱️ 手动点 Run workflow | 可选 | 按你选 | 按模式 |

需要改时间？修改 yaml 里的 `cron` 表达式即可（<https://crontab.guru/> 可视化生成）。

### 📝 改了本地代码之后

```bash
git add -A
git commit -m "feat: 新增 xxx 基金"
git push
```

- **改的是前端（index.html）**：Pages 自动重新部署，1~2 分钟后网页更新
- **改的是 Python 脚本**：下次 Actions 自动跑时就用新代码了；想立刻生效就手动 Run workflow

---

## 📱 移动端访问（手机/iPad）

Web 版**已经是响应式设计**，手机浏览器打开网址就能看。两种更好的体验：

### 方式 1：Safari / Chrome 添加到桌面（推荐）

iOS Safari：打开网址 → 底部分享按钮 → **添加到主屏幕**
Android Chrome：打开网址 → 右上角菜单 → **添加到主屏幕**

效果：桌面多一个图标，点开像 App 一样（全屏、无地址栏）。本质是 **PWA（渐进式 Web 应用）**。

### 方式 2：浏览器书签 + 省流量

看板体积不到 500 KB（HTML + JSON 总和），书签就够用。

---

## 🔭 将来想做更多？

如果这个工具你用顺了，将来能扩展的方向：

- ~~**加历史净值图**：完整历史 + 区间筛选（1月/3月/...）+ hover 详情~~ ✅ 已做
- ~~**加列头排序**：规模 / 涨跌 / 收益 / 申购状态~~ ✅ 已做
- ~~**加持仓股票市场状态指示**：含美股冬夏令时~~ ✅ 已做
- **历史归档**：在 `web/data/history/{yyyymm}/` 存按月快照，纯静态实现"时间轴对比"（仍不引入数据库，保持零成本）
- **加策略回测**：给每只基金算年化、夏普比率、最大回撤
- **加提醒**：通过 Server 酱 / Telegram Bot 推送"某基金今日跌超 3%"
- **加对比**：两只基金叠加曲线对比
- **加七姐妹浓度打分**：现在只识别"有没有"，可以做加权评分
- **做成公众号菜单**：公众号的 H5 链接不受小程序的域名限制，可以直接跳 Web 版（这是比小程序靠谱的"微信生态"方案）

> 设计原则：**不引入数据库、不引入后端服务**。所有功能都通过 Actions 生成静态 JSON + 前端按需加载实现。

这些不急，现在这版先稳定用半年再说。

---

## 🔑 数据源详解

| 来源 | URL / 接口 | 提供什么 | 稳定性 | 谁用 |
|---|---|---|---|---|
| **AKShare** | `ak.fund_name_em()` | 全量基金列表 | ⭐⭐⭐⭐⭐ | 后端脚本 |
| AKShare | `ak.fund_em_open_fund_rank()` | 排行榜数据（净值、各期收益、今年来、成立来） | ⭐⭐⭐⭐ | 后端脚本 |
| AKShare | `ak.fund_purchase_em()` | 申购状态、日限额（兜底，主用前端 API） | ⭐⭐⭐⭐ | 后端脚本 |
| AKShare | `ak.fund_portfolio_hold_em()` | Top10 重仓 | ⭐⭐⭐⭐ | 后端脚本 |
| AKShare | `ak.fund_open_fund_info_em(indicator='累计收益率走势')` | 成立日起每日累计收益（用来算 YTD） | ⭐⭐⭐⭐ | 后端脚本 |
| AKShare | `ak.fund_etf_spot_em()` | 场内 ETF 实时价（快照） | ⭐⭐⭐⭐⭐ | 后端脚本 |
| AKShare | `ak.stock_us_spot_em()` | 美股实时行情（大批量，估值计算输入） | ⭐⭐⭐⭐ | 后端脚本 |
| **天天基金** | `pingzhongdata/{code}.js` | 净值曲线、近期收益、资产配置 | ⭐⭐⭐⭐ | 后端脚本 + **前端走势图** |
| 天天基金 | `fundf10.eastmoney.com/jbgk_{code}.html` | 规模、成立日、基金经理 | ⭐⭐⭐ | 后端脚本 |
| 天天基金 | `fundgz.1234567.com.cn/js/{code}.js` | 最新真实净值 / 日期 | ⭐⭐⭐⭐⭐ | **前端兜底**（仅在仓库缺当日净值时拉，15 分钟轮询） |
| 天天基金 | `fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo` | 申购状态 / 日限额（移动端 JSONP） | ⭐⭐⭐⭐ | **前端实时**（每次刷新页面拉一次） + 后端脚本 |
| **雪球** | 基金页 HTML | 规模、管理费、费率详情 | ⭐⭐⭐ | 后端脚本 |
| 雪球 | `stock_individual_spot_xq` | 港股 / A 股实时 | ⭐⭐⭐ | 后端脚本 |
| **腾讯财经** | `qt.gtimg.cn/q=sh510300,sz159941,...` | ETF 最新价 / 涨跌 / 交易日 | ⭐⭐⭐⭐⭐ | **前端动态**（批量） |
| 腾讯财经 | `qt.gtimg.cn/q=usAAPL,hk00700,...` | 美股/港股/A 股持仓行情 | ⭐⭐⭐⭐⭐ | **前端动态**（点击「📊 持仓」时拉） |

> ⚠️ **限频注意**：天天基金对高频请求有 IP 级限频（403 / 返回空）。脚本里统一设 `time.sleep(0.15~0.3)` 限速。前端 fundgz 兜底已经做了"仅缺当日净值才拉"的过滤，正常使用不会触发限频。

> 🔒 **前端依赖说明**：Tailwind CSS 已本地化到 `web/tailwind.min.js`（267KB），不依赖任何外部 CDN。整个看板首屏只读取自己仓库的资源，国内访问无白屏。

---

## 🔍 分类规则（scan_funds.py）

```
QDII 基金入口
├── FORCE_EXCLUDE_CODES 命中  → exclude          # 黑名单（持仓跑偏的个案）
├── FORCE_INCLUDE_CODES 命中  → 指定分类           # 白名单（规则误伤的精品）
├── 不是 QDII                 → exclude
├── 名字命中 EXCLUDE_KEYWORDS → exclude          # 债 / 港股 / 医疗 / 中概 …
├── 场内代码（159/513/510）   → etf
├── 名字含"标普500"           → sp500
├── 名字含"纳斯达克100"        → nasdaq_passive
├── 名字含"美国/美股/全球/科技…"
│   ├── 命中 ACTIVE_WHITELIST → active           # 精选 18 只美股主动
│   └── 否则                  → global_other     # 其他全球型 QDII
└── 否则                      → exclude
```

具体关键词和代码清单见 `scripts/scan_funds.py` 顶部常量区。

---

## ➕ 运维手册（新增基金 / 数据修复）

- **[新增基金操作手册 → docs/ADDING-FUNDS.md](docs/ADDING-FUNDS.md)**
  手工加一只/一个系列基金到看板，包含：查同系列份额的方法、骨架字段模板、补字段脚本的作用和顺序、本地验证清单、常见坑速查表。
  - **最短路径**：编辑 `web/data/{分类}.json` 追加 series → 依次跑 `enrich_data.py` → `fill_missing.py` → `refresh_purchase.py` → `fetch_holdings.py`（仅主动）→ `calc_estimate.py`（仅主动）→ commit。

> 📂 所有运维类 SOP 统一沉淀在 `docs/` 目录下，方便人/AI 照着做。

---

## 🛠 常见问题

**Q: 前端看到数据和基金 APP 不一致？**
A: 分三类看：
- **净值 / ETF 最新价**：先看 footer 提示
  - 🟢 "数据已刷新于 xx:xx" → 仓库 + 兜底都正常
  - 🟢 "仓库数据已是最新" → Actions 已跑完，data.json 就是当日权威值
  - ⏸ "天天基金接口暂时限频" → fundgz 短时封 IP（5 分钟自动恢复，不影响仓库数据展示）
- **估值列**：盘中跟随持仓股价秒变；非美股交易时段显示最近一次 calc_estimate.py 的快照
- **规模 / 费率 / 历史收益 / 持仓等**：脚本快照，看 `web/data/meta.json` 的 `generated_at` / `enriched_at` 确认数据时间

**Q: 浏览器里看到的数据老不更新？是不是有缓存？**
A: 不会。前端每次刷新都会先拉一次 `meta.json`（`?t=Date.now()` 强破缓存），然后用其中的 `generated_at` 当所有数据 JSON 的版本号 query（`?v=xxx`）。**只要 Actions 推了新数据，meta.generated_at 一变，所有 JSON 的 query 串就跟着变，浏览器/Pages CDN 自动失效。** 数据没变时反而能命中缓存，秒开。

**Q: 为什么 QDII 子分类净值不是今天的？**
A: 这是 QDII 客观规则不是 bug：
- **国内基金**：T+1 披露，今天 9~10 点能看到昨天净值
- **QDII 基金**：因跨境结算，T+1 ~ T+2 披露，今早看到的常常是**前一交易日**的净值
- 实测：5-7 早上 9 点，纯 A 股基金已披露 5-6 净值，但 QDII 仍是 5-4（因为节假日 + T+1）—— **数据源就是这样，前端做不了更多**
- 解决方案：
  - **盘后 15:00-22:30**：前端每 15 分钟自动调 fundgz 兜底，基金公司一披露就同步上来
  - **22:30 之后**：Actions 跑完，仓库 data.json 就是当日最新值
  - **次日早上**：刷页面即可，仓库已是昨日终值

**Q: 走势图为什么 y 轴是百分比不是净值？**
A: 不同基金净值绝对值差距很大（有的 0.6 有的 6.0），y 轴用净值多档对比无意义。用「区间累计涨跌幅」（以所选区间起点为 0% 基准），多档放在一起也能直观比较。

**Q: 持仓股票的「●/○」是什么意思？**
A: 该股票所属市场（A/HK/US）当前是否盘中：
- 🟢 绿点 = 盘中实时（涨跌跟着腾讯行情秒变）
- ⚪ 灰点 = 已收盘 / 休市（显示最近成交价）
- 美股冬夏令时（DST）由系统时区库 `Intl.DateTimeFormat('America/New_York')` 自动处理

**Q: 能做到 100% 实时吗（每秒刷新）？**
A: 基金不像股票有秒级盘口。`fundgz` 是按分钟粒度的盘中估值 / 收盘后真实净值，ETF 腾讯行情是 T+0 但个人开发者没必要秒级轮询。当前方案（"打开即见仓库 + 盘后兜底每 15 分钟 + 手动刷新按钮"）已经覆盖 99% 使用场景。

**Q: 某只基金数据不对？**
A: 依次检查：
1. `web/data/{cat}.json` 里的字段是不是 null
2. 跑 `python scripts/fill_missing.py`（会针对性补缺）
3. 还是 null 说明数据源本身没有（通常是新基金，等 Q 报披露）

**Q: 想加/删基金怎么办？**
A: 编辑 `scripts/scan_funds.py` 的 3 个字典：
- `EXCLUDE_KEYWORDS`：批量排除（关键词）
- `FORCE_EXCLUDE_CODES`：精准排除（代码）
- `FORCE_INCLUDE_CODES`：精准保留
- `ACTIVE_WHITELIST_KEYWORDS`：进入"精选美股主动"白名单

改完重跑完整流水线。

---

## 📜 License

本项目基于 **[MIT License](./LICENSE)** 开源。

简而言之：
- ✅ 你可以自由使用、修改、分发，甚至用于商业用途
- ✅ 可以闭源二次开发
- ⚠️ 必须保留原作者版权声明（LICENSE 文件）
- ⚠️ 作者不承担任何责任（基金投资自负盈亏）

**数据免责**：本项目仅聚合公开数据做展示，不构成投资建议。基金有风险，投资需谨慎。
