# ADR-005: TREND_STATE 显式参数化

**状态**：accepted
**日期**：2026-07-13
**决策者**：@zhouminghan

## 背景
`renderTrendChart()` 和 `renderTrendList()` 原本通过读写全局 `TREND_STATE` 对象协调状态。`main.js`（基金走势）和 `market-trend.js`（指标 K 线）两个调用方通过写入/擦除全局对象的方式传递参数，存在时序耦合问题。

## 决策
**`renderTrendChart(trendDisplay)` / `renderTrendList(pts, trendDisplay)` 接受显式参数对象**，不再读全局 TREND_STATE。

`trendDisplay` 对象包含：
- `yMode`: `'value'`（指数绝对值）或 `'pct'`（基金百分比）
- `digits`: 数值精度
- `navLabel`: 坐标轴标签文案

原因：消除时序耦合 — 调用方传入显式参数，无需依赖全局对象的状态迁移顺序。

## 后果
- ✅ 消除时序耦合，调用方无副作用
- ✅ 向后兼容：不传参数时 fallback 读 TREND_STATE（market-trend 的 window 调用路径已同步更新）
- ❌ 两个调用方（main.js / market-trend.js）需要各自构造 trendDisplay 对象

## 源码引用
- `web/js/main.js` — `renderTrendChart(trendDisplay)` 显式参数版
- `web/js/main.js` — `renderTrendList(pts, trendDisplay)` 显式参数版
- `web/js/market-trend.js` — 调用 `window.renderTrendChart(chartData)` / `window.renderTrendList(pts, chartData)`（通过 window 桥接）
