/**
 * market-temperature.js — 「市场温度」Tab 渲染
 *
 * 数据来自 web/data/market-temperature.json（由 scripts/pipeline/market_temperature.py
 * 在 sync / refresh / CI 增量时生成）。纯静态渲染，不实时拉取四个数据源。
 *
 * 分数方向：越高越友好；红 0-39 / 黄 40-70 / 绿 71-100。
 */
(function () {
  const ROOT = document.getElementById('temperature-root');
  const UPDATED = document.getElementById('temperature-updated');
  const DATA_URL = './data/market-temperature.json';

  const INDICATORS = [
    { key: 'nasdaq_trend', name: '纳指趋势', icon: '📈', weight: 0.4, color: '#0ea5e9' },
    { key: 'vix', name: 'VIX 恐慌指数', icon: '🌡️', weight: 0.2, color: '#8b5cf6' },
    { key: 'treasury_10y', name: '10 年期美债', icon: '🏦', weight: 0.2, color: '#f59e0b' },
    { key: 'dxy', name: '美元指数 DXY', icon: '💵', weight: 0.2, color: '#14b8a6' },
  ];

  // 与 scripts/pipeline/market_temperature.py 保持一致
  const BAND_GREEN_MIN = 71;
  const BAND_YELLOW_MIN = 40;
  const NASDAQ_BASE = 50;
  const NASDAQ_SLOPE = 5;

  let data = null;

  function scoreClass(score) {
    if (score == null) return 't-muted';
    if (score >= 71) return 't-good';
    if (score >= 40) return 't-mid';
    return 't-bad';
  }

  function fmtPct(v) {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + Number(v).toFixed(2) + '%';
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function formatRaw(key, raw) {
    if (!raw) return '—';
    switch (key) {
      case 'nasdaq_trend':
        return `${raw.price ?? '—'} · 200日线 ${raw.ma200 ?? '—'} · ${fmtPct(raw.pct_above_ma)}`;
      case 'vix':
        return raw.value != null ? Number(raw.value).toFixed(1) : '—';
      case 'treasury_10y':
        return raw.value != null ? Number(raw.value).toFixed(2) + '%' : '—';
      case 'dxy':
        return raw.value != null ? Number(raw.value).toFixed(1) : '—';
      default:
        return '—';
    }
  }

  function polar(cx, cy, r, score) {
    const ang = Math.PI - (score / 100) * Math.PI;
    return { x: cx + r * Math.cos(ang), y: cy - r * Math.sin(ang) };
  }

  function arcPath(cx, cy, r, s0, s1) {
    const p0 = polar(cx, cy, r, s0);
    const p1 = polar(cx, cy, r, s1);
    const large = (s1 - s0) > 50 ? 1 : 0;
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }

  function gaugeSvg(score) {
    const cx = 100;
    const cy = 96;
    const R = 62;
    const needleDeg = ((score || 0) / 100) * 180;
    const zones = [
      { cls: 'temp-zone-red', s0: 0, s1: 39 },
      { cls: 'temp-zone-yellow', s0: 40, s1: 70 },
      { cls: 'temp-zone-green', s0: 71, s1: 100 },
    ];
    const zoneArcs = zones.map((z) =>
      `<path d="${arcPath(cx, cy, R, z.s0, z.s1)}" class="temp-zone ${z.cls}" />`
    ).join('');
    let ticks = '';
    let tickLabels = '';
    for (let s = 0; s <= 100; s += 10) {
      const major = s % 20 === 0;
      const p0 = polar(cx, cy, R + 2, s);
      const p1 = polar(cx, cy, R + (major ? 11 : 7), s);
      ticks += `<line x1="${p0.x.toFixed(2)}" y1="${p0.y.toFixed(2)}" x2="${p1.x.toFixed(2)}" y2="${p1.y.toFixed(2)}" class="temp-gauge-tick ${major ? 'major' : 'minor'}" />`;
      if (major) {
        const lp = polar(cx, cy, R + 21, s);
        tickLabels += `<text x="${lp.x.toFixed(2)}" y="${(lp.y + 3).toFixed(2)}" text-anchor="middle" class="temp-gauge-tick-label">${s}</text>`;
      }
    }
    return `
      <svg viewBox="0 0 200 150" class="temp-gauge-svg" role="img" aria-label="综合评分 ${score}">
        <path d="${arcPath(cx, cy, R, 0, 100)}" class="temp-gauge-track" />
        ${zoneArcs}
        ${ticks}
        ${tickLabels}
        <g id="temp-gauge-needle" class="temp-gauge-needle ${scoreClass(score)}" transform="rotate(${needleDeg.toFixed(1)} ${cx} ${cy})">
          <line x1="${cx}" y1="${cy}" x2="${cx - (R - 10)}" y2="${cy}" />
          <circle cx="${cx}" cy="${cy}" r="5" />
        </g>
        <text id="temp-gauge-value" x="${cx}" y="124" text-anchor="middle" class="temp-gauge-value">${score ?? '—'}</text>
        <text x="${cx}" y="141" text-anchor="middle" class="temp-gauge-unit">综合分 / 100</text>
      </svg>`;
  }

  function donutSvg(weights) {
    const r = 42;
    const c = 2 * Math.PI * r;
    let offset = 0;
    let segs = '';
    for (const ind of INDICATORS) {
      const w = weights && weights[ind.key] != null ? weights[ind.key] : ind.weight;
      const len = c * w;
      segs += `<circle r="${r}" cx="54" cy="54" fill="none" stroke="${ind.color}"
                stroke-width="12" stroke-dasharray="${(len - 1.5).toFixed(1)} ${(c - len + 1.5).toFixed(1)}"
                stroke-dashoffset="${(-offset).toFixed(1)}" class="temp-donut-seg" />`;
      offset += len;
    }
    return `
      <svg viewBox="0 0 108 108" class="temp-donut-svg" role="img" aria-label="权重分布">
        <circle r="${r}" cx="54" cy="54" fill="none" stroke="rgba(120,120,120,.18)" stroke-width="12" />
        ${segs}
      </svg>`;
  }

  function legendHtml(weights) {
    return INDICATORS.map((ind) => {
      const w = weights && weights[ind.key] != null ? weights[ind.key] : ind.weight;
      return `
        <div class="temp-legend-item">
          <span class="temp-legend-dot" style="background:${ind.color}"></span>
          <span class="temp-legend-name">${ind.icon} ${ind.name}</span>
          <span class="temp-legend-pct">${Math.round(w * 100)}%</span>
        </div>`;
    }).join('');
  }

  function trafficLight(band) {
    const bands = ['red', 'yellow', 'green'];
    const labels = { red: '防守', yellow: '中性', green: '机会' };
    return `
      <div id="temp-light" class="temp-light" aria-label="${labels[band] || ''}">
        ${bands.map((b) => `<span class="temp-light-dot ${b} ${b === band ? 'on' : ''}"></span>`).join('')}
      </div>`;
  }

  function indicatorCards() {
    return INDICATORS.map((ind) => {
      const item = (data.indicators && data.indicators[ind.key]) || {};
      const score = item.score;
      return `
        <article class="temp-ind" data-key="${ind.key}">
          <div class="temp-ind-head">
            <span class="temp-ind-name">${ind.icon} ${ind.name}</span>
            <span class="temp-ind-weight">${Math.round((data.weights && data.weights[ind.key] != null ? data.weights[ind.key] : ind.weight) * 100)}%</span>
          </div>
          <div class="temp-ind-score-row">
            <span class="temp-ind-score ${scoreClass(score)}" data-score>${score ?? '—'}</span>
            <span class="temp-ind-label" data-label>${item.label || '暂无数据'}</span>
          </div>
          <div class="temp-ind-raw" data-raw>${formatRaw(ind.key, item.raw)}</div>
          <div class="temp-ind-note" data-note>${item.note || ''}${item.stale ? ' <span class="temp-stale">· 旧数据</span>' : ''}</div>
          <div class="temp-ind-source">${item.source || ''}</div>
        </article>`;
    }).join('');
  }

  function bulletList(title, items, kind) {
    if (!items || !items.length) return '';
    return `
      <div class="temp-interp">
        <div class="temp-interp-title ${kind}">${title}</div>
        <ul class="temp-interp-list">
          ${items.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
        </ul>
      </div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function render() {
    if (!ROOT || !data) return;
    const band = data.band || 'yellow';
    const positives = bulletList('利好因子', data.positives, 't-good');
    const risks = bulletList('风险因子', data.risks, 't-bad');

    ROOT.innerHTML = `
      <div class="temp-hero temp-band-${band}">
        <div class="temp-hero-left">
          ${gaugeSvg(data.score)}
          <div class="temp-score-meta">
            ${trafficLight(band)}
            <div id="temp-verdict" class="temp-verdict">${escapeHtml(data.verdict || '')}</div>
            <div id="temp-summary" class="temp-summary">${escapeHtml(data.summary || '')}</div>
          </div>
        </div>
        <div class="temp-hero-right">
          <div class="temp-donut">${donutSvg(data.weights)}</div>
          <div class="temp-legend">${legendHtml(data.weights)}</div>
        </div>
      </div>
      <div class="temp-grid">${indicatorCards()}</div>
      <div class="temp-interp-grid">${positives}${risks}</div>
      <div class="temp-foot">
        <span>${escapeHtml(data.disclaimer || '')}</span>
        <span class="temp-foot-cal">数据口径：美东收盘价（纳指 / VIX / 美元指数），10 年期美债为日频收益率。</span>
      </div>`;

    if (UPDATED) {
      UPDATED.textContent = `更新于 ${fmtTime(data.generated_at)}`;
    }
    applyLive();
  }

  async function load() {
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      render();
    } catch (_) {
      if (ROOT) {
        ROOT.innerHTML = `
          <div class="temp-empty">
            <div class="text-sm">市场温度数据暂不可用</div>
            <div class="text-xs text-stone-400 dark:text-stone-500 mt-1">首次生成请运行 <code>python3.12 scripts/pipeline/market_temperature.py</code>，或等 GitHub Actions 每日更新。</div>
          </div>`;
      }
    }
  }

  let _htmlToImage = null;
  function loadHtmlToImage() {
    if (_htmlToImage) return Promise.resolve(_htmlToImage);
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js';
      s.onload = function () { _htmlToImage = window.htmlToImage; resolve(_htmlToImage); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function buildPosterNode() {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:fixed', 'left:-9999px', 'top:0', 'width:720px',
      'background:#ffffff', 'color:#1c1917', 'padding:20px', 'box-sizing:border-box',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');
    ['temp-hero', 'temp-grid', 'temp-interp-grid'].forEach(function (cls) {
      const el = ROOT.querySelector('.' + cls);
      if (el) wrap.appendChild(el.cloneNode(true));
    });
    document.body.appendChild(wrap);
    return wrap;
  }

  window.downloadTemperaturePNG = async function () {
    const btn = document.getElementById('temperature-save');
    if (!ROOT || !data || !btn) return;
    btn.disabled = true;
    btn.textContent = '生成中…';

    const wrap = buildPosterNode();
    const wasDark = document.documentElement.classList.contains('dark');
    if (wasDark) document.documentElement.classList.remove('dark');
    try {
      const lib = await loadHtmlToImage();
      const dataUrl = await lib.toPng(wrap, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const dateStr = new Date().toISOString().slice(0, 10);
      const fname = `市场温度-${dateStr}.png`;
      if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        const blob = await (await fetch(dataUrl)).blob();
        await navigator.share({ files: [new File([blob], fname, { type: 'image/png' })] });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fname;
        a.click();
      }
    } catch (e) {
      if (!e || e.name !== 'AbortError') console.error('海报生成失败:', e);
    } finally {
      if (wasDark) document.documentElement.classList.add('dark');
      wrap.remove();
      btn.disabled = false;
      btn.textContent = '保存图片';
    }
  };

  const saveBtn = document.getElementById('temperature-save');
  if (saveBtn) saveBtn.addEventListener('click', () => window.downloadTemperaturePNG());

  // ==================== 盘中实时重算（纳指项 + 综合分） ====================
  let liveTimer = null;

  function nasdaqScoreFromPct(pct) {
    if (pct == null || !isFinite(pct)) return null;
    return Math.max(0, Math.min(100, Math.round(NASDAQ_BASE + pct * NASDAQ_SLOPE)));
  }

  function bandOf(score) {
    if (score >= BAND_GREEN_MIN) return { band: 'green', verdict: '绿灯 · 机会区间', summary: '市场整体偏乐观，适合关注或分批买入。' };
    if (score >= BAND_YELLOW_MIN) return { band: 'yellow', verdict: '黄灯 · 中性区间', summary: '市场处于合理区间，适合定投或谨慎操作。' };
    return { band: 'red', verdict: '红灯 · 防守区间', summary: '市场风险偏高，控制仓位、避免追高。' };
  }

  function labelOf(score) {
    if (score == null) return '暂无数据';
    if (score >= 70) return '趋势偏强';
    if (score >= 40) return '趋势中性';
    return '趋势偏弱';
  }

  function applyLive() {
    const live = window.__mktData && window.__mktData.usNDX;
    const nasdaq = data && data.indicators && data.indicators.nasdaq_trend;
    const raw = nasdaq && nasdaq.raw;
    if (!live || !live.price || !raw || raw.ma200 == null) {
      return false;
    }

    const price = live.price;
    const pct = (price - raw.ma200) / raw.ma200 * 100;
    const ndxScore = nasdaqScoreFromPct(pct);
    const weights = data.weights || {};
    const parts = data.indicators || {};
    const sum = ndxScore * (weights.nasdaq_trend || 0.4)
      + (parts.vix && parts.vix.score || 0) * (weights.vix || 0.2)
      + (parts.treasury_10y && parts.treasury_10y.score || 0) * (weights.treasury_10y || 0.2)
      + (parts.dxy && parts.dxy.score || 0) * (weights.dxy || 0.2);
    const score = Math.round(sum);
    const b = bandOf(score);

    const needle = document.getElementById('temp-gauge-needle');
    if (needle) {
      needle.setAttribute('transform', `rotate(${((score / 100) * 180).toFixed(1)} 100 96)`);
      needle.setAttribute('class', `temp-gauge-needle ${scoreClass(score)}`);
    }
    const val = document.getElementById('temp-gauge-value');
    if (val) val.textContent = score;
    const verdict = document.getElementById('temp-verdict');
    if (verdict) verdict.textContent = b.verdict;
    const summary = document.getElementById('temp-summary');
    if (summary) summary.textContent = b.summary;
    const light = document.getElementById('temp-light');
    if (light) {
      light.querySelectorAll('.temp-light-dot').forEach((d) => {
        d.classList.toggle('on', d.classList.contains(b.band));
      });
    }

    const card = ROOT.querySelector('.temp-ind[data-key="nasdaq_trend"]');
    if (card) {
      const scoreEl = card.querySelector('[data-score]');
      if (scoreEl) {
        scoreEl.textContent = ndxScore;
        scoreEl.setAttribute('class', `temp-ind-score ${scoreClass(ndxScore)}`);
      }
      const labelEl = card.querySelector('[data-label]');
      if (labelEl) labelEl.textContent = labelOf(ndxScore);
      const rawEl = card.querySelector('[data-raw]');
      if (rawEl) rawEl.textContent = `${price.toFixed(2)} · 200日线 ${raw.ma200.toFixed(2)} · ${(pct >= 0 ? '+' : '') + pct.toFixed(2)}%`;
      const noteEl = card.querySelector('[data-note]');
      if (noteEl) noteEl.textContent = `纳指 100 位于 200 日线${pct >= 0 ? '上方' : '下方'} ${Math.abs(pct).toFixed(1)}%`;
    }

    return true;
  }

  function startLive() {
    applyLive();
    liveTimer = setInterval(applyLive, 15 * 1000);
  }

  window.renderTemperature = render;
  load();
  startLive();
})();
