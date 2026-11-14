# ADR-0001：前端平台

## 状态

已采纳，2026-11-14。

## 背景

现有前端为 1,346 行主脚本、916 行单页 HTML 和 2,660 行全局 CSS。基金表格、市场图表、个人资产和研究内容需要长期维护，并要建立类型、组件测试和浏览器回归。

## 候选方案

- Vue 3 + TypeScript + Vite。
- React + TypeScript + Vite。
- Svelte + TypeScript + Vite。
- 继续扩展 Vanilla JS。

## 评估

Vue 的单文件组件适合将模板、交互和局部样式放在同一业务边界内，学习与长期维护成本低。Pinia 为基金筛选、主题和设置提供清晰状态边界。TanStack Table 的 Vue adapter 保持表格 DOM 和视觉完全可控，适合 A/C 展开、收藏置顶、自定义单元格与移动卡片映射。ECharts 覆盖走势、资产分布、年度热力图和市场概览，Apache-2.0 许可。Vite 与 Vitest/Playwright 生态衔接直接。

React 同样成熟，但当前团队没有既有 React 业务代码，迁移不会获得复用优势。Svelte 的运行时更轻，但复杂表格和长期生态的团队可替换性不如 Vue。继续使用 Vanilla JS 无法解决模块边界和测试成本。

调研核对：TanStack Table 为 MIT License，当前 README 明确支持 Vue、排序、过滤、分组与虚拟化；Apache ECharts 为 Apache-2.0 License，当前稳定版为 6.1.0，支持声明式交互图表。GitHub API 匿名额度受限，因此维护状态以官方仓库页面和 npm 安装结果交叉确认。

## 决定

采用 Vue 3、TypeScript、Vite、Vue Router、Pinia、TanStack Table、ECharts、Lucide。

## 影响

- 新增 Node 构建步骤，GitHub Pages 部署前必须执行 `npm ci && npm run build`。
- 旧 Vanilla UI 在迁移完成后删除，不长期双轨。
- 首屏图表按页面懒加载，避免 ECharts 进入基础壳包。
- 版本锁定使用 `package-lock.json`，CI 使用 `npm ci`。
