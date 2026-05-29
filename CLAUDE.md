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
│   ├── fetch_holdings.py     # ⑤ 抓 Top10 重仓（active + global_other + global_index）
│   └── requirements.txt
└── web/
    ├── index.html            # 单文件前端（HTML+CSS+JS 全内联）
    ├── tailwind.min.js       # Tailwind 本地化（禁用 CDN）
    ├── .nojekyll
    └── data/
        ├── sp500.json / nasdaq_passive.json / active.json
        ├── global_index.json     # 手动维护，不参与 scan
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

**增量**（工作日 05:00 / 17:30 / 22:30 北京时间）：③ → ④
**完整**（每月 2 日 02:00）：① → ② → ③ → ④ → ⑤

> 完整流水线 scan 后**必须**接 enrich + fill_missing，否则会丢失已有 enriched 数据。

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

## 数据分类（6 个 JSON）

| 文件 | 说明 | 来源 |
|---|---|---|
| `sp500.json` | 标普500 被动指数 | scan 自动 |
| `nasdaq_passive.json` | 纳指100 被动指数 | scan 自动 |
| `active.json` | 美股主动（白名单精选） | scan 自动 |
| `global_index.json` | 全球指数（日经225 等） | **手动维护** |
| `global_other.json` | 全球/其他 QDII | scan 自动 |
| `etf.json` | 场内跨境 ETF（513/159） | scan 自动 |

`global_index` 不参与 `scan_funds.py`，但参与其他 4 个脚本。

---

## 前端约定

### 单文件架构
所有 HTML/CSS/JS 都在 `web/index.html`，不拆分、不引入构建工具。

### 配色（A 股口径）
**红涨绿跌**：`.up { color: #dc2626; }` / `.down { color: #16a34a; }`

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

**`condition` 字段必须是符号格式**（不允许中文）：
- 时间：`0天<持有期限<7天` / `7天<=持有期限<2年` / `365天<=持有期限`
- 金额：`0万<买入金额<50万` / `100万<=买入金额`
- 后端 `fill_missing.py::normalize_condition()` 在抓取时统一格式
- 前端 `cleanCondition()` 进一步简化显示（`365天`→`1年`、`<=`→`≥` 等）

### 申购状态显示

| 份额 | 显示 |
|---|---|
| 人民币 A/C/默认/LOF/FOF | 正常（暂停 / 限 ¥X / 开放申购） |
| 美元份额 | 统一 `—`（接口不返回） |
| E/F/I/D 类 | 统一 `—`（非主流代销） |

### 子分类展开行
- **不含"类别"列**（A/C 已在份额名称中）
- 列顺序：代码 | 份额名称 | 币种 | 规模 | 净值(+日涨跌) | 近1年 | 申购 | 买入费 | 卖出规则
- 默认份额代码后加 ★（金色）
- 币种用符号 `¥` / `$`
- 不用 `table-fixed`，列宽自适应

### nav_date 防回退
所有写入 `nav_date` 的位置必须检查：新日期 < 已有日期 → 跳过。

### 场外 vs 场内 ETF 表头
ETF 表头**没有**：成立来、申购、份额数列。
ETF `nav_date` 来自东财快照（非实时，与场外同节奏）。
`series.starred = true` 在分组内置顶（当前 513500、513100）。

---

## 改动规则

### 新增基金

**白名单方式**（sp500 / nasdaq_passive / active / global_other / etf）：
1. 编辑 `scripts/scan_funds.py` 的 `FORCE_INCLUDE_CODES` 或 `*_WHITELIST_KEYWORDS`
2. 跑完整流水线 ① → ② → ③ → ④ → ⑤

**手动方式**（必须用于 `global_index`，或追加单只）：
1. 用 `ak.fund_name_em()` 查同系列代码
2. 在 `web/data/{分类}.json` 的 `series` 数组追加骨架（`series_scale` 留 null）
3. shares 排序按上面【份额排序】规则
4. 跑 ② → ③ → ④ → ⑤（仅 active/global_other/global_index 跑 ⑤）

`default_share_code` 选择：有 A/C 选 A，有人民币/美元选人民币，单只就是它本身。

校验：`python3 -c "import json; json.load(open('web/data/xxx.json'))"`

### 修改脚本
- 直接读写 `web/data/`，不维护中间副本
- 失败静默降级，不中断流水线
- 逐只调用限速 `time.sleep(0.2~0.3)`
- 写文件用 `ensure_ascii=False, indent=2`

### 修改前端
- 只改 `web/index.html`
- 页面加载阶段不调外部 API（走势图除外，按需加载）

### 修改流水线
- 改/新增脚本时同步更新 `.github/workflows/update-data.yml`，**增量与完整两个 job 都要覆盖**

---

## 🚫 禁止事项

1. 不在 `web/` 下创建新文件（除 `web/data/*.json`、`tailwind.min.js`、`.nojekyll`）
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

**不报**（伪问题）：
- "孤儿 holdings"——见禁止事项 4
- "default 份额缺 holdings"——多数是新基金/季报未披露，前端有 `'暂无持仓数据'` 兜底
- Action cron 时间与文档微小偏差——脚本注释已说明
