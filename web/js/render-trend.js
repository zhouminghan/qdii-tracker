// ==================== render-trend.js — 历史净值走势图 ====================
// 从 main.js 提取，独立为普通 script（全局作用域），通过 window 访问 STATE / openModal 等。
// 数据来源：fund.eastmoney.com/pingzhongdata/{code}.js（JSONP）
//  ，Data_netWorthTrend: [{x: ts_ms, y: 单位净值, equityReturn: 日涨跌%}, ...]
//  ，数据从基金成立日起算（多则 10+ 年），可支持 1 月 ~ 全部 各档区间筛选

(function () {
  let TREND_STATE = { code: null, fullSeries: null, range: '3m', expanded: false };
  let trendLastFocus = null;

  // IndexedDB 缓存：按 code 存历史净值序列，24h 内复用；
  // 过期/读取失败退回实时 JSONP；实时失败再用过期缓存兜底（断网仍可看）。
  const TREND_CACHE_DB = 'qdii-trend-cache';
  const TREND_CACHE_STORE = 'series';
  const TREND_CACHE_TTL = 24 * 60 * 60 * 1000;

  function openTrendCacheDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('indexeddb unavailable')); return; }
      const req = indexedDB.open(TREND_CACHE_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(TREND_CACHE_STORE)) {
          req.result.createObjectStore(TREND_CACHE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexeddb open failed'));
    });
  }

  async function readTrendCache(code) {
    try {
      const db = await openTrendCacheDb();
      const entry = await new Promise((resolve) => {
        const tx = db.transaction(TREND_CACHE_STORE, 'readonly');
        const req = tx.objectStore(TREND_CACHE_STORE).get(code);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
      });
      return entry && Array.isArray(entry.series) ? entry : null;
    } catch (_) {
      return null;
    }
  }

  function writeTrendCache(code, series) {
    try {
      openTrendCacheDb().then((db) => {
        const tx = db.transaction(TREND_CACHE_STORE, 'readwrite');
        tx.objectStore(TREND_CACHE_STORE).put({ ts: Date.now(), series }, code);
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      }).catch(() => {});
    } catch (_) {
      // 缓存写入失败不影响主流程
    }
  }

  async function fetchPzdHistoryLive(code) {
    return window.jsonpFetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js?rt=${Date.now()}`, {
      timeoutMs: 8000,
      failValue: null,
      beforeLoad: () => {
        try { delete window.Data_netWorthTrend; } catch (_) { window.Data_netWorthTrend = undefined; }
        try { delete window.fS_code; } catch (_) { window.fS_code = undefined; }
      },
      onData: () => {
        if (window.fS_code && String(window.fS_code) !== String(code)) return null;
        const arr = window.Data_netWorthTrend;
        if (!Array.isArray(arr) || !arr.length) return null;
        const out = arr.map(p => ({
          date: new Date(p.x),
          nav: parseFloat(p.y),
          change: p.equityReturn != null ? parseFloat(p.equityReturn) : null,
        })).filter(p => Number.isFinite(p.nav));
        return out;
      },
    });
  }

  async function loadLocalHistory(code) {
    try {
      const res = await fetch(`./data/nav-history/${code}.json?t=${Date.now()}`);
      if (!res.ok) return null;
      const d = await res.json();
      const dates = d && d.dates;
      const navs = d && d.navs;
      if (!Array.isArray(dates) || !Array.isArray(navs) || !dates.length || dates.length !== navs.length) return null;
      const out = [];
      for (let i = 0; i < dates.length; i++) {
        const nav = parseFloat(navs[i]);
        if (!Number.isFinite(nav)) continue;
        const prev = i > 0 ? parseFloat(navs[i - 1]) : null;
        out.push({
          date: new Date(dates[i] + 'T00:00:00+08:00'),
          nav,
          change: (prev != null && Number.isFinite(prev) && prev > 0) ? (nav / prev - 1) * 100 : null,
        });
      }
      return out.length ? out : null;
    } catch (_) {
      return null;
    }
  }

  async function fetchPzdHistory(code) {
    const cached = await readTrendCache(code);
    if (cached && cached.series.length && Date.now() - cached.ts < TREND_CACHE_TTL) {
      return cached.series;
    }
    const local = await loadLocalHistory(code);
    if (local && local.length) {
      writeTrendCache(code, local);
      return local;
    }
    const fresh = await fetchPzdHistoryLive(code);
    if (fresh && fresh.length) {
      writeTrendCache(code, fresh);
      return fresh;
    }
    return (cached && cached.series.length) ? cached.series : null;
  }

  function filterTrendRange(series, rangeKey) {
    if (!series?.length) return [];
    if (rangeKey === 'all') return series;
    const last = series[series.length - 1].date;
    let start;
    if (rangeKey === 'ytd') {
      start = new Date(last.getFullYear(), 0, 1);
    } else {
      const r = TREND_RANGES.find(x => x.key === rangeKey);
      if (!r || !r.days) return series;
      start = new Date(last.getTime() - r.days * 86400 * 1000);
    }
    return series.filter(p => p.date >= start);
  }

  function renderTrendChart(trendDisplay) {
    if (!trendDisplay) trendDisplay = { yMode: TREND_STATE.yMode, digits: TREND_STATE.digits, navLabel: TREND_STATE.navLabel };
    TREND_STATE.expanded = false;
    const wrap = document.getElementById('trend-chart');
    const recent = document.getElementById('trend-recent');
    const data = filterTrendRange(TREND_STATE.fullSeries, TREND_STATE.range);
    if (!data.length) {
      wrap.innerHTML = '<div class="text-center py-12 text-stone-400 dark:text-stone-500 text-sm">所选区间无数据</div>';
      recent.innerHTML = '';
      return;
    }

    const yMode = trendDisplay.yMode === 'value' ? 'value' : 'pct';
    const digits = Number.isInteger(trendDisplay.digits) ? trendDisplay.digits : 4;
    const navLabel = trendDisplay.navLabel || '净值';

    const baseNav = data[0].nav;
    const pts = data.map(p => ({
      date: p.date,
      nav: p.nav,
      change: p.change,
      ret: (p.nav / baseNav - 1) * 100,
    }));

    const W = 720, H = 260, PAD_R = 16, PAD_T = 16, PAD_B = 28;
    const ys = yMode === 'value' ? pts.map(p => p.nav) : pts.map(p => p.ret);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const padY = (maxY - minY) * 0.08 || (yMode === 'value' ? Math.max(minY * 0.001, 0.01) : 0.5);
    const lo = minY - padY, hi = maxY + padY;

    const fmtAxis = (v) => {
      if (yMode === 'value') {
        return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
      }
      return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    };
    let maxLabelLen = 0;
    for (let i = 0; i <= 4; i++) {
      const v = lo + (hi - lo) * (i / 4);
      maxLabelLen = Math.max(maxLabelLen, fmtAxis(v).length);
    }
    const PAD_L = Math.min(88, Math.max(44, Math.ceil(maxLabelLen * 6.2) + 12));

    const xOf = (i) => PAD_L + (W - PAD_L - PAD_R) * (i / Math.max(1, pts.length - 1));
    const yOf = (v) => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - lo) / (hi - lo));

    const totalChg = pts[pts.length - 1].ret;
    const upColor = 'var(--red-9)';
    const downColor = 'var(--green-9)';
    const lineColor = totalChg >= 0 ? upColor : downColor;

    const yField = yMode === 'value' ? 'nav' : 'ret';
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p[yField]).toFixed(1)}`).join(' ');
    const area = `${path} L${xOf(pts.length - 1).toFixed(1)},${yOf(lo).toFixed(1)} L${xOf(0).toFixed(1)},${yOf(lo).toFixed(1)} Z`;

    const zeroY = (yMode === 'pct' && 0 >= lo && 0 <= hi) ? yOf(0) : null;

    const gridLines = [];
    const gridLabels = [];
    for (let i = 0; i <= 4; i++) {
      const v = lo + (hi - lo) * (i / 4);
      const y = yOf(v);
      gridLines.push(`<line class="trend-grid-line" x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" stroke="#e7e5e4" stroke-dasharray="2 3"/>`);
      gridLabels.push(`<text class="trend-grid-text" x="${PAD_L - 6}" y="${(y + 3).toFixed(1)}" font-size="10" fill="#a8a29e" text-anchor="end">${fmtAxis(v)}</text>`);
    }

    const fmtD = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fmtFullD = (d) => `${d.getFullYear()}-${fmtD(d)}`;
    const spanDays = (pts[pts.length - 1].date - pts[0].date) / 864e5;
    let fmtXLabel;
    if (spanDays > 365 * 3) {
      fmtXLabel = (d) => `${d.getFullYear()}`;
    } else if (spanDays > 365) {
      fmtXLabel = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月`;
    } else {
      fmtXLabel = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
    }
    const xTickCount = spanDays > 365 * 3 ? 6 : 5;
    const xLabels = [];
    for (let t = 0; t < xTickCount; t++) {
      const i = t === 0 ? 0 : t === xTickCount - 1 ? pts.length - 1 : Math.round(pts.length * t / (xTickCount - 1));
      xLabels.push({ i, label: fmtXLabel(pts[i].date) });
    }

    const totalChgCls = totalChg > 0 ? 'up' : totalChg < 0 ? 'down' : 'text-stone-400';
    const totalChgStr = `${totalChg >= 0 ? '+' : ''}${totalChg.toFixed(2)}%`;
    const fmtVal = (v) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const headExtra = yMode === 'value'
      ? `<span class="text-xs text-stone-500 dark:text-stone-400 ml-2 num">${fmtVal(pts[0].nav)} → <span class="text-stone-700 dark:text-stone-300 font-medium">${fmtVal(pts[pts.length - 1].nav)}</span></span>`
      : '';

    wrap.innerHTML = `
      <div class="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <div class="text-sm text-stone-500 dark:text-stone-400">区间累计 <span class="font-bold ${totalChgCls} num text-base ml-1">${totalChgStr}</span>${headExtra}</div>
        <div class="text-xs text-stone-400 dark:text-stone-500 num">${fmtFullD(pts[0].date)} ~ ${fmtFullD(pts[pts.length - 1].date)}，${pts.length} 个交易日</div>
      </div>
      <div class="relative" id="trend-chart-inner">
        <svg viewBox="0 0 ${W} ${H}" class="w-full" style="height:auto; display:block;" id="trend-svg">
          <defs>
            <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
            </linearGradient>
          </defs>
          ${gridLines.join('')}
          ${gridLabels.join('')}
          ${zeroY != null ? `<line class="trend-zero-line" x1="${PAD_L}" y1="${zeroY.toFixed(1)}" x2="${W - PAD_R}" y2="${zeroY.toFixed(1)}" stroke="#a8a29e" stroke-width="0.6" stroke-dasharray="3 3"/>` : ''}
          <path d="${area}" fill="url(#trend-grad)" />
          <path d="${path}" fill="none" stroke="${lineColor}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
          ${xLabels.map(l => `<text class="trend-grid-text" x="${xOf(l.i).toFixed(1)}" y="${H - 8}" font-size="10" fill="#a8a29e" text-anchor="middle">${l.label}</text>`).join('')}
          <g id="trend-cursor" style="display:none;">
            <line id="trend-cursor-line" y1="${PAD_T}" y2="${H - PAD_B}" stroke="#525252" stroke-width="0.8" stroke-dasharray="2 2"/>
            <circle id="trend-cursor-dot" r="3.5" fill="${lineColor}" stroke="${document.documentElement.classList.contains('dark') ? 'var(--gray-3)' : '#fff'}" stroke-width="1.5"/>
          </g>
        </svg>
        <div id="trend-tooltip" class="absolute pointer-events-none hidden bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 shadow-md text-xs whitespace-nowrap" style="transition:opacity .12s; min-width:160px;"></div>
      </div>
    `;

    renderTrendList(pts, trendDisplay);

    const svg = document.getElementById('trend-svg');
    const wrapInner = document.getElementById('trend-chart-inner');
    const cursor = document.getElementById('trend-cursor');
    const cursorLine = document.getElementById('trend-cursor-line');
    const cursorDot = document.getElementById('trend-cursor-dot');
    const tooltip = document.getElementById('trend-tooltip');

    function findIndex(viewX) {
      let lo = 0, hi = pts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (xOf(mid) < viewX) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0 && Math.abs(xOf(lo - 1) - viewX) < Math.abs(xOf(lo) - viewX)) return lo - 1;
      return lo;
    }

    function onMove(e) {
      const rect = svg.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const viewX = (clientX - rect.left) * (W / rect.width);
      if (viewX < PAD_L || viewX > W - PAD_R) {
        cursor.style.display = 'none';
        tooltip.classList.add('hidden');
        return;
      }
      const i = findIndex(viewX);
      const p = pts[i];
      const cx = xOf(i), cy = yOf(p[yField]);
      cursor.style.display = '';
      cursorLine.setAttribute('x1', cx.toFixed(1));
      cursorLine.setAttribute('x2', cx.toFixed(1));
      cursorDot.setAttribute('cx', cx.toFixed(1));
      cursorDot.setAttribute('cy', cy.toFixed(1));

      const chgTxt = p.change == null ? '--' : `${p.change > 0 ? '+' : ''}${p.change.toFixed(2)}%`;
      const chgCls = p.change == null ? 'text-stone-400' : p.change > 0 ? 'up' : p.change < 0 ? 'down' : 'text-stone-400';
      const retCls = p.ret > 0 ? 'up' : p.ret < 0 ? 'down' : 'text-stone-400';
      const retTxt = `${p.ret >= 0 ? '+' : ''}${p.ret.toFixed(2)}%`;
      const navTxt = yMode === 'value' ? fmtVal(p.nav) : p.nav.toFixed(4);
      tooltip.innerHTML = `
        <div class="font-semibold text-stone-900 dark:text-stone-100 num">${fmtFullD(p.date)}</div>
        <div class="mt-1.5 flex justify-between gap-4"><span class="text-stone-500 dark:text-stone-400">${navLabel}</span><span class="num font-medium text-stone-900 dark:text-stone-100">${navTxt}</span></div>
        <div class="mt-0.5 flex justify-between gap-4"><span class="text-stone-500 dark:text-stone-400">日涨跌</span><span class="num font-medium ${chgCls}">${chgTxt}</span></div>
        <div class="mt-0.5 flex justify-between gap-4 pt-1 border-t border-stone-100 dark:border-stone-700"><span class="text-stone-500 dark:text-stone-400">区间累计</span><span class="num font-bold ${retCls}">${retTxt}</span></div>
      `;
      tooltip.classList.remove('hidden');
      const wrapRect = wrapInner.getBoundingClientRect();
      const localX = (cx / W) * rect.width;
      const localY = (cy / H) * rect.height;
      const ttW = tooltip.offsetWidth || 160;
      const ttH = tooltip.offsetHeight || 80;
      let tx = localX + 12;
      if (tx + ttW > rect.width) tx = localX - ttW - 12;
      let ty = localY - ttH / 2;
      if (ty < 0) ty = 4;
      if (ty + ttH > rect.height) ty = rect.height - ttH - 4;
      tooltip.style.left = tx + 'px';
      tooltip.style.top = ty + 'px';
    }
    function onLeave() {
      cursor.style.display = 'none';
      tooltip.classList.add('hidden');
    }
    svg.addEventListener('mousemove', onMove);
    svg.addEventListener('mouseleave', onLeave);
    svg.addEventListener('touchstart', onMove, { passive: true });
    svg.addEventListener('touchmove', onMove, { passive: true });
    svg.addEventListener('touchend', onLeave);
  }

  function renderTrendList(pts, trendDisplay) {
    if (!trendDisplay) trendDisplay = { yMode: TREND_STATE.yMode, digits: TREND_STATE.digits, navLabel: TREND_STATE.navLabel };
    const recent = document.getElementById('trend-recent');
    if (!recent) return;
    const expanded = TREND_STATE.expanded;
    const all = pts.slice().reverse();
    const view = expanded ? all : all.slice(0, 5);
    const fmtFullD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const yMode = trendDisplay.yMode === 'value' ? 'value' : 'pct';
    const digits = Number.isInteger(trendDisplay.digits) ? trendDisplay.digits : 4;
    const navLabel = trendDisplay.navLabel || '单位净值';
    const fmtNav = (v) => yMode === 'value'
      ? v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : v.toFixed(4);

    const rows = view.map(p => {
      const chgCls = p.change == null ? 'text-stone-400' : p.change > 0 ? 'up' : p.change < 0 ? 'down' : '';
      const chgTxt = p.change == null ? '--' : `${p.change > 0 ? '+' : ''}${p.change.toFixed(2)}%`;
      const retCls = p.ret > 0 ? 'up' : p.ret < 0 ? 'down' : 'text-stone-400';
      const retTxt = `${p.ret > 0 ? '+' : ''}${p.ret.toFixed(2)}%`;
      return `<tr class="border-t border-stone-100 dark:border-stone-700/50">
        <td class="py-2 px-3 num">${fmtFullD(p.date)}</td>
        <td class="py-2 px-3 text-right num font-medium">${fmtNav(p.nav)}</td>
        <td class="py-2 px-3 text-right num ${chgCls}">${chgTxt}</td>
        <td class="py-2 px-3 text-right num ${retCls}">${retTxt}</td>
      </tr>`;
    }).join('');

    const tableHtml = `
      <table class="w-full">
        <thead class="bg-stone-50 dark:bg-stone-900 text-stone-500 dark:text-stone-400 ${expanded ? 'sticky top-0 z-10' : ''}">
          <tr>
            <th class="text-left py-2 px-3 font-medium">日期</th>
            <th class="text-right py-2 px-3 font-medium">${navLabel}</th>
            <th class="text-right py-2 px-3 font-medium">日涨跌</th>
            <th class="text-right py-2 px-3 font-medium">区间累计</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    const showToggle = all.length > 5;
    let toggleHtml = '';
    if (showToggle) {
      if (!expanded) {
        toggleHtml = `<button id="trend-list-more" class="w-full py-2.5 text-xs text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition border-t border-stone-100 dark:border-stone-700/50 flex items-center justify-center gap-1">
          <span>加载全部历史净值（共 ${all.length} 条）</span>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </button>`;
      } else {
        toggleHtml = `<button id="trend-list-more" class="w-full py-2.5 text-xs text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition border-t border-stone-100 dark:border-stone-700/50 sticky bottom-0 bg-white dark:bg-stone-800 flex items-center justify-center gap-1">
          <span>收起（仅看最近 5 条）</span>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
        </button>`;
      }
    }

    if (expanded) {
      recent.innerHTML = `<div class="max-h-[420px] overflow-y-auto text-xs">${tableHtml}</div>${toggleHtml}`;
    } else {
      recent.innerHTML = `${tableHtml}${toggleHtml}`;
    }

    const btn = document.getElementById('trend-list-more');
    if (btn) {
      btn.addEventListener('click', () => {
        TREND_STATE.expanded = !TREND_STATE.expanded;
        renderTrendList(pts, trendDisplay);
      });
    }
  }

  function renderTrendRanges(trendDisplay) {
    if (!trendDisplay) trendDisplay = { yMode: TREND_STATE.yMode, digits: TREND_STATE.digits, navLabel: TREND_STATE.navLabel };
    const box = document.getElementById('trend-ranges');
    box.innerHTML = TREND_RANGES.map(r => `
      <button data-range="${r.key}" class="px-3 py-1.5 rounded-md text-xs border dark:border-stone-700 transition ${TREND_STATE.range === r.key ? 'bg-stone-900 dark:bg-stone-700 text-white dark:text-stone-200 border-transparent dark:border-stone-600' : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'}">
        ${r.label}
      </button>
    `).join('');
    box.querySelectorAll('button[data-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        TREND_STATE.range = btn.dataset.range;
        renderTrendRanges(trendDisplay);
        renderTrendChart(trendDisplay);
      });
    });
  }

  async function openTrend(code, evt) {
    if (evt) evt.stopPropagation();
    let series = null, share = null;
    for (const cat of ['sp500', 'nasdaq_passive', 'active', 'global_index', 'global_other', 'etf']) {
      const d = window.STATE.data[cat];
      if (!d) continue;
      for (const s of d.series) {
        const sh = s.shares.find(x => x.code === code);
        if (sh) { series = s; share = sh; break; }
      }
      if (series) break;
    }
    trendLastFocus = window.openModal('trendModal', { closeBtnId: 'trend-close' });
    document.getElementById('trend-title').textContent = series?.display_name || share?.name || `基金 ${code}`;
    document.getElementById('trend-subtitle').innerHTML = `
      <span class="num">${code}</span>
      ${share?.share_class ? `，${share.share_class}` : ''}
      ${share?.nav != null ? `，当前净值 <span class="font-medium num text-stone-700 dark:text-stone-300">${share.nav.toFixed(4)}</span>` : ''}
      ${share?.nav_date ? ` <span class="text-stone-400">(${share.nav_date})</span>` : ''}
    `;
    document.getElementById('trend-chart').innerHTML = '<div class="text-center py-12 text-stone-400 dark:text-stone-500 text-sm">⏳ 拉取历史净值中...</div>';
    document.getElementById('trend-recent').innerHTML = '';
    TREND_STATE.code = code;
    TREND_STATE.fullSeries = null;
    TREND_STATE.range = '3m';
    TREND_STATE.expanded = false;
    const trendDisplay = { yMode: 'pct', digits: 4, navLabel: '单位净值' };
    renderTrendRanges(trendDisplay);

    const data = await fetchPzdHistory(code);
    if (!data || !data.length) {
      document.getElementById('trend-chart').innerHTML = '<div class="text-center py-12 text-stone-400 dark:text-stone-500 text-sm">无法拉取历史净值（数据源临时不可用）</div>';
      return;
    }
    TREND_STATE.fullSeries = data;
    renderTrendChart(trendDisplay);
  }

  function closeTrend() {
    window.closeModal('trendModal', trendLastFocus);
  }

  // 点 trendModal 背景关闭
  document.addEventListener('click', (e) => {
    const m = document.getElementById('trendModal');
    if (!m || m.classList.contains('hidden')) return;
    if (e.target.id === 'trendModal' || e.target.classList.contains('modal-overlay')) {
      closeTrend();
    }
  });

  // 暴露给 main.js（trendBtn onclick）和 market-trend.js（ES Module 通过 window 访问）
  window.openTrend = openTrend;
  window.closeTrend = closeTrend;
  window.TREND_STATE = TREND_STATE;
  window.renderTrendChart = renderTrendChart;
  window.renderTrendList = renderTrendList;
  window.renderTrendRanges = renderTrendRanges;
})();
