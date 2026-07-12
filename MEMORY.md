# MEMORY — 架构决策 + 踩坑 + 快速索引

## 深模块速查（2026-07-12 架构深化）

| 模块 | 位置 | 收拢的重复 |
|------|------|-----------|
| `jsonpFetch()` | `web/js/utils.js` | 7 处 `<script>`+超时+cleanup 样板 |
| `openModal()` / `closeModal()` | `web/js/utils.js` | 3 套 Modal 生命周期 |
| `classifyBuyStatus()` | `web/js/utils.js` | 2 处申购状态判断 |
| `calc_series_scale()` | `scripts/core/utils.py` | 2 处 series_scale 计算（fill.py 未收拢） |
| `HOLDINGS_CATEGORIES` | `scripts/core/constants.py` | 3 处硬编码分类白名单 |

## 踩坑：截图保存

### 不能用 `left:-99999px` 离屏
- `html-to-image` 对视口外坐标渲染结果为空白（推测内部依赖 viewport 坐标采样）
- 先踩坑后弃用

### 克隆体必须挂在 `#ss-preview` 下
- 挂到 `document.body` 会丢失 `.ss-preview td` / `.ss-preview table` 等父级前缀选择器
- 后果：`white-space:nowrap` / `border-collapse:separate` / `border-spacing:0` 全部丢失 → 表头表体列宽不一致

### 不能用 `position:fixed` 藏克隆体
- `z-index:-1` 在 `position:fixed` 下，页面滚动时克隆体会穿过半透明遮罩短暂可见（幽灵图）
- 解决方案：`position:absolute` + `#ss-preview{position:relative}`

## 踩坑：指标卡

### 轮廓用 border 不用 box-shadow
- 截图导出时 box-shadow 在半透明背景上显脏影
- 7 种风格各自覆盖 `border-color`，`box-shadow` 统一 `none`

## 踩坑：表头

### NAV 日期内联不用 div 换行
- `<div>` 副标题导致表头两行高度 → 表头明显高于数据行
- `<span>·MM-DD</span>` 内联后表头 29px vs 数据行 42px，紧凑且对齐
