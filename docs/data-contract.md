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
    "warnings": [],
    "errors": []
  }
}
```

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

- `market-snapshot.json`：首屏市场快照，含 `schema_version`、`generated_at`、`source`。
- `nasdaq-history.json`：纳指年度序列、月度热力图与排行。
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
