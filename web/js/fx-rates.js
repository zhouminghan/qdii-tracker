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

function num(v) {
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

function resolve(item, map, usdcnh) {
  if (item.key === 'usdcnh') {
    return usdcnh ? { price: usdcnh.price, changePct: usdcnh.changePct, dataSymbol: 'fxUSDCNH' } : null;
  }
  if (item.key === 'cnyusd') {
    const src = map.fxUSDCNY;
    return src ? { price: 1 / src.price, changePct: src.changePct != null ? -src.changePct : null, dataSymbol: null } : null;
  }
  if (item.key === 'hkdusd') {
    const src = map.fxUSDHKD;
    return src ? { price: 1 / src.price, changePct: src.changePct != null ? -src.changePct : null, dataSymbol: null } : null;
  }
  const src = map[item.key];
  return src ? { price: src.price, changePct: src.changePct, dataSymbol: item.key } : null;
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
  const attr = data && data.dataSymbol
    ? `data-symbol="${data.dataSymbol}" data-last-price="${price}" role="button" tabindex="0" title="点击查看历史走势"`
    : '';
  return `
    <div class="fx-card" ${attr}>
      <div class="fx-name">${item.name}</div>
      <div class="fx-en">${item.en}</div>
      <div class="fx-price">${price}</div>
      <div class="fx-chg">${chgHtml(data && data.changePct)}</div>
    </div>`;
}

function render(map, usdcnh) {
  const root = document.getElementById('fx-rates');
  if (!root) return;
  const ok = Object.values(map || {}).filter(Boolean).length || usdcnh;
  if (!ok) {
    root.innerHTML = '<div class="fx-empty">💱 外汇行情加载中…</div>';
    return;
  }
  const groups = FX_GROUPS.map((g) => `
    <div class="fx-group">
      <div class="fx-group-label">${g.label}</div>
      <div class="fx-cards">${g.items.map((it) => cardHtml(it, resolve(it, map, usdcnh))).join('')}</div>
    </div>`).join('');

  root.innerHTML = `
    <div class="fx-head"><span class="fx-title">💱 外汇汇率</span><span class="fx-sub">按基础货币分组 · 含互换对</span></div>
    ${groups}`;
}

export function start() {
  const root = document.getElementById('fx-rates');
  if (!root) return;
  root.innerHTML = '<div class="fx-empty">💱 外汇行情加载中…</div>';
  async function refresh() {
    try {
      const [map, usdcnh] = await Promise.all([fetchTen(), fetchUsdCnh()]);
      render(map, usdcnh);
    } catch (e) {
      render({}, null);
    }
  }
  refresh();
  setInterval(refresh, 60 * 1000);
}
