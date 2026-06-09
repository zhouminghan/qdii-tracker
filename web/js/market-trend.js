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
//   · 一次性取 lmt=2500（约 10 年），覆盖 all 区间，复用率高（来回切区间不再发请求）
//   · push2his 失败后尝试 push2 兜底，提高可用性
// ============================================================================

// 5 个标的：与 market-indices.js 的 SYMBOLS / DATA_SYMBOL_MAP 一一对应
//   key 为东财 secid（直接用作 push2his 请求参数），同时也是 HTML 卡片的 data-symbol
// why 不沿用腾讯 qq code（usDJI 等）：本模块所有 IO 都走东财，统一用 secid 维度更清爽
const INDICES = [
  { secid: '100.DJIA',   name: '道琼斯',         emoji: '📈', digits: 2, kind: 'stock' },
  { secid: '100.SPX',    name: '标普 500',       emoji: '🇺🇸', digits: 2, kind: 'stock' },
  { secid: '100.NDX',    name: '纳斯达克综合',   emoji: '💻', digits: 2, kind: 'stock' },
  { secid: '100.NDX100', name: '纳斯达克 100',   emoji: '🚀', digits: 2, kind: 'stock' },
  { secid: '133.USDCNH', name: '美元/人民币',    emoji: '💵', digits: 4, kind: 'fx'    },
];
const META_BY_SECID = Object.fromEntries(INDICES.map(it => [it.secid, it]));

// 5 分钟内同一标的不重复请求（仅当前会话内）
const HISTORY_CACHE = new Map(); // secid -> { ts, series }
const CACHE_TTL_MS = 5 * 60 * 1000;

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
async function fetchDayKWithFallback(secid) {
  const cached = HISTORY_CACHE.get(secid);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { series: cached.series, host: 'cache' };
  }

  for (const host of KLINE_HOSTS) {
    const result = await fetchDayKFromHost(secid, host);
    if (result) {
      HISTORY_CACHE.set(secid, { ts: Date.now(), series: result });
      return { series: result, host };
    }
  }
  return null;
}

// 从指定 host 拉日 K（JSONP）
//   返回 [{date, nav, change}, ...] 升序，失败返回 null
function fetchDayKFromHost(secid, host) {
  return new Promise((resolve) => {
    const cbName = `jsonp_mt_${secid.replace(/\W/g, '')}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const s = document.createElement('script');
    s.async = true;
    const cleanup = () => {
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      try { s.remove(); } catch (e) {}
    };
    const timer = setTimeout(() => { cleanup(); resolve(null); }, 8000);

    window[cbName] = (resp) => {
      clearTimeout(timer);
      try {
        const klines = resp && resp.data && Array.isArray(resp.data.klines) ? resp.data.klines : null;
        if (!klines || !klines.length) { cleanup(); resolve(null); return; }
        const out = parseKlines(klines);
        if (!out.length) { cleanup(); resolve(null); return; }
        cleanup();
        resolve(out);
      } catch (err) {
        cleanup();
        resolve(null);
      }
    };

    const params = new URLSearchParams({
      cb: cbName,
      secid,
      klt: '101',
      fqt: '0',
      end: '20500101',
      lmt: '2500',
      fields1: 'f1,f2,f3,f4,f5',
      fields2: 'f51,f52,f53,f54,f55,f56',
      _: String(Date.now()),
    });
    s.src = `https://${host}/api/qt/stock/kline/get?${params.toString()}`;
    s.onerror = () => { clearTimeout(timer); cleanup(); resolve(null); };
    document.head.appendChild(s);
  });
}

// 打开 trendModal 并切到「指数模式」
async function openIndexTrend(secid, evt) {
  if (evt) evt.stopPropagation();
  const meta = META_BY_SECID[secid];
  if (!meta) return;

  const modal = document.getElementById('trendModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // 标题/副标题：从指标卡当前快照里读最新价（避免再发一次行情请求）
  const card = document.querySelector(`.market-card[data-symbol="${secid}"]`);
  const lastPrice = card ? card.dataset.lastPrice : null;

  const titleEl = document.getElementById('trend-title');
  const subEl = document.getElementById('trend-subtitle');
  if (titleEl) titleEl.textContent = `${meta.emoji} ${meta.name}`;
  if (subEl) {
    subEl.innerHTML = `
      <span class="num">${secid}</span>
      ${lastPrice ? ` · 最新 <span class="font-medium num text-stone-700">${lastPrice}</span>` : ''}
      <span class="text-stone-400 ml-1">· 日 K（东方财富）</span>
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
  TS.yMode = 'value';
  TS.digits = meta.digits;
  TS.navLabel = meta.kind === 'fx' ? '汇率' : '点位';
  window.renderTrendRanges();

  const result = await fetchDayKWithFallback(secid);
  if (!result || !result.series || !result.series.length) {
    if (chartEl) {
      chartEl.innerHTML = `
        <div class="text-center py-12 text-stone-400 text-sm">
          无法拉取历史 K 线（数据源暂时不可达）<br>
          <span class="text-stone-300 text-xs">可稍后重试，或查看顶部指标卡的实时价格变动</span>
        </div>`;
    }
    return;
  }
  TS.fullSeries = result.series;
  window.renderTrendChart();
}

// 5 张指标卡挂点击 + 视觉提示
function bindCardClicks() {
  const grid = document.getElementById('market-cards');
  if (!grid) return;
  grid.querySelectorAll('.market-card').forEach(card => {
    card.classList.add('cursor-pointer', 'transition', 'hover:border-stone-400', 'hover:shadow-sm');
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

export function start() {
  bindCardClicks();
}
