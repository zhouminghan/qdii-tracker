# 最终测试报告（2026-11-14）

## 结论

Vue 前端迁移、公共数据契约、本地 IndexedDB、研究历史、PNG 导出和构建部署链路已完成本地验证。
Chromium 桌面/移动与 WebKit 的核心流程、axe 检查和生产构建 smoke test 通过。
Firefox 测试引擎在本机启动阶段被 Playwright Firefox profile 错误阻断，业务页面尚未开始执行。

## 自动化结果

| 检查 | 结果 | 证据 |
|------|------|------|
| TypeScript | 通过 | `npm run typecheck` |
| ESLint | 通过 | `npm run lint` |
| Vitest | 8 个文件 / 26 条通过 | `npm test` |
| Python pytest | 96 条通过 | `pytest test/ -q` |
| 数据门禁 | Layer 0–6 通过 | `fundctl.py check --offline` |
| Agent 规则 | 7 层通过 | `fundctl.py check --offline --agent-rules` |
| 生产构建 | 通过 | `npm run build` |
| 生产静态 smoke | 4 页通过，0 console/page error | `http://127.0.0.1:8766/` |
| npm 安全审计 | 0 vulnerabilities | `npm audit` / `npm audit --omit=dev` |

## 浏览器回归

| 引擎/设备 | 结果 | 覆盖 |
|-----------|------|------|
| Chromium 桌面 | 18 条通过 | 导航、Funds、PNG、对比、Market/DCA、Portfolio、Research、4 页 axe、4 张视觉基准 |
| Chromium 移动 | 14 条通过 | 底部导航、移动基金卡片、移动排序、份额展开、交易、研究、4 页 axe |
| WebKit 桌面 | 14 条通过 | Chromium 交互批次；含 4 页 axe |
| Firefox 桌面 | 未启动 | Firefox 159 报 `Could not find profile folder`；Firefox 150 在 Playwright 1.65/1.60 下 30 秒内未建立会话 |

Firefox 错误发生在浏览器进程启动或协议握手阶段，不是页面断言失败。该问题记录为本地测试环境阻塞，
未虚报为通过，也不再重复重试。

## 可访问性

- axe-core `wcag2a + wcag2aa`。
- 严重/致命问题：0。
- 覆盖 Market、Funds、Portfolio、Research。
- 覆盖 Chromium 桌面、Chromium 移动、WebKit 桌面。
- DCA 横向矩阵在移动端改为可读的纵向布局；桌面矩阵可聚焦。

## 视觉回归

桌面 Chromium 基准：

- `funds-desktop-light.png`
- `market-desktop-dark.png`
- `funds-mobile-light.png`
- `portfolio-mobile-dark.png`

基准由人工检查后生成，并非在完整回归中自动接受差异。验收截图位于 `docs/evidence/`。

## 数据与功能验证

- 基金搜索、单字段排序、缺失值置底、收藏置顶、A/C 份额展开。
- 场内/场外切换与溢价显示。
- 场内 ETF / 指数 Tencent 实时行情覆盖：请求失败时自动回退静态快照；解析器定向单测通过。
- 详情抽屉、历史走势、持仓与费率。
- CSV 和 PNG（PNG 文件头、大小均验证）。
- 多基金归一化走势对比。
- Portfolio 持仓保存、交易新增、修改、删除、刷新持久化。
- Research 笔记创建、刷新持久化、修改历史。
- v1/v2 JSON 备份解析与事务回滚测试。
- localStorage → Dexie 迁移和幂等测试。
- DCA 规则与 Python 边界一致性。

## 构建

- Vite 内容哈希资源。
- 主应用 gzip 约 52 KB。
- ECharts 独立懒加载 chunk gzip 约 208 KB。
- `web/data/`、`web/index.html`、manifest、Service Worker 在生产静态服务器可用。
- 实时行情覆盖层改动后已做定向 `vue-tsc`、ESLint、Vitest 和生产构建；遵循本轮要求，未重复执行完整浏览器回归。

## 未执行

- 未 `git push`。
- 未部署 GitHub Pages。
- 未修改远程仓库设置。
- Firefox 自动化受本机浏览器启动问题阻塞，见上。
