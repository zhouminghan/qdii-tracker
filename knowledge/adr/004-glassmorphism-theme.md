# ADR-004: Apple 玻璃态 UI 设计

**状态**：accepted
**日期**：2026-07-13
**决策者**：@zhouminghan

## 背景
前端视觉经历过多次调整：从"不同组件不同配色"到统一的现代化视觉语言。需要选择一套可维护的视觉系统。

## 决策
选择 **Apple 玻璃拟态（Glassmorphism）+ 随主题切换的中性色系**（不固定紫色）。

核心模式：
- Chip/Tab/分享按钮的激活态 → 亮色深渐变+白字 / 暗色浅渐变+深字
- 市场卡/弹窗 → `backdrop-filter: blur(16px) saturate(180%)` 玻璃效果
- `.market-card:hover` → `translateY(-2px)` 上浮 + 阴影加深
- 表格行 hover → 紫底高亮（0.15s 平滑过渡）
- body 字体 → `-apple-system` + `SF Pro Text` + `antialiased`

原因：统一碎片化视觉为「玻璃白 + 深色渐变」双向跟随主题，暗色模式自动适配。

## 后果
- ✅ 统一的视觉语言，亮暗切换自然
- ✅ backdrop-filter 提供深度层次感（毛玻璃效果）
- ❌ **`backdrop-filter` 需要 `-webkit-` 前缀**（Safari/iOS 兼容）
- ❌ `.market-card` 玻璃态需 `!important` 覆盖 Tailwind 工具类背景色
- ❌ html-to-image 截图需临时移除 `backdrop-filter`（iPhone 兼容，见 `screenshot.js`）

## 源码引用
- `web/css/app.css` — 玻璃态规则（`.market-card`、`detailModal`、`trendModal` 的 `backdrop-filter`）
- `web/css/app.css` — `.market-card:hover` 上浮动画
- `web/css/app.css` — 暗色模式覆盖（`html.dark .market-card { background: rgba(255,255,255,.05) }`）
- `web/js/screenshot.js:snapPng()` — iPhone 截前移除 `backdrop-filter`
