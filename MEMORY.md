# MEMORY — 新 AI 接手后的速读入口

> 这不是文档——是「如果不写下来，下次会话一定会忘记」的东西。
> 读者是**我自己（下次会话）或另一个 AI Agent**。

## 新 AI 必读（先看这 5 个文件）

| 优先级 | 文件 | 为什么 |
|--------|------|--------|
| 1 | `AGENT.md` | 规则 + 命令 + 约束。做任何事之前先读 |
| 2 | `web/js/utils.js` | 公共 deep module：jsonpFetch / openModal / closeModal / classifyBuyStatus |
| 3 | `web/js/main.js` | 前端主逻辑（~1700 行）：STATE / renderCategory / buildCategoryViewModel / renderTrendChart |
| 4 | `scripts/fundctl.py` | 数据流水线统一入口：add / move / refresh / sync / check |
| 5 | `web/js/screenshot.js` | 截图分享独立模块：snapPng 克隆离屏渲染 |

## 架构决策（为什么选了 A 没选 B）

### 纯静态 / Vanilla JS / 无框架
- **决策**：不用 React/Vue/打包工具，纯 `<script>` 加载，全局作用域通信
- **原因**：GitHub Pages 零构建部署；改动频率低，框架 overhead > 收益
- **代价**：没有 import/export，重命名函数/变量需跨文件 grep；模块边界靠注释约定

### 截图用 cloneNode 离屏渲染
- **决策**：`snapPng()` 克隆 `.ss-phone-wrap` → 挂在 `#ss-preview` 下 → `html-to-image` 截取 → 移除克隆
- **原因**：避免改动可见 DOM（杜绝闪烁）；克隆必须在 preview 下（CSS 上下文不丢）
- **踩过坑**：`left:-99999px`（空白）、`position:fixed`（幽灵图）、挂 `document.body`（表错位）

### 截图指标卡用 border 不用 box-shadow
- **决策**：`.ss-mkt-card { border: 1px solid ... }` 替代 `box-shadow: 0 0 0 1px ...`
- **原因**：html-to-image 渲染 box-shadow 在半透明背景上显脏影
- **约束**：7 种风格各自覆盖 `border-color`，`box-shadow` 统一 `none`

### TREND_STATE yMode/digits/navLabel → 显式参数（2026-07-13）
- **决策**：`renderTrendChart(trendDisplay)` / `renderTrendList(pts, trendDisplay)` 接受显式对象，不再读全局 TREND_STATE
- **原因**：消除时序耦合——main.js 和 market-trend.js 之前通过写入/擦除全局对象协调状态
- **向后兼容**：不传参数时 fallback 读 TREND_STATE（market-trend 的 window 调用路径已同步更新）

### Apple 玻璃态 UI 设计（2026-07-13）
- **决策**：全局玻璃拟态 + 随主题切换的中性色系（不固定紫色），深度层次靠 `backdrop-filter` + 阴影
- **原因**：取代此前"不同组件不同配色"的碎片化视觉，统一为「玻璃白 + 深色渐变」双向跟随主题
- **核心模式**：
  - Chip/Tab/分享按钮的激活态 → 亮色深渐变+白字 / 暗色浅渐变+深字
  - 市场卡/弹窗 → `backdrop-filter: blur(16px) saturate(180%)` 玻璃
  - `.market-card:hover` → `translateY(-2px)` 上浮 + 阴影加深
  - 表格行 → hover 紫底高亮（0.15s 平滑过渡）
  - body 字体 → `-apple-system` + `SF Pro Text` + `antialiased`

## 关键约定（容易忘）

### 数据流
- `STATE.data[cat]` 是前端唯一数据源。`offshore-live-nav` / `etf-premium` 直接原地写 STATE（无事件总线）
- 写回后调 `renderCategory(tab)` 触发全量重渲
- 所有轮询都挂在 `idle-scheduler` 下（页面隐藏自动暂停）

### 文件约定
- `web/js/config.js`：纯常量（CATEGORIES / OFFSHORE_GROUPS / GROUP_META 等）
- `web/js/utils.js`：纯函数 + deep module（jsonpFetch / openModal / classifyBuyStatus）
- `web/js/main.js`：状态 + 渲染 + 事件
- `scripts/core/constants.py`：路径 / 分类 / 共享常量（HOLDINGS_CATEGORIES 已收拢到此）
- `scripts/core/utils.py`：通用工具 + 领域工具（calc_series_scale / fetch_and_save_holdings）

## 踩坑记录

### 截图保存
- **`left:-99999px` 离屏** → html-to-image 渲染空白，已弃用
- **`position:fixed` 藏克隆体** → 滚动时穿过半透明遮罩（幽灵图），改用 `position:absolute`
- **挂 `document.body`** → 丢失 `.ss-preview td` 等 CSS → 表头表体错位，改挂 `#ss-preview`

### 指标卡
- **box-shadow 脏影** → 改用 border 描边
- **glass/warm/fresh 风格** → 必须显式 `box-shadow:none`（base 无 shadow 但需防御）

### 表头
- **NAV 日期 `<div>` 换行** → 表头两行过高，改用 `<span>·MM-DD</span>` 内联

### 暗色模式（2026-07-13）
- **截图弹窗 7 种风格需各自深色变体**：`.ss-phone-wrap`/`.ss-inner` 一概亮底色，`html.dark .ss-style-*` 逐个覆盖
- **指标卡 `.ss-mkt-card`**：`html.dark .ss-mkt-card { background: rgba(255,255,255,.05) }` 统一覆盖
- **保存图片强制亮色**：`snapPng()` 截前 `classList.remove('dark')` → 截完恢复
- **分享按钮 `style.cssText`** 覆盖 `.chip` 暗色 → 改为 CSS class `.ss-share-btn`

### 玻璃态 UI
- **`backdrop-filter` 需要 `-webkit-` 前缀**，否则 Safari/iOS 无效果
- **`.market-card` 玻璃态需 `!important`** 覆盖 Tailwind 工具类背景色
- **Tab/Chip/分享按钮激活态统一用中性渐变**（深底白字/浅底深字），不固定紫色——亮暗切换才显合理

## 深模块速查

| 模块 | 位置 | 收拢的重复 |
|------|------|-----------|
| `jsonpFetch()` | `web/js/utils.js` | 7 处 `<script>` 样板 |
| `openModal()` / `closeModal()` | `web/js/utils.js` | 3 套 Modal 生命周期 |
| `classifyBuyStatus()` | `web/js/utils.js` | 2 处申购状态判断 |
| `buildCategoryViewModel()` | `web/js/main.js` | renderCategory 的数据变换分离（2026-07-13） |
| `calc_series_scale()` | `scripts/core/utils.py` | 2 处（enrich/reclassify），fill.py 因防回退保护未收拢 |
| `_normalize_fund_name()` | `scripts/pipeline/scan.py` | 2 处基金名正则清洗（2026-07-13） |
| `fetch_and_save_holdings()` | `scripts/core/utils.py` | 2 处 holdings 抓取链（2026-07-13） |
| `HOLDINGS_CATEGORIES` | `scripts/core/constants.py` | 3 处硬编码 |

## 待办 / 已知限制

- `fill.py::main()` 已拆为 8 子函数，但 Pass 2b（买卖规则）仍是串行，可考虑并行化
- `renderTrendChart`（~220 行）数据/坐标/交互三层仍揉在一起，待下一轮拆分
- 远端 GitHub Pages 访问东方财富 push2/push2his 偶发 `ERR_EMPTY_RESPONSE`（本地正常）
