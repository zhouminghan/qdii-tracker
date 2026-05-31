// ============================================================================
// idle-scheduler.js  —  智能空闲调度器（避免长时间挂机轮询消耗外部接口配额）
// ============================================================================
// 解决的问题：
//   · 用户把页面挂在后台标签页 24 小时不动 → 每分钟仍在拉外部接口
//   · 单 IP 长期高频访问可能被东财/腾讯标记异常（虽然阈值高，但理论存在）
//   · GitHub Pages 没有服务端，每个用户都是直连，IP 信誉影响个体而非全站
//
// 三层降级策略（命中任一即暂停）：
//   1. 页面不可见（document.hidden）—— Page Visibility API
//   2. 页面虽可见但用户无交互 > 10 分钟 —— 鼠标/键盘事件重置计时器
//   3. 用户回到页面或重新交互 → 立即触发一次刷新 + 恢复定时轮询
//
// 设计取舍：
//   · 不做指数退避（avoidance complexity）：暂停 / 运行 二态足够
//   · 不引入 Worker / requestIdleCallback：浏览器原生 API 已够用
//   · 多个调用方共享同一份 visibility/idle 信号，避免事件监听重复绑定
// ============================================================================

const IDLE_THRESHOLD_MS = 10 * 60 * 1000;  // 10 分钟无交互即视为空闲

// 共享活跃状态（所有 schedule 调用共享）
let lastActivityAt = Date.now();
let activityHooked = false;

function markActive() {
  lastActivityAt = Date.now();
}

function ensureActivityHook() {
  if (activityHooked) return;
  activityHooked = true;
  // passive 提示浏览器无需 preventDefault，对滚动性能友好
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, markActive, { passive: true });
  });
}

function isUserActive() {
  return (Date.now() - lastActivityAt) < IDLE_THRESHOLD_MS;
}

function isPageVisible() {
  return typeof document !== 'undefined' && document.visibilityState !== 'hidden';
}

/**
 * 调度一个轮询任务。
 * 与原生 setInterval 的核心区别：
 *   · 自动跳过 hidden / idle 时段，避免无效请求
 *   · 用户回到页面 / 重新交互时自动 catch-up 一次
 *   · 返回 stop() 函数供取消（虽然本项目暂用不到）
 *
 * @param {() => Promise<void> | void} task        要执行的任务（拉数据）
 * @param {() => number} getIntervalMs              动态间隔（每次调用决定下次多久）—— 支持盘中 / 盘外不同节奏
 * @param {object}   [options]
 * @param {number}   [options.firstDelayMs=0]      首次执行前的延迟（用于等待依赖数据加载，如 etf-premium 等 loadData）
 * @returns {() => void}                            取消函数
 */
export function schedule(task, getIntervalMs, options = {}) {
  const { firstDelayMs = 0 } = options;
  ensureActivityHook();

  let timer = null;
  let stopped = false;
  let wasSuspended = false;  // 上一次 tick 时是否处于暂停态（用于检测"恢复"边沿）

  async function tick() {
    if (stopped) return;
    const suspendNow = !isPageVisible() || !isUserActive();

    if (suspendNow) {
      wasSuspended = true;
      // 暂停期间仍每 30s 轻探测一次，回到活跃即恢复（不会发外部请求）
      timer = setTimeout(tick, 30 * 1000);
      return;
    }

    // 活跃态：执行任务后按正常节奏排下一次
    try {
      await task();
    } catch (e) {
      // 任务自己应当处理失败；此处兜底防止整条调度链断掉
    }
    wasSuspended = false;
    timer = setTimeout(tick, getIntervalMs());
  }

  // Visibility 变化 → 立即触发一次 tick（让暂停的恢复 / 活跃的不变）
  function onVisibility() {
    if (!stopped && isPageVisible() && wasSuspended) {
      // 视为用户回到页面，重置活跃时间防止被 idle 判定卡住
      lastActivityAt = Date.now();
      // 清掉等待中的探测 timer，立即 tick
      if (timer) { clearTimeout(timer); timer = null; }
      tick();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  // 首次启动：firstDelayMs=0 即立即跑；否则延迟指定毫秒
  if (firstDelayMs > 0) {
    timer = setTimeout(tick, firstDelayMs);
  } else {
    tick();
  }

  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

// 暴露给调试用（可选）：在 Console 里 `import('./js/idle-scheduler.js').then(m => m._debug())`
export function _debug() {
  return {
    visible: isPageVisible(),
    active: isUserActive(),
    idleSeconds: Math.round((Date.now() - lastActivityAt) / 1000),
  };
}
