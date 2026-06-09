import { schedule } from './idle-scheduler.js';

const OFFSHORE_CATEGORIES = ['sp500', 'nasdaq_passive', 'active', 'global_index', 'global_other'];
const LIVE_SOURCE = 'lsjz';
const REQUEST_TIMEOUT_MS = 8000;
const CONCURRENCY_LIMIT = 5;
const META_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const RECHECK_AFTER_NEWER_MS = 90 * 60 * 1000;
const BOOTSTRAP_RETRY_MS = 15 * 1000;

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
  if (!inLiveWindow(parts)) return 30 * 60 * 1000;
  if (parts.minutes < 21 * 60 + 30) return 10 * 60 * 1000;
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
    };
    codeStates.set(code, st);
  }
  return st;
}

function shouldFetchCode(code, share, nowTs) {
  const st = getCodeState(code);
  const localDate = share?.nav_date || '';

  if (st.settled) return false;

  if (st.hasObservedNewer && st.observedLiveDate && localDate && compareDate(localDate, st.observedLiveDate) >= 0) {
    st.settled = true;
    st.cooldownUntil = Infinity;
    clearLiveOverlay(share);
    return false;
  }

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

  async function maybeRefreshMeta(nowParts) {
    if (!inLiveWindow(nowParts)) return false;
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
    if (!inLiveWindow(nowParts)) return;

    const reloaded = await maybeRefreshMeta(nowParts);
    if (reloaded) return;

    const defaultShares = collectOffshoreDefaultShares(state);
    if (!defaultShares.size) {
      // 可能是首屏数据还在 loadData() 中，短间隔补拉，避免直接等到常规 10 分钟档
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
      const live = await fetchLsjzLatest(code);
      if (!live) return;

      if (live.navDate && compareDate(live.navDate, st.observedLiveDate) > 0) {
        st.observedLiveDate = live.navDate;
      }

      const localDate = share?.nav_date || '';
      if (live.navDate && compareDate(live.navDate, localDate) > 0) {
        const prevMarker = `${share._live_nav_date || ''}|${share._live_nav || ''}|${share._live_daily_change || ''}`;
        share._live_nav = live.nav;
        share._live_daily_change = live.dailyChange;
        share._live_nav_date = live.navDate;
        share._live_nav_source = LIVE_SOURCE;
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
