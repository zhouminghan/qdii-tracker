// ============================================================================
// macro-rates.js — 宏观利率与估值区（美债 2/10/30 年 + VIX + 纳指 PE）
// ============================================================================
// 数据源：web/data/macro-rates.json（美债）、market-temperature.json（VIX）、
// ndx-pe.json（PE）。展示于「纳指图谱」Tab 顶部。
// ============================================================================

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  return res.ok ? res.json() : null;
}

function smallCard(label, value, unit) {
  return `
    <div class="mr-card">
      <div class="mr-card-label">${label}</div>
      <div class="mr-card-value">${value}<span class="mr-unit">${unit || ''}</span></div>
    </div>`;
}

function render(treasury, vix, pe) {
  const root = document.getElementById('macro-rates');
  if (!root) return;
  root.innerHTML = `
    <div class="mr-cards">
      ${smallCard('美债 2 年', treasury && treasury.y2 != null ? treasury.y2.toFixed(2) : '--', '%')}
      ${smallCard('美债 10 年', treasury && treasury.y10 != null ? treasury.y10.toFixed(2) : '--', '%')}
      ${smallCard('美债 30 年', treasury && treasury.y30 != null ? treasury.y30.toFixed(2) : '--', '%')}
      ${smallCard('VIX 恐慌指数', vix != null ? vix.toFixed(1) : '--', '')}
      ${smallCard('纳指 100 PE', pe != null ? pe.toFixed(1) : '--', '')}
    </div>`;
}

export function start() {
  const root = document.getElementById('macro-rates');
  if (!root) return;
  root.innerHTML = '<div class="mr-loading">宏观行情加载中…</div>';

  Promise.all([
    fetchJson('./data/macro-rates.json'),
    fetchJson('./data/market-temperature.json'),
    fetchJson('./data/ndx-pe.json'),
  ]).then(([mr, temp, pe]) => {
    const treasury = mr && mr.treasury;
    const vix = temp && temp.indicators && temp.indicators.vix && temp.indicators.vix.raw && num(temp.indicators.vix.raw.value);
    render(treasury, vix, pe && pe.pe);
  }).catch(() => render(null, null, null));
}
