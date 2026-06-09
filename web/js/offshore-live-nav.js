import { schedule } from './idle-scheduler.js';

const OFFSHORE_CATEGORIES = ['sp500', 'nasdaq_passive', 'active', 'global_index', 'global_other'];
const LIVE_SOURCE_LSJZ = 'lsjz';
const LIVE_SOURCE_PZD = 'pzd';
const REQUEST_TIMEOUT_MS = 8000;
const CONCURRENCY_LIMIT = 5;
const META_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const RECHECK_AFTER_NEWER_MS = 90 * 60 * 1000;
const BOOTSTRAP_RETRY_MS = 15 * 1000;

// 失败退避基数（毫秒）：连续失败 → 15min / 30min / 60min
const BACKOFF_BASE_MS = 15 * 60 * 1000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;

const codeStates = new Map();

function bjNowParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hh = parseInt(get('hour'), 10) || 0;
  const mm = parseInt(get('minute'), 10) || 0;
  return {
    date: `${year}-${month}-${day}`,
    hh,
    mm,
    minutes: hh * 60 + mm,
    ts: Date.now(),
  };
}

function inLiveWindow(parts) {
  return parts.minutes >= 15 * 60 && parts.minutes < 24 * 60;
}

function getIntervalMsByBjTime(parts) {
  if (inLiveWindow(parts)) {
    // 15:00–22:00 每 10 分钟
    if (parts.minutes < 22 * 60) return 10 * 60 * 1000;
    // 22:00–24:00 每 60 分钟
    return 60 * 60 * 1000;
  }
  // 非实时窗口：30 分钟（meta.json 检查仍会执行）
  return 30 * 60 * 1000;
}

function compareDate(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function clearLiveOverlay(share) {
  if (!share) return false;
  const hasLive = share._live_nav != null || share._live_daily_change != null || share._live_nav_date || share._live_nav_source || share._live_nav_updated_at;
  if (!hasLive) return false;
  delete share._live_nav;
  delete share._live_daily_change;
  delete share._live_nav_date;
  delete share._live_nav_source;
  delete share._live_nav_updated_at;
  return true;
}

function getDefaultShare(series) {
  if (!series || !Array.isArray(series.shares) || !series.shares.length) return null;
  const defCode = series.default_share_code;
  return series.shares.find(s => s.code === defCode) || series.shares[0] || null;
}

function collectOffshoreDefaultShares(state) {
  const out = new Map();
  for (const cat of OFFSHORE_CATEGORIES) {
    const seriesList = state?.data?.[cat]?.series || [];
    for (const series of seriesList) {
      const def = getDefaultShare(series);
      if (def?.code && !out.has(def.code)) out.set(def.code, def);
    }
  }
  return out;
}

// ==================== 数据源 1: lsjz（主选） ====================
function fetchLsjzLatest(code) {
  return new Promise((resolve) => {
    const cbName = `jsonp_lsjz_${code}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const s = document.createElement('script');
    s.async = true;

    const cleanup = () => {
      try { delete window[cbName]; } catch (_) { window[cbName] = undefined; }
      try { s.remove(); } catch (_) {}
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, REQUEST_TIMEOUT_MS);

    window[cbName] = (resp) => {
      clearTimeout(timer);
      try {
        const item = resp?.Data?.LSJZList?.[0];
        if (!item) {
          cleanup();
          resolve(null);
          return;
        }
        const nav = parseFloat(item.DWJZ);
        const dailyChange = parseFloat(item.JZZZL);
        const navDate = item.FSRQ || '';
        if (!navDate || !Number.isFinite(nav)) {
          cleanup();
          resolve(null);
          return;
        }
        cleanup();
        resolve({
          nav,
          dailyChange: Number.isFinite(dailyChange) ? dailyChange : null,
          navDate,
          source: LIVE_SOURCE_LSJZ,
        });
      } catch (_) {
        cleanup();
        resolve(null);
      }
    };

    const params = new URLSearchParams({
      callback: cbName,
      fundCode: String(code),
      pageIndex: '1',
      pageSize: '1',
      _: String(Date.now()),
    });
    s.src = `https://api.fund.eastmoney.com/f10/lsjz?${params.toString()}`;
    s.onerror = () => {
      clearTimeout(timer);
      cleanup();
      resolve(null);
    };
    document.head.appendChild(s);
  });
}

// ==================== 数据源 2: pingzhongdata（兜底） ====================
// 从 fund.eastmoney.com/pingzhongdata/{code}.js 解析 Data_netWorthTrend 最后一条
//   · lsjz 对 GitHub Pages 等跨站来源返回 ErrCode=-999，但 pingzhongdata 仍可访问
//   · 缺点：全量历史 JS 体积大（~100KB），但只取最后一条即可
//   · 注意：需清掉旧全局变量，避免上次请求的残留数据污染本次
function fetchPzdLatest(code) {
  return new Promise((resolve) => {
    // 清掉上次 pingzhongdata 留下的全局变量，避免 stale 污染
    try { delete window.Data_netWorthTrend; } catch (_) { window.Data_netWorthTrend = undefined; }
    try { delete window.fS_code; } catch (_) { window.fS_code = undefined; }

    const s = document.createElement('script');
    s.async = true;
    const timer = setTimeout(() => { s.remove(); resolve(null); }, REQUEST_TIMEOUT_MS);
    s.onload = () => {
      clearTimeout(timer);
      s.remove();
      try {
        // 校验 fS_code 与请求 code 一致，防止缓存错乱
        if (window.fS_code && String(window.fS_code) !== String(code)) {
          resolve(null);
          return;
        }
        const arr = window.Data_netWorthTrend;
        if (!Array.isArray(arr) || !arr.length) { resolve(null); return; }
        // 取最后一条（最新净值）
        const last = arr[arr.length - 1];
        if (!last || last.y == null) { resolve(null); return; }
        const nav = parseFloat(last.y);
        const navDate = last.x ? new Date(last.x) : null;
        const change = last.equityReturn != null ? parseFloat(last.equityReturn) : null;
        if (!Number.isFinite(nav) || !navDate || isNaN(navDate.getTime())) {
          resolve(null);
          return;
        }
        const dateStr = `${navDate.getFullYear()}-${String(navDate.getMonth() + 1).padStart(2, '0')}-${String(navDate.getDate()).padStart(2, '0')}`;
        resolve({
          nav,
          dailyChange: Number.isFinite(change) ? change : null,
          navDate: dateStr,
          source: LIVE_SOURCE_PZD,
        });
      } catch (_) {
        resolve(null);
      }
    };
    s.onerror = () => { clearTimeout(timer); s.remove(); resolve(null); };
    s.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js?rt=${Date.now()}`;
    document.head.appendChild(s);
  });
}

// 主选 lsjz，失败后 pingzhongdata 兜底
async function fetchLatestNav(code) {
  const lsjz = await fetchLsjzLatest(code);
  if (lsjz) return lsjz;
  return fetchPzdLatest(code);
}

async function runWithConcurrency(items, limit, worker) {
  if (!items.length) return;
  let idx = 0;
  const n = Math.min(limit, items.length);
  const runners = Array.from({ length: n }, async () => {
    while (idx < items.length) {
      const cur = idx;
      idx += 1;
      await worker(items[cur]);
    }
  });
  await Promise.all(runners);
}

function getCodeState(code) {
  let st = codeStates.get(code);
  if (!st) {
    st = {
      observedLiveDate: '',
      hasObservedNewer: false,
      settled: false,
      cooldownUntil: 0,
      consecutiveFailures: 0,
      backoffUntil: 0,
    };
    codeStates.set(code, st);
  }
  return st;
}

function shouldFetchCode(code, share, nowTs) {
  const st = getCodeState(code);
  const localDate = share?.nav_date || '';

  if (st.settled) return false;

  // 已被静态数据追上 → settled
  if (st.hasObservedNewer && st.observedLiveDate && localDate && compareDate(localDate, st.observedLiveDate) >= 0) {
    st.settled = true;
    st.cooldownUntil = Infinity;
    clearLiveOverlay(share);
    return false;
  }

  // 指数退避冷却中
  if (st.backoffUntil > nowTs) return false;

  // 常规冷却
  if (st.cooldownUntil > nowTs) return false;
  return true;
}

function settleStatesAfterReload(defaultShares) {
  for (const [code, share] of defaultShares.entries()) {
    const st = getCodeState(code);
    const localDate = share?.nav_date || '';
    if (st.hasObservedNewer && st.observedLiveDate && localDate && compareDate(localDate, st.observedLiveDate) >= 0) {
      st.settled = true;
      st.cooldownUntil = Infinity;
      clearLiveOverlay(share);
    }
  }
}

export function start({ state, onUpdate, reloadData }) {
  let lastMetaGeneratedAt = state?.metaGeneratedAt || '';
  let nextMetaCheckAt = 0;
  let nextIntervalOverrideMs = null;

  // meta.json 检查：拆出 live window 限制，全天低频检查
  // why：GitHub Actions 在凌晨 03:31 更新静态 JSON，如果只在 15:00-24:00 检查，
  //      长期开着的页面不会自动 reload 新数据
  async function maybeRefreshMeta(nowParts) {
    if (nowParts.ts < nextMetaCheckAt) return false;

    nextMetaCheckAt = nowParts.ts + META_CHECK_INTERVAL_MS;
    try {
      const res = await fetch(`./data/meta.json?t=${Date.now()}`);
      if (!res.ok) return false;
      const meta = await res.json();
      const generatedAt = meta?.generated_at || '';
      if (!generatedAt) return false;
      if (!lastMetaGeneratedAt) {
        lastMetaGeneratedAt = generatedAt;
        return false;
      }
      if (generatedAt === lastMetaGeneratedAt) return false;

      if (typeof reloadData === 'function') {
        await reloadData();
      }
      lastMetaGeneratedAt = state?.metaGeneratedAt || generatedAt;
      const shares = collectOffshoreDefaultShares(state);
      settleStatesAfterReload(shares);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function tick() {
    const nowParts = bjNowParts();

    // meta.json 检查：全天运行（不再受 inLiveWindow 限制）
    const reloaded = await maybeRefreshMeta(nowParts);
    if (reloaded) return;

    // 实时净值只在 live window 内拉取
    if (!inLiveWindow(nowParts)) return;

    const defaultShares = collectOffshoreDefaultShares(state);
    if (!defaultShares.size) {
      nextIntervalOverrideMs = BOOTSTRAP_RETRY_MS;
      return;
    }

    const targets = [];
    for (const [code, share] of defaultShares.entries()) {
      if (shouldFetchCode(code, share, nowParts.ts)) {
        targets.push({ code, share });
      }
    }
    if (!targets.length) return;

    let changed = false;

    await runWithConcurrency(targets, CONCURRENCY_LIMIT, async ({ code, share }) => {
      const st = getCodeState(code);
      const live = await fetchLatestNav(code);

      if (!live) {
        // 失败 → 指数退避
        st.consecutiveFailures++;
        const backoffMs = Math.min(BACKOFF_BASE_MS * st.consecutiveFailures, BACKOFF_MAX_MS);
        st.backoffUntil = Date.now() + backoffMs;
        return;
      }

      // 成功 → 重置退避
      st.consecutiveFailures = 0;
      st.backoffUntil = 0;

      if (live.navDate && compareDate(live.navDate, st.observedLiveDate) > 0) {
        st.observedLiveDate = live.navDate;
      }

      const localDate = share?.nav_date || '';
      if (live.navDate && compareDate(live.navDate, localDate) > 0) {
        const prevMarker = `${share._live_nav_date || ''}|${share._live_nav || ''}|${share._live_daily_change || ''}`;
        share._live_nav = live.nav;
        share._live_daily_change = live.dailyChange;
        share._live_nav_date = live.navDate;
        share._live_nav_source = live.source;
        share._live_nav_updated_at = new Date().toISOString();
        st.hasObservedNewer = true;
        st.cooldownUntil = Date.now() + RECHECK_AFTER_NEWER_MS;
        const nextMarker = `${share._live_nav_date || ''}|${share._live_nav || ''}|${share._live_daily_change || ''}`;
        if (prevMarker !== nextMarker) changed = true;
      } else {
        if (st.hasObservedNewer && st.observedLiveDate && localDate && compareDate(localDate, st.observedLiveDate) >= 0) {
          st.settled = true;
          st.cooldownUntil = Infinity;
          if (clearLiveOverlay(share)) changed = true;
        } else if (share._live_nav_date && localDate && compareDate(localDate, share._live_nav_date) >= 0) {
          if (clearLiveOverlay(share)) changed = true;
        }
      }
    });

    if (changed) {
      try { onUpdate && onUpdate(); } catch (_) {}
    }
  }

  schedule(
    tick,
    () => {
      if (nextIntervalOverrideMs != null) {
        const ms = nextIntervalOverrideMs;
        nextIntervalOverrideMs = null;
        return ms;
      }
      return getIntervalMsByBjTime(bjNowParts());
    },
    { firstDelayMs: 2500 },
  );
}
