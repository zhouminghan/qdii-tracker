# 已知坑点（Gotchas）

> 含源码行号 + 生命周期管理。同一坑 3 次复发 → 提示升级到 AGENT.md Critical Rules。

| ID | 现象 | 根因 | 源码位置 | 状态 | 发现日期 | 修复日期 |
|----|------|------|----------|------|----------|----------|
| G001 | 截图空白 | cloneNode `left:-99999px` 离屏 → html-to-image 渲染空白 | `web/js/screenshot.js:snapPng()` | ✅已修复 | 2026-07-13 | 2026-07-13 |
| G002 | 表格错位 | 克隆挂 `document.body` → 丢 CSS 上下文（`.ss-preview td` 等选择器匹配不到） | `web/js/screenshot.js:snapPng()` | ✅已修复 | 2026-07-13 | 2026-07-13 |
| G003 | 指标卡脏阴影 | html-to-image 渲染 `box-shadow` 在半透明背景上显脏影 | `web/css/app.css:.ss-mkt-card` | ✅已修复 | 2026-07-13 | 2026-07-13 |
| G004 | backdrop-filter 无效果 | 缺 `-webkit-` 前缀 → Safari/iOS 无效 | `web/css/app.css:玻璃态规则` | ✅已修复 | 2026-07-13 | 2026-07-13 |
| G005 | 远程 API ERR_EMPTY_RESPONSE | 东方财富 push2/push2his 对 GitHub Pages 跨站来源限制访问（本地正常） | `web/js/market-indices.js:fetchAll()` / `web/js/market-trend.js:fetchDayKFromHost()` | ⚠️已知限制 | 2026-07 | — |
| G006 | 截图弹窗暗色消失 | `snapPng()` 截完恢复暗色时 `classList.add('dark')` 覆盖了截前的 `classList.remove` → 截完可能丢失暗色 | `web/js/screenshot.js:snapPng()` | ✅已修复 | 2026-07-13 | 2026-07-13 |
| G007 | NAV 日期 `<div>` 换行 | 表头 `<div>` 自动换行导致两行过高 | `web/index.html` 净值列 | ✅已修复 | 2026-07-13 | 2026-07-13 |
| G008 | scan 后不接 enrich+fill | scan 覆盖现有 JSON → 丢失 enrich 填充的规模和费率数据 | `scripts/fundctl.py:cmd_sync()` (line 85-90 串行正确) | ✅已修复 | — | — |
| G009 | LOF chg_ytd 为空 | LOF 场内份额不暴露场外收益字段 | `scripts/pipeline/fill.py:_fill_ytd()` → 取同系列兄弟份额兜底 | ✅已修复 | — | — |
| G010 | 份额 key 顺序不一致 | 多脚本写盘时 dict key 顺序依赖插入顺序 → diff 噪音 | `scripts/core/constants.py:STANDARD_SHARE_KEY_ORDER` (line 82-92) → `utils.py:normalize_share_keys()` (line 142-161) | ✅已修复 | — | — |

## Gotchas 生命周期规则
- 已修复 → 保留条目，标记 `✅已修复`（不删——后人要知道坑存在过）
- 新发现 → 追加，标记 `🐛待修复`
- 同一坑 3 次复发 → 提示升级到 AGENT.md Critical Rules
- 每月审查一次：标记 `✅已修复` 超过 6 个月的条目可考虑归档

## 编码约定速查（易忘坑点）

1. **nav_date 永不回退**：lsjz 失败保留旧值，禁用 `datetime.now()` 推算
2. **数据文件不写时间戳**：仅 `meta.json` 保留 `generated_at`，避免 diff 噪音
3. **写盘前 normalize**：`normalize_share_keys()` / `normalize_holdings_keys()`
4. **ETF 无申购历史**：`_update_history()` 跳过 `"场内"` 和美元份额
5. **截图 cloning**：必须挂 `#ss-preview` 下 → `position:absolute` → 截前 `boxShadow='none'` + `classList.remove('dark')`
6. **指标卡用 border 不用 box-shadow**：7 种风格各自覆盖 `border-color`，`box-shadow` 统一 `none`
