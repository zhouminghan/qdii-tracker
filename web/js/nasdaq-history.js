// ============================================================================
// nasdaq-history.js — 「纳指图谱」：40 年年度回撤 / 月度热力图 / 多周期排行榜
// ============================================================================
// 数据源：web/data/nasdaq-history.json（由 scripts/pipeline/nasdaq_history.py 生成）
// 颜色口径：红涨绿跌（与全站一致）——热力图/排行榜中红=上涨、绿=下跌；
// 回撤图是「风险严重度」口径，颜色越深回撤越深，已在下文独立标注，避免混淆。
// ============================================================================

import { saveNodeAsPng, previewAndDownload, pngFilename, saveImageErrorMessage } from './save-image.js?v=dev';

const MONTH_CN = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const WINDOWS = [
  { key: '5y', label: '近 5 年' },
  { key: '10y', label: '近 10 年' },
  { key: 'full', label: '全长 2001+' },
];
const HEAT_META = {
  year: {
    label: '年度',
    title: '年度涨跌热力图',
    aria: '纳指年度涨跌热力图',
    poster: '年度涨跌热力图',
    filePrefix: 'qdii-nasdaq-heat-year',
  },
  month: {
    label: '月度',
    title: '月度冷热热力图',
    aria: '纳指月度冷热热力图',
    poster: '月度冷热热力图',
    filePrefix: 'qdii-nasdaq-heat-month',
  },
};

let DATA = null;
let activeWindow = '5y';
let heatView = 'year';
let heatSaveBusy = false;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function pctText(v, withSign = true) {
  if (v == null) return '--';
  const sign = withSign && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function upDownClass(v) {
  if (v == null || Math.abs(v) < 0.005) return 'nh-flat';
  return v > 0 ? 'nh-up' : 'nh-down';
}

// 热力图单元格配色：红=上涨，绿=下跌，透明度随幅度加深
function heatStyle(v) {
  if (v == null) return { bg: 'rgba(128,128,128,0.08)', fg: 'var(--gray-9)' };
  const t = clamp(Math.abs(v) / 12, 0, 1);
  const alpha = 0.08 + 0.78 * t;
  if (v > 0) {
    return {
      bg: `rgba(229,72,77,${alpha.toFixed(3)})`,
      fg: alpha > 0.5 ? '#fff' : 'var(--rise)',
    };
  }
  return {
    bg: `rgba(48,164,108,${alpha.toFixed(3)})`,
    fg: alpha > 0.5 ? '#fff' : 'var(--fall)',
  };
}

function currentHeatMeta() {
  return HEAT_META[heatView] || HEAT_META.year;
}

function heatRangeText(d, view) {
  const source = view === 'month'
    ? d?.heatmap?.years
    : d?.annual?.map((a) => a.year);
  const years = (source || []).map(Number).filter(Number.isFinite);
  if (years.length) return `${Math.min(...years)}-${Math.max(...years)}`;
  return `${d?.range?.first_year ?? 1986}-${d?.range?.last_year ?? '至今'}`;
}

function syncHeatViewControls(d = DATA) {
  const meta = currentHeatMeta();
  const range = heatRangeText(d, heatView);
  const title = document.getElementById('nh-heat-title');
  if (title) title.textContent = `🔥 ${meta.title}（${range}，%）`;
  const heatEl = document.getElementById('nh-heatmap');
  if (heatEl) heatEl.setAttribute('aria-label', `${meta.aria}（${range}，红涨绿跌）`);
  const toggle = document.getElementById('nh-heat-toggle');
  if (toggle) toggle.setAttribute('aria-label', `热力图视图切换，当前${meta.label}`);
  document.querySelectorAll('#nh-heat-toggle .nh-seg').forEach((btn) => {
    const active = btn.dataset.heat === heatView;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  const saveBtn = document.getElementById('nh-heat-save');
  if (saveBtn) {
    saveBtn.title = `保存${meta.label}热力图 PNG`;
    saveBtn.setAttribute('aria-label', `保存${meta.label}热力图 PNG`);
  }
}

function setHeatSaveStatus(text, state = '') {
  const el = document.getElementById('nh-heat-save-status');
  if (!el) return;
  el.textContent = text;
  el.dataset.state = state;
  el.setAttribute('role', state === 'error' ? 'alert' : 'status');
}

function clearHeatSaveStatus() {
  setHeatSaveStatus('');
  const btn = document.getElementById('nh-heat-save');
  if (btn && !btn.disabled) {
    btn.textContent = '保存图片';
    btn.removeAttribute('aria-busy');
  }
}

function setHeatSaveBusy(meta) {
  heatSaveBusy = true;
  const btn = document.getElementById('nh-heat-save');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '生成中…';
    btn.setAttribute('aria-busy', 'true');
  }
  setHeatSaveStatus(`正在生成${meta.label}热力图 PNG…`, 'busy');
}

function setHeatSaveSuccess(meta) {
  heatSaveBusy = false;
  setHeatSaveStatus(`已生成${meta.label}热力图预览，可滚动查看并下载 PNG。`, 'success');
}

function setHeatSaveError(err) {
  heatSaveBusy = false;
  const btn = document.getElementById('nh-heat-save');
  if (btn) {
    btn.disabled = false;
    btn.textContent = '重试保存';
    btn.removeAttribute('aria-busy');
  }
  setHeatSaveStatus(`生成失败：${saveImageErrorMessage(err)} 点击「重试保存」可再试。`, 'error');
}

function restoreHeatSaveButton() {
  heatSaveBusy = false;
  const btn = document.getElementById('nh-heat-save');
  if (btn) {
    btn.disabled = false;
    btn.textContent = '保存图片';
    btn.removeAttribute('aria-busy');
  }
  clearHeatSaveStatus();
}

function renderSummary(d) {
  const el = document.getElementById('nh-summary');
  if (!el) return;
  const rng = d.range || {};
  const src = d.source || '--';
  el.innerHTML = `
    <div class="nh-summary-title">📌 一眼看结论：${d.summary?.text || '数据生成中'}</div>
    <div class="nh-summary-meta">
      数据：${d.index?.name || '纳斯达克 100 指数'}（${d.index?.symbol || '^NDX'}）
      · ${rng.first_year ?? '--'}–${rng.last_year ?? '--'}
      · 来源 ${src}
    </div>`;
}

function renderAnnualReturns(d) {
  const annual = d.annual || [];
  const wrap = document.getElementById('nh-annual-returns');
  if (!wrap) return;
  if (!annual.length) {
    wrap.innerHTML = '<div class="nh-empty">暂无数据</div>';
    return;
  }

  const width = 960;
  const height = 260;
  const padL = 42;
  const padR = 8;
  const padT = 10;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = annual.length;
  const barW = Math.max(2, Math.min(16, plotW / n - 2));
  const gap = plotW / n - barW;
  const maxAbs = Math.max(...annual.map((a) => Math.abs(a.return_pct || 0)), 1);
  const zeroY = padT + plotH / 2;

  const bars = annual.map((a, i) => {
    const v = a.return_pct || 0;
    const h = plotH * Math.abs(v) / (maxAbs * 2);
    const x = padL + i * (barW + gap) + gap / 2;
    const y = v >= 0 ? zeroY - h : zeroY;
    const color = v >= 0 ? 'rgba(229,72,77,0.82)' : 'rgba(48,164,108,0.82)';
    return `<rect class="nh-ret-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="1" fill="${color}"><title>${a.year} 年：${pctText(a.return_pct)}</title></rect>`;
  }).join('');

  const every = Math.ceil(n / 12);
  const labels = annual.map((a, i) => {
    if (i % every !== 0 && i !== n - 1) return '';
    const x = padL + i * (barW + gap) + gap / 2 + barW / 2;
    return `<text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="middle" class="nh-axis-text">${a.year}</text>`;
  }).join('');

  const grid = [];
  grid.push(`<line x1="${padL}" y1="${zeroY}" x2="${width - padR}" y2="${zeroY}" class="nh-axis-line"/>
             <text x="${padL - 6}" y="${zeroY + 3}" text-anchor="end" class="nh-axis-text">0%</text>`);
  for (const sign of [-1, 1]) {
    const yy = zeroY + sign * plotH / 2;
    const val = (maxAbs * sign).toFixed(0);
    grid.push(`<line x1="${padL}" y1="${yy}" x2="${width - padR}" y2="${yy}" class="nh-grid"/>
               <text x="${padL - 6}" y="${yy + 3}" text-anchor="end" class="nh-axis-text">${sign > 0 ? '+' : ''}${val}%</text>`);
  }

  wrap.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="nh-svg" role="img" aria-label="纳指逐年涨跌幅">
      ${grid.join('')}
      ${bars}
      ${labels}
    </svg>
    <div class="nh-chart-note">柱高 = 年度涨跌幅；红涨绿跌。</div>`;
}

function renderDrawdown(d) {
  const annual = d.annual || [];
  const wrap = document.getElementById('nh-drawdown');
  if (!wrap) return;
  if (!annual.length) {
    wrap.innerHTML = '<div class="nh-empty">暂无数据</div>';
    return;
  }

  const width = 960;
  const height = 260;
  const padL = 42;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = annual.length;
  const barW = Math.max(2, Math.min(16, plotW / n - 2));
  const gap = plotW / n - barW;
  const maxDd = Math.max(...annual.map((a) => Math.abs(a.max_drawdown_pct || 0)), 1);

  const bars = annual.map((a, i) => {
    const h = plotH * Math.abs(a.max_drawdown_pct || 0) / maxDd;
    const x = padL + i * (barW + gap) + gap / 2;
    const y = padT + plotH - h;
    const alpha = 0.3 + 0.7 * Math.min(1, Math.abs(a.max_drawdown_pct || 0) / (maxDd || 1));
    return `
      <rect class="nh-dd-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
            width="${barW.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}"
            rx="1" fill="rgba(229,72,77,${alpha.toFixed(2)})">
        <title>${a.year} 年：回撤 ${pctText(a.max_drawdown_pct)}，${MONTH_CN[(a.peak_month || 1) - 1]} → ${MONTH_CN[(a.trough_month || 1) - 1]}，全年 ${pctText(a.return_pct)}</title>
      </rect>`;
  }).join('');

  // 稀疏年标签，避免 40 根柱子全标
  const every = Math.ceil(n / 12);
  const labels = annual.map((a, i) => {
    if (i % every !== 0 && i !== n - 1) return '';
    const x = padL + i * (barW + gap) + gap / 2 + barW / 2;
    return `<text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="middle" class="nh-axis-text">${a.year}</text>`;
  }).join('');

  const grid = [];
  for (let g = 0; g <= 4; g++) {
    const yy = padT + plotH * g / 4;
    const val = (maxDd * g / 4).toFixed(0);
    grid.push(`<line x1="${padL}" y1="${yy}" x2="${width - padR}" y2="${yy}" class="nh-grid"/>
               <text x="${padL - 6}" y="${yy + 3}" text-anchor="end" class="nh-axis-text">-${val}%</text>`);
  }

  wrap.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="nh-svg" role="img" aria-label="纳指逐年年内最大回撤">
      ${grid.join('')}
      ${bars}
      ${labels}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" class="nh-axis-line"/>
    </svg>
    <div class="nh-chart-note">柱高 = 年内最大回撤；颜色越深回撤越深。悬停可看峰谷月份（如 07 → 09）。</div>`;
}

function renderTroughHistogram(d) {
  const hist = d.drawdown_histogram || [];
  const el = document.getElementById('nh-trough-hist');
  if (!el) return;
  const max = Math.max(...hist.map((h) => h.count || 0), 1);
  const bars = hist.map((h) => {
    const hh = Math.round(90 * (h.count || 0) / max);
    return `
      <div class="nh-hist-col">
        <span class="nh-hist-count">${h.count || 0}</span>
        <div class="nh-hist-bar" style="height:${Math.max(2, hh)}px"></div>
        <span class="nh-hist-label">${MONTH_CN[h.month - 1]}</span>
      </div>`;
  }).join('');
  el.innerHTML = bars;
}

function renderHeatmap(d) {
  syncHeatViewControls(d);
  if (heatView === 'year') {
    renderYearlyHeatmap(d);
    return;
  }
  const hm = d.heatmap || {};
  const years = hm.years || [];
  const rows = hm.rows || [];
  const el = document.getElementById('nh-heatmap');
  if (!el) return;
  if (!years.length) {
    el.innerHTML = '<div class="nh-empty">暂无数据</div>';
    return;
  }

  const head = `<tr><th class="nh-th nh-th-year">年份</th>${MONTH_CN.map((m) => `<th class="nh-th">${m}</th>`).join('')}</tr>`;
  const body = years.map((y, i) => {
    const cells = rows[i] || [];
    const tds = MONTH_CN.map((_, m) => {
      const v = cells[m];
      const s = heatStyle(v);
      return `<td class="nh-cell" style="background:${s.bg};color:${s.fg}" title="${y} 年 ${MONTH_CN[m]}：${pctText(v)}">${v == null ? '—' : v.toFixed(1) + '%'}</td>`;
    }).join('');
    return `<tr><th class="nh-th nh-th-year">${y}</th>${tds}</tr>`;
  }).join('');

  el.innerHTML = `<div class="nh-heat-wrap"><table class="nh-heat">${head}${body}</table></div>`;
}

function renderYearlyHeatmap(d) {
  const annual = d.annual || [];
  const el = document.getElementById('nh-heatmap');
  if (!el) return;
  const valid = annual.filter((a) => Number.isFinite(a.return_pct));
  if (!valid.length) {
    el.innerHTML = '<div class="nh-empty">暂无数据</div>';
    return;
  }
  const upCount = valid.filter((a) => a.return_pct > 0).length;
  const downCount = valid.filter((a) => a.return_pct < 0).length;
  const avg = valid.reduce((sum, a) => sum + a.return_pct, 0) / valid.length;
  const sorted = valid.map((a) => a.return_pct).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const best = valid.reduce((a, b) => (b.return_pct > a.return_pct ? b : a));
  const worst = valid.reduce((a, b) => (b.return_pct < a.return_pct ? b : a));
  const ddRows = annual.filter((a) => Number.isFinite(a.max_drawdown_pct));
  const deepestDd = ddRows.length
    ? ddRows.reduce((a, b) => (b.max_drawdown_pct < a.max_drawdown_pct ? b : a))
    : null;
  const maxAbs = Math.max(...valid.map((a) => Math.abs(a.return_pct)), 1);
  const summary = [
    `<span class="nh-year-stat"><b>${valid.length}</b> 个年度</span>`,
    `<span class="nh-year-stat nh-up">上涨 ${upCount} 年</span>`,
    `<span class="nh-year-stat nh-down">下跌 ${downCount} 年</span>`,
    `<span class="nh-year-stat">均值 ${pctText(avg)}</span>`,
    `<span class="nh-year-stat">中位 ${pctText(median)}</span>`,
    `<span class="nh-year-stat">最佳 ${best.year} ${pctText(best.return_pct)}</span>`,
    `<span class="nh-year-stat">最差 ${worst.year} ${pctText(worst.return_pct)}</span>`,
    deepestDd ? `<span class="nh-year-stat">最深回撤 ${deepestDd.year} ${pctText(deepestDd.max_drawdown_pct)}</span>` : '',
    '<span class="nh-year-stat nh-year-legend"><i class="nh-legend-swatch nh-legend-up"></i>红涨 <i class="nh-legend-swatch nh-legend-down"></i>绿跌 · 小字为年内回撤</span>',
  ].join('');
  const cells = annual.map((a) => {
    const v = a.return_pct;
    const s = heatStyle(v);
    const barWidth = clamp(100 * Math.abs(v || 0) / maxAbs, 4, 100).toFixed(1);
    const peak = MONTH_CN[(a.peak_month || 1) - 1] || '--';
    const trough = MONTH_CN[(a.trough_month || 1) - 1] || '--';
    return `
      <div class="nh-year-cell" style="background:${s.bg};color:${s.fg}"
           title="${a.year} 年：全年 ${pctText(v)}，年内最大回撤 ${pctText(a.max_drawdown_pct)}（${peak} → ${trough}）">
        <span class="nh-year-cell-head">
          <span class="nh-year-cell-year">${a.year}</span>
          <span class="nh-year-cell-dd">${pctText(a.max_drawdown_pct)}</span>
        </span>
        <span class="nh-year-cell-val">${pctText(v)}</span>
        <span class="nh-year-cell-bar" aria-hidden="true"><i style="width:${barWidth}%"></i></span>
      </div>`;
  }).join('');
  el.innerHTML = `<div class="nh-year-summary">${summary}</div><div class="nh-year-heat">${cells}</div>`;
}

async function saveHeatmap() {
  const heatEl = document.getElementById('nh-heatmap');
  const btn = document.getElementById('nh-heat-save');
  if (!heatEl || !DATA || !btn || btn.disabled || heatSaveBusy) return;
  const view = heatView;
  const meta = HEAT_META[view] || HEAT_META.year;
  const range = heatRangeText(DATA, view);
  const heatMarkup = heatEl.innerHTML;
  const poster = document.createElement('div');
  poster.className = 'nh-poster';
  // 必须放在视口内（top:0/left:0 + z-index:-1），离屏 -9999px 会让 html-to-image 渲染空白
  poster.style.position = 'fixed';
  poster.style.top = '0';
  poster.style.left = '0';
  poster.style.zIndex = '-1';
  poster.style.pointerEvents = 'none';
  poster.setAttribute('aria-hidden', 'true');
  const viewNote = view === 'year'
    ? `${(DATA.annual || []).length} 个年度 · 每格含全年涨跌与年内最大回撤 · 红涨绿跌`
    : `${(DATA.heatmap?.years || []).length} 年 × 12 月 · 单元格为当月涨跌 · 红涨绿跌`;
  poster.innerHTML = `
    <div class="nh-poster-title">纳指图谱 · ${meta.poster}（${range}）</div>
    <div class="nh-poster-meta">${viewNote}</div>
    ${heatMarkup}
    <div class="nh-poster-foot">数据更新于 ${(DATA.generated_at || '').slice(0, 10)} · QDII Tracker</div>`;
  document.body.appendChild(poster);
  setHeatSaveBusy(meta);
  try {
    const ok = await previewAndDownload(poster, pngFilename(meta.filePrefix), {
      title: `📸 ${meta.label}热力图预览`,
      ariaLabel: `${meta.label}热力图预览`,
      triggerButton: btn,
      restoreTrigger: restoreHeatSaveButton,
      onClose: () => syncHeatViewControls(DATA),
      onError: setHeatSaveError,
    });
    if (ok) setHeatSaveSuccess(meta);
  } catch (e) {
    setHeatSaveError(e);
  } finally {
    poster.remove();
    heatSaveBusy = false;
  }
}

function renderRanking(d) {
  const ranking = (d.ranking || {})[activeWindow] || [];
  const el = document.getElementById('nh-ranking');
  if (!el) return;
  const valid = ranking.filter((r) => r.avg_pct != null);
  if (!valid.length) {
    el.innerHTML = '<div class="nh-empty">暂无数据</div>';
    return;
  }
  const maxAbs = Math.max(...valid.map((r) => Math.abs(r.avg_pct)), 0.001);

  const rows = ranking.map((r, i) => {
    if (r.avg_pct == null) {
      return `<div class="nh-rank-row nh-rank-empty"><span class="nh-rank-no">${i + 1}</span><span class="nh-rank-month">${MONTH_CN[r.month - 1]}</span><span class="nh-rank-nodata">数据不足</span></div>`;
    }
    const barW = Math.round(48 * Math.abs(r.avg_pct) / maxAbs);
    const cls = upDownClass(r.avg_pct);
    const posRatio = r.positive_ratio == null ? '--' : `${Math.round(r.positive_ratio)}%`;
    return `
      <div class="nh-rank-row">
        <span class="nh-rank-no">${i + 1}</span>
        <span class="nh-rank-month">${MONTH_CN[r.month - 1]}</span>
        <div class="nh-rank-track">
          <div class="nh-rank-bar ${cls}" style="width:${Math.max(2, barW)}%"></div>
        </div>
        <span class="nh-rank-pct ${cls}">${pctText(r.avg_pct)}</span>
        <span class="nh-rank-ratio">上涨占比 ${posRatio}</span>
      </div>`;
  }).join('');

  const seg = WINDOWS.map((w) =>
    `<button type="button" class="nh-seg ${w.key === activeWindow ? 'active' : ''}" data-window="${w.key}" aria-pressed="${w.key === activeWindow}">${w.label}</button>`
  ).join('');

  el.innerHTML = `<div class="nh-seg-row" role="group" aria-label="排行榜时间窗口">${seg}</div><div class="nh-rank-list">${rows}</div>`;

  el.querySelectorAll('.nh-seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeWindow = btn.dataset.window;
      renderRanking(d);
    });
  });
}

function setChartStates(msg) {
  ['nh-annual-returns', 'nh-drawdown', 'nh-trough-hist', 'nh-heatmap', 'nh-ranking'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="nh-empty">${msg}</div>`;
  });
}

function render() {
  if (!DATA) {
    setChartStates('数据加载失败，请稍后重试。');
    const sum = document.getElementById('nh-summary');
    if (sum) sum.innerHTML = '<div class="nh-summary-title">📌 数据加载失败</div><div class="nh-summary-meta">请稍后刷新重试。</div>';
    return;
  }
  renderSummary(DATA);
  renderAnnualReturns(DATA);
  renderDrawdown(DATA);
  renderTroughHistogram(DATA);
  renderHeatmap(DATA);
  renderRanking(DATA);
  const meta = document.getElementById('nh-updated');
  if (meta) meta.textContent = DATA.generated_at ? `更新于 ${DATA.generated_at.slice(0, 16).replace('T', ' ')}` : '--';
}

async function load() {
  setChartStates('加载中…');
  try {
    const res = await fetch('./data/nasdaq-history.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
    render();
  } catch (e) {
    console.error('nasdaq history load error:', e);
    DATA = null;
    render();
  }
}

export function start() {
  window.renderNasdaqHistory = render;
  syncHeatViewControls(null);
  document.querySelectorAll('#nh-heat-toggle .nh-seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.heat === 'month' ? 'month' : 'year';
      if (next === heatView) return;
      heatView = next;
      if (!heatSaveBusy) clearHeatSaveStatus();
      if (DATA) renderHeatmap(DATA);
      else syncHeatViewControls(null);
    });
  });
  const heatSave = document.getElementById('nh-heat-save');
  if (heatSave) heatSave.addEventListener('click', saveHeatmap);
  const saveBtn = document.getElementById('nasdaq-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const panel = document.getElementById('panel-nasdaq');
      const card = document.querySelector('#panel-nasdaq .nh-card');
      const bg = card ? getComputedStyle(card).backgroundColor : undefined;
      saveNodeAsPng(panel, pngFilename('qdii-nasdaq-history'), bg);
    });
  }
  load();
}
