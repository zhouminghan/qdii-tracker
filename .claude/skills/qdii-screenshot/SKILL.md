# QDII 截图分享

## 适用场景
- 修改截图 Modal 布局 / 样式 / 列配置
- 新增字段 / 新风格 / 新布局
- 修复截图导出 bug
- 宽度自适应 / 响应式调整

## 文件清单
- `web/js/screenshot.js` — 渲染 + 导出逻辑
- `web/css/app.css` — 截图专属样式
- `web/js/utils.js` — 共享工具（statusBadge 等）

## 关键规则
- `html-to-image` CDN 懒加载，不内联
- CSS 独立于主样式，在 `app.css` 中
- 卡片结构：外层 `.ss-phone-wrap` 唯一带边框 + 内层 `.ss-inner` × 2
- `snapPng()` 用 cloneNode + z-index:-1 离屏渲染，别用 left:-99999px
- 指标卡用 border 别用 box-shadow
- 窄屏 adapter：chip/col 设 min-width:0

## 验收
- `fundctl.py check`
- 浏览器交互确认（多视口/多风格）
- 截图保存到相册测试（iOS）

## 回归场景
- `feedback/ui_scenarios/ss-save-no-flicker.yaml`
- `feedback/ui_scenarios/ss-mkt-card-border-visible.yaml`
- `feedback/ui_scenarios/modal-lifecycle-contract.yaml`
