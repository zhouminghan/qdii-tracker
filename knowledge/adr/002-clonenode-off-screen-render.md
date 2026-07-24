# ADR-002: 截图用 cloneNode 离屏渲染

**状态**：accepted
**日期**：2026-07-13
**决策者**：@zhouminghan

## 背景
需要实现截图分享功能。面临三种渲染方案：直接截可见 DOM（有闪烁问题）、canvas 重绘（工作量极大）、cloneNode 离屏渲染。

## 决策
选择 **`cloneNode(true)` 克隆 DOM → 挂在 `#ss-preview` 容器下 → `html-to-image` 截取 → 移除克隆**。

原因：
1. 避免改动可见 DOM — 杜绝闪烁
2. 克隆必须在 `#ss-preview` 下 — `app.css` 的选择器（`.ss-preview td` 等）才能正确匹配
3. `html-to-image` CDN 懒加载 — 仅在用户打开截图弹窗时加载，不增加首屏体积

## 后果
- ✅ 所见即所得 — 克隆体渲染效果与原始 DOM 完全一致
- ✅ 零闪烁 — 截完即删，用户看不到克隆体
- ❌ 克隆体 `position:absolute` 必须挂在 `#ss-preview`（relative 定位容器）下 — 挂错位置丢 CSS 上下文
- ❌ 截前必须 `clone.style.boxShadow = 'none'` — html-to-image 渲染半透明 box-shadow 显脏影
- ❌ 截前必须 `classList.remove('dark')` — 暗色模式导出图片偏暗，需强制亮色

## 源码引用
- `web/js/screenshot.js:snapPng()` — 克隆离屏渲染主函数
- `web/css/app.css:.ss-preview` — 容器 `position:relative` 约束
- `web/css/app.css:.ss-mkt-card` — border 替代 box-shadow（见 ADR-003）
