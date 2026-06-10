# QDII Tracker — AI 操作手册

> 修改本项目前必读。仅记录约束与决策，不解释常识。

---

## 项目定位

美股 QDII 基金追踪看板。**纯静态前端 + Python 流水线**，部署在 GitHub Pages。
前端页面加载**0 外部请求**，只读 `web/data/*.json`。

---

## 目录结构

```
qdii-tracker/
├── CLAUDE.md / README.md
├── .github/workflows/
│   ├── deploy-pages.yml      # Pages 部署
│   └── update-data.yml       # 定时数据更新（增量 / 完整）
├── config/
│   └── funds.json            # ⭐ SSOT：所有业务决策配置（分类规则/白名单/品牌色/置顶等）
├── scripts/
│   ├── fundctl.py            # ⭐ 统一入口（add/move/refresh/sync/check）
│   ├── config_loader.py      # 配置加载器（读写 config/funds.json）
│   ├── gen_frontend_config.py# 前端常量 codegen（funds.json → config.js 派生段）
│   ├── scan_funds.py         # ① 扫描 QDII + 自动分类（支持 --codes）
│   ├── enrich_data.py        # ② 补规模/费率/经理（支持 --codes）
│   ├── fill_missing.py       # ③ 补净值/YTD/历史收益/费率规则（支持 --codes）
│   ├── refresh_purchase.py   # ④ 补申购状态/限额（支持 --codes）
│   ├── fetch_holdings.py     # ⑤ 抓 Top10 重仓（支持 --codes，override 从 config 派生）
│   ├── reclassify_fund.py    # 增量分类调整（更新 config + JSON）
│   ├── timezone_utils.py     # 北京时间时区工具
│   └── requirements.txt
└── web/
    ├── index.html            # 前端骨架（HTML+CSS+主渲染 JS 内联）
    ├── js/
    │   ├── config.js         # 纯常量（GROUP_META / ETF_GROUPS + codegen 派生段）
    │   ├── utils.js          # 纯工具函数（格式化 / 市场时段 / 卖出规则解析）
    │   ├── idle-scheduler.js # 智能空闲调度（被 indices/etf-premium 共享）
    │   ├── market-indices.js # 顶部 5 张指数+汇率指标卡（实时）
    │   ├── etf-premium.js    # 场内 ETF 溢价率（实时）
    │   ├── offshore-live-nav.js # 场外基金实时净值 overlay（lsjz 主选 + pingzhongdata 兜底）
    │   ├── market-trend.js   # 点指标卡看日 K 走势（复用 trendModal，push2his + push2 双 host）
    │   └── tailwind.min.js   # Tailwind 本地化（禁用 CDN）
    ├── .nojekyll
    └── data/
        ├── sp500.json / nasdaq_passive.json / active.json
        ├── global_index.json     # 全球非美指数，通过 config/funds.json force_include 纳入
        ├── global_other.json / etf.json
        ├── meta.json
        └── holdings/{code}.json  # 主动基金持仓
```

---

## 数据流水线

| 步骤 | 脚本 | 输出 |
|---|---|---|
| ① | `scan_funds.py` | 6 个分类 JSON（**覆盖式写入**） |
| ② | `enrich_data.py` | 补规模/费率/经理/收益 |
| ③ | `fill_missing.py` | 补净值/YTD/历史收益/费率规则 |
| ④ | `refresh_purchase.py` | 补申购状态/限额/排行榜数据 |
| ⑤ | `fetch_holdings.py` | `holdings/*.json` |

**增量**（工作日 05:00 凌晨兜底 + 21:30 晚间主力）：③ → ④
**完整**（每月 2 日凌晨）：① → ② → ③ → ④ → ⑤

> 完整流水线 scan 后**必须**接 enrich + fill_missing，否则会丢失已有 enriched 数据。

### 前端缓存机制与 `generated_at` 同步策略

**缓存破坏机制**：
- 前端使用 `meta.json` 的 `generated_at` 作为所有数据文件的查询版本号（`?v=` 参数）
- 版本号策略：先拉 `meta.json`（绕缓存），用其 `generated_at` 当所有数据文件的 query 版本号
- Actions 推了新数据 → `meta.generated_at` 变 → query 变 → 自动失效

**`generated_at` 同步要求**：
- **所有增量更新脚本必须同时更新 `meta.json` 和各数据文件的 `generated_at` 字段**
- 仅更新 `meta.json` 会导致前端仍使用旧缓存（数据文件 `generated_at` 未变）
- 当前已修复：`fill_missing.py` 和 `refresh_purchase.py` 都会同步更新所有数据文件

**缓存问题症状**：
- 数据已更新但前端显示旧数据（如限购金额、净值日期等）
- `meta.json` 的 `generated_at` 是最新的，但数据文件仍是旧时间戳
- 用户需要强制刷新浏览器才能看到最新数据

### 时区统一策略
GitHub Actions 跑在 UTC、本地是北京时间，裸 `datetime.now()` 会让 `generated_at` 偏移 8 小时。
- 统一走 `scripts/timezone_utils.py`：`from timezone_utils import beijing_now_iso, beijing_year, beijing_year_start`
- 时间戳用 `beijing_now_iso()`、年份用 `beijing_year()`、年初用 `beijing_year_start()`；依赖 `pytz>=2024.1`（已在 requirements.txt）
- 自检：脚本不得出现裸 `datetime.now()` 写时间戳；`meta.json` 与各数据文件 `generated_at` 均为北京时间

### `fill_missing.py` 关键策略

- nav 三件套（nav / nav_date / daily_change）**无条件覆盖**（防回退由前置检查保证）
- 历史收益 / scale / fee / manager 等**仅填漏**，不覆盖已有值
- A/默认类的 `sale_service_fee > 0.05` 视为误抓，丢弃
- 写回前**必须**重算 `series_scale`（防止 scan 阶段 scale=None 时该字段卡在 0）

### `refresh_purchase.py` 关键策略

- `fund_open_fund_rank_em()` 排行榜**不覆盖**所有基金（LOF/FOF/发起式常缺），缺 `chg_since_inception` 时前端显示 `--`

### 已知数据覆盖限制

| 字段 | 限制 |
|---|---|
| `chg_since_inception` | 排行榜不全 |
| `buy_rules` / `sell_rules` | ~80% 覆盖率，暂停申购的基金常无 |
| 美元份额 nav/收益/规模 | pingzhongdata 与排行榜对美元份额覆盖差 |

---

## 前端约定

**轻模块化架构**：HTML/CSS/主渲染 JS 仍在 `web/index.html`，通用常量/工具/实时模块抽到 `web/js/*.js`（普通 `<script>` + ES Module 混用，**不引入构建工具**）。页面加载阶段不调外部 API（走势图、指数/汇率指标卡、ETF 溢价率、场外实时净值除外，均按需加载且受 idle-scheduler 节流）。

### 场外实时净值（offshore-live-nav.js）

**数据源双链路**：
- **主选**：`api.fund.eastmoney.com/f10/lsjz`（JSONP，`LSJZList[0]` 取最新净值）
- **兜底**：`fund.eastmoney.com/pingzhongdata/{code}.js`（JSONP，`Data_netWorthTrend` 末条取最新净值）
- why 双链路：`lsjz` 对 GitHub Pages 等跨站 Referer 返回 `ErrCode=-999`，本地正常但远端失败；`pingzhongdata` 对跨站访问更宽容

**调度策略**（5 档分时 + settled 自然终止）：
- 15:00–17:30 每 15 分钟（低频待命，美股数据尚未处理）
- 17:30–22:00 每 10 分钟（高频窗口，净值披露核心时段）
- 22:00–00:00 每 20 分钟（降频，大部分已出）
- 00:00–06:00 每 30 分钟（极低频，仅防 Actions 延迟推送）
- 06:00–15:00 不拉净值，`meta.json` 每 30 分钟检查（不受 `inLiveWindow` 限制）
- `inLiveWindow()` 覆盖 15:00~次日06:00（无硬截止），settled 后完全停止
- 页面隐藏 / 用户 10 分钟无交互：暂停
- 用户回到页面：立即 catch-up 一次

**失败退避**：
- 连续失败 → 指数退避：15 分钟 → 30 分钟 → 60 分钟
- 成功后重置退避计数
- 本地静态数据追上实时日期 → 标记 `settled`，不再请求该 code

**overlay 边界**：
- 仅覆盖场外默认份额（`default_share_code`）的外层行，展开子份额仍用静态 `nav_date`
- 表头日期 = 当前 tab 所有展示日期最大值（含 overlay `_live_nav_date`），不会"造日期"
- `_live_nav_source` 标记来源（`'lsjz'` / `'pzd'`），方便调试

### 指标卡日 K 走势（market-trend.js）

**双 host fallback**：
- 主选 `push2his.eastmoney.com`，失败自动尝试 `push2.eastmoney.com`
- 两个 host 参数完全一致，只是域名不同
- why：`push2his` 从 GitHub Pages 等跨站环境偶尔不可达，`push2` 作为备选提高可用性

**pingzhongdata 请求防护**（`fetchPzdHistory` + `offshore-live-nav.js::fetchPzdLatest`）：
- 请求前清掉旧全局变量 `window.Data_netWorthTrend` / `window.fS_code`，防止 stale 数据污染
- 校验 `window.fS_code === code`，防止 CDN 缓存返回错误基金的 JS

### 份额排序（前后端必须一致）
币种（人民币 < 美元 < 其他）→ 类型（A < C < D < E < F < H < I < 默认 < LOF）
- 前端：`shareSort()`
- 后端：`enrich_data.py` 的 `share_sort_key()`

### 规模显示
- 系列外层 = `series_scale`（取 A 类人民币规模，**不加和**：同系列各份额共享底层资产）
- 子分类展开行 = 各份额自己的 `scale_raw`
- 默认按规模倒序

### 费率规则

**综合费率公式**：
- A/默认类：`管理费 + 托管费`（**不含**销售服务费）
- C/E/F/I/D 类：`管理费 + 托管费 + 销售服务费`
- 数字去尾零（`1.00%` → `1%`）

**`condition` 字段格式约定**：
- 标准形态：时间 `0天<持有期限<7天` / `7天<=持有期限<2年` / `365天<=持有期限`；金额 `0万<买入金额<50万` / `100万<=买入金额`
- 数据源（AKShare）实际会返回多种"野生形态"，**前端统一兜底，原始数据保持不动**：
  - 文本式：`小于等于6天` → `0天<持有期限<7天`
  - 冗余 `.0`：`7.0天` → `7天`、`2.0年` → `2年`、`0.0万` → `0万`
  - 接近一年/两年的天数（差 ≤5 天）：`365/366天` → `1年`、`730/731天` → `2年`
- 实现位置：前端 `cleanCondition()`（仅展示用）；不在数据写入侧改写，避免覆盖原始抓取结果
- `free_hold_days` 主展示用 `formatHoldDays()` 同样做天→年归一化（`366` 显示"持 1 年免"而非"持 366 天免"）

### nav_date 防回退
所有写入 `nav_date` 的位置必须检查：新日期 < 已有日期 → 跳过。

### 表头净值日期取值
- 不用 `new Date()`：周末/节假日浏览器拿到的"今天" ≠ 官方最新披露日（如周六会显示 5.30，但官方还是 5.29）
- 实现：遍历当前 tab 下所有 `share.nav_date` 取**最大值**作为表头副标题，与官方披露完全一致
- 行内净值日期 = 表头日期时不再重复展示；按 tab 隔离存到 `STATE._navDate[tab]`，避免场内外撞车
- 数据空时 fallback 到 `new Date()`（仅初次加载/异常兜底）

### 持仓列两态（被动表也可能有内容）
- **isActive=true**（active / global_other）：渲染 `📊 持仓` 按钮，点击拉 `holdings/{code}.json`
- **`PASSIVE_HOLDINGS_OVERRIDE` 命中**（前端常量，被动分类下的例外名单）：
  - `type='active'`：分类被动但实为主动管理（Smart Beta，如 096001 大成标普500等权重）→ 走真实持仓按钮
- **其他被动指数**：占位 `—`（包括场外联接基金，如 050025 博时标普500ETF联接 —— 跟踪母 ETF 的细节不在列里展示）
- 维护：`PASSIVE_HOLDINGS_OVERRIDE`（前端）和 `EXTRA_HOLDINGS_CODES`（脚本）均由 `config/funds.json → passive_override` 统一派生（`gen_frontend_config.py` 生成前者，`fetch_holdings.py` 从 config 读取后者），**无需手动同步**
- `openDetail` 的 series 查找已扩展到全部场外分类（`active / global_other / sp500 / nasdaq_passive / global_index`），新增 override 无需再改查找列表

### 分类下的"真被动 / 名义被动"扫盲（sp500 / nasdaq_passive）

| 分类 | series | 主代码 | fund_type | 性质 | 处理 |
|---|---|---|---|---|---|
| sp500 | 博时标普500ETF联接 | 050025 | 指数型-海外股票 | ✅ 真被动（跟踪 513500） | 占位 `—` |
| sp500 | 摩根标普500指数 | 017641 | 指数型-海外股票 | ✅ 真被动 | 占位 `—` |
| sp500 | 易方达标普500指数 | 161125 | 指数型-海外股票 | ✅ 真被动 | 占位 `—` |
| sp500 | 华夏标普500ETF联接 | 018064 | 指数型-海外股票 | ✅ 真被动 | 占位 `—` |
| sp500 | 大成标普500等权重指数 | 096001 | 指数型-海外股票 | ⚠️ Smart Beta（等权再平衡） | `type='active'` 走持仓按钮 |
| sp500 | 天弘标普500发起 | 007721 / 007722 | **QDII-FOF** | ⚠️ FOF（基金经理选 ETF 配置，实为主动） | **保留占位 `—`**：akshare `fund_portfolio_hold_em` 对 FOF 返回 0 行（FOF 持基金不持个股），加按钮也是空 |
| nasdaq_passive | 全部 series（含南方纳斯达克100 等发起式） | — | 指数型-海外股票 | ✅ 全是真被动 | 占位 `—`（被动指数有"持仓"=指数成分股，是常识不展示） |

> 维护原则：判定标准是 **`fund_type` + `full_name`**，不是名字带不带"指数"。FOF 即便归在标普500分类下也**不是被动**。

### 卖出规则展示统一格式
- 主展示**只用**「持X免」一种格式（X 经 `formatHoldDays` 归一化：366→1年、730→2年）
- 优先级：`free_hold_days` → `sell_rules` 末档（最低费率档）的 `condition` 下界（`parseSellRuleLowerDays` 解析）
- **禁止**显示 `持7天起0.5%` 这类混合格式（华夏全球永不免赎也照样展示「持7天免」+ 详细费率走 tooltip）
- 详细分档（含费率、买入金额段）走 hover tooltip，不污染主行

### tooltip 触发样式
- `.fee-tip` 类用于费率/买入费/卖出规则等主行单元格 + hover 弹窗，**`cursor` 必须是 `pointer`，禁止 `help`**
  - `cursor: help` 会让光标变 `?` 形状，暗示"这是说明性内容"，与"可点开查看详情"的语义冲突，用户会误以为单元格有问题

### 分组级风险/说明横幅 `GROUP_NOTICE`
- 配置位于 `web/js/config.js` 内的 `GROUP_NOTICE` 常量，按 `tab → filter` 二级嵌套；空配置自动隐藏
- 三档配色：`sky`（中性提示，被动指数）/ `amber`（黄色提醒，限购等可控风险）/ `rose`（红色警告，主动基挂羊头卖狗肉等深坑）
- 文案约束：**点到为止、起警示作用**，单条 ≤45 字，每组 ≤2 条
- 主动基（`active`）的红色警告**禁止移除/弱化**——风格漂移是真实存在的坑，是看板的核心警示价值之一
- **日限额汇总**：`sp500` / `nasdaq_passive` / `global_index` 三个被动分组横幅自动追加 💰 汇总行，遍历该分组所有 series 的默认份额，跳过暂停申购，累加 `daily_limit` 并计数开放不限只数。格式如 `当前每日可购买 ¥1,230 + 2 只开放申购`

### 场内 ETF 特殊点
- ETF 表头**没有**两列：成立来 / 申购（代码位置：`index.html` 中 `${isEtf ? '' : sortableTh(...)}` 条件渲染）
- ETF `nav_date` **必须**走 lsjz API 拉真实净值披露日（`enrich_data.py::fetch_etf_nav_date_lsjz`），与场外 QDII 同节奏
  - **禁止**用 `datetime.now()` 写入 ETF `nav_date`：周末/节假日运行会写入非交易日，导致表头显示「最新价 5.30」（周六）这类错误日期
  - 数据源：`fund_open_fund_rank_em` **不收录 ETF**，所以 ETF 的 `nav_date` 不会被 `refresh_purchase.py` 自动覆盖刷新；只能靠 enrich 阶段写入
  - 表头日期取所有 share `nav_date` 最大值，前端逻辑一致（场内外都按这套）
- `etf_price` / `etf_change_pct` 来自东财快照（`fund_etf_spot_em`，可能是实时报价），**与 `nav_date` 不必同日**——`nav_date` 始终是 lsjz 净值日，价格则是当前抓取时的最新价
- `series.starred = true` 在分组内置顶（场内 ETF 当前 513500、513100）
- 场外置顶走 `OFFSHORE_STARRED` 集合（按 `default_share_code` 识别，当前 050025、160213）；ETF 置顶走 `series.starred=true` 字段。两者表现一致：置顶 + 展示⭐

---

## 改动规则

### 调整基金分类（⭐ 推荐：增量，~5秒）

统一用 `fundctl move`：

```bash
python3 scripts/fundctl.py move --keyword "富国全球科技互联网" --from global_other --to active
```

脚本自动完成：
1. 从源分类 JSON 中取出目标 series（含完整数据）
2. 移到目标分类 JSON，更新 category/series_id
3. 按需补 holdings（移到 active/global_other 时）
4. 同步更新 `meta.json`
5. 同步更新 `config/funds.json`（force_include / active_whitelist）

选项：
- `--no-holdings`：跳过 holdings 抓取
- `--no-whitelist`：跳过 `config/funds.json` 白名单更新

### 新增基金

统一用 `fundctl add`（配置 + 增量补数 + 可选持仓）：

```bash
python3 scripts/fundctl.py add --code 008888 --to active --keyword "某某基金"
```

> `global_index`（全球非美指数）同样通过 `fundctl add --to global_index` 进入。

**手动**（临时补加单只、不想跑完整扫描时）：
1. `ak.fund_name_em()` 查同系列代码
2. 在 `web/data/{分类}.json` 的 `series` 数组追加骨架（`series_scale` 留 null，shares 按【份额排序】规则）
3. 跑 ②→③→④→⑤（仅 active / global_other 跑 ⑤，global_index 不抵持仓）

> ⚠️ 骨架字段（scale/manager/established/费率/收益/etf_price/nav_date 等）**只能由脚本填**，前端没有兜底。光追加骨架不跑脚本，行内会全 `—`。
> · ETF 手动新增：只需跑 `enrich_data.py`（一步到位补 scale/费率/经理/收益/etf_price/nav_date），无需 ③④⑤
> · 场外手动新增：跑 ②→③→④（active / global_other 还要跑 ⑤）

`default_share_code`：有 A/C 选 A，有人民币/美元选人民币，单只就是它本身。
校验：`python3 -c "import json; json.load(open('web/data/xxx.json'))"`

### 修改脚本/前端/流水线
- 脚本：直接读写 `web/data/`，不维护中间副本；失败静默降级不中断流水线；逐只调用限速 `time.sleep(0.2~0.3)`；写文件用 `ensure_ascii=False, indent=2`
- 前端：只改 `web/index.html`
- **改 `web/js/*.js` 后必须 bump `index.html` 中 `import './js/xxx.js?v=YYYYMMDDx'` 的版本戳**：GitHub Pages / 浏览器对 `.js` 默认强缓存，不 bump 版本号会导致用户访问时仍命中旧版本（典型症状：JS 已修但页面行为不变）
- 流水线：改/新增脚本时同步更新 `.github/workflows/update-data.yml`，增量建议调用 `fundctl refresh`，完整建议调用 `fundctl sync`

---

## 🚫 禁止事项

1. 不在 `web/` 下创建新文件（除 `web/data/*.json`、`web/js/*.js` 模块化文件、`.nojekyll`）
   - `web/js/` 下当前模块：`market-indices.js`（指数+汇率指标卡）/ `etf-premium.js`（场内 ETF 溢价率）/ `idle-scheduler.js`（智能空闲调度，被前两者共享）/ `market-trend.js`（点击指标卡看日 K 走势，复用 trendModal，push2his+push2 双 host）/ `offshore-live-nav.js`（场外实时净值 overlay，lsjz+pingzhongdata 双链路）/ `config.js`（纯常量+codegen 派生段）/ `tailwind.min.js`（Tailwind 本地化）
   - 新增 ES Module 时必须 ① 在 `index.html` 末尾 `<script type="module">` 块里 import + start，② 用 `?v=YYYYMMDDx` 版本戳防缓存
2. 不引入 npm / webpack / vite 等构建工具
3. 前端加载时不调外部 API
4. **不删 `web/data/holdings/` 下的 JSON**（脚本只增不删）
   - 即使某 holdings 对应代码**已不在任何分类 JSON 中**（"未引用"），也**不是孤儿**，**不要清理**
   - 设计意图：白名单变动 / 数据修复期间基金可能短暂离场，保留无运行时成本（前端不会主动 fetch）
   - 自检时只在文件**损坏 / 字段缺失 / 空内容**时告警
5. 不把 API Key 写进代码（当前接口全公开）
6. 不改 A 股红涨绿跌配色
7. 不让 `nav_date` 回退

---

## 自检任务口径

**应报**：
- 文档与实际不一致（系列数、字段说明等）
- JSON 损坏 / 关键字段缺失 / 类型错误
- `default_share_code` 指向不存在的份额
- 前端引用了不存在的 JSON 字段
- 未提交的 untracked 文件
- 表头/行内出现 `366天`、`持7天起0.5%` 等违反【卖出规则展示统一格式】的文案
- `GROUP_NOTICE.offshore.active` 红色警告被改成中性色或被删除
- ETF `nav_date` 在周末/节假日显示为脚本运行当天（应来自 lsjz 真实披露日）
- **场内ETF最新价日期bug**：周末/节假日脚本运行时，ETF `nav_date` 被错误设置为 `datetime.now()` 而非 lsjz 真实披露日，导致表头显示错误日期（如周六显示"最新价 5.30"）
- 任何脚本里出现 `share["nav_date"] = datetime.now()` 这种写法（无论场内场外都禁止）
- `config/funds.json` 中 `passive_override.type='active'` 的代码没有对应 `holdings/{code}.json`（可用 `fundctl check` 自动检查）
- `.fee-tip` 的 `cursor` 被改回 `help`（应为 `pointer`，避免误导 `?` 图标）
- `007721 / 007722` 被加进 `passive_override`（FOF 接口拿不到个股持仓，加了点开就是空 + 脚本空跑）
- **增量更新脚本只更新 `meta.json` 的 `generated_at` 而不更新数据文件**（会导致前端缓存失效）
- **数据文件的 `generated_at` 与 `meta.json` 的时间戳差异过大**（>1分钟视为异常）
- **前端显示的数据与数据源不一致但 `generated_at` 已更新**（缓存机制失效的典型症状）
- **脚本用 `datetime.now()` 或自行推算"交易日"写 ETF nav_date**（必须只信 lsjz `FSRQ`，失败保留旧值）
- **ETF nav_date 比 lsjz 真实披露日还新 / 落在非交易日**（说明被造假日期污染）
- **数据更新后网页显示仍为旧数据**（缓存机制或数据写入问题）

**不报**（伪问题）：
- "孤儿 holdings"——见禁止事项 4
- "default 份额缺 holdings"——多数是新基金/季报未披露，前端有 `'暂无持仓数据'` 兜底
- Action 实际起跑时间与文档时点的小偏差——平台调度抖动，非问题
- 周末打开看到的净值日期是上一交易日——这是【表头净值日期取值】的正确行为，与官方披露口径一致

---

## 调试指南

### 数据显示与数据源不一致
1. **缓存**：确认 `meta.json` 与各数据文件 `generated_at` 都已更新（差异 <1 分钟），强刷浏览器（Ctrl+F5）排除缓存
2. **数据源**：直接看 `web/data/*.json` 是否正确，再看脚本日志确认更新是否执行
3. **前端**：确认按 `meta.generated_at` 作 `?v=` 版本号取数

### ETF nav_date
- 唯一正确来源：lsjz 真实披露日（`fill_missing.py` ETF 块 / `enrich_data.py::fetch_etf_nav_date_lsjz`），防回退（新 >= 旧才写），**lsjz 失败保留旧值**
- 周末/节假日 nav_date 停在上一交易日是【正确行为】，不是 bug，**不要"修"它让日期前进**
- 自检：脚本里不得出现 `datetime.now()` 或自行推算"交易日"来写 nav_date

---

## Bug 史 / 反面教材

### ETF nav_date 被 datetime.now() 造假（2026-06 教训）
- **现象**：周末/节假日 ETF 表头显示非交易日（如周六"最新价 6.6"）。
- **错误做法（已废弃）**：`fill_missing.py` 曾在 lsjz 返回空时用 `datetime.now()` 按"中国 weekday"推算"上一交易日"写入 nav_date。但 QDII ETF 跟踪美股、T+1 披露，中美日历不对齐；且推算函数"不考虑节假日"，必然错。
- **根因误判**：把"周末日期不前进"当成 bug，其实那是【表头净值日期取值】认可的正确行为 —— 用真 bug 去修一个伪 bug，还围绕它打了 5 个补丁 commit。
- **正确做法（现行）**：ETF nav_date 只信 lsjz `FSRQ`，防回退（新 >= 旧才写），**lsjz 失败保留旧值，绝不造日期**。`fill_missing.py` ETF 块与 `enrich_data.py` 已统一这套口径。

### 双目录分裂（2026-05-08）
脚本曾同时维护 `data/` 与 `web/data/`，上游简化快照覆盖完整版导致字段丢失 → 已统一为单一 `web/data/`，脚本直接读写该目录，不再维护中间副本。

### 远端实时接口被封锁（2026-06-09 教训）
- **现象**：本地打开页面实时净值/指标卡日 K 正常，GitHub Pages 远端不行。
- **根因**：不是 GitHub Pages 服务器 IP 被封（纯静态页面，浏览器直连 API）。而是东方财富 `api.fund.eastmoney.com/f10/lsjz` 和 `push2his.eastmoney.com` 对跨站 Referer（`zhouminghan.github.io`）返回空数据 / 拒绝连接。Python 脚本可以伪造 Referer，浏览器 JS 不行。
- **区分**：走势图能拉到是因为走 `fund.eastmoney.com/pingzhongdata/{code}.js`（不受限），指标卡日 K 拉不到是因为走 `push2his.eastmoney.com`（受限）。两者不是同一数据源。
- **修复（现行）**：
  - 实时净值：`lsjz`（主选）→ `pingzhongdata`（兜底）双链路
  - 指标卡日 K：`push2his`（主选）→ `push2`（兜底）双 host
  - 两者仍有偶发不可用可能，后续如需彻底解决需加 Cloudflare Worker 代理
