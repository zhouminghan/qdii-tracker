// ============================================================================
// dca-strategy.js — VIX & PE 阶梯定投实操矩阵（模块 4.2）
// ============================================================================
// 与 scripts/core/dca_strategy.py 保持同一套规则，改动时两边同步。
// 规则：CNN 恐慌贪婪指数(0-100) 定阶梯，VIX 做匹配校验，PE 给估值提示。
// ============================================================================

const BANDS = [
  { key: 'extreme_fear', lo: 0, hi: 25, label: '极度恐慌', action: '黄金坑策略', strategy: '大胆加仓 / 倍定投', vixLo: 30, vixHi: null, vixText: 'VIX > 30', tone: 'green' },
  { key: 'fear', lo: 25, hi: 45, label: '恐惧', action: '低位定投', strategy: '正常定投 / 小幅加仓', vixLo: 25, vixHi: 30, vixText: 'VIX 25-30', tone: 'green' },
  { key: 'neutral', lo: 45, hi: 55, label: '中性', action: '常态定投', strategy: '维持规律定投', vixLo: 15, vixHi: 25, vixText: 'VIX 15-25', tone: 'amber' },
  { key: 'greed', lo: 55, hi: 75, label: '贪婪', action: '风险预警', strategy: '停止加仓，保持观望', vixLo: 12, vixHi: 20, vixText: 'VIX 12-20', tone: 'amber' },
  { key: 'extreme_greed', lo: 75, hi: 100, label: '极度贪婪', action: '泡沫高危', strategy: '卖出 / 买入对冲', vixLo: null, vixHi: 15, vixText: 'VIX < 15', tone: 'red' },
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function peLabel(pe) {
  if (pe == null) return '暂无 PE 数据';
  if (pe >= 35) return '估值偏高，注意回撤风险';
  if (pe >= 25) return '估值中性，控制节奏';
  return '估值偏低，长期赔率改善';
}

function bandOf(fg) {
  const f = Math.max(0, Math.min(100, num(fg) == null ? 50 : num(fg)));
  for (let i = 0; i < BANDS.length - 1; i++) {
    if (BANDS[i].lo <= f && f < BANDS[i].hi) return BANDS[i];
  }
  return BANDS[BANDS.length - 1];
}

function strategyOf(fg, vix, pe) {
  const band = bandOf(fg);
  const v = num(vix);
  const p = num(pe);
  let matched = true;
  let note = null;
  if (v == null) {
    matched = false;
    note = '暂无 VIX 数据。';
  } else if (band.vixLo != null && v < band.vixLo) {
    matched = false;
    note = `VIX ${v.toFixed(1)} 低于该阶梯的 ${band.vixText}，恐慌情绪偏弱。`;
  } else if (band.vixHi != null && v > band.vixHi) {
    matched = false;
    note = `VIX ${v.toFixed(1)} 高于该阶梯的 ${band.vixText}，波动风险偏高。`;
  }
  return { band, matched, note, peLabel: peLabel(p) };
}

function toneClass(tone) {
  return tone === 'green' ? 'dca-tone-green' : tone === 'red' ? 'dca-tone-red' : 'dca-tone-amber';
}

function render() {
  const fg = document.getElementById('dca-fg').value;
  const vix = document.getElementById('dca-vix').value;
  const pe = document.getElementById('dca-pe').value;
  const r = strategyOf(fg, vix, pe);
  const tone = toneClass(r.band.tone);

  const verdict = document.getElementById('dca-verdict');
  verdict.innerHTML = `
    <div class="dca-verdict ${tone}">${r.band.label} · ${r.band.action}</div>
    <div class="dca-strategy">${r.band.strategy}</div>
    <div class="dca-notes">
      <span class="${r.matched ? 'dca-ok' : 'dca-warn'}">${r.matched ? '✓ VIX 匹配' : '△ VIX 偏离'}（${r.band.vixText}）</span>
      <span>${r.peLabel}</span>
    </div>
    ${r.note ? `<div class="dca-note">${r.note}</div>` : ''}`;

  const matrix = document.getElementById('dca-matrix');
  matrix.innerHTML = BANDS.map((b) => `
    <div class="dca-row ${b.key === r.band.key ? 'dca-row-active ' + toneClass(b.tone) : ''}">
      <span class="dca-col-range">${b.lo}-${b.hi}</span>
      <span class="dca-col-state">${b.label}</span>
      <span class="dca-col-action">${b.action}</span>
      <span class="dca-col-strategy">${b.strategy}</span>
    </div>`).join('');
}

export function start() {
  const root = document.getElementById('dca-root');
  if (!root) return;
  root.innerHTML = `
    <div class="dca-controls">
      <label class="dca-field dca-field-fg">
        <span class="dca-label">CNN 恐慌贪婪指数 <b id="dca-fg-val">50</b></span>
        <input id="dca-fg" type="range" min="0" max="100" step="1" value="50" />
        <span class="dca-scale"><i>极度恐慌</i><i>恐惧</i><i>中性</i><i>贪婪</i><i>极度贪婪</i></span>
      </label>
      <label class="dca-field">
        <span class="dca-label">VIX</span>
        <input id="dca-vix" type="number" inputmode="decimal" min="0" step="0.1" value="20" />
      </label>
      <label class="dca-field">
        <span class="dca-label">纳指 PE</span>
        <input id="dca-pe" type="number" inputmode="decimal" min="0" step="0.1" value="30" />
      </label>
    </div>
    <div id="dca-verdict" class="dca-verdict-box"></div>
    <div id="dca-matrix" class="dca-matrix"></div>
    <div class="dca-disclaimer">历史数据与模型策略不代表未来收益，不构成具体买卖建议。</div>`;

  const fgEl = document.getElementById('dca-fg');
  const fgVal = document.getElementById('dca-fg-val');
  fgEl.addEventListener('input', () => {
    fgVal.textContent = fgEl.value;
    render();
  });
  ['dca-vix', 'dca-pe'].forEach((id) => {
    document.getElementById(id).addEventListener('input', render);
  });

  render();

  // 用市场温度里的实时 VIX 预填（若可用），并覆盖默认 20
  fetch('./data/market-temperature.json', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((d) => {
      const v = d && d.indicators && d.indicators.vix && d.indicators.vix.raw && d.indicators.vix.raw.value;
      if (v != null) {
        document.getElementById('dca-vix').value = Number(v).toFixed(1);
        render();
      }
    })
    .catch(() => {});

  // 用 CNN 恐慌贪婪实时读数预填情绪滑杆（若可用）
  fetch('./data/cnn-fear-greed.json', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((d) => {
      if (d && d.score != null) {
        const fgEl = document.getElementById('dca-fg');
        const fgVal = document.getElementById('dca-fg-val');
        fgEl.value = Math.round(d.score);
        fgVal.textContent = Math.round(d.score);
        render();
      }
    })
    .catch(() => {});

  // 用人工维护的纳指 PE 预填（若已录入）
  fetch('./data/ndx-pe.json', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((d) => {
      if (d && d.pe != null) {
        document.getElementById('dca-pe').value = Number(d.pe).toFixed(1);
        render();
      }
    })
    .catch(() => {});
}
