# MEMORY — 架构决策与踩坑记录

---

## 架构决策记录（ADR）

### `web/js/tailwind.css` — 纯占位文件
- **决策**：用 CDN 引入 Tailwind，本地的 `tailwind.css` 只是占位文件（含 `@tailwind` 指令但从未编译），让所有 CSS 引用路径保持统一 `css/tailwind.css?v=placeholder`，由 `deploy-pages.yml` 自动 bump 版本戳。
- **为什么**：不引入 Node 构建工具链（项目约束：纯静态、零构建）。

### `feedback/` — 验收夹具独立目录
- **决策**：验收相关文件独立成目录，跟 `scripts/`/`web/` 平级。
- **为什么**：`scripts/` 心智是"纯数据流水线"，`feedback/` 心智是"验收真理"，不应混在一个目录里互相污染。

### `snapPng()` 用 `cloneNode` 离屏渲染
- 截图前 `cloneNode(true)` 克隆 `.ss-phone-wrap`，克隆体 `position:fixed; z-index:-1`（沉到弹窗遮罩之下，肉眼不可见但仍在正常布局坐标系内）。
- 直接改原始节点会导致可见的定位跳动；用 `left:-99999px` 挪出视口会导致 `html-to-image` 渲染空白。

---

## 收拢的深模块

### `web/js/utils.js`
- `jsonpFetch(urlOrBuilder, options)`：收拢全项目 7 处 `<script>`+超时+cleanup 样板。
- `openModal(dialogId, options)` / `closeModal(dialogId, focusEl)`：收拢 3 套 Modal 生命周期。
- `classifyBuyStatus(sh)`：收拢申购状态判断（HTML 拼装保持独立，只共享逻辑）。

### `scripts/core/`
- `utils.py::calc_series_scale(shares)`：取 A 类人民币份额规模。`fill.py` 有额外防回退保护，未收拢。
- `constants.py::HOLDINGS_CATEGORIES`：哪些分类需要抓 holdings。

---

## 踩坑记录

### `scan_scenarios.py` — 多行 `fixed_in` 正则
- 初版正则 `[^"\'\n]+` 只截首行，`origin.fixed_in` 常跨行 → 改用 `re.DOTALL` 非贪婪匹配。

### 指标卡轮廓用 `border` 不用 `box-shadow`
- 截图导出时 `box-shadow` 在半透明背景上显脏影 → 改用实体 `border`；7 种风格分别覆盖色调。

### `left:-99999px` 离屏截图渲染空白
- `html-to-image` 对视口外坐标不渲染 → 改用 `z-index:-1` 沉到遮罩之下。

---

## 技术笔记

### 反馈层联动机制（`feedback/scan_scenarios.py`）
- `git diff` 改动文件 → 正则匹配 `ui_scenarios/*.yaml` 的 `origin.fixed_in` → 提示该重跑回归场景。
- 已接入 `fundctl.py check` + `.git/hooks/pre-commit`（均为 non-blocking 提示）。
- 解决了"改了代码却忘了这里已有固化回归场景"的记忆漂移问题。
