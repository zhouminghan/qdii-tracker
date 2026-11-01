// ============================================================================
// market-trend.js  —  点击「市场参照系」指标卡 → 弹 trendModal 看日 K 走势
// ============================================================================
// 数据源（实测 2026-05 选型记录）：
//   ❌ 腾讯 fqkline `web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=usDJI,day,...,640,qfq`
//      美股标的只返回最新 1 行，无历史，参数语义与 A股/港股不同——直接放弃
//   ✅ 东财 push2his `https://push2his.eastmoney.com/api/qt/stock/kline/get`
//      · 5 个标的 secid 全部支持（含汇率 133.USDCNH）
//      · 同时支持原生 CORS（Access-Control-Allow-Origin 动态回显）和 JSONP（?cb= 参数）
//      · 字段：klt=101 日 K，fqt=0 不复权（指数本无除权），fields2=f51..f56 = 日期/开/收/高/低/成交量
//
// 选 JSONP 而非 fetch：与项目其他 3 个模块（market-indices/etf-premium/...）同源同机制，
//   · 不用关心 AbortController / 超时控制 / 跨域兜底
//   · 出问题时排查路径统一（都是 <script> onload/onerror）
//
// 复用 trendModal（基金走势 modal）：
//   共用 #trendModal / #trend-title / #trend-subtitle / #trend-chart / #trend-recent / #trend-ranges
//   共用 window.TREND_STATE / window.renderTrendChart / window.renderTrendRanges
//     —— 由 index.html 内联脚本 hoist 到 window
//   适配层把东财 klines 字符串数组转成基金走势的 {date, nav, change} 格式：
//     nav    = 收盘价
//     change = 当日涨跌幅%（基于前一日收盘）
//   下游 renderTrendChart / renderTrendList 完全无需改动
//
// 设计取舍：
//   · 不实时刷新走势（点开即拉）—— 历史 K 线变动慢，且每点开 = 1 次额外请求
//   · 同一标的 5 分钟内不再重复请求（轻缓存），缓解东财接口 IP 频次限制
//   · 一次性取 lmt=12000 + beg=19900101（约 35+ 年），覆盖 all 区间，复用率高（来回切区间不再发请求）
//   · push2his 失败后尝试 push2 兜底，提高可用性
// ============================================================================

// 与 market-indices.js 的卡片 data-symbol 一一对应；K 线请求默认用东财 secid。
// 上证指数的实时卡走腾讯（sh000001），但东财 K 线 secid 是 1.000001，故用 klineSecid 区分。
const INDICES = [
  { secid: '100.DJIA',   name: '道琼斯',         emoji: '📈', digits: 2, kind: 'stock' },
  { secid: '100.SPX',    name: '标普 500',       emoji: '🇺🇸', digits: 2, kind: 'stock' },
  { secid: '100.NDX',    name: '纳斯达克综合',   emoji: '💻', digits: 2, kind: 'stock' },
  { secid: '100.NDX100', name: '纳斯达克 100',   emoji: '🚀', digits: 2, kind: 'stock' },
  { secid: '251.SOX',    name: '费城半导体',     emoji: '⚡', digits: 2, kind: 'stock' },
  { secid: '133.USDCNH', name: '美元/人民币',    emoji: '💵', digits: 4, kind: 'fx'    },
  { secid: 'fxCNYHKD',   name: '人民币/港元',    emoji: '🇭🇰', digits: 4, kind: 'fx', klineSecid: '133.CNYHKD' },
  { secid: 'fxUSDJPY',   name: '美元/日元',      emoji: '🇯🇵', digits: 4, kind: 'fx', klineSecid: '119.USDJPY' },
  { secid: 'sh000001',   name: '上证指数',       emoji: '🇨🇳', digits: 2, kind: 'stock', klineSecid: '1.000001' },
  { secid: '100.N225',   name: '日经 225',       emoji: '🇯🇵', digits: 2, kind: 'stock' },
  { secid: '100.HSI',    name: '恒生指数',       emoji: '🇭🇰', digits: 2, kind: 'stock' },
];
const META_BY_SECID = Object.fromEntries(INDICES.map(it => [it.secid, it]));

// 5 分钟内同一标的不重复请求（仅当前会话内）
const HISTORY_CACHE = new Map(); // secid -> { ts, series }
const CACHE_TTL_MS = 5 * 60 * 1000;

// 指数 K 线的 IndexedDB 持久缓存：第二次打开秒出，本地 JSON 缺失时也能离线
const INDEX_CACHE_DB = 'qdii-index-kline';
const INDEX_CACHE_STORE = 'series';
const INDEX_CACHE_TTL = 24 * 60 * 60 * 1000;

function openIndexCacheDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('indexeddb unavailable')); return; }
    const req = indexedDB.open(INDEX_CACHE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(INDEX_CACHE_STORE)) {
        req.result.createObjectStore(INDEX_CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexeddb open failed'));
  });
}

async function readIndexCache(key) {
  try {
    const db = await openIndexCacheDb();
    const entry = await new Promise((resolve) => {
      const tx = db.transaction(INDEX_CACHE_STORE, 'readonly');
      const req = tx.objectStore(INDEX_CACHE_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
    return entry && Array.isArray(entry.series) ? entry : null;
  } catch (_) {
    return null;
  }
}

function writeIndexCache(key, series) {
  try {
    openIndexCacheDb().then((db) => {
      const tx = db.transaction(INDEX_CACHE_STORE, 'readwrite');
      tx.objectStore(INDEX_CACHE_STORE).put({ ts: Date.now(), series }, key);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    }).catch(() => {});
  } catch (_) {
    // 缓存写入失败不影响主流程
  }
}

// 本地日 K JSON → 走势图需要的 {date, nav, change}
async function loadLocalKline(cardSecid) {
  try {
    const res = await fetch(`./data/index-kline/${cardSecid}.json?t=${Date.now()}`);
    if (!res.ok) return null;
    const d = await res.json();
    const dates = d && d.dates;
    if (!Array.isArray(dates) || !dates.length) return null;
    const out = [];
    let prev = null;
    for (let i = 0; i < dates.length; i++) {
      const close = parseFloat(d.close[i]);
      if (!Number.isFinite(close) || close <= 0) continue;
      out.push({
        date: new Date(dates[i] + 'T00:00:00+08:00'),
        nav: close,
        open: parseFloat(d.open[i]),
        high: parseFloat(d.high[i]),
        low: parseFloat(d.low[i]),
        volume: parseFloat(d.volume[i]),
        change: prev != null && prev > 0 ? (close / prev - 1) * 100 : null,
      });
      prev = close;
    }
    return out.length ? out : null;
  } catch (_) {
    return null;
  }
}

// 日 K 请求的两个 host：主选 push2his，失败后 push2 兜底
const KLINE_HOSTS = [
  'push2his.eastmoney.com',
  'push2.eastmoney.com',
];

// 解析 klines 数组 → [{date, nav, change}, ...] 升序
function parseKlines(klines) {
  let prevClose = null;
  const out = [];
  for (const line of klines) {
    if (typeof line !== 'string') continue;
    const parts = line.split(',');
    if (parts.length < 3) continue;
    const dateStr = parts[0];
    const close = parseFloat(parts[2]);
    if (!Number.isFinite(close) || close <= 0) continue;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;
    const change = prevClose != null && prevClose > 0
      ? ((close - prevClose) / prevClose) * 100
      : null;
    out.push({ date: d, nav: close, change });
    prevClose = close;
  }
  return out;
}

// 拉日 K（JSONP），自动 fallback 到备选 host
//   返回 { series: [{date, nav, change}, ...], host: string } 或 null
async function fetchDayKWithFallback(cardSecid, klineSecid) {
  const cached = HISTORY_CACHE.get(cardSecid);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { series: cached.series, host: 'memory' };
  }

  const idb = await readIndexCache(cardSecid);
  if (idb && Date.now() - idb.ts < INDEX_CACHE_TTL) {
    HISTORY_CACHE.set(cardSecid, { ts: Date.now(), series: idb.series });
    return { series: idb.series, host: 'indexeddb' };
  }

  const local = await loadLocalKline(cardSecid);
  if (local && local.length) {
    writeIndexCache(cardSecid, local);
    HISTORY_CACHE.set(cardSecid, { ts: Date.now(), series: local });
    return { series: local, host: 'local-json' };
  }

  for (const host of KLINE_HOSTS) {
    const result = await fetchDayKFromHost(klineSecid, host);
    if (result) {
      writeIndexCache(cardSecid, result);
      HISTORY_CACHE.set(cardSecid, { ts: Date.now(), series: result });
      return { series: result, host };
    }
  }

  if (idb && idb.series && idb.series.length) {
    return { series: idb.series, host: 'indexeddb-stale' };
  }
  return null;
}

// 从指定 host 拉日 K（JSONP）
//   返回 [{date, nav, change}, ...] 升序，失败返回 null
function fetchDayKFromHost(secid, host) {
  return window.jsonpFetch((cbName) => {
    const params = new URLSearchParams({
      cb: cbName,
      secid,
      klt: '101',
      fqt: '0',
      beg: '19900101',
      end: '20500101',
      lmt: '12000',
      fields1: 'f1,f2,f3,f4,f5',
      fields2: 'f51,f52,f53,f54,f55,f56',
      _: String(Date.now()),
    });
    return `https://${host}/api/qt/stock/kline/get?${params.toString()}`;
  }, {
    timeoutMs: 8000,
    usesCallback: true,
    failValue: null,
    onData: (resp) => {
      const klines = resp && resp.data && Array.isArray(resp.data.klines) ? resp.data.klines : null;
      if (!klines || !klines.length) return null;
      const out = parseKlines(klines);
      return out.length ? out : null;
    },
  });
}

// 打开 trendModal 并切到「指数模式」
async function openIndexTrend(secid, evt) {
  if (evt) evt.stopPropagation();
  const meta = META_BY_SECID[secid];
  if (!meta) return;

  // 复用 utils.js 的 openModal（收拢自 main.js 原 openDetail/openTrend 的机械开窗步骤）。
  // 注：原实现从未设置过焦点恢复变量，这里保持一致，不新增该行为。
  if (typeof window.openModal !== 'function' || !document.getElementById('trendModal')) return;
  window.openModal('trendModal');

  // 标题/副标题：从指标卡当前快照里读最新价（避免再发一次行情请求）
  const card = document.querySelector(`.market-card[data-symbol="${secid}"]`);
  const lastPrice = card ? card.dataset.lastPrice : null;

  const titleEl = document.getElementById('trend-title');
  const subEl = document.getElementById('trend-subtitle');
  if (titleEl) titleEl.textContent = `${meta.emoji} ${meta.name}`;
  if (subEl) {
    subEl.innerHTML = `
      <span class="num">${secid}</span>
      ${lastPrice ? `，最新 <span class="font-medium num text-stone-700 dark:text-stone-300">${lastPrice}</span>` : ''}
      <span class="text-stone-400 dark:text-stone-500 ml-1">日 K（本地/东财）</span>
    `;
  }

  const chartEl = document.getElementById('trend-chart');
  const recentEl = document.getElementById('trend-recent');
  if (chartEl) chartEl.innerHTML = '<div class="text-center py-12 text-stone-400 text-sm">⏳ 拉取历史 K 线中...</div>';
  if (recentEl) recentEl.innerHTML = '';

  // 复用基金那套 TREND_STATE
  const TS = window.TREND_STATE;
  if (!TS || typeof window.renderTrendChart !== 'function' || typeof window.renderTrendRanges !== 'function') {
    if (chartEl) chartEl.innerHTML = '<div class="text-center py-12 text-rose-500 text-sm">⚠️ 走势模块未就绪，请刷新页面重试</div>';
    return;
  }
  TS.code = secid;
  TS.fullSeries = null;
  TS.range = '3m';
  TS.expanded = false;
  const trendDisplay = { yMode: 'value', digits: meta.digits, navLabel: meta.kind === 'fx' ? '汇率' : '点位' };
  window.renderTrendRanges(trendDisplay);

  const result = await fetchDayKWithFallback(secid, meta.klineSecid || secid);
  if (!result || !result.series || !result.series.length) {
    if (chartEl) {
      chartEl.innerHTML = `
        <div class="text-center py-12 text-stone-400 dark:text-stone-500 text-sm">
          无法拉取历史 K 线（数据源暂时不可达）<br>
          <span class="text-stone-300 dark:text-stone-600 text-xs">可稍后重试，或查看顶部指标卡的实时价格变动</span>
        </div>`;
    }
    return;
  }
  TS.fullSeries = result.series;
  window.renderTrendChart(trendDisplay);
}

// 5 张指标卡挂点击 + 视觉提示
function bindCardClicks() {
  const grids = ['market-cards', 'market-fx-cards']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  for (const grid of grids) {
    grid.querySelectorAll('.market-card').forEach(card => {
      card.classList.add('cursor-pointer', 'transition', 'hover:border-stone-400', 'dark:hover:border-stone-500', 'hover:shadow-sm');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('title', '点击查看历史走势');
    });
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.market-card');
      if (!card || !grid.contains(card)) return;
      const secid = card.getAttribute('data-symbol');
      if (META_BY_SECID[secid]) openIndexTrend(secid, e);
    });
    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.market-card');
      if (!card || !grid.contains(card)) return;
      e.preventDefault();
      const secid = card.getAttribute('data-symbol');
      if (META_BY_SECID[secid]) openIndexTrend(secid, e);
    });
  }
}

export function start() {
  bindCardClicks();
}
