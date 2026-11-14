# 最终测试报告（2026-11-14）

## 结论

Vue 前端迁移、公共数据契约、本地 IndexedDB、研究历史、PNG 导出和构建部署链路已完成本地验证。
Chromium 桌面/移动与 WebKit 的核心流程、axe 检查和生产构建 smoke test 通过。
Firefox 测试引擎在 macOS 27.2 的浏览器启动/应用注册阶段失败，业务页面尚未开始执行。

## 自动化结果

| 检查 | 结果 | 证据 |
|------|------|------|
| TypeScript | 通过 | `npm run typecheck` |
| ESLint | 通过 | `npm run lint` |
| Vitest | 8 个文件 / 27 条通过 | `npm test` |
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
| Firefox 桌面 | BLOCKED | Firefox 159 报 `Could not find profile folder`；受限上下文在 `_RegisterApplication` 处 SIGABRT；Firefox 150 也无法完成会话 |

Firefox 分类为 C+E：profile 初始化表现异常，同时 macOS 应用注册阶段崩溃。
Playwright 1.65.1 与 Firefox 159 版本匹配，缓存签名有效，profile 参数路径实际存在，
且失败发生在页面执行和 Juggler 协议握手之前，不是项目页面代码错误。

## 本轮恢复与 Reviewer 闭环

| Finding | 处理 | 验证 |
|---------|------|------|
| 纳指综合与纳斯达克 100 标签互换 | 修正标签映射，脉冲卡改用 `100.NDX100` | 定向单测 + Chromium/WebKit 实时指数 E2E |
| 实时刷新失败后继续展示旧值 | 失败时清空对应实时映射并回退静态快照，显示失败状态 | 模拟 Tencent 失败 E2E |
| ETF/指数共用 loading 导致请求丢失 | 拆分 loading/error/timestamp/in-flight Promise | 三引擎定向 E2E |
| 一次性 timer 与请求未随卸载取消 | 清理 boot timer/interval，为 JSONP 增加 AbortSignal | typecheck/lint + 代码审查 |
| 实时路径浏览器覆盖不足 | 新增 mock Tencent 成功与失败回退 E2E | Chromium 桌面/移动、WebKit 共 6 条通过 |
| CI 只覆盖 Chromium | `ci.yml` 增加 Chromium、Firefox、WebKit 矩阵 | workflow 静态检查 |
| Harness 提交指针滞后 | 改为记录已验证代码提交 `92c20b7`，避免文档提交造成伪滞后 | `harness/state.json` |

Reviewer 未发现 JSONP 永久脚本泄漏或重复监听；确认正常、错误、超时路径都会清理脚本和计时器。

## 可访问性

- axe-core `wcag2a + wcag2aa`。
- 严重/致命问题：0。
- 覆盖 Market、Funds、Portfolio、Research。
- 覆盖 Chromium 桌面、Chromium 移动、WebKit 桌面。
- 本轮受影响页面重新执行 Funds/Market axe：6 条通过。
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
- 实时行情成功、失败、旧值清理与纳指标签：Chromium 桌面/移动、WebKit 共 6 条定向 E2E 通过。
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

## 发布判断

- Chromium 与 WebKit 目标范围具备发布条件。
- Firefox 为未关闭的 BLOCKED 验收项，不能由其他浏览器结果替代。
- 是否继续将 Firefox 作为发布阻断项，需要项目负责人确认兼容性承诺。
- Push、Merge、Release、部署和远程设置修改均未执行，等待明确授权。
