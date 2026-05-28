# QDII Tracker — 项目规范

> 本文件是 AI 辅助开发时的全局上下文，定义架构、约定、数据流和改动规则。
> 任何 AI（Claude Code / Copilot 等）在修改本项目前必须先读此文件。

---

## 📐 项目定位

美股 QDII 基金追踪看板 —— **纯静态页面，页面加载 0 外部请求**。
数据由 Python 流水线（GitHub Actions）定时抓取，前端直接消费本地 `web/data/*.json`。
**仅自用场景**：仅 GitHub Pages 一种部署方式，无数据库、无 Docker、无任何长驻服务。

在线地址：https://zhouminghan.github.io/qdii-tracker/

---

## 🏗️ 架构总览

```
                    ┌─────────────────────┐
                    │   数据源（公开接口）   │
                    │  AKShare / 天天基金   │
                    │  雪球                 │
                    └─────────┬───────────┘
                              │ Python 脚本（定时）
                              ▼
┌──────────────────────────────────────────────────┐
│  scripts/                                        │
│  ① scan_funds.py     → web/data/{5个分类}.json   │
│  ② enrich_data.py    → 补规模/费率/经理/收益      │
│  ③ fill_missing.py   → 补净值/YTD/历史收益        │
│  ④ refresh_purchase.py → 补申购状态/限额          │
│  ⑤ fetch_holdings.py → web/data/holdings/*.json  │
└──────────────────────────────────────────────────┘
                              │ 静态 JSON
                              ▼
┌──────────────────────────────────────────────────┐
│  web/index.html  （单文件前端，~2400 行）          │
│  · Tailwind 本地化 + Vanilla JS                   │
│  · 页面加载仅读取本地 JSON，0 外部 API 请求        │
│  · 场外/场内双 Tab · 分组 Chips · 展开行 · Modal  │
│  · 走势图（点击时拉 pingzhongdata）               │
│  · 持仓详情（读本地 holdings JSON）               │
└──────────────────────────────────────────────────┘
```

### 纯静态策略

页面加载时**只读取本地 `web/data/*.json`**，不调任何外部 API。
唯一的动态请求：用户点击"走势图"时拉取 `pingzhongdata/{code}.js`。

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
│   └── requirements.txt       ← Python 依赖
│
└── web/
    ├── index.html             ← 单文件前端（HTML + CSS + JS 全内联）
    ├── tailwind.min.js         ← 本地化 Tailwind（避免 CDN 白屏，267KB）
    ├── .nojekyll               ← 禁用 GitHub Pages Jekyll 解析
    └── data/
        ├── sp500.json         ← 场外·标普500（7 系列）
        ├── nasdaq_passive.json← 场外·纳指100（17 系列）
        ├── active.json        ← 场外·美股主动精选（19 系列）
        ├── global_index.json  ← 场外·全球指数（手动维护，1 系列）
        ├── global_other.json  ← 场外·全球/其他QDII（20 系列）
        ├── etf.json           ← 场内ETF（17 系列）
        ├── meta.json          ← 扫描元信息
        └── holdings/          ← 主动基金持仓详情
            └── {code}.json
        ├── etf.json           ← 场内ETF
        ├── meta.json          ← 扫描元信息
        └── holdings/          ← 主动基金持仓详情
            └── {code}.json
```

---

## 🔀 数据流水线（5 步，顺序执行）

| 步骤 | 脚本                    | 输入                  | 输出             | 耗时   |
| ---- | ----------------------- | --------------------- | ---------------- | ------ |
| ①   | `scan_funds.py`       | AKShare 全量基金      | 6 个分类 JSON    | ~30s   |
| ②   | `enrich_data.py`      | 分类 JSON             | 补规模/费率/经理 | ~5min  |
| ③   | `fill_missing.py`     | 分类 JSON             | 补净值/费率/规则 | ~5min  |
| ④   | `refresh_purchase.py` | 分类 JSON             | 补申购状态/涨跌  | ~30s   |
| ⑤   | `fetch_holdings.py`   | active + global_other | holdings/*.json  | ~2min  |

**增量更新**（每工作日 08:30 / 17:30 / 22:30 北京时间）跑 ③→④（fill_missing → refresh_purchase）。
**完整流水线**（每月 2 日 02:00 北京时间）跑 ①→②→③→④→⑤。

注：QDII 净值 T+1 披露——T 日美股收盘后，基金公司于 T+1 日北京时间晚间陆续披露。22:30 那轮最关键。

### `fill_missing.py` 详细逻辑（增量核心）

| Pass | 数据源 | 补什么字段 | 策略 |
|------|--------|-----------|------|
| **Pass 1** | 天天基金 `pingzhongdata/{code}.js` | nav / nav_date / daily_change + chg_1m/3m/6m/1y | nav三件套**无条件覆盖**（防回退已在前置检查）；历史收益仅填漏 |
| **Pass 2** | 天天基金 F10 概况页 + 费率页 | scale / established / manager / mgmt_fee / custody_fee / sale_service_fee / first_buy_rate | 仅填漏（有值不覆盖） |
| **Pass 2b** | 天天基金费率页 HTML 表格解析 | buy_rules / sell_rules / free_hold_days | 仅在缺失时补（逐只抓取，~0.2s/只） |
| **Pass 3** | AKShare 累计收益率走势 | chg_ytd（今年来） | 仅填漏 |
| **写回** | — | 重算 series_scale | 防止补了 scale 后 series_scale 仍为 0 |

### `refresh_purchase.py` 详细逻辑

| 数据源 | 补什么字段 |
|--------|-----------|
| AKShare `fund_purchase_em()` 批量 | buy_status / sell_status / buy_min / daily_limit / fee |
| AKShare `fund_open_fund_rank_em()` 批量 | nav / nav_date / daily_change / chg_1w~3y / chg_ytd / **chg_since_inception** |

注：排行榜接口不覆盖所有基金（~19600只中约覆盖主流，LOF/FOF/发起式份额常缺失），缺 `chg_since_inception` 的前端显示"--"。

### 数据分类（6 个 JSON）

| 文件 | 说明 | 来源 |
|------|------|------|
| `sp500.json` | 标普500 被动指数 | scan 自动分类 |
| `nasdaq_passive.json` | 纳指100 被动指数 | scan 自动分类 |
| `active.json` | 美股主动（白名单精选 19 只） | scan 自动分类 |
| `global_index.json` | **全球指数基金**（手动维护） | 手动添加 |
| `global_other.json` | 全球/其他 QDII | scan 自动分类 |
| `etf.json` | 场内跨境 ETF | scan 自动分类 |

> `global_index` 不参与 `scan_funds.py` 自动扫描，需手动编辑 JSON 添加基金。其他 5 个脚本（enrich/fill_missing/refresh_purchase/fetch_holdings）都已覆盖该分类。

---

### ⚠️ 已知的数据覆盖限制

| 字段 | 限制 | 原因 |
|------|------|------|
| `chg_since_inception` | 排行榜不覆盖所有基金（LOF/FOF/发起式常缺） | AKShare `fund_open_fund_rank_em` 接口本身不全 |
| `buy_rules` / `sell_rules` | ~80% 覆盖率 | 天天基金费率页 HTML 结构不统一，暂停申购的基金常无数据 |
| 美元份额全面数据 | 常缺 nav/收益/规模 | pingzhongdata 和排行榜对美元份额覆盖差 |

---

### 🐛 历史 Bug 记录（防止回犯）

| Bug | 根因 | 修复 |
|-----|------|------|
| nav 值相同时 nav_date 不更新 | `ALWAYS_OVERWRITE` 的 `cur != new_val` 判断阻止了写入 | 改为无条件覆盖 |
| 接口没返回 nav_date 时 nav 被错误更新 | 缺前置检查，nav 可能被更新但 nav_date 保持旧值 | 新增 `skip_nav_fields` 逻辑 |
| fill_missing 补了 scale 但 series_scale 仍为 0 | scan 生成骨架时 scale=None→series_scale=0，后续补 scale 时没重算 | 写回前重算 series_scale |
| display_name 末尾残留"汇"/"钞" | `make_display_name` 去"美元"后"汇"字残留 | 加 `[汇钞]$` 清理 |
| scan 覆盖 enriched 数据 | scan 直接覆盖 JSON，丢失已有的净值/费率等 | 完整流水线中 scan 后必须接 enrich + fill_missing |
| rebase 时 `--ours` 取了远端数据 | rebase 中 ours/theirs 语义与 merge 相反 | 注意 rebase 方向 |

---

## 📊 数据源接口

| 数据源   | 接口                              | 用途                      | 调用方  |
| -------- | --------------------------------- | ------------------------- | ------- |
| AKShare  | `fund_name_em()`                | 全量基金列表              | 后端    |
| AKShare  | `fund_open_fund_rank_em()`      | 排行榜（净值/收益）       | 后端    |
| AKShare  | `fund_purchase_em()`            | 申购状态/日限额           | 后端    |
| AKShare  | `fund_portfolio_hold_em()`      | Top10 重仓                | 后端    |
| AKShare  | `fund_open_fund_info_em()`      | 累计收益率                | 后端    |
| AKShare  | `fund_etf_spot_em()`            | ETF 场内规模/价格         | 后端    |
| 天天基金 | `pingzhongdata/{code}.js`       | 净值曲线                  | 前端    |
| 天天基金 | `fundf10.eastmoney.com`         | F10 概况/费率页           | 后端    |
| 天天基金 | `api.fund.eastmoney.com/f10/lsjz` | 历史净值                | 后端    |
| 雪球     | `fund_individual_basic_info_xq` | 规模/费率/基金经理        | 后端    |

---

## 🎨 前端约定

### 单文件架构

- **所有 HTML / CSS / JS 都在 `web/index.html`**，不拆分文件
- CSS 用 Tailwind 本地化（`tailwind.min.js`）+ `<style>` 自定义
- JS 用 `<script>` 内联，不使用构建工具

### 配色（A 股口径）

- **红涨绿跌**：`.up { color: #dc2626; }` / `.down { color: #16a34a; }`

### 份额排序（全局统一）

币种（人民币 < 美元 < 其他）→ 份额类型（A < C < D < E < F < H < I < 默认 < LOF）

前端 `shareSort()` 函数保证子分类表格渲染时排序一致。
后端 `enrich_data.py` 的 `share_sort_key()` 保证 JSON 中排序一致。

### 规模显示规则

- **大分类外层行**：`series_scale` = A 类人民币份额的规模（同系列各份额共享底层资产，不加和）
- **子分类展开行**：各份额各自的 `scale_raw`
- **默认按规模倒序排列**

### 费率 Tooltip

- **A 类**：`综合费率 X%/年 = 管理费 + 托管费`
- **C 类**：`综合费率 X%/年 = 管理费 + 托管费 + 销售服务费 X%（按日从净值中扣取）`
- 买入费分档表 + 卖出规则表
- **弹窗方向**：向上弹出（`bottom: 100%`），避免被 footer 遮挡

### 费率条件格式规范

所有买入/卖出费率的 `condition` 字段必须统一为**符号格式**，不允许中文描述：

| 原始（中文/天数） | 规范格式 |
|------------------|----------|
| `小于7天` | `0天<持有期限<7天` |
| `大于等于7天，小于730天` | `7天<=持有期限<2年` |
| `大于等于365天` | `365天<=持有期限`（前端显示为 `≥1年`） |
| `小于50万元` | `0万<买入金额<50万` |
| `大于等于100万元` | `100万<=买入金额` |

**后端**：`fill_missing.py` 的 `normalize_condition()` 在 Pass 2b 抓取时统一格式。
**前端**：`cleanCondition()` 进一步简化显示：
- 去 `.0`（`7.0天` → `7天`）
- 天数转年（`365天` → `1年`、`730天` → `2年`、`1095天` → `3年`）
- 去"持有期限"/"买入金额"文字
- `0天<` / `0万<` 简化为 `<`
- 末尾 `<=` 简化为 `≥`

### 子分类展开行规范

展开后的份额表格：
- **不含"类别"列**（A/C/默认 已体现在份额名称中，无需单独一列）
- **列顺序**：代码 | 份额名称 | 币种 | 规模 | 净值(+日涨跌) | 近1年 | 申购 | 买入费 | 卖出规则
- **列宽**：自动适应（不用 `table-fixed`），浏览器根据内容紧凑排列
- **默认份额**：代码后标 ★（金色）
- **币种列**：用符号 `¥` / `$`，不用中文

### 申购状态显示规则

| 份额类型 | 显示逻辑 |
|----------|----------|
| 人民币 A/C/默认/LOF/FOF | 正常显示（暂停 / 限 ¥X / 开放申购） |
| 美元份额 | 统一显示 `—`（接口不返回美元限额） |
| E/F/I/D 类 | 统一显示 `—`（非主流代销份额） |

限额格式：`限 ¥1000` / `限 ¥10万`（用 `formatLimit` 转换大数字）

### 卖出规则展示

- 主展示列：`持X天免` / `持X年免`（`free_hold_days` 转年：≥365天显示年）
- Tooltip：完整分档表

### 综合费率规范

- A/默认类：`综合费率 = 管理费 + 托管费`（**不含销售服务费**）
- C/E/F/I/D 类：`综合费率 = 管理费 + 托管费 + 销售服务费`
- 数字去尾零：`1.00%` → `1%`，`0.80%` → `0.8%`
- **防误抓**：A/默认类的 `sale_service_fee > 0.05` 视为误抓，不写入

### nav_date 防回退

所有脚本写入 `nav_date` 时必须检查：新日期 < 已有日期 → 跳过写入。
防止 CDN 缓存 / 接口抽风返回旧数据覆盖已有新数据。

### 场外 vs 场内 ETF 表头差异

| 列 | 场外 | 场内 ETF |
|----|------|----------|
| 规模 | ✅ | ✅ |
| 净值/最新价 | ✅ 净值+日涨跌 | ✅ etf_price+etf_change_pct |
| 近1月/今年来/近1年 | ✅ | ✅ |
| 成立来 | ✅ | ❌（排行榜不覆盖 ETF） |
| 申购 | ✅ | ❌（场内无申购概念） |
| 类型（份额数） | ✅ | ❌（ETF 单份额） |
| 走势/持仓 | ✅ | ✅ |

### ETF 星标置顶

JSON 中 `series.starred = true` 的 ETF 在分组内排最前面（当前：513500 博时标普500、513100 国泰纳指）。

### ETF 价格日期

ETF 的 `nav_date` = `enrich_data.py` 抓取东财快照时的日期（非实时，同场外一样由 Action 定时更新）。
前端逻辑统一：行内 `nav_date < 表头最大日期` 时才显示灰色小字日期。

---

## ⚙️ 改动规则

### 新增基金

遵循 `docs/ADDING-FUNDS.md`，核心：加白名单 → 跑 scan → 跑 enrich → 跑 fill_missing。
或手动编辑 JSON 骨架 → 跑补数据脚本。

### 修改脚本

1. 所有脚本**直接读写 `web/data/`**，不维护中间副本
2. 失败静默降级，不中断整条流水线
3. 限速：逐只调用时 `time.sleep(0.2~0.3)`
4. 输出文件用 `ensure_ascii=False, indent=2`

### 修改前端

1. 只改 `web/index.html`，不引入新文件
2. 新功能用函数封装，不污染全局
3. 页面加载不调外部 API（走势图除外，用户点击时按需加载）

### 修改流水线

- 修改/新增脚本时，需同步更新 `.github/workflows/update-data.yml` 中的步骤
- 增量/完整 模式都要覆盖

---

## 🔧 关键技术决策

| 决策                  | 原因                                                        |
| --------------------- | ----------------------------------------------------------- |
| 纯静态页面            | 页面加载 0 外部请求，不受第三方接口限频/下线影响            |
| 单文件前端            | 零构建部署到 GitHub Pages，简单可靠                         |
| 份额归组              | A/C/E/F 只是费率不同，持仓/走势完全一样                     |
| series_scale 取 A 类  | 同系列各份额共享底层资产，加和是重复计算                    |
| 纯静态部署            | 无服务器成本，Public repo Actions 完全免费                  |
| Tailwind 本地化       | 避免 cdn.tailwindcss.com 国内白屏                           |
| nav_date 防回退       | 接口可能返回缓存旧数据，只允许日期前进                      |

---

## 📋 分类规则速查

| category           | 适用                            | 场景   | 来源 |
| ------------------ | ------------------------------- | ------ | ---- |
| `sp500`          | 跟踪标普 500 的场外指数基金     | 被动   | scan 自动 |
| `nasdaq_passive` | 跟踪纳指 100 的场外被动指数基金 | 被动   | scan 自动 |
| `active`         | 美股主动基金（白名单精选）      | 主动   | scan 自动 |
| `global_index`   | 全球指数基金（日经225等）       | 被动   | **手动维护** |
| `global_other`   | 其他全球型 QDII                 | 主动   | scan 自动 |
| `etf`            | 场内跨境 ETF（513/159 等）      | 场内   | scan 自动 |

---

## 🚫 禁止事项

1. **不要在 `web/` 下创建新文件**（除 `web/data/` 下的 JSON、`tailwind.min.js`、`.nojekyll`）
2. **不要引入 npm / webpack / vite 等构建工具**
3. **不要在前端加载时调用外部 API**（保持纯静态）
4. **不要删除 `web/data/holdings/` 下的 JSON**（脚本只增不删）
5. **不要把 API Key 写进代码**（当前全部是公开接口，无需鉴权）
6. **不要改动 A 股红涨绿跌配色**
7. **不要让 nav_date 回退**（写入前必须检查日期前进）
