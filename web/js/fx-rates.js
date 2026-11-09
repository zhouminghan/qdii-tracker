// ============================================================================
// fx-rates.js — 常用外汇汇率区（按基础货币分组：美元系 / 人民币系 / 港元系）
// ============================================================================
// 数据源：腾讯行情 qt.gtimg.cn（fx*），离岸人民币走东财 133.USDCNH。
// 互换对（人民币/美元、港元/美元）由直接对倒数计算，腾讯未提供对应代码。
// fx* 字段：[3]=最新价 [12]=涨跌额 [13]=涨跌幅%。
// ============================================================================


const FX_TEN = [
  { qq: 'fxUSDCNY', name: '美元 / 人民币', en: 'USD/CNY', digits: 4 },
  { qq: 'fxUSDHKD', name: '美元 / 港元',   en: 'USD/HKD', digits: 4 },
  { qq: 'fxUSDJPY', name: '美元 / 日元',   en: 'USD/JPY', digits: 2 },
  { qq: 'fxCNYHKD', name: '人民币 / 港元', en: 'CNY/HKD', digits: 4 },
  { qq: 'fxCNYJPY', name: '人民币 / 日元', en: 'CNY/JPY', digits: 2 },
  { qq: 'fxHKDCNY', name: '港元 / 人民币', en: 'HKD/CNY', digits: 4 },
];

const FX_GROUPS = [
  {
    label: '美元系',
    items: [
      { key: 'usdcnh', name: '美元 / 离岸人民币', en: 'USD/CNH', digits: 4 },
      { key: 'fxUSDCNY', name: '美元 / 人民币', en: 'USD/CNY', digits: 4 },
      { key: 'fxUSDHKD', name: '美元 / 港元', en: 'USD/HKD', digits: 4 },
      { key: 'fxUSDJPY', name: '美元 / 日元', en: 'USD/JPY', digits: 2 },
    ],
  },
  {
    label: '人民币系',
    items: [
      { key: 'cnyusd', name: '人民币 / 美元', en: 'CNY/USD', digits: 4 },
      { key: 'fxCNYHKD', name: '人民币 / 港元', en: 'CNY/HKD', digits: 4 },
      { key: 'fxCNYJPY', name: '人民币 / 日元', en: 'CNY/JPY', digits: 2 },
    ],
  },
  {
    label: '港元系',
    items: [
      { key: 'hkdusd', name: '港元 / 美元', en: 'HKD/USD', digits: 4 },
      { key: 'fxHKDCNY', name: '港元 / 人民币', en: 'HKD/CNY', digits: 4 },
    ],
  },
];

const FX_DATA_SYMBOL = {
  usdcnh: 'fxUSDCNH',
  fxUSDCNY: 'fxUSDCNY',
  fxUSDHKD: 'fxUSDHKD',
  fxUSDJPY: 'fxUSDJPY',
  fxCNYHKD: 'fxCNYHKD',
  fxCNYJPY: 'fxCNYJPY',
  fxHKDCNY: 'fxHKDCNY',
  cnyusd: null,
  hkdusd: null,
};

const SNAPSHOT_URL = './data/market-snapshot.json';
const BOOT_AT = Date.now();
const EXTERNAL_MIN_DELAY_MS = 2500;
let localSnapshot = null;
let localMap = {};
let liveMap = {};
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
  };
}

function invertQuote(src) {
  if (!src || !src.price || src.price <= 0) return null;
  return {
    price: 1 / src.price,
    changePct: src.changePct != null ? -src.changePct : null,
    asOf: src.asOf || null,
  };
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

async function fetchUsdCnh() {
  const ut = 'fa5fd1943c7b386f172d6893dbfba10b';
  const hosts = ['push2.eastmoney.com', 'push2delay.eastmoney.com'];
  for (const host of hosts) {
    const r = await window.jsonpFetch(
      (cb) => `https://${host}/api/qt/stock/get?secid=133.USDCNH&fields=f43,f170&cb=${cb}&ut=${ut}`,
      {
        usesCallback: true,
        timeoutMs: 5000,
        failValue: null,
        onData: (d) => {
          const data = d && d.data;
          const price = num(data && data.f43) / 10000;
          return price && price > 0 ? { price, changePct: num(data.f170) / 100 } : null;
        },
      },
    );
    if (r) return r;
  }
  return null;
}

function parse(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const p = raw.split('~');
  const price = num(p[3]);
  if (price == null || price <= 0) return null;
  return { price, changePct: num(p[13]) ?? 0 };
}

async function fetchTen() {
  const codes = FX_TEN.map((s) => s.qq).join(',');
  return window.jsonpFetch(`https://qt.gtimg.cn/q=${codes}&t=${Date.now()}`, {
    timeoutMs: 8000,
    failValue: {},
    onData: () => {
      const out = {};
      for (const s of FX_TEN) out[s.qq] = parse(window['v_' + s.qq]);
      return out;
    },
  });
}

function resolve(item, map) {
  if (item.key === 'cnyusd') return map.cnyusd || invertQuote(map.fxUSDCNY);
  if (item.key === 'hkdusd') return map.hkdusd || invertQuote(map.fxUSDHKD);
  return map[item.key] || null;
}

function chgHtml(pct) {
  const p = num(pct);
  if (p == null) return '<span class="fx-flat">--</span>';
  const up = p > 0.005;
  const flat = Math.abs(p) < 0.005;
  const cls = flat ? 'fx-flat' : up ? 'fx-up' : 'fx-down';
  const arrow = flat ? '—' : up ? '↑' : '↓';
  return `<span class="${cls}">${arrow} ${up ? '+' : ''}${p.toFixed(2)}%</span>`;
}

function cardHtml(item, data) {
  const price = data ? data.price.toFixed(item.digits) : '--';
  const symbol = FX_DATA_SYMBOL[item.key];
  const attr = symbol
    ? `data-symbol="${symbol}" data-last-price="${data ? price : ''}" role="button" tabindex="0" title="点击查看历史走势${data && data.asOf ? ' · 本地收盘 ' + data.asOf : ''}"`
    : '';
  return `
    <div class="fx-card" ${attr}>
      <div class="fx-name">${item.name}</div>
      <div class="fx-en">${item.en}</div>
      <div class="fx-price">${price}</div>
      <div class="fx-chg">${chgHtml(data && data.changePct)}</div>
    </div>`;
}

function render(map, meta = {}) {
  const root = document.getElementById('fx-rates');
  if (!root) return;
  const status = meta.label || localStatus(localSnapshot);
  const groups = FX_GROUPS.map((g) => `
    <div class="fx-group">
      <div class="fx-group-label">${g.label}</div>
      <div class="fx-cards">${g.items.map((it) => cardHtml(it, resolve(it, map))).join('')}</div>
    </div>`).join('');

  root.innerHTML = `
    <div class="fx-head">
      <span class="fx-title">💱 外汇汇率</span>
      <span class="fx-sub" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${status}</span>
      <button type="button" class="temp-save-btn fx-refresh" style="margin-left:0;padding:2px 8px;font-size:11px" title="刷新实时行情">刷新</button>
    </div>
    ${groups}`;
  root.querySelector('.fx-refresh').addEventListener('click', requestExternalRefresh);
}

function renderCurrent() {
  const map = { ...localMap, ...liveMap };
  const label = hasLive ? '📡 实时汇率 · 已刷新' : localStatus(localSnapshot);
  render(map, { label });
}

function renderLocalSnapshot(snapshot) {
  localSnapshot = snapshot;
  const items = (snapshot && snapshot.fx && snapshot.fx.items) || {};
  localMap = {};
  for (const key of Object.keys(FX_DATA_SYMBOL)) {
    const quote = quoteFromSnapshot(items[key]);
    if (quote) localMap[key] = quote;
  }
  if (!hasLive) renderCurrent();
}

async function refresh() {
  if (refreshing || !canUseExternal()) return;
  refreshing = true;
  try {
    const [tenMap, usdcnh] = await Promise.all([fetchTen(), fetchUsdCnh()]);
    const updates = { ...liveMap };
    for (const s of FX_TEN) {
      if (tenMap[s.qq]) updates[s.qq] = tenMap[s.qq];
    }
    if (usdcnh) updates.usdcnh = usdcnh;
    if (updates.fxUSDCNY) updates.cnyusd = invertQuote(updates.fxUSDCNY);
    if (updates.fxUSDHKD) updates.hkdusd = invertQuote(updates.fxUSDHKD);
    if (Object.keys(updates).length) {
      liveMap = updates;
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
  if (!document.getElementById('fx-rates')) return;
  render({}, { label: '💾 本地快照 · 读取中' });
  loadLocalSnapshot().then(renderLocalSnapshot);
  // 实时汇率只在用户点击「刷新」后、idle 且满 2.5s 时拉取。
}
