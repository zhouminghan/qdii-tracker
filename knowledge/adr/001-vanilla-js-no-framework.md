# ADR-001: 纯静态 / Vanilla JS / 无框架

**状态**：accepted
**日期**：2026-07-13
**决策者**：@zhouminghan

## 背景
构建 QDII 基金追踪看板，需要选择前端技术栈。面临 React/Vue 等现代框架与 Vanilla JS 之间的选择。

## 决策
选择 **Vanilla JS + 全局作用域通信**，不用 React/Vue/打包工具。

原因：
1. GitHub Pages 零构建部署 — 不需要 Webpack/Vite 等构建工具
2. 改动频率低 — 基金看板以数据更新为主，前端逻辑相对稳定
3. 框架 overhead > 收益 — ~1700 行 main.js 加几个独立模块，框架引入的复杂度大于解决的问题

## 后果
- ✅ 零构建部署，push 即上线
- ✅ 无依赖版本管理负担
- ❌ 没有 import/export，重命名函数/变量需跨文件 grep
- ❌ 模块边界靠注释约定（如 `utils.js` 的函数通过 `window.xxx = xxx` 暴露）
- ❌ ES Module 文件（offshore-live-nav.js 等）需要 `window.jsonpFetch(...)` 跨作用域引用

## 源码引用
- `web/js/utils.js:96` — `window.jsonpFetch = jsonpFetch;`（全局作用域挂载模式）
- `web/js/utils.js:142-143` — `window.openModal = openModal; window.closeModal = closeModal;`（同上）
- `web/js/main.js:1-10` — ES Module import 声明（`import { API_BASE } from './config.js'`）
- `web/index.html` — `<script>` 标签加载顺序：config.js → utils.js → bj-time.js → ... → main.js（隐式依赖）
