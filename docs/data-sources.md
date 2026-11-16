# 数据源与更新机制

## 公共市场数据

| 数据 | 数据源 | 产物 | 失败策略 |
|------|--------|------|----------|
| 场外基金净值/申购 | 天天基金、pingzhongdata、AKShare | 六个分类 JSON | 保留旧值，nav_date 不回退 |
| 区间收益补算 | 本地 `nav-history/`、pingzhongdata | 六个分类 JSON | 只填 `null`，不覆盖已有公开值；封闭期份额不伪造净值 |
| 南向通渠道资料 | 基金公司官方产品/业绩页、建行亚洲南向通合资格基金筛选器、银行 APP 人工核验 | `southbound.json` | 官方页提供份额代码、ISIN、净值与收益；银行渠道码来自公开合资格名单，实际可购状态仍以 APP 当日信息为准。建行亚洲 2026-11-15 显示 344 个合资格份额，名单按销售银行动态变化 |
| ETF 价格/规模 | 东方财富、AKShare | `etf.json` | 保留旧值并标记缺失 |
| 指数/ETF/外汇/科技股 K 线 | 东方财富、腾讯、Yahoo | `index-kline/`、`etf-kline/`、`fx-kline/` | 保留最近成功快照 |
| 实时汇率 | 新浪财经 `hq.sinajs.cn`（USD/CNY、USD/CNH、USD/JPY、USD/HKD、CNY/HKD） | `fx-spot.json` | 保留最近成功快照；`market-snapshot.json` 优先读取，缺失回退 K 线 |
| 美债收益率 | 美国财政部官方 CSV → FRED → 东方财富 | `macro-rates.json` | 复用旧快照 |
| VIX | Yahoo Finance → FRED `VIXCLS` | `market-temperature.json` | 复用旧值 |
| 纳指历史 | Yahoo `^NDX`、新浪指数兜底 | `nasdaq-history.json` | 保留旧图谱 |
| CNN 情绪 | CNN dataviz 接口 | `cnn-fear-greed.json` | 保留旧值 |
| 黄金 | 金投网 Au9999、新浪 `hf_XAU` 伦敦金、本地 K 线兜底 | `gold-spot.json`、`market-snapshot.json` | 保留最近成功值；无独立 XAU 时回退折算且不计算溢价 |
| 品牌金价 | 证券之星 | `brand-gold.json` | 单字段 `null` |

## 更新链路

```text
GitHub Actions 工作日 22:00（北京时间）与次日 00:30 兜底
  → fill / nav_history / performance / kline_history / market data
  → fx_spot / gold_spot（实时汇率与黄金）
  → macro_rates / market_temperature / ndx_pe
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
- 市场快照、实时汇率与黄金快照都落在 `web/data/*.json` 并由 GitHub Actions 提交到仓库；浏览器不用 localStorage 保存公共行情。
- 不伪造实时数据；页面明确展示快照时间和净值日期。
- Tencent 实时覆盖请求失败时清空该域旧实时值并回退静态 JSON，同时显示失败状态。
- 个人资产和研究数据只写 IndexedDB，不上传。
