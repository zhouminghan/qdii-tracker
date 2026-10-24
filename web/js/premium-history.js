/**
 * premium-history.js — 场内 ETF 历史溢价曲线
 *
 * 读取 pipeline 生成的 data/etf-premium-history.json，弹 modal 画溢价时序折线。
 * 溢价口径与实时溢价一致：(场内价 - 净值) / 净值（历史净值替代盘中 IOPV）。
 */
(function () {
  const MODAL_ID = 'premium-history-modal';

  function path(points, w, h) {
    if (!points || points.length < 2) return null;
    let min = Infinity, max = -Infinity;
    for (const p of points) { if (p < min) min = p; if (p > max) max = p; }
    const range = max - min || 1;
    const pad = 8;
    return points.map((v, i) => {
      const x = pad + (i / (points.length - 1)) * (w - 2 * pad);
      const y = pad + (1 - (v - min) / range) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  function render(code, name, series) {
    const old = document.getElementById(MODAL_ID);
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'hp-overlay';
    const pts = path(series.map(s => s.premium), 720, 220);
    const body = pts
      ? `<svg viewBox="0 0 720 220" class="w-full" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="#e11d48" stroke-width="1.5"/><line x1="8" y1="${220 - 8}" x2="${720 - 8}" y2="${220 - 8}" stroke="currentColor" stroke-opacity="0.25"/></svg>
        <div class="flex justify-between text-[10px] text-stone-400 mt-1"><span>${series[0].date}</span><span>${series[series.length - 1].date}</span></div>`
      : '<div class="py-10 text-center text-stone-400 text-sm">暂无历史溢价数据（下次数据同步后生成）</div>';
    modal.innerHTML = `
      <div class="hp-panel" role="dialog" aria-modal="true" aria-label="历史溢价曲线">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-base font-bold">📈 ${name}，历史溢价</h2>
          <button type="button" class="hp-close" aria-label="关闭" onclick="document.getElementById('${MODAL_ID}').remove()">✕</button>
        </div>
        <p class="text-xs text-stone-500 dark:text-stone-400 mb-3">溢价 = (场内价 − 净值) ÷ 净值；历史净值替代盘中 IOPV，与实时溢价口径一致。</p>
        ${body}
      </div>`;
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  window.openPremiumHistory = async function (code) {
    const state = window.STATE || {};
    let name = String(code);
    if (state.data && state.data.etf) {
      for (const s of state.data.etf.series || []) {
        const sh = (s.shares || []).find(x => x.code === code);
        if (sh) { name = sh.name || name; break; }
      }
    }
    try {
      const res = await fetch(`./data/etf-premium-history.json?t=${Date.now()}`);
      if (!res.ok) throw new Error('no data');
      const d = await res.json();
      render(String(code), name, d.premiums && d.premiums[code] || []);
    } catch (_) {
      render(String(code), name, []);
    }
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const m = document.getElementById(MODAL_ID);
      if (m) m.remove();
    }
  });
})();
