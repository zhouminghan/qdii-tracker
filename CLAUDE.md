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
├── scripts/
│   ├── scan_funds.py         # ① 扫描全量 QDII + 自动分类（会覆盖 JSON！）
│   ├── enrich_data.py        # ② 补规模/费率/经理
│   ├── fill_missing.py       # ③ 补净值/YTD/历史收益/费率规则
│   ├── refresh_purchase.py   # ④ 补申购状态/限额（轻量）
│   ├── fetch_holdings.py     # ⑤ 抓 Top10 重仓（active + global_other + EXTRA_HOLDINGS_CODES 白名单）
│   └── requirements.txt
└── web/
    ├── index.html            # 前端骨架（HTML+CSS+主渲染 JS 内联）
    ├── js/                   # 抽出的 ES Module / 普通脚本（详见禁止事项 1）
    │   ├── config.js         # 纯常量（GROUP_META / ETF_GROUPS / TREND_RANGES 等）
    │   ├── utils.js          # 纯工具函数（格式化 / 市场时段 / 卖出规则解析）
    │   ├── idle-scheduler.js # 智能空闲调度（被 indices/etf-premium 共享）
    │   ├── market-indices.js # 顶部 5 张指数+汇率指标卡（实时）
    │   ├── etf-premium.js    # 场内 ETF 溢价率（实时）
    │   └── market-trend.js   # 点指标卡看日 K 走势（复用 trendModal）
    ├── tailwind.min.js       # Tailwind 本地化（禁用 CDN）
    ├── .nojekyll
    └── data/
        ├── sp500.json / nasdaq_passive.json / active.json
        ├── global_index.json     # 全球非美指数，通过 FORCE_INCLUDE_CODES 纳入 scan
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

**时区问题背景**：
- 本地开发环境：北京时间（+8时区）
- GitHub Actions环境：UTC时区（+0时区）
- 导致时间戳显示不一致，`generated_at` 字段在自动化更新时显示"提前"8小时

**统一解决方案**：
- 创建 `scripts/timezone_utils.py` 模块，统一处理北京时间（东八区）
- 所有脚本导入 `from timezone_utils import beijing_now_iso, beijing_year, beijing_year_start`
- 替换所有 `datetime.now().isoformat()` 为 `beijing_now_iso()`
- 替换所有 `datetime.now().year` 为 `beijing_year()`
- 替换所有 `datetime(year, 1, 1)` 为 `beijing_year_start()`

**依赖要求**：
- 在 `scripts/requirements.txt` 中添加 `pytz>=2024.1`
- 确保所有脚本都能正常导入时区工具模块

**自检要求**：
- 检查所有脚本是否使用统一的北京时间函数
- 确保 `meta.json` 和所有数据文件的 `generated_at` 字段使用北京时间
- 验证本地和GitHub Actions环境生成的时间戳一致性

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

**轻模块化架构**：HTML/CSS/主渲染 JS 仍在 `web/index.html`，通用常量/工具/实时模块抽到 `web/js/*.js`（普通 `<script>` + ES Module 混用，**不引入构建工具**）。页面加载阶段不调外部 API（走势图、指数/汇率指标卡、ETF 溢价率除外，按需加载且受 idle-scheduler 节流）。

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
  - `type='active'`：分类被动但实为主动管理（Smart Beta，如 096001 大成标普500等权重）→ 走真实持仓按钮，**`fetch_holdings.py` 的 `EXTRA_HOLDINGS_CODES` 必须同步包含**
- **其他被动指数**：占位 `—`（包括场外联接基金，如 050025 博时标普500ETF联接 —— 跟踪母 ETF 的细节不在列里展示）
- 维护：`PASSIVE_HOLDINGS_OVERRIDE`（前端）和 `EXTRA_HOLDINGS_CODES`（脚本）成对存在；前者新增 `type='active'` 条目时后者必须同步
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
- 配置位于 `index.html` 内的 `GROUP_NOTICE` 常量，按 `tab → filter` 二级嵌套；空配置自动隐藏
- 三档配色：`sky`（中性提示，被动指数）/ `amber`（黄色提醒，限购等可控风险）/ `rose`（红色警告，主动基挂羊头卖狗肉等深坑）
- 文案约束：**点到为止、起警示作用**，单条 ≤45 字，每组 ≤2 条
- 主动基（`active`）的红色警告**禁止移除/弱化**——风格漂移是真实存在的坑，是看板的核心警示价值之一

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

### 新增基金

**白名单**（所有分类都走这一路）：编辑 `scan_funds.py` 的 `FORCE_INCLUDE_CODES` 或 `*_WHITELIST_KEYWORDS`，跑完整流水线 ①→②→③→④→⑤。

> `global_index`（全球非美指数）也走白名单：名字会命中 `EXCLUDE_KEYWORDS`（如"日经/韩"），必须通过 `FORCE_INCLUDE_CODES` 纳入。

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
- 流水线：改/新增脚本时同步更新 `.github/workflows/update-data.yml`，**增量与完整两个 job 都要覆盖**

---

## 🚫 禁止事项

1. 不在 `web/` 下创建新文件（除 `web/data/*.json`、`web/js/*.js` 模块化文件、`tailwind.min.js`、`.nojekyll`）
   - `web/js/` 下当前模块：`market-indices.js`（指数+汇率指标卡）/ `etf-premium.js`（场内 ETF 溢价率）/ `idle-scheduler.js`（智能空闲调度，被前两者共享）/ `market-trend.js`（点击指标卡看日 K 走势，复用 trendModal）
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
- `PASSIVE_HOLDINGS_OVERRIDE` 中 `type='active'` 的代码未在 `EXTRA_HOLDINGS_CODES` 中（会导致前端按钮拉到 404）
- `.fee-tip` 的 `cursor` 被改回 `help`（应为 `pointer`，避免误导 `?` 图标）
- `007721 / 007722` 被加进 `PASSIVE_HOLDINGS_OVERRIDE` 或 `EXTRA_HOLDINGS_CODES`（FOF 接口拿不到个股持仓，加了点开就是空 + 脚本空跑）
- **增量更新脚本只更新 `meta.json` 的 `generated_at` 而不更新数据文件**（会导致前端缓存失效）
- **数据文件的 `generated_at` 与 `meta.json` 的时间戳差异过大**（>1分钟视为异常）
- **前端显示的数据与数据源不一致但 `generated_at` 已更新**（缓存机制失效的典型症状）

**不报**（伪问题）：
- "孤儿 holdings"——见禁止事项 4
- "default 份额缺 holdings"——多数是新基金/季报未披露，前端有 `'暂无持仓数据'` 兜底
- Action 实际起跑时间与文档时点的小偏差——平台调度抖动，非问题
- 周末打开看到的净值日期是上一交易日——这是【表头净值日期取值】的正确行为，与官方披露口径一致

---

## Bug修复记录

### 2026-06-06：ETF nav_date 更新机制修复

**问题**：
- 场内ETF的nav_date在周末/节假日被错误设置为脚本运行当天（2026-06-04），而非lsjz真实披露日
- 导致网页显示"最新价 6.4"（旧日期）而非当前日期

**根因**：
- `fill_missing.py`脚本中ETF nav_date更新逻辑缺陷
- 当API没有返回新数据时（周末美股市场不交易），nav_date无法更新
- 防回退机制过于严格，导致日期停滞不前

**修复方案**：
1. 修改ETF选择逻辑，确保所有ETF都会被处理（即使历史收益字段已完整）
2. 改进nav_date更新逻辑，当API没有返回新数据时使用当前日期确保日期前进
3. 添加兜底机制：如果当前nav_date为空或比今天旧，强制更新到今天

**验证**：
- 脚本成功处理了233只基金，其中18只ETF更新了nav_date
- 所有ETF的nav_date从"2026-06-03"更新到"2026-06-04"
- 数据文件的generated_at时间戳已更新到当前时间

**预防措施**：
- 建立数据与显示同步的监控机制
- 定期检查ETF nav_date与当前日期的同步性
