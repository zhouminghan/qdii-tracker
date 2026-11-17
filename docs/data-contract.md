# 公共数据契约

## 版本

当前公共目录契约版本：`schema_version: 1`。

前端唯一基金入口是 `web/data/catalog.json`。原始分类 JSON 仍由 pipeline 维护，
但页面不得直接推断分类文件是否完整或新鲜。

## Catalog Envelope

```json
{
  "schema_version": 1,
  "generated_at": "ISO-8601",
  "source": "web/data/...",
  "status": "ok | degraded | error",
  "data": {
    "categories": {
      "sp500": {
        "label": "sp500",
        "count": 7,
        "share_count": 25,
        "series": []
      }
    },
    "summary": {
      "series_count": 91,
      "share_count": 238,
      "category_count": 6,
      "newest_nav_date": "YYYY-MM-DD"
    },
    "company_brands": {}
  },
  "quality": {
    "status": "ok | degraded | error",
    "checked_at": "ISO-8601",
    "missing_nav": 0,
    "expected_no_nav": 0,
    "stale_nav": 0,
    "limit_scope": {
      "share": 0,
      "series_shared": 0,
      "unknown": 119
    },
    "warnings": [],
    "errors": []
  }
}
```

### 基金份额限购字段

`catalog.json` 的每个 share 保留 pipeline 产出的 `daily_limit`，并由
`scripts/pipeline/public_catalog.py` 基于 `config/limit-scopes.json` 补充以下可选字段：

| 字段 | 含义 |
|------|------|
| `limit_scope` | `share`（单份额）、`series_shared`（系列共同额度）、`unknown`（范围未核验） |
| `limit_group_id` | 人工核验的共同额度组 ID；仅同一真实额度组使用相同值 |
| `limit_currency` | 额度币种，缺失时回退 share 的 `currency` |
| `limit_source` / `limit_source_url` | 基金公司公告或可靠来源及链接 |
| `limit_effective_date` / `limit_expires_at` | 公告生效日与可选失效日；过期记录降级为 `unknown` + `expired` |
| `limit_verified_at` | 人工核验日 |
| `limit_confidence` | `official`、`verified` 或 `unverified` |
| `limit_status` | `active`、`expired`、`unverified` 或 `unknown` |

`daily_limit` 仍是原始数值，不允许把展示字符串写回数据。暂停申购、开放申购和
额度缺失不能互相冒充：暂停不是 0 元限购；开放申购即使残留数字也不参与限购排序。
多份额系列如果没有人工核验记录，全部标记为 `unknown`，不得仅因 A/C 名称、代码、
金额相同就推断共同额度。

### 限购排序规则

1. 收藏基金始终置顶。
2. 收藏组内部按默认份额的已确认 `daily_limit` 排序。
3. 人民币组在美元组之前；只有同币种金额才参与数值比较，不做跨币种换算或直接比较。
4. 降序/升序只改变同币种金额顺序。
5. 暂停、开放、额度缺失和未确认数值始终置底。
6. 系列行显示“默认份额”口径；全部份额的真实额度在详情份额表中逐行展示，不做求和。

### 状态语义

- `ok`：分类齐全，所有可用价格字段完整且未超过 7 天。
- `degraded`：目录可消费，但存在缺失价格或陈旧净值；前端显示可见提示。
- `error`：分类文件缺失、结构损坏或没有任何系列；前端停止依赖该目录的基金操作。

### 兼容性规则

1. 增加可选字段不升版本。
2. 删除字段、修改字段类型或改变状态语义必须升 `schema_version`。
3. Python 生成器与 `frontend/src/types/data.ts` 必须同步。
4. `test/frontend/catalog.spec.ts` 校验 envelope、分类数和默认份额。

## 其他公共 JSON

- `market-snapshot.json`：首屏市场快照，含 `schema_version`、`generated_at`、`source`。指数、科技股、外汇、黄金与宏观字段均保留原始 `as_of`；`change_pct` 使用百分数单位（如 `-0.54` 表示 -0.54%）。黄金优先使用 `gold-spot.json` 的独立 Au9999 / XAU 报价，此时 `gold.xau.derived = false` 且 `gold.premium_pct` 可计算；没有独立 XAU 时才回退 `au9999 * 31.1034768 / USDCNH` 折算并标记 `derived: true`，此时不计算国内溢价。
- `fx-spot.json`：新浪财经即期汇率快照，`items` 包含 `fxUSDCNY`、`usdcnh`、`fxUSDJPY`、`fxUSDHKD`、`fxCNYHKD`，每条保留 `price`、`change`、`change_pct`、`as_of`、`source`、`source_updated_at`。`market-snapshot.json` 优先使用它，失败时回退 `fx-kline/`。
- `gold-spot.json`：独立黄金快照，`au9999` 为金投网上海金（元/克），`xau` 为新浪伦敦金现货（USD/盎司）；两者都带 `derived: false`。抓取失败时保留上一次成功值。
- `nasdaq-history.json`：纳斯达克 100（`^NDX`）年度序列、YTD、日线收盘最大回撤、月度热力图与 5/10/20 年及全长月份排行。`index.symbol` 必须为 `^NDX`；`as_of` 是最后有效交易日；`heatmap.partial_year` 标记进行中的年份，未结束月份不进入季节性排行。
- `ndx-pe.json`：纳斯达克 100 TTM PE，`source` 为 Siblis Research，`frequency: monthly`、`observation_period: month_end`；`date` 是统计日而不是抓取时间。抓取失败保留旧快照。
- `cnn-fear-greed.json`：当前值、分档和历史序列。
- `nav-history/{code}.json`：日期与净值/收盘序列。
- `holdings/{code}.json`：最近季度 Top10 持仓。
- `southbound.json` v3：南向通产品与份额目录。顶层包含银行合资格名单覆盖说明与来源；每个产品包含官方来源、核验日期、搜索别名、渠道、额度和风险；`shares[]` 保存币种、银行名称/渠道码/核验状态、Bloomberg ticker、ISIN、净值、净值日期、近一年收益及收益截止日。

所有缺失数值在 TypeScript 中映射为 `null`，不伪造成 0；封闭期显示“封闭期”，历史不足显示 `-`。

## 本地数据契约

浏览器数据库为 Dexie/IndexedDB `qdii-tracker`：

- v1：`positions`、`trades`、`notes`、`watchlist`、`strategyLogs`、`meta`
- v2：新增 `noteHistory`

旧 `localStorage` key `qdii-portfolio-v1` 在首次打开时迁移。
JSON 备份当前为 `schema_version: 2`，包含持仓、交易、笔记、笔记历史、观察清单和策略记录。
读取端兼容 v1 备份并自动补空 `noteHistory`。导入先完整校验，再在单个事务中替换；
任何失败回滚，不覆盖旧数据。
