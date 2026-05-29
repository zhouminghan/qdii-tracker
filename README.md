# US Fund Tracker · 美股基金追踪看板

一个专注于**美股 QDII 基金**的追踪看板。数据来自 AKShare + 天天基金 + 雪球公开接口，纯静态部署，零后端。

🌐 **在线看板**：<https://zhouminghan.github.io/qdii-tracker/>
📦 **源码仓库**：<https://github.com/zhouminghan/qdii-tracker>
⚙️ **自动更新**：[![Update Fund Data](https://github.com/zhouminghan/qdii-tracker/actions/workflows/update-data.yml/badge.svg)](https://github.com/zhouminghan/qdii-tracker/actions/workflows/update-data.yml)

![US Fund Tracker](https://img.shields.io/badge/status-running-success) ![Data](https://img.shields.io/badge/data-static-blue) ![Deploy](https://img.shields.io/badge/deploy-GitHub%20Pages-black) ![License](https://img.shields.io/badge/license-MIT-green)

> 🚀 **想快速用起来？** 直接跳到 [👉 部署方式](#-部署方式)：GitHub Pages 零服务器、零成本、自动更新。

---

## ✨ 核心功能

- **2 大 Tab**：🏦 场外基金 / 📈 场内 ETF
- **场外 5 分组**（Chips 筛选）：标普500 / 纳指100 / 美股主动（精选 19 只白名单）/ 全球指数（日经225等）/ 全球其他 QDII
- **场内 ETF 3 分组**（Chips 筛选）：标普500 / 纳指100 / 全球·其他 ETF（含日经225）
- **⭐ ETF 星标置顶**：重点关注的 ETF 排在分组最前面
- **📈 历史净值走势图**：每只基金可弹窗查看完整历史，支持 7 档区间（1月/3月/6月/今年来/1年/3年/全部）
- **A/C/E/F/I 份额对比**：同一只基金不同份额的费率结构一目了然，含综合费率 tooltip
- **列头排序**：规模 / 净值（按当日涨跌） / 近1月 / 今年来 / 近1年 / 成立来 / 申购状态 都可点击切换升降序
- **申购状态/日限额**：每只基金的限购金额、暂停状态一目了然
- **费率 Tooltip**：A 类显示综合费率（管理费+托管费），C 类额外显示销售服务费
- **纯静态**：页面加载 0 外部 API 请求，打开即看，离线可用（数据停留在最后更新时间）
- **展示指标**：规模 / 净值 / 日涨跌 / 近1月 / 今年来(YTD) / 近1年 / 成立来 / 基金经理 / 日限额 / 买卖费率

---

## 🏗️ 整体架构

```
┌────────────────────────────────────────────────────┐
│                   数据层（静态文件）                 │
│   web/data/                                        │
│   ├── sp500.json / nasdaq_passive.json             │
│   ├── active.json / global_index.json              │
│   ├── global_other.json / etf.json                 │
│   ├── holdings/{code}.json    # 主动基金 Top10 持仓 │
│   └── meta.json               # 扫描元信息          │
└──────────▲──────────────────────────┬──────────────┘
           │ 生成                     │ 读取（首屏）
┌──────────┴──────────────┐    ┌──────▼──────────────┐
│  数据流水线 (Python)     │    │  前端 (HTML/JS)      │
│  scripts/               │    │  web/index.html     │
│  ├── scan_funds.py      │    │                     │
│  ├── enrich_data.py     │    │  - 纯 Vanilla JS    │
│  ├── fill_missing.py    │    │  - Tailwind 本地化  │
│  ├── refresh_purchase.py│    │  - 0 外部 API 请求  │
│  └── fetch_holdings.py  │    │  - 走势图按需加载   │
└──────────▲──────────────┘    └─────────────────────┘
           │ 拉取
┌──────────┴──────────────────────────────────────────┐
│               公开数据源                              │
│  AKShare（基金列表 / 排行 / 累计收益走势 / ETF）      │
│  天天基金（pingzhongdata / F10 概况页 / 费率页）      │
│  雪球（基金基础信息 / 费率详情）                      │
└──────────────────────────────────────────────────────┘
```

> 🚀 **部署形态**：纯 GitHub Pages 静态托管，**无后端运行时、无数据库、无 Docker**。页面加载仅读取本地 JSON 文件。

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
│   ├── enrich_data.py            # [2] 补充规模/费率/基金经理/收益
│   ├── fill_missing.py           # [3] 补齐净值/YTD/历史收益
│   ├── refresh_purchase.py       # [4] 申购状态 + 日限额
│   ├── fetch_holdings.py         # [5] 抓主动基金 Top10 重仓
│   └── requirements.txt
│
├── web/                          # 前端（纯静态）
│   ├── index.html                # 单文件应用（~2400 行）
│   ├── tailwind.min.js           # 本地化 Tailwind（避免 CDN 白屏）
│   ├── .nojekyll                 # 禁用 GitHub Pages 的 Jekyll 解析
│   └── data/                     # 前端消费的 JSON（git 追踪）
│       ├── sp500.json            # 🏦 场外 · 标普500（7 系列）
│       ├── nasdaq_passive.json   # 🏦 场外 · 纳指100（17 系列）
│       ├── active.json           # 🏦 场外 · 美股主动精选（19 系列）
│       ├── global_index.json    # 🌍 场外 · 全球指数（手动维护，1 系列）
│       ├── global_other.json     # 🏦 场外 · 全球/其他 QDII（23 系列）
│       ├── etf.json              # 📈 场内 ETF（17 系列）
│       ├── meta.json             # 扫描元信息
│       └── holdings/{code}.json  # 主动基金 Top10 持仓
│
└── .github/workflows/
    ├── update-data.yml           # GitHub Actions 自动更新数据
    └── deploy-pages.yml          # 发布 web/ 到 GitHub Pages
```

---

## 🧪 数据流水线（5 步）

| 步骤 | 脚本 | 做什么 | 耗时 |
|---|---|---|---|
| ① | `scan_funds.py` | 扫描全量 QDII 基金，按规则分类，归组成系列 | ~30s |
| ② | `enrich_data.py` | 补规模/费率/基金经理/收益（逐只调雪球） | ~5min |
| ③ | `fill_missing.py` | 补净值/日涨跌/YTD/历史收益（天天基金） | ~2min |
| ④ | `refresh_purchase.py` | 补申购状态/日限额（批量接口） | ~30s |
| ⑤ | `fetch_holdings.py` | 抓主动基金 Top10 重仓 | ~2min |

> 📝 `global_index.json`（全球指数·日经225 等）**手动维护**，不参与 scan 自动扫描；其他 4 个补数据脚本（enrich/fill_missing/refresh_purchase/fetch_holdings）都覆盖该分类。

### 自动更新时间表

| 触发时机 | 模式 | 跑哪些步骤 | 耗时 |
|---|---|---|---|
| 🗓️ 工作日 05:00（北京，实际~07-09点执行） | 增量 | ③→④ | ~3min |
| 🗓️ 工作日 17:30 | 增量 | ③→④ | ~3min |
| 🗓️ 工作日 22:30 | 增量 | ③→④ | ~3min |
| 🗓️ 每月 2 日 02:00 | 完整 | ①→②→③→④→⑤ | ~12min |
| 🖱️ 手动 Run workflow | 可选 | 按你选 | 按模式 |

---

## 💻 本地开发

```bash
# 1. 装依赖
cd scripts
pip install -r requirements.txt

# 2. 跑一次完整流水线（首次，~10 分钟）
python3 scan_funds.py
python3 enrich_data.py
python3 fill_missing.py
python3 refresh_purchase.py
python3 fetch_holdings.py

# 3. 启动前端
cd ../web
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080/
```

**日常增量更新**（交易日 22:30 QDII 净值主力披露）：

```bash
cd scripts
python3 fill_missing.py        # 更新净值 + YTD + 收益
python3 refresh_purchase.py    # 申购状态
```

---

## 🚀 部署方式

**GitHub Pages + Actions 自动更新**：免费 / 零服务器 / 自动定时刷数据。

### 📋 首次配置步骤

1. **创建 Public 仓库** `qdii-tracker`
2. **推送代码** `git push -u origin main`
3. **Settings → Pages → Source** 选 `GitHub Actions`
4. **Settings → Actions → General → Workflow permissions** 选 `Read and write permissions`
5. **Actions → Update Fund Data → Run workflow** 手动跑一次验证
6. 访问 `https://{username}.github.io/qdii-tracker/`

### 日常使用

- 打开书签看网页即可
- 想立刻更新：Actions → Run workflow → 选 `incremental` → 等几分钟刷新

---

## 🔍 分类规则（scan_funds.py）

```
QDII 基金入口
├── FORCE_EXCLUDE_CODES 命中  → exclude
├── FORCE_INCLUDE_CODES 命中  → 指定分类
├── 不是 QDII                 → exclude
├── 名字命中 EXCLUDE_KEYWORDS → exclude
├── 场内代码（159/513/510）   → etf
├── 名字含"标普500"           → sp500
├── 名字含"纳斯达克100"        → nasdaq_passive
├── 名字含"美国/美股/全球/科技…"
│   ├── 命中 ACTIVE_WHITELIST → active（19 只精选）
│   └── 否则                  → global_other
└── 否则                      → exclude
```

> 📝 `global_index`（全球指数，如日经225）**不参与 scan 自动扫描**，需手动编辑 `web/data/global_index.json` 添加。

---

## ➕ 新增基金

**方式 A：白名单自动扫描（推荐 sp500 / nasdaq_passive / active / global_other / etf）**

1. 编辑 `scripts/scan_funds.py` 加白名单：
   - 按代码：`FORCE_INCLUDE_CODES = {"002891": "active"}`
   - 或按名字：`ACTIVE_WHITELIST_KEYWORDS = ["华夏移动互联"]`
2. 跑完整流水线：`scan_funds.py` → `enrich_data.py` → `fill_missing.py` → `refresh_purchase.py` → `fetch_holdings.py`
3. 本地验证 → commit

**方式 B：手动编辑 JSON（`global_index` 必须用这种）**

1. 用 `ak.fund_name_em()` 查同系列代码
2. 在 `web/data/{分类}.json` 的 `series` 末尾追加骨架（参考已有的 `global_index.json`）
3. 跑补数据脚本（enrich + fill_missing + refresh_purchase + fetch_holdings）

> ⚠️ `scan_funds.py` 会**覆盖** `web/data/*.json`，方式 A 跑完 scan 后必须接 enrich + fill_missing；方式 B 补数据脚本不会覆盖已有字段。

详细字段规范、踩坑列表、Bug 史 详见 [`CLAUDE.md`](./CLAUDE.md)。

---

## 🛠 常见问题

**Q: 数据不是今天的？**
A: QDII 净值 T+1 披露，今天看到的通常是前一交易日的净值。Actions 22:30 那轮覆盖绝大多数，凌晨补漏。

**Q: 某只基金数据不对/为空？**
A: 跑 `fill_missing.py` 补缺；还是空说明数据源本身没有（新基金，等披露）。

**Q: 想加/删基金？**
A: 编辑 `scripts/scan_funds.py` 的白/黑名单，重跑完整流水线。

---

## 📜 License

本项目基于 **[MIT License](./LICENSE)** 开源。
**数据免责**：本项目仅聚合公开数据做展示，不构成投资建议。基金有风险，投资需谨慎。
