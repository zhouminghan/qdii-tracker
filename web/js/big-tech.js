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

function num(v) {
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

function render(map) {
  const root = document.getElementById('big-tech');
  if (!root) return;
  const okCount = Object.values(map || {}).filter(Boolean).length;
  if (!okCount) {
    root.innerHTML = '<div class="bt-empty">🚀 科技行情暂时无法刷新，稍后重试</div>';
    return;
  }
  const cards = BIG_TECH.map((s) => {
    const d = map[s.qq];
    if (!d) {
      return `
        <div class="bt-card" data-symbol="${s.qq}">
          <div class="bt-name">${s.name}<span class="bt-en">${s.en}</span></div>
          <div class="bt-price">--</div>
          <div class="bt-chg bt-flat">数据缺失</div>
        </div>`;
    }
    const up = d.changePct > 0.005;
    const flat = Math.abs(d.changePct) < 0.005;
    const cls = flat ? 'bt-flat' : up ? 'bt-up' : 'bt-down';
    const arrow = flat ? '—' : up ? '↑' : '↓';
    return `
      <div class="bt-card" data-symbol="${s.qq}" data-last-price="${d.price.toFixed(2)}" role="button" tabindex="0" title="点击查看历史走势">
        <div class="bt-name">${s.name}<span class="bt-en">${s.en}</span></div>
        <div class="bt-price">${d.price.toFixed(2)}</div>
        <div class="bt-chg ${cls}">${arrow} ${up ? '+' : ''}${d.changePct.toFixed(2)}%</div>
      </div>`;
  }).join('');

  root.innerHTML = `
    <div class="bt-title-row">
      <span class="bt-title">🚀 科技七姐妹</span>
      <span class="bt-sub">美股七巨头实时行情</span>
      <button type="button" class="temp-save-btn bt-save" style="margin-left:auto" title="保存图片">保存图片</button>
    </div>
    <div class="bt-cards">${cards}</div>`;

  root.querySelector('.bt-save').addEventListener('click', () => {
    saveNodeAsPng(root, pngFilename('qdii-big-tech'));
  });
}

export function start() {
  const root = document.getElementById('big-tech');
  if (!root) return;
  root.innerHTML = '<div class="bt-empty">科技行情加载中…</div>';

  async function refresh() {
    try {
      const map = await fetchAll();
      render(map);
    } catch (e) {
      render({});
    }
  }

  refresh();
  setInterval(refresh, 60 * 1000);
}
