# 数据 Schema

> `web/data/*.json` 文件字段说明。以 `active.json` 为样本，其他分类结构相同。

## 顶层结构

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `category` | string | 分类标识 | `"active"` |
| `label` | string | 分类中文标签 | `"板块3 · 美股主动（场外·白名单精选）"` |
| `series_count` | integer | 系列总数 | `25` |
| `total_scale` | number | 板块总规模（亿元） | `523.45` |
| `series` | array | 基金系列列表 | — |

## series（系列）对象

| 字段 | 类型 | 说明 | 取值范围 |
|------|------|------|----------|
| `series_id` | string | 唯一标识 | `"{公司}__{产品名}__{category}"` 下划线连接 |
| `company` | string | 基金公司原始名 | `"广发"`、`"易方达"` |
| `company_display` | string | 公司显示名（alias） | 同 company 或品牌别名 |
| `series_name` | string | 产品系列名 | `"全球精选股票"` |
| `display_name` | string | 显示名（去份额尾缀） | `"广发全球精选股票"` |
| `category` | string | 分类 | 同顶层 category |
| `etf_target` | string\|null | ETF 跟踪标的 | `"sp500"`、`"nasdaq100"`、`"us50"`、`"other"`、`null` |
| `default_share_code` | string | 默认份额代码 | A 类人民币份额代码 |
| `series_scale` | number\|null | 系列规模（亿元） | A 类人民币份额规模 |
| `shares` | array | 份额列表 | — |

## shares（份额）对象

### 标识字段

| 字段 | 类型 | 说明 | 来源 |
|------|------|------|------|
| `code` | string | 基金代码（6 位） | scan 阶段 |
| `name` | string | 基金全称（含币种/份额类） | scan 阶段 |
| `share_class` | string | 份额类型 | `"A"`、`"C"`、`"D"`、`"E"`、`"F"`、`"H"`、`"I"`、`"Q"`、`"R"`、`"LOF"`、`"FOF"`、`"默认"`、`"A(后端)"`、`"A(美钞)"`、`"A(美汇)"` |
| `currency` | string | 币种 | `"人民币"`、`"美元"`、`"欧元"`、`"港币"` |
| `fund_type` | string | 基金类型 | `"QDII-普通股票"`、`"QDII-指数"`、`"指数型-海外股票"` 等 |

### 净值字段

| 字段 | 类型 | 说明 | 来源 |
|------|------|------|------|
| `nav` | number\|null | 单位净值 | enrich / fill |
| `nav_cum` | number\|null | 累计净值 | enrich |
| `nav_date` | string\|null | 净值日期 | enrich / fill，格式 `"YYYY-MM-DD"` |
| `daily_change` | number\|null | 日涨跌幅（%） | enrich / fill |

### 收益字段

| 字段 | 类型 | 说明 | 来源 |
|------|------|------|------|
| `chg_1w` | number\|null | 近 1 周收益（%） | enrich |
| `chg_1m` | number\|null | 近 1 月收益（%） | enrich / fill |
| `chg_3m` | number\|null | 近 3 月收益（%） | enrich / fill |
| `chg_6m` | number\|null | 近 6 月收益（%） | enrich / fill |
| `chg_ytd` | number\|null | 今年以来收益（%） | enrich / fill（LOF 取同系列兄弟份额兜底） |
| `chg_1y` | number\|null | 近 1 年收益（%） | enrich / fill |
| `chg_2y` | number\|null | 近 2 年收益（%） | enrich |
| `chg_3y` | number\|null | 近 3 年收益（%） | enrich |
| `chg_since_inception` | number\|null | 成立以来收益（%） | enrich / fill |

### 规模与基本信息

| 字段 | 类型 | 说明 | 来源 |
|------|------|------|------|
| `scale` | number\|null | 资产规模（亿元） | enrich (雪球) / fill (F10) |
| `scale_raw` | string | 规模原始字符串 | `"112.68亿"` |
| `established` | string | 成立日期 | enrich / fill，格式 `"YYYY-MM-DD"` |
| `manager` | string | 基金经理 | enrich / fill |
| `fund_company` | string | 基金公司全称 | enrich (雪球) |
| `fund_type_xq` | string | 雪球分类 | `"QDII-股票"` |
| `full_name` | string | 基金全称 | enrich (雪球) |

### 申购/赎回

| 字段 | 类型 | 说明 | 取值范围 |
|------|------|------|----------|
| `buy_status` | string | 申购状态 | `"开放申购"`、`"限大额"`、`"暂停申购"`、`"封闭期"`、`"场内"` |
| `sell_status` | string | 赎回状态 | `"开放赎回"`、`"暂停赎回"` |
| `buy_min` | number\|null | 购买起点（元） | `10.0` |
| `daily_limit` | number\|null | 日累计限额（元） | `200.0`（限大额时）；`null` = 不限额/开放申购（东财哨兵值 1e11 已归一化） |
| `buy_status_history` | array | 申购变更追踪 | `[{date, buy_status, daily_limit}]`，状态或额度变化才追加；场内 ETF 与美元份额不追踪 |

### 费率

| 字段 | 类型 | 说明 | 来源 |
|------|------|------|------|
| `mgmt_fee` | number\|null | 管理费率（%） | enrich (雪球) / fill (F10) |
| `custody_fee` | number\|null | 托管费率（%） | enrich (雪球) / fill (F10) |
| `sale_service_fee` | number\|null | 销售服务费率（%） | fill (F10)，A 类 >0.05% 时跳过（误判） |
| `first_buy_rate` | number\|null | 首档买入费率（%） | enrich (雪球) / fill (F10) |
| `fee` | string | 手续费原始字符串 | `"0.16"` |
| `buy_rules` | array | 买入费率多档规则 | `[{condition, rate}]` |
| `sell_rules` | array | 卖出费率多档规则 | `[{condition, rate}]` |
| `free_hold_days` | integer\|null | 免费持有天数 | 卖出规则中 rate=0 的最小天数 |
| `max_sell_rate` | number\|null | 最高卖出费率（%） | 卖出规则中最大 rate |

### ETF 专用字段（仅 etf.json 中的份额有值）

| 字段 | 类型 | 说明 | 来源 |
|------|------|------|------|
| `etf_price` | number\|null | 场内最新价 | enrich / fill |
| `etf_change_pct` | number\|null | 场内涨跌幅（%） | enrich / fill |
| `etf_scale_yi` | number\|null | ETF 规模（亿元） | enrich |
| `etf_volume` | number\|null | 成交量 | enrich |

## 数据写入规则

> 硬规则（`nav_date` 永不回退、scan 后接 enrich+fill）见 [AGENTS.md](../AGENTS.md) 关键边界；此处只列数据层特有约定。

1. **写盘前 normalize**：`normalize_share_keys()` 固定 key 顺序，避免 diff 噪音
2. **增量合并**：scan 保留已有字段（不覆盖 enrich/fill 产物）；fill 只补缺失不覆盖已有
3. **meta.json**：仅 `generated_at` 保留时间戳，其他文件不写时间戳
4. **holdings 单独存储**：`web/data/holdings/{code}.json`，每只基金一个文件
