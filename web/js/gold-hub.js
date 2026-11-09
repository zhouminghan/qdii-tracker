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
const SNAPSHOT_URL = './data/market-snapshot.json';
const BOOT_AT = Date.now();
const EXTERNAL_MIN_DELAY_MS = 2500;
let localSnapshot = null;
let localGold = {};
let localExtra = {};
let liveGold = {};
let hasLive = false;
let refreshing = false;
let refreshPending = false;

function loadLocalSnapshot() {
  if (window.__marketSnapshot) return Promise.resolve(window.__marketSnapshot);
  if (!window.__marketSnapshotPromise) {
    window.__marketSnapshotPromise = fetch(SNAPSHOT_URL, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((snapshot) => {
        window.__marketSnapshot = snapshot || null;
        return snapshot || null;
      })
      .catch(() => null);
  }
  return window.__marketSnapshotPromise;
}

function snapshotStamp(snapshot) {
  const iso = snapshot && snapshot.generated_at;
  if (!iso) return '时间未知';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function localStatus(snapshot) {
  return snapshot
    ? `💾 本地快照 · 更新于 ${snapshotStamp(snapshot)}`
    : '💾 本地快照不可用 · 等待后台刷新';
}

function quoteFromSnapshot(raw) {
  const price = num(raw && raw.price);
  if (price == null || price <= 0) return null;
  return {
    price,
    changePct: num(raw.change_pct),
    asOf: raw.as_of || null,
    derived: !!raw.derived,
    source: 'local',
  };
}

function valueFromSnapshot(raw) {
  const value = num(raw && raw.value);
  return value == null ? null : value;
}

function marketPanelVisible() {
  const panel = document.getElementById('market-overview');
  return !!panel && panel.style.display !== 'none' && panel.getAttribute('aria-hidden') !== 'true';
}

function canUseExternal() {
  return Date.now() - BOOT_AT >= EXTERNAL_MIN_DELAY_MS && !document.hidden && marketPanelVisible();
}

function onIdleAfterBoot(task) {
  const wait = Math.max(0, EXTERNAL_MIN_DELAY_MS - (Date.now() - BOOT_AT));
  setTimeout(() => {
    const run = () => { if (canUseExternal()) task(); };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 1000 });
    } else {
      setTimeout(run, 0);
    }
  }, wait);
}

function requestExternalRefresh() {
  if (refreshPending) return;
  refreshPending = true;
  onIdleAfterBoot(() => { refreshPending = false; refresh(); });
}

function num(v) {
  if (v === null || v === '' || v === undefined) return null;
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

function render(au, comex, xau, cnh, extra = {}, meta = {}) {
  const root = document.getElementById('gold-hub');
  if (!root) return;
  const status = meta.label || localStatus(localSnapshot);
  const xauDerived = !!extra.xauDerived;
  let converted = extra.converted;
  let premiumCny = extra.premiumCny;
  let premiumPct = extra.premiumPct;
  if (extra.allowCompute && xau && cnh) {
    converted = convCnyPerGram(xau.price, cnh.price);
    if (au && !xauDerived) {
      premiumCny = au.price - converted;
      premiumPct = (au.price / converted - 1) * 100;
    }
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
    comex ? changeHtml(comex.changePct) : '💾 本地快照暂无 COMEX 收盘',
    'comex',
    comex ? comex.price.toFixed(2) : '',
  ));
  cards.push(card(
    xauDerived ? '伦敦金折算 XAU/USD' : '伦敦金 XAU/USD',
    xau ? xau.price.toFixed(2) : '--',
    '美元/盎司',
    xau
      ? `${changeHtml(xau.changePct)}${xauDerived ? '<span class="gold-premium-note">按上海金/USDCNH 折算</span>' : ''}`
      : '💾 本地快照暂无伦敦金',
    'xau',
    xau ? xau.price.toFixed(2) : '',
  ));
  cards.push(card(
    '黄金综合报价',
    converted != null ? converted.toFixed(2) : '--',
    '元/克',
    xauDerived ? '按上海金折算' : '按盎司折算',
  ));
  cards.push(card(
    '美元 / 离岸人民币',
    cnh ? cnh.price.toFixed(4) : '--',
    '',
    changeHtml(cnh && cnh.changePct),
    'fxUSDCNH',
    cnh ? cnh.price.toFixed(4) : '',
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
  } else if (xauDerived) {
    premiumLine = `
      <div class="gold-premium gold-flat">
        💾 本地快照缺少独立伦敦金，暂不计算境内溢价
        <span class="gold-premium-note">避免上海金反推造成 0 溢价</span>
      </div>`;
  }

  const brandHtml = BRANDS.length ? `
    <div class="gold-brand">
      <div class="gold-brand-title">🏬 品牌实物金价（元/克）<span class="gold-brand-meta">${(BRAND_META.generated_at || BRAND_META.as_of || '').slice(0, 10)}</span></div>
      <table class="gold-brand-table">
        <thead><tr><th>品牌</th><th>足金饰品</th><th>投资金条</th></tr></thead>
        <tbody>
          ${BRANDS.map((b) => `<tr><td>${b.brand}</td><td>${b.ornament ?? '—'}</td><td>${b.investment_bar ?? '—'}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="gold-brand-note">💾 本地快照 · 品牌挂牌价为每日快照；实时折算/溢价在外部刷新后更新</div>
    </div>` : '';

  root.innerHTML = `
    <div class="gold-title-row">
      <span class="gold-hub-title">🥇 黄金多市场</span>
      <span class="gold-hub-sub" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${status}</span>
      <button type="button" class="temp-save-btn gold-refresh" style="margin-left:0;padding:2px 8px;font-size:11px" title="刷新实时行情">刷新</button>
      <button type="button" class="temp-save-btn gold-save" style="margin-left:0" title="保存图片">保存图片</button>
    </div>
    <div class="gold-cards">${cards.join('')}</div>
    ${premiumLine}
    ${brandHtml}`;

  root.querySelector('.gold-save').addEventListener('click', () => {
    saveNodeAsPng(root, pngFilename('qdii-gold-hub'));
  });
  root.querySelector('.gold-refresh').addEventListener('click', requestExternalRefresh);
}

function renderCurrent() {
  const quotes = { ...localGold, ...liveGold };
  const hasLivePair = !!(liveGold.xau && liveGold.cnh);
  const xauDerived = !!(quotes.xau && quotes.xau.derived && !liveGold.xau);
  const extra = hasLivePair
    ? { allowCompute: true, xauDerived }
    : { ...localExtra, xauDerived };
  const label = hasLive ? '📡 实时行情 · 已刷新' : localStatus(localSnapshot);
  render(quotes.au, quotes.comex, quotes.xau, quotes.cnh, extra, { label });
}

function renderLocalSnapshot(snapshot) {
  localSnapshot = snapshot;
  const gold = (snapshot && snapshot.gold) || {};
  localGold = {};
  for (const key of ['au9999', 'comex', 'xau', 'usdcnh']) {
    const quote = quoteFromSnapshot(gold[key]);
    if (quote) localGold[key === 'au9999' ? 'au' : key === 'usdcnh' ? 'cnh' : key] = quote;
  }
  localExtra = {
    converted: valueFromSnapshot(gold.converted_cny_per_gram),
    premiumCny: valueFromSnapshot(gold.premium_cny),
    premiumPct: valueFromSnapshot(gold.premium_pct),
    xauDerived: !!(gold.xau && gold.xau.derived),
    allowCompute: false,
  };
  BRAND_META = (snapshot && snapshot.brand_gold) || {};
  BRANDS = BRAND_META.brands || [];
  if (!hasLive) renderCurrent();
}

async function refresh() {
  if (refreshing || !canUseExternal()) return;
  refreshing = true;
  try {
    const [au, comex, xau, cnh] = await Promise.allSettled([
      fetchEast('118.AU9999', 100),
      fetchHf('hf_GC', 'v_hf_GC', 'COMEX纽约金'),
      fetchHf('hf_XAU', 'v_hf_XAU', '伦敦金'),
      fetchEast('133.USDCNH', 10000),
    ]);
    const values = {
      au: au.status === 'fulfilled' ? au.value : null,
      comex: comex.status === 'fulfilled' ? comex.value : null,
      xau: xau.status === 'fulfilled' ? xau.value : null,
      cnh: cnh.status === 'fulfilled' ? cnh.value : null,
    };
    let ok = false;
    for (const key of Object.keys(values)) {
      if (values[key]) {
        liveGold[key] = { ...values[key], source: 'live' };
        ok = true;
      }
    }
    if (ok) {
      hasLive = true;
      renderCurrent();
    }
  } catch (_) {
    // 外部刷新失败时保留本地快照，不写回空卡片。
  } finally {
    refreshing = false;
  }
}

export function start() {
  if (!document.getElementById('gold-hub')) return;
  render(null, null, null, null, {}, { label: '💾 本地快照 · 读取中' });
  loadLocalSnapshot().then(renderLocalSnapshot);
  // 实时黄金行情只在用户点击「刷新」后、idle 且满 2.5s 时拉取。
}
