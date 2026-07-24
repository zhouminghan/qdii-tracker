# screenshot-js — 截图分享模块

**文件**：`web/js/screenshot.js` (~591 行)
**上游**：用户点击分享按钮 → `window.openScreenshotModal(tab, seriesList, groups)`
**下游**：`html-to-image` CDN（懒加载）→ PNG 下载 / `navigator.share()` 存相册
**updated**：2026-07-24

## 入口
```javascript
window.openScreenshotModal(tab, seriesList, groups)
```
IIFE 模块，全局暴露 `openScreenshotModal`。

## 核心流程

### 1. 打开弹窗
- `openScreenshotModal()` — 接收当前 tab 和 series 数据
- 展平数据：`flattenByGroup()` 取每个系列的默认份额

### 2. 列筛选面板
- 场外 8 列（name/code/buy_status/nav/chg_1m/chg_ytd/chg_1y/chg_since_inception）
- ETF 9 列（name/code/buy_status/etf_price/etf_premium/nav/chg_1m/chg_ytd/chg_1y）
- `locked:true`（name）不显示筛选面板；`sortable:true` 可排序

### 3. 渲染卡片
- **3 种布局** × **7 种风格**：dense/comfortable/spacious 布局；cute/dark/minimal/vivid/warm/fresh/classic 风格
- **卡片结构**：外层 `.ss-phone-wrap`（唯一带边框）+ 内层 `.ss-inner` × 2（无边框）
- 市场参照系指标卡（`.ss-mkt-card`）→ 5 张实时指标卡

### 4. 导出 PNG — `snapPng()`
- `cloneNode(true)` 克隆 `.ss-phone-wrap`
- 挂到 `#ss-preview`（relative 容器）下
- 截前：`clone.style.boxShadow='none'` + `classList.remove('dark')`（强制亮色）
- `html-to-image.toPng(clone)` → 截取
- 移除克隆体 → 恢复暗色（如需要）
- 桌面端：下载 PNG；移动端：`navigator.share()` 存相册

## 关键函数表

| 函数 | 行号 | 作用 |
|------|------|------|
| `openScreenshotModal()` | ~70 | 入口：打开截图弹窗 |
| `flattenByGroup()` | 66 | 数据展平（仅取默认份额） |
| `snapPng()` | ~400 | 核心：cloneNode → html-to-image → PNG |
| `buildScreenshotHtml()` | ~200 | 构建截图 HTML（7 风格 × 3 布局） |
| `applyStyle()` | ~300 | 应用风格到克隆 DOM |
| `statusBadgeHtml()` | ~150 | 申购状态徽章 HTML（截图专用，复用 classifyBuyStatus） |

## 数据依赖

| 读文件 | 写文件 | 外部 API |
|--------|--------|----------|
| `web/data/{cat}.json` (via STATE.data) | — | `html-to-image` CDN (懒加载) |
| `config.js` (COMPANY_BRAND) | | |

## 约束
- 卡片结构不可改：外层 `.ss-phone-wrap` + 内层 `.ss-inner` × 2
- 指标卡用 border 不用 box-shadow（ADR-003）
- 克隆必须挂 `#ss-preview` 下（CSS 上下文不丢）
- 截前必须移除 backdrop-filter（iPhone 兼容）
- `html-to-image` CDN 懒加载 — 首屏不加载 lib
