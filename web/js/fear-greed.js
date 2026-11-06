// ============================================================================
// fear-greed.js — CNN 恐慌与贪婪仪表盘（模块 4.1）
// ============================================================================
// 数据源：web/data/cnn-fear-greed.json（由 scripts/pipeline/cnn_sentiment.py 生成）
// 配色与 VIX & PE 阶梯定投一致：低分恐慌 = 绿色机会，高分贪婪 = 红色风险。
// ============================================================================

import { saveNodeAsPng, pngFilename } from './save-image.js?v=dev';

const FG_BANDS = [
  { key: 'extreme_fear', label: '极度恐慌', lo: 0, hi: 25, w: 25 },
  { key: 'fear', label: '恐惧', lo: 25, hi: 45, w: 20 },
  { key: 'neutral', label: '中性', lo: 45, hi: 55, w: 10 },
  { key: 'greed', label: '贪婪', lo: 55, hi: 75, w: 20 },
  { key: 'extreme_greed', label: '极度贪婪', lo: 75, hi: 100, w: 25 },
];

const FG_TONE = {
  extreme_fear: 'fg-green',
  fear: 'fg-green',
  neutral: 'fg-amber',
  greed: 'fg-red',
  extreme_greed: 'fg-red',
};

function sparkline(history) {
  if (!history || history.length < 2) return '<div class="fg-empty">暂无历史序列</div>';
  const scores = history.map((h) => h.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = Math.max(max - min, 1);
  const W = 360;
  const H = 64;
  const pad = 3;
  const pts = history.map((h, i) => {
    const x = pad + (W - pad * 2) * i / (history.length - 1);
    const y = H - pad - (H - pad * 2) * (h.score - min) / span;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const area = `${pad},${H - pad} ${pts} ${W - pad},${H - pad}`;
  const refs = [25, 45, 55, 75].map((v) => {
    const y = H - pad - (H - pad * 2) * (v - min) / span;
    return `<line x1="${pad}" y1="${y.toFixed(1)}" x2="${W - pad}" y2="${y.toFixed(1)}" class="fg-ref"/>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" class="fg-spark-svg" preserveAspectRatio="none" role="img" aria-label="恐慌贪婪历史走势">
      <polygon points="${area}" class="fg-area"/>
      ${refs}
      <polyline points="${pts}" class="fg-line"/>
    </svg>`;
}

function render(d) {
  const root = document.getElementById('fear-greed');
  if (!root) return;
  if (!d || d.score == null) {
    root.innerHTML = '<div class="fg-empty">恐慌贪婪数据暂不可用</div>';
    return;
  }

  const marker = Math.max(0, Math.min(100, d.score));
  const segments = FG_BANDS.map((b) =>
    `<div class="fg-seg ${FG_TONE[b.key]}" style="width:${b.w}%" title="${b.label} ${b.lo}-${b.hi}"></div>`
  ).join('');
  const labels = FG_BANDS.map((b) => `<span class="fg-band-label">${b.label}</span>`).join('');

  const prev = d.previous || {};
  const time = d.timestamp ? d.timestamp.slice(0, 10) : (d.generated_at || '').slice(0, 10);

  root.innerHTML = `
    <div class="fg-head">
      <span class="fg-title">🎭 CNN 恐慌与贪婪</span>
      <span class="fg-head-right">
        <span class="fg-time">${time || '--'}</span>
        <button type="button" class="temp-save-btn fg-save" title="保存图片">保存图片</button>
      </span>
    </div>
    <div class="fg-main">
      <div class="fg-score">
        <span class="fg-score-num">${d.score.toFixed(1)}</span>
        <span class="fg-score-label ${FG_TONE[d.band] || 'fg-amber'}">${d.label || '--'}</span>
      </div>
      <div class="fg-gauge">
        <div class="fg-bar">
          <div class="fg-marker" style="left:${marker.toFixed(1)}%"></div>
          ${segments}
        </div>
        <div class="fg-band-labels">${labels}</div>
      </div>
    </div>
    <div class="fg-spark">${sparkline(d.history)}</div>
    <div class="fg-context">
      <span>昨收 ${prev.close ?? '--'}</span>
      <span>上周 ${prev.week ?? '--'}</span>
      <span>上月 ${prev.month ?? '--'}</span>
      <span>去年 ${prev.year ?? '--'}</span>
    </div>`;

  root.querySelector('.fg-save').addEventListener('click', () => {
    saveNodeAsPng(root.closest('.fg-card') || root, pngFilename('qdii-cnn-fear-greed'));
  });
}

export function start() {
  const root = document.getElementById('fear-greed');
  if (!root) return;
  root.innerHTML = '<div class="fg-empty">恐慌贪婪加载中…</div>';
  fetch('./data/cnn-fear-greed.json', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then(render)
    .catch(() => render(null));
}
