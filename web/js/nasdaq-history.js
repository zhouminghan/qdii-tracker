// ============================================================================
// nasdaq-history.js — 「纳指图谱」：40 年年度回撤 / 月度热力图 / 多周期排行榜
// ============================================================================
// 数据源：web/data/nasdaq-history.json（由 scripts/pipeline/nasdaq_history.py 生成）
// 颜色口径：红涨绿跌（与全站一致）——热力图/排行榜中红=上涨、绿=下跌；
// 回撤图是「风险严重度」口径，颜色越深回撤越深，已在下文独立标注，避免混淆。
// ============================================================================

import { saveNodeAsPng, previewAndDownload, pngFilename } from './save-image.js?v=dev';

const MONTH_CN = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const WINDOWS = [
  { key: '5y', label: '近 5 年' },
  { key: '10y', label: '近 10 年' },
  { key: 'full', label: '全长 2001+' },
];

let DATA = null;
let activeWindow = '5y';
let heatView = 'month';

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
  if (heatView === 'year') {
    renderYearlyHeatmap(d);
    return;
  }
  const hm = d.heatmap || {};
  const years = hm.years || [];
  const rows = hm.rows || [];
  const el = document.getElementById('nh-heatmap');
  if (!el) return;
  const title = document.getElementById('nh-heat-title');
  if (title) title.textContent = '🔥 月度冷热热力图（1997 至今，%）';
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
  const title = document.getElementById('nh-heat-title');
  if (title) title.textContent = '🔥 年度涨跌热力图（1986 至今，%）';
  if (!annual.length) {
    el.innerHTML = '<div class="nh-empty">暂无数据</div>';
    return;
  }
  const cells = annual.map((a) => {
    const s = heatStyle(a.return_pct);
    return `
      <div class="nh-year-cell" style="background:${s.bg};color:${s.fg}" title="${a.year} 年：${pctText(a.return_pct)}">
        <span class="nh-year-cell-year">${a.year}</span>
        <span class="nh-year-cell-val">${pctText(a.return_pct)}</span>
      </div>`;
  }).join('');
  el.innerHTML = `<div class="nh-year-heat">${cells}</div>`;
}

async function saveHeatmap() {
  const heatEl = document.getElementById('nh-heatmap');
  if (!heatEl || !DATA) return;
  const poster = document.createElement('div');
  poster.className = 'nh-poster';
  // 必须放在视口内（top:0/left:0 + z-index:-1），离屏 -9999px 会让 html-to-image 渲染空白
  poster.style.position = 'fixed';
  poster.style.top = '0';
  poster.style.left = '0';
  poster.style.zIndex = '-1';
  const label = heatView === 'month' ? '月度冷热热力图' : '年度涨跌热力图';
  poster.innerHTML = `
    <div class="nh-poster-title">纳指图谱 · ${label}</div>
    ${heatEl.innerHTML}
    <div class="nh-poster-foot">数据更新于 ${(DATA.generated_at || '').slice(0, 10)} · QDII Tracker</div>`;
  document.body.appendChild(poster);
  try {
    await previewAndDownload(poster, pngFilename('qdii-nasdaq-heat'));
  } catch (e) {
    console.error('heatmap save error:', e);
  } finally {
    poster.remove();
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
  document.querySelectorAll('#nh-heat-toggle .nh-seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      heatView = btn.dataset.heat;
      document.querySelectorAll('#nh-heat-toggle .nh-seg').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (DATA) renderHeatmap(DATA);
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
