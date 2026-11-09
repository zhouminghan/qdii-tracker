// ============================================================================
// big-tech.js — 美股科技七姐妹实时行情（模块 3.2）
// ============================================================================
// 数据源：腾讯行情 qt.gtimg.cn（与 market-indices.js 同源同机制）。
// 字段映射（us*）：[3]=最新价 [31]=涨跌额 [32]=涨跌幅%。
// 颜色口径与全站一致：红涨绿跌。
// ============================================================================

import { saveNodeAsPng, pngFilename } from './save-image.js?v=dev';

const BIG_TECH = [
  { qq: 'usAAPL', name: '苹果', en: 'AAPL' },
  { qq: 'usMSFT', name: '微软', en: 'MSFT' },
  { qq: 'usNVDA', name: '英伟达', en: 'NVDA' },
  { qq: 'usGOOG', name: '谷歌', en: 'GOOG' },
  { qq: 'usAMZN', name: '亚马逊', en: 'AMZN' },
  { qq: 'usMETA', name: 'Meta', en: 'META' },
  { qq: 'usTSLA', name: '特斯拉', en: 'TSLA' },
];

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
    change: num(raw.change) ?? 0,
    changePct: num(raw.change_pct) ?? 0,
    asOf: raw.as_of || null,
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

function parse(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const p = raw.split('~');
  const price = num(p[3]);
  if (price == null || price <= 0) return null;
  return {
    price,
    change: num(p[31]) ?? 0,
    changePct: num(p[32]) ?? 0,
  };
}

async function fetchAll() {
  const codes = BIG_TECH.map((s) => s.qq).join(',');
  return window.jsonpFetch(`https://qt.gtimg.cn/q=${codes}&t=${Date.now()}`, {
    timeoutMs: 8000,
    failValue: {},
    onData: () => {
      const out = {};
      for (const s of BIG_TECH) {
        out[s.qq] = parse(window['v_' + s.qq]);
      }
      return out;
    },
  });
}

function render(map, meta = {}) {
  const root = document.getElementById('big-tech');
  if (!root) return;
  const status = meta.label || localStatus(localSnapshot);
  const cards = BIG_TECH.map((s) => {
    const d = map[s.qq];
    const lastPrice = d ? d.price.toFixed(2) : '';
    const attr = `data-symbol="${s.qq}" data-last-price="${lastPrice}" role="button" tabindex="0" title="点击查看历史走势${d && d.asOf ? ' · 本地收盘 ' + d.asOf : ''}"`;
    if (!d) {
      return `
        <div class="bt-card" ${attr}>
          <div class="bt-name">${s.name}<span class="bt-en">${s.en}</span></div>
          <div class="bt-price">--</div>
          <div class="bt-chg bt-flat">本地快照暂无数据</div>
        </div>`;
    }
    const up = d.changePct > 0.005;
    const flat = Math.abs(d.changePct) < 0.005;
    const cls = flat ? 'bt-flat' : up ? 'bt-up' : 'bt-down';
    const arrow = flat ? '—' : up ? '↑' : '↓';
    return `
      <div class="bt-card" ${attr}>
        <div class="bt-name">${s.name}<span class="bt-en">${s.en}</span></div>
        <div class="bt-price">${d.price.toFixed(2)}</div>
        <div class="bt-chg ${cls}">${arrow} ${up ? '+' : ''}${d.changePct.toFixed(2)}%</div>
      </div>`;
  }).join('');

  root.innerHTML = `
    <div class="bt-title-row">
      <span class="bt-title">🚀 科技七姐妹</span>
      <span class="bt-sub" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${status}</span>
      <button type="button" class="temp-save-btn bt-refresh" style="margin-left:0;padding:2px 8px;font-size:11px" title="刷新实时行情">刷新</button>
      <button type="button" class="temp-save-btn bt-save" style="margin-left:0" title="保存图片">保存图片</button>
    </div>
    <div class="bt-cards">${cards}</div>`;

  root.querySelector('.bt-save').addEventListener('click', () => {
    saveNodeAsPng(root, pngFilename('qdii-big-tech'));
  });
  root.querySelector('.bt-refresh').addEventListener('click', requestExternalRefresh);
}

function renderCurrent() {
  const map = { ...localMap, ...liveMap };
  const label = hasLive ? '📡 实时行情 · 已刷新' : localStatus(localSnapshot);
  render(map, { label });
}

function renderLocalSnapshot(snapshot) {
  localSnapshot = snapshot;
  const items = (snapshot && snapshot.big_tech && snapshot.big_tech.items) || {};
  localMap = {};
  for (const s of BIG_TECH) {
    const quote = quoteFromSnapshot(items[s.qq]);
    if (quote) localMap[s.qq] = quote;
  }
  if (!hasLive) renderCurrent();
}

async function refresh() {
  if (refreshing || !canUseExternal()) return;
  refreshing = true;
  try {
    const map = await fetchAll();
    const updates = {};
    for (const s of BIG_TECH) {
      if (map[s.qq]) updates[s.qq] = map[s.qq];
    }
    if (Object.keys(updates).length) {
      liveMap = { ...liveMap, ...updates };
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
  if (!document.getElementById('big-tech')) return;
  render({}, { label: '💾 本地快照 · 读取中' });
  loadLocalSnapshot().then(renderLocalSnapshot);
  // 实时行情只在用户点击卡片区「刷新」后、idle 且满 2.5s 时拉取。
}
