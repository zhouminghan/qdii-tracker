// ============================================================================
// gold-hub.js — 黄金多市场实时参考（伦敦金 / 离岸人民币 / 折算金价 / 上海金）
// ============================================================================
// 与 scripts/core/gold.py 保持同一套公式：
//   折合国内金价(元/克) = XAU/USD × USD/CNH ÷ 31.1034768
//   溢价 = Au99.99 − 折合国内金价
// 颜色口径与全站一致：红涨绿跌。
// ============================================================================

import { saveNodeAsPng, pngFilename } from './save-image.js?v=dev';

const OZ_TO_GRAM = 31.1034768;
const EAST_UT = 'fa5fd1943c7b386f172d6893dbfba10b';
let BRANDS = [];
let BRAND_META = {};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function convCnyPerGram(xau, cnh) {
  return xau * cnh / OZ_TO_GRAM;
}

async function fetchHf(symbol, varName, name) {
  return window.jsonpFetch(`https://qt.gtimg.cn/q=${symbol}&t=${Date.now()}`, {
    timeoutMs: 8000,
    failValue: null,
    onData: () => {
      const raw = window[varName];
      if (typeof raw !== 'string' || !raw) return null;
      const p = raw.split(',');
      const price = num(p[0]);
      if (price == null || price <= 0) return null;
      return { price, changePct: num(p[1]) ?? 0, name };
    },
  });
}

async function fetchEast(secid, priceScale) {
  const hosts = ['push2.eastmoney.com', 'push2delay.eastmoney.com'];
  for (const host of hosts) {
    const r = await window.jsonpFetch(
      (cb) => `https://${host}/api/qt/stock/get?secid=${secid}&fields=f43,f58,f169,f170&cb=${cb}&ut=${EAST_UT}`,
      {
        usesCallback: true,
        timeoutMs: 5000,
        failValue: null,
        onData: (d) => {
          const data = d && d.data;
          if (!data) return null;
          const price = num(data.f43) / priceScale;
          if (price == null || price <= 0) return null;
          return {
            price,
            name: data.f58 || '',
            changePct: num(data.f170) / 100,
          };
        },
      },
    );
    if (r) return r;
  }
  return null;
}

function changeHtml(pct) {
  const p = num(pct);
  if (p == null) return '<span class="gold-flat">--</span>';
  const up = p > 0.005;
  const flat = Math.abs(p) < 0.005;
  const cls = flat ? 'gold-flat' : up ? 'gold-up' : 'gold-down';
  const arrow = flat ? '—' : up ? '↑' : '↓';
  return `<span class="${cls}">${arrow} ${up ? '+' : ''}${p.toFixed(2)}%</span>`;
}

function card(title, value, unit, extra, symbol, lastPrice) {
  const attr = symbol
    ? `data-symbol="${symbol}" data-last-price="${lastPrice || ''}" role="button" tabindex="0" title="点击查看历史走势"`
    : '';
  return `
    <div class="gold-card" ${attr}>
      <div class="gold-card-title">${title}</div>
      <div class="gold-card-value">${value}<span class="gold-unit">${unit}</span></div>
      <div class="gold-card-extra">${extra}</div>
    </div>`;
}

function render(au, comex, xau, cnh) {
  const root = document.getElementById('gold-hub');
  if (!root) return;
  if (!xau && !cnh && !au && !comex) {
    root.innerHTML = '<div class="gold-empty">🥇 黄金行情暂时无法刷新，稍后重试</div>';
    return;
  }

  let converted = null;
  let premiumCny = null;
  let premiumPct = null;
  if (xau && cnh) {
    converted = convCnyPerGram(xau.price, cnh.price);
  }
  if (au && converted != null) {
    premiumCny = au.price - converted;
    premiumPct = (au.price / converted - 1) * 100;
  }

  const cards = [];
  cards.push(card(
    '上海金 Au99.99',
    au ? au.price.toFixed(2) : '--',
    '元/克',
    changeHtml(au && au.changePct),
    'au9999',
    au ? au.price.toFixed(2) : '',
  ));
  cards.push(card(
    'COMEX 纽约金',
    comex ? comex.price.toFixed(2) : '--',
    '美元/盎司',
    changeHtml(comex && comex.changePct),
    'comex',
    comex ? comex.price.toFixed(2) : '',
  ));
  cards.push(card(
    '伦敦金 XAU/USD',
    xau ? xau.price.toFixed(2) : '--',
    '美元/盎司',
    changeHtml(xau && xau.changePct),
    'xau',
    xau ? xau.price.toFixed(2) : '',
  ));
  cards.push(card(
    '黄金综合报价',
    converted != null ? converted.toFixed(2) : '--',
    '元/克',
    '按盎司折算',
  ));

  let premiumLine = '';
  if (premiumCny != null) {
    const cls = premiumPct > 0.5 ? 'gold-up' : premiumPct < -0.5 ? 'gold-down' : 'gold-flat';
    const sign = premiumCny > 0 ? '+' : '';
    premiumLine = `
      <div class="gold-premium ${cls}">
        境内溢价：${sign}${premiumCny.toFixed(2)} 元/克（${sign}${premiumPct.toFixed(2)}%）
        <span class="gold-premium-note">= Au99.99 − 折合国内金价</span>
      </div>`;
  }

  const brandHtml = BRANDS.length ? `
    <div class="gold-brand">
      <div class="gold-brand-title">🏬 品牌实物金价（元/克）<span class="gold-brand-meta">${(BRAND_META.generated_at || '').slice(0, 10)}</span></div>
      <table class="gold-brand-table">
        <thead><tr><th>品牌</th><th>足金饰品</th><th>投资金条</th></tr></thead>
        <tbody>
          ${BRANDS.map((b) => `<tr><td>${b.brand}</td><td>${b.ornament ?? '—'}</td><td>${b.investment_bar ?? '—'}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="gold-brand-note">折算/溢价为前端实时；品牌挂牌价为证券之星当日快照（每日更新）</div>
    </div>` : '';

  root.innerHTML = `
    <div class="gold-title-row">
      <span class="gold-hub-title">🥇 黄金多市场</span>
      <span class="gold-hub-sub">上海金 · COMEX · 伦敦金 → 综合报价</span>
      <button type="button" class="temp-save-btn gold-save" style="margin-left:auto" title="保存图片">保存图片</button>
    </div>
    <div class="gold-cards">${cards.join('')}</div>
    ${premiumLine}
    ${brandHtml}`;

  root.querySelector('.gold-save').addEventListener('click', () => {
    saveNodeAsPng(root, pngFilename('qdii-gold-hub'));
  });
}

export function start() {
  const root = document.getElementById('gold-hub');
  if (!root) return;
  root.innerHTML = '<div class="gold-empty">黄金行情加载中…</div>';

  fetch('./data/brand-gold.json', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((d) => { BRAND_META = d || {}; BRANDS = (d && d.brands) || []; refresh(); })
    .catch(() => { BRAND_META = {}; BRANDS = []; refresh(); });

  async function refresh() {
    const [au, comex, xau, cnh] = await Promise.allSettled([
      fetchEast('118.AU9999', 100),
      fetchHf('hf_GC', 'v_hf_GC', 'COMEX纽约金'),
      fetchHf('hf_XAU', 'v_hf_XAU', '伦敦金'),
      fetchEast('133.USDCNH', 10000),
    ]);
    render(
      au.status === 'fulfilled' ? au.value : null,
      comex.status === 'fulfilled' ? comex.value : null,
      xau.status === 'fulfilled' ? xau.value : null,
      cnh.status === 'fulfilled' ? cnh.value : null,
    );
  }

  // 黄金与汇率 5 分钟低频刷新足够；页面隐藏/闲置由浏览器自身暂停定时器成本可控
  setInterval(refresh, 5 * 60 * 1000);
}
