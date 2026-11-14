# 数据源与更新机制

## 公共市场数据

| 数据 | 数据源 | 产物 | 失败策略 |
|------|--------|------|----------|
| 场外基金净值/申购 | 天天基金、pingzhongdata、AKShare | 六个分类 JSON | 保留旧值，nav_date 不回退 |
| ETF 价格/规模 | 东方财富、AKShare | `etf.json` | 保留旧值并标记缺失 |
| 指数/ETF/外汇/科技股 K 线 | 东方财富、腾讯、Yahoo | `index-kline/`、`etf-kline/`、`fx-kline/` | 保留最近成功快照 |
| 美债收益率 | 东方财富 | `macro-rates.json` | 复用旧快照 |
| 纳指历史 | Yahoo `^NDX`、新浪指数兜底 | `nasdaq-history.json` | 保留旧图谱 |
| CNN 情绪 | CNN dataviz 接口 | `cnn-fear-greed.json` | 保留旧值 |
| 黄金与品牌金价 | 本地 K 线、证券之星 | `market-snapshot.json`、`brand-gold.json` | 单字段 `null` |

## 更新链路

```text
GitHub Actions 工作日 22:00（北京时间）
  → fill / nav_history / kline_history / market data
  → fundctl.py check
  → checks/build_snapshot.py
      → snapshot.json / feed.rss
      → market-snapshot.json
      → catalog.json
  → commit data
  → deploy-pages.yml
      → npm ci
      → npm run build
      → upload web/
```

每月完整流水线额外执行 `scan → enrich → fill → holdings`。

## 浏览器端

- 公共数据只读。
- 首次加载 `catalog.json` 与 `market-snapshot.json`，页面按需加载历史序列。
- 不伪造实时数据；页面明确展示快照时间和净值日期。
- 个人资产和研究数据只写 IndexedDB，不上传。
