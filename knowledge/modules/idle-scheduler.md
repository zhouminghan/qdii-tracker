# idle-scheduler — 智能空闲调度器

**文件**：`web/js/idle-scheduler.js` (122 行)
**上游**：`main.js` / `offshore-live-nav.js` / `etf-premium.js` / `market-indices.js` 的轮询初始化
**下游**：各轮询模块的 task 函数
**updated**：2026-07-24

## 入口
```javascript
import { schedule } from './idle-scheduler.js';
const stop = schedule(taskFn, getIntervalMs, { firstDelayMs: 0 });
```
ES Module，导出 `schedule()` 函数。

## 核心流程

### 三层降级策略（命中任一即暂停）
1. **页面不可见**（`document.hidden`）— Page Visibility API
2. **页面可见但用户无交互 > 10 分钟** — 鼠标/键盘事件重置计时器
3. **用户回到页面或重新交互** — 立即触发一次 catch-up + 恢复定时轮询

### schedule() 函数 (line 60-113)
- 共享活跃状态：所有 schedule 调用共享同一个 `lastActivityAt` 和事件监听
- 暂停时每 30s 轻探测一次 visibility/idle 状态变更
- Visibility 变化 → 立即触发 tick 恢复轮询

## 关键函数表

| 函数 | 行号 | 作用 |
|------|------|------|
| `schedule()` | 60 | 出口：创建调度任务 |
| `isPageVisible()` | 43 | Page Visibility API 检查 |
| `isUserActive()` | 39 | 用户活跃度检查（10 分钟阈值） |
| `markActive()` | 26 | 交互事件回调（重置 `lastActivityAt`） |
| `ensureActivityHook()` | 30 | 单次绑定 5 种事件监听 |
| `_debug()` | 116 | 暴露调试信息（Console 可用） |

## 数据依赖

| 读文件 | 写文件 | 外部 API |
|--------|--------|----------|
| — | — | — （纯浏览器 API） |

## 约束
- 不做指数退避（avoidance complexity）：暂停/运行二态足够
- 不引入 Worker / requestIdleCallback：浏览器原生 API 已够用
- 多个调用方共享同一份 visibility/idle 信号，避免事件监听重复绑定
- `lastActivityAt` 初始化为 `Date.now()`（启动时不算空闲）
