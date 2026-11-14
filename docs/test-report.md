# 最终测试报告（2026-11-15）

## 结论

Vue 前端迁移、公共数据契约、本地 IndexedDB、研究历史、PNG 导出和构建部署链路已完成本地验证。
当前兼容性承诺已收敛为 Chromium/Chrome；浏览器自动化只在本机 Chromium 执行。
Firefox/WebKit 不属于当前支持目标，不参与发布验收。

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

实际执行命令：

```bash
npm run test:t0
npm run test:t3
npx playwright test test/e2e/visual.spec.ts --project=chromium-desktop
npm run build
python fundctl.py check --offline --agent-rules
gh run list --repo zhouminghan/qdii-tracker --limit 30
```

## 浏览器回归

| 引擎/设备 | 结果 | 覆盖 |
|-----------|------|------|
| Chromium 桌面 | 通过 | 导航、Funds、Market、Portfolio、Research、实时行情、axe、视觉基准 |
| Chromium 移动 | 通过 | 底部导航、移动卡片、排序、份额展开、交易、研究、实时行情、axe |

历史 Firefox 启动失败证据保留用于排障记录，但在新的 Chromium-only 策略下不构成发布阻塞。

T3 实际发现 40 条：36 条唯一测试通过，4 条移动端视觉重复项按项目规则跳过。
首次 T3 中 Market 深色视觉基准因纳指标签纠正出现 1 处 1% 像素差异；
检查 diff 后仅更新该基准，四张 Chromium 视觉基准复跑全部通过。

## 本轮恢复与 Reviewer 闭环

| Finding | 处理 | 验证 |
|---------|------|------|
| 纳指综合与纳斯达克 100 标签互换 | 修正标签映射，脉冲卡改用 `100.NDX100` | 定向单测 + Chromium 实时指数 E2E |
| 实时刷新失败后继续展示旧值 | 失败时清空对应实时映射并回退静态快照，显示失败状态 | 模拟 Tencent 失败 E2E |
| ETF/指数共用 loading 导致请求丢失 | 拆分 loading/error/timestamp/in-flight Promise | Chromium 桌面/移动定向 E2E |
| 一次性 timer 与请求未随卸载取消 | 清理 boot timer/interval，为 JSONP 增加 AbortSignal | typecheck/lint + 代码审查 |
| 实时路径浏览器覆盖不足 | 新增 mock Tencent 成功与失败回退 E2E | Chromium 桌面/移动共 4 条通过 |
| CI 测试过重 | Actions 改为只做静态/单测/构建，不安装浏览器、不跑 Playwright | workflow 审计 |
| Harness 提交指针滞后 | 改为记录已验证代码提交 `9c0975f`，避免文档提交造成伪滞后 | `harness/state.json` |

Reviewer 未发现 JSONP 永久脚本泄漏或重复监听；确认正常、错误、超时路径都会清理脚本和计时器。

## 可访问性

- axe-core `wcag2a + wcag2aa`。
- 严重/致命问题：0。
- 覆盖 Market、Funds、Portfolio、Research。
- 覆盖 Chromium 桌面和 Chromium 移动。
- T3 中 Funds/Market/Portfolio/Research 的桌面与移动 axe：8 条通过。
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
- 实时行情成功、失败、旧值清理与纳指标签：Chromium 桌面/移动定向 E2E。
- T3 唯一差异是纳指标签变更导致的 Market 深色视觉基准；检查 diff 后仅更新该基准，四张视觉基准复跑通过。
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
- Firefox/WebKit 未执行；它们不属于当前 Chromium-only 测试与兼容性承诺。

## 测试分级

| 等级 | 命令 | 范围 |
|------|------|------|
| T0 | `npm run test:t0` | 类型、Lint、Vitest |
| T1 | `npm run test:t1` | 当前变更涉及的 Chromium 桌面交互 |
| T2 | `npm run test:t2` | Chromium 桌面集成 + 视觉基准 |
| T3 | `npm run test:t3` | Chromium 桌面 + 移动完整回归 |

浏览器 E2E 只在本机执行；GitHub Actions 不安装浏览器、不运行 Playwright。

## GitHub Actions 性能

基于最近 30 次真实 Actions 记录（截至 2026-11-13）：

| Workflow | 样本 | 最短 | 平均 | 最长 |
|----------|-----:|-----:|-----:|-----:|
| 更新基金数据 | 12 | 308s | 662s | 1388s |
| Deploy Pages | 15 | 20s | 53s | 198s |
| 旧 CI 质量门禁 | 3 | 23s | 26s | 29s |

最近一次增量数据更新（run `43504333117`，总计 533s）：

- Checkout 3s，Python 初始化 2s，依赖安装 8s。
- 基金增量更新 166s。
- 历史净值/K 线/溢价历史 309s，是主要耗时来源。
- 数据一致性校验 12s，快照生成 0s，提交 4s。
- workflow 没有安装或执行任何浏览器。

依赖缓存已由 `setup-python` 和 `setup-node` 配置；剩余瓶颈是外部数据采集，而不是前端测试。
新的轻量 CI 尚未 push，因此没有远程运行耗时；本地配置已移除所有浏览器安装和 Playwright 步骤。

## 仓库治理

- `.gitignore` 覆盖 `node_modules/`、`web/assets/`、coverage、pytest/Playwright 报告、trace、浏览器 profile、日志和临时文件。
- `docs/evidence/` 仅保留正式验收截图。
- `harness/state.json` 已纳入 Git，不包含机器路径或临时日志。
- `git ls-files` 未发现 `node_modules`、构建资源、trace、报告或 profile 被追踪。
- 本轮不重写历史、不删除分支/Tag。

## Git 可追溯性

- 远端基线：`1997131`
- 架构迁移：`a54faed`
- 实时行情加固：`f39e60c`、`92c20b7`
- Chromium-only 策略与轻量 CI：`9c0975f`
- 本轮生产构建验证的代码 SHA：`9c0975f`
- 底层 `origin/main` 未修改，本地提交未 push。

`AGENTS.md` 已补充 Chromium-only、T0–T3、Actions 边界、Commit 规范和 Harness 规则。
`README.md` 已同步本地测试命令、Actions 职责和浏览器支持范围。

## 尚未解决与风险

- 新的轻量 CI 配置尚未 push，因此没有远程执行耗时；已通过 YAML 解析和本地静态审计。
- ECharts 懒加载 chunk gzip 约 208 KB，构建仅提示体积 warning，不影响构建产物。
- 视觉基准当前记录为 macOS Chromium snapshot；跨平台 CI 不执行视觉回归。

## 发布判断

- Chromium/Chrome 目标范围具备发布条件。
- Firefox/WebKit 不在当前兼容性承诺内，不属于发布阻断项。
- Push、Merge、Release、部署和远程设置修改均未执行，等待明确授权。
