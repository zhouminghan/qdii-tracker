# ADR-003: 截图指标卡用 border 不用 box-shadow

**状态**：accepted
**日期**：2026-07-13
**决策者**：@zhouminghan

## 背景
截图分享的指标卡（市场参照系卡片）需要视觉边框。面临 `box-shadow` 描边与 `border` 描边的选择。

## 决策
选择 **`.ss-mkt-card { border: 1px solid ... }`** 替代 `box-shadow: 0 0 0 1px ...`。

原因：
- html-to-image 库渲染 `box-shadow` 在半透明背景上产生脏影（灰黑边缘模糊）
- `border` 在 html-to-image 中渲染清晰，无伪影

## 后果
- ✅ 截图清晰无伪影 — 7 种风格卡片边框均正常
- ❌ 约束：7 种风格（glass/warm/fresh/dark/minimal/vivid/classic）各自覆盖 `border-color`
- ❌ 必须显式 `box-shadow: none` 防御（base 无 shadow 但需要覆盖 Tailwind 默认）

## 源码引用
- `web/css/app.css:.ss-mkt-card` — `border: 1px solid` 替代 `box-shadow`
- `web/css/app.css` — 7 种风格 `html.dark .ss-style-* .ss-mkt-card` 覆盖规则
- `web/js/screenshot.js:snapPng()` — 截前 `clone.style.boxShadow = 'none'`（见 ADR-002）
