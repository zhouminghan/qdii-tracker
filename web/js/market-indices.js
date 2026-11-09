// ============================================================================
// market-indices.js  —  顶部「市场参照系」指标卡（美股指数 + 上证指数 + 美元/人民币汇率）
// ============================================================================
// 数据源：腾讯行情 https://qt.gtimg.cn/q={symbol1,symbol2,...}
//  ，通过 <script> 标签加载（JSONP）→ 天然绕过 CORS
//  ，比东财 push2 更稳定，几乎不限流（与 etf-premium.js 同源同机制）
//
// 标的列表（symbol **必须不含点**，见 why 段）：
//  ，usDJI    = 道琼斯
//  ，usINX    = 标普 500
//  ，usIXIC   = 纳斯达克综合
//  ，usNDX    = 纳斯达克 100
//  ，fxUSDCNY = 美元/在岸人民币（央行口径，与 QDII 估值最直接相关）
//
// ⚠️ 不要用 'us.DJI' 这种带点的形式：
//  ，腾讯生成的 JSONP 是 `var v_us.DJI = "..."`，**变量名含点是 JS 语法错误**
//  ，整个 <script> 解析就直接挂掉，5 张卡片全部拿不到数据（onload 触发但 window['v_us.DJI'] 全 undefined）
//  ，历史教训：曾两次踩这个坑（先以为限流、后以为编码、其实是 SyntaxError）
//  ，正确写法 `usDJI` → `var v_usDJI = "..."` 合法可执行
//
// 字段映射（~ 分隔，0-based）：
//   美股指数(us*)：[3]=最新价 [4]=昨收 [31]=涨跌额 [32]=涨跌幅%
//   汇率(fx*)   ：[3]=最新价 [12]=涨跌额 [13]=涨跌幅%（实测 2026-05 腾讯返回结构）
//
// 调度策略（由 idle-scheduler 接管，避免长期挂机被 IP 限流）：
//  ，美股开盘（北京 21:30-04:00）：每 60s 刷新
//  ，美股收盘：每 5 分钟刷新
//  ，标签页隐藏 / 用户 10 分钟无交互：暂停轮询
//  ，用户回到页面：立即 catch-up 一次后恢复正常节奏
//
// why 选 USDCNY 而不是 USDCNH：
//  ，QDII 净值结算口径以央行中间价（CNY）为准，不是离岸 CNH
//  ，两者偏差通常 <0.3%，但 USDCNY 更准确反映"基金真实汇率影响"
//  ，失败兜底：保留缓存上次成功值，避免卡片消失
// ============================================================================

const SYMBOLS = [
  { qq: 'usDJI',    name: '道琼斯',         emoji: '📈', digits: 2, kind: 'stock' },
  { qq: 'usINX',    name: '标普 500',       emoji: '🇺🇸', digits: 2, kind: 'stock' },
  { qq: 'usIXIC',   name: '纳斯达克综合',   emoji: '💻', digits: 2, kind: 'stock' },
  { qq: 'usNDX',    name: '纳斯达克 100',   emoji: '🚀', digits: 2, kind: 'stock' },
  { qq: 'sh000001', name: '上证指数',       emoji: '🇨🇳', digits: 2, kind: 'stock' },
  { qq: 'sh000300', name: '沪深 300',       emoji: '🇨🇳', digits: 2, kind: 'stock' },
  { qq: 'sh000688', name: '科创 50',        emoji: '🔬', digits: 2, kind: 'stock' },
];

// 全球指数卡：东财 push2 实时行情（腾讯不提供日经/斯托克50，恒生腾讯有但统一走东财更一致）
const GLOBAL_SYMBOLS = [
  { em: '100.N225', name: '日经 225',      emoji: '🇯🇵', digits: 2 },
  { em: '100.HSI',  name: '恒生指数',      emoji: '🇭🇰', digits: 2 },
  { em: '124.HSTECH', name: '恒生科技',    emoji: '🖥️', digits: 2 },
  { em: '100.KS11', name: '韩国 KOSPI',    emoji: '🇰🇷', digits: 2 },
  { em: '251.SOX',  name: '费城半导体',    emoji: '⚡', digits: 2 },
];

// data-symbol 与 HTML 模板里的旧 secid 对齐（避免必须改 HTML）
const DATA_SYMBOL_MAP = {
  'usDJI':    '100.DJIA',
  'usINX':    '100.SPX',
  'usIXIC':   '100.NDX',     // 纳斯达克综合 → 复用旧 NDX 卡位
  'usNDX':    '100.NDX100',  // 纳斯达克 100 → 复用旧 NDX100 卡位
  'sh000001': 'sh000001',    // 上证指数（腾讯 A 股指数）
  'sh000300': 'sh000300',    // 沪深 300
  'sh000688': 'sh000688',    // 科创 50
};

const SNAPSHOT_URL = './data/market-snapshot.json';
const BOOT_AT = Date.now();
const EXTERNAL_MIN_DELAY_MS = 2500;
let hasExternalData = false;
let refreshing = false;

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

function finite(v) {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) ? n : null;
}

function quoteFromSnapshot(raw) {
  const price = finite(raw && raw.price);
  if (price == null || price <= 0) return null;
  return {
    price,
    change: finite(raw.change) ?? 0,
    changePct: finite(raw.change_pct) ?? 0,
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

// 北京时间美股盘中判断（21:30 - 次日 04:00），且必须是「美股交易日」窗口
// why 加周末判断：原版只看时段，导致周六凌晨 03:00 也被判为「盘中」（其实美股已收盘 = 周五收盘）
// 美股交易日的北京时间映射（夏令时口径，简化处理不细分冬夏令时——差 1h 影响极小）：
//   美股 周一开盘 → 北京周一 21:30 ~ 周二 04:00
//   美股 周二开盘 → 北京周二 21:30 ~ 周三 04:00
//   ...
//   美股 周五开盘 → 北京周五 21:30 ~ 周六 04:00
// 所以「盘中」窗口的北京时间星期数：
//  ，21:30-23:59：周一/二/三/四/五（dow ∈ [1,5]）
//  ，00:00-04:00：周二/三/四/五/六（dow ∈ [2,6]）
function isUsMarketOpen() {
  const now = new Date();
  const dow = now.getDay();              // 0=周日, 1=周一, ..., 6=周六
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= 21 * 60 + 30) {
    // 晚盘：必须是周一~周五开始的交易日
    return dow >= 1 && dow <= 5;
  }
  if (minutes <= 4 * 60) {
    // 凌晨：是前一天美股开盘的延续 → 必须是周二~周六凌晨
    return dow >= 2 && dow <= 6;
  }
  return false;
}

// 北京时间 A 股 / 港股盘中判断（周一~周五，含午休）
function isAShareMarketOpen() {
  const now = new Date();
  const dow = now.getDay();
  if (dow === 0 || dow === 6) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return (m >= 9 * 60 + 30 && m <= 11 * 60 + 30) ||
         (m >= 13 * 60 && m <= 15 * 60);
}

function isHkMarketOpen() {
  const now = new Date();
  const dow = now.getDay();
  if (dow === 0 || dow === 6) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return (m >= 9 * 60 + 30 && m <= 12 * 60) ||
         (m >= 13 * 60 && m <= 16 * 60);
}

// 是否处于美股「连续休市」状态（周末 + 周一白天）→ 调度器应放慢请求
// why 单独抽出：与 isUsMarketOpen 互斥，但周末更适合 30min 间隔（行情完全不会变）
function isWeekendOff() {
  const now = new Date();
  const dow = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  // 周六 04:00 之后（美股周五已收盘）→ 整个周六剩余
  if (dow === 6 && minutes > 4 * 60) return true;
  // 周日全天
  if (dow === 0) return true;
  // 周一 21:30 之前（美股还没开盘）
  if (dow === 1 && minutes < 21 * 60 + 30) return true;
  return false;
}

// 顶部「📡 美股 xxx」状态标签：只显示市场状态，不显示时间戳
// why 不再显示具体时间：腾讯返回的时间戳混合了汇率（境内 24h 跳动）+ 美股（北京时间收盘点位）
//   两者口径不一致 → 周末看到「02:59，周末休市」非常困惑（其实是离岸汇率盘）
//   用户真正关心的是「现在能不能交易」，而不是「最后一笔报价的分钟数」
//   每行的「净值日」已经精确到日，不需要在顶部再放时间
function getMarketStatusLabel() {
  if (isUsMarketOpen()) return '美股交易中';
  if (isAShareMarketOpen()) return 'A股交易中';
  if (isHkMarketOpen()) return '港股交易中';
  if (isWeekendOff()) return '周末休市';
  // 平日 04:00 ~ 21:30：美股盘前/盘后/未开盘
  // why 用「未开盘」覆盖盘前阶段：北京白天用户最常打开的时段，「未开盘」比「已收盘」更准确
  //   边界：21:00-21:30 仍归「未开盘」（与 isUsMarketOpen 的 21:30 阈值对齐）
  //   04:00-09:00 归「已收盘」（昨日刚结束的延续）
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= 4 * 60 && minutes < 12 * 60) return '已收盘';  // 凌晨~中午：刚收完盘
  return '未开盘';                                                 // 中午~晚 21:30：等待今晚开盘
}

// JSONP 拉取所有标的，返回 { 'us.DJI': '原始字符串', ... }
function fetchAll() {
  const codes = SYMBOLS.map(s => s.qq).join(',');
  return window.jsonpFetch(`https://qt.gtimg.cn/q=${codes}&t=${Date.now()}`, {
    timeoutMs: 8000,
    failValue: {},
    onData: () => {
      const result = {};
      for (const sym of SYMBOLS) {
        // 腾讯 JSONP 生成 `var v_${symbol} = "..."`，symbol 不带点 → 变量名合法：
        //  ，'usDJI'    → window.v_usDJI
        //  ，'fxUSDCNY' → window.v_fxUSDCNY
        // 早期版本曾用 'us.DJI' 带点形式，导致 `var v_us.DJI = "..."` 整个脚本 SyntaxError
        // 解析失败 → onload 仍触发但 window['v_us.DJI'] 全 undefined → 5 张卡空白
        const key = 'v_' + sym.qq;
        const raw = window[key];
        if (typeof raw === 'string' && raw) result[sym.qq] = raw;
      }
      return result;
    },
  });
}

// 解析 ~ 分隔字符串
// 不再解析时间戳：顶部状态标签改为「市场状态文字」（交易中/已收盘/未开盘/周末休市），
// 不依赖任何外部时间字段，避免「汇率境内 24h 跳动」污染美股盘后状态显示。
function parsePayload(raw, kind) {
  if (!raw) return null;
  const parts = raw.split('~');
  const price = parseFloat(parts[3]);
  if (!isFinite(price) || price <= 0) return null;
  if (kind === 'fx') {
    // 腾讯 fx* 字段：[12]=涨跌额，[13]=涨跌幅%（不要写成 [11]/[12]）
    const change = parseFloat(parts[12]);
    const changePct = parseFloat(parts[13]);
    return {
      price,
      change: isFinite(change) ? change : 0,
      changePct: isFinite(changePct) ? changePct : 0,
    };
  }
  const change = parseFloat(parts[31]);
  const changePct = parseFloat(parts[32]);
  return {
    price,
    change: isFinite(change) ? change : 0,
    changePct: isFinite(changePct) ? changePct : 0,
  };
}

function renderCard(item, parsed) {
  const dataSymbol = DATA_SYMBOL_MAP[item.qq];
  const card = document.querySelector(`.market-card[data-symbol="${dataSymbol}"]`);
  if (!card) return;
  if (!parsed) {
    // 失败兜底：若有缓存则展示缓存价 + "暂时无法刷新"提示，否则才显示空占位
    const cached = card.dataset.lastPrice;
    if (cached) {
      card.innerHTML = `
        <div class="text-[11px] text-stone-400 dark:text-stone-500 mb-0.5">${item.emoji} ${item.name}</div>
        <div class="text-base sm:text-lg font-semibold tabular-nums text-stone-400 dark:text-stone-500">${cached}</div>
        <div class="text-[11px] text-stone-300 dark:text-stone-600">💾 本地快照暂无数据</div>
      `;
    } else {
      card.innerHTML = `
        <div class="text-[11px] text-stone-400 dark:text-stone-500 mb-0.5">${item.emoji} ${item.name}</div>
        <div class="text-base font-semibold text-stone-300 dark:text-stone-600">-</div>
        <div class="text-[11px] text-stone-300 dark:text-stone-600">💾 本地快照暂无数据</div>
      `;
    }
    return;
  }
  const { price, change, changePct } = parsed;
  const up = changePct > 0;
  const flat = Math.abs(changePct) < 0.005;
  const colorCls = flat ? 'text-stone-500' : (up ? 'up' : 'down');
  const arrow = flat ? '—' : (up ? '↑' : '↓');
  const sign = up ? '+' : '';
  const priceStr = price.toFixed(item.digits);
  const pctStr = `${sign}${changePct.toFixed(2)}%`;
  const changeStr = `${sign}${change.toFixed(item.digits === 4 ? 4 : 2)}`;
  card.dataset.lastPrice = priceStr;  // 缓存上次成功值，下次失败可降级展示
  card.dataset.asOf = parsed.asOf || '';
  if (parsed.asOf) card.title = `本地/最新收盘 ${parsed.asOf} · 点击查看历史走势`;
  card.innerHTML = `
    <div class="text-[11px] text-stone-500 dark:text-stone-400 mb-0.5">${item.emoji} ${item.name}</div>
    <div class="text-base sm:text-lg font-semibold tabular-nums">${priceStr}</div>
    <div class="text-[11px] tabular-nums ${colorCls}">${arrow} ${changeStr} (${pctStr})</div>
  `;
}

function fetchGlobalQuotes() {
  const ut = 'fa5fd1943c7b386f172d6893dbfba10b';
  const hosts = ['push2.eastmoney.com', 'push2delay.eastmoney.com'];
  const parse = (data) => {
    const d = data && data.data;
    if (!d) return null;
    const price = Number(d.f43) / 100;   // 东财 f43 = 价格 × 100
    const changePct = Number(d.f170) / 100; // f170 = 涨跌幅% × 100
    if (!Number.isFinite(price) || price <= 0) return null;
    return { price, changePct: Number.isFinite(changePct) ? changePct : 0 };
  };
  const fetchOne = async (secid) => {
    // 偶发空回（限流/断连）时稍等重试一轮，避免首屏卡片空白
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const host of hosts) {
        const r = await window.jsonpFetch(
          (cb) => `https://${host}/api/qt/stock/get?secid=${secid}&fields=f43,f170&cb=${cb}&ut=${ut}`,
          { usesCallback: true, timeoutMs: 5000, failValue: null, onData: parse }
        );
        if (r) return r;
      }
      if (attempt === 0) await new Promise((res) => setTimeout(res, 1200));
    }
    return null;
  };
  return Promise.all(GLOBAL_SYMBOLS.map((g) => fetchOne(g.em))).then((results) => {
    const map = {};
    GLOBAL_SYMBOLS.forEach((g, i) => { map[g.em] = results[i]; });
    return map;
  });
}

function renderGlobalCard(item, parsed) {
  const card = document.querySelector(`.market-card[data-symbol="${item.em}"]`);
  if (!card) return;
  if (!parsed) {
    const cached = card.dataset.lastPrice;
    if (cached) {
      card.innerHTML = `
        <div class="text-[11px] text-stone-400 dark:text-stone-500 mb-0.5">${item.emoji} ${item.name}</div>
        <div class="text-base sm:text-lg font-semibold tabular-nums text-stone-400 dark:text-stone-500">${cached}</div>
        <div class="text-[11px] text-stone-300 dark:text-stone-600">💾 本地快照暂无数据</div>
      `;
    } else {
      card.innerHTML = `
        <div class="text-[11px] text-stone-400 dark:text-stone-500 mb-0.5">${item.emoji} ${item.name}</div>
        <div class="text-base font-semibold text-stone-300 dark:text-stone-600">-</div>
        <div class="text-[11px] text-stone-300 dark:text-stone-600">💾 本地快照暂无数据</div>
      `;
    }
    return;
  }
  const { price, changePct } = parsed;
  const up = changePct > 0;
  const flat = Math.abs(changePct) < 0.005;
  const colorCls = flat ? 'text-stone-500' : (up ? 'up' : 'down');
  const arrow = flat ? '—' : (up ? '↑' : '↓');
  const sign = up ? '+' : '';
  card.dataset.lastPrice = price.toFixed(item.digits);
  card.dataset.asOf = parsed.asOf || '';
  if (parsed.asOf) card.title = `本地/最新收盘 ${parsed.asOf} · 点击查看历史走势`;
  card.innerHTML = `
    <div class="text-[11px] text-stone-500 dark:text-stone-400 mb-0.5">${item.emoji} ${item.name}</div>
    <div class="text-base sm:text-lg font-semibold tabular-nums">${price.toFixed(item.digits)}</div>
    <div class="text-[11px] tabular-nums ${colorCls}">${arrow} ${sign}${changePct.toFixed(2)}%</div>
  `;
}

function renderLocalSnapshot(snapshot) {
  if (hasExternalData) return;
  const items = (snapshot && snapshot.market_indices && snapshot.market_indices.items) || {};
  window.__mktData = window.__mktData || {};
  for (const sym of SYMBOLS) {
    const parsed = quoteFromSnapshot(items[DATA_SYMBOL_MAP[sym.qq]]);
    if (parsed) {
      window.__mktData[sym.qq] = {
        name: sym.name, price: parsed.price, change: parsed.change,
        changePct: parsed.changePct, asOf: parsed.asOf, source: 'local',
      };
    }
    renderCard(sym, parsed);
  }
  for (const g of GLOBAL_SYMBOLS) {
    renderGlobalCard(g, quoteFromSnapshot(items[g.em]));
  }
  const el = document.getElementById('market-update-time');
  if (el) el.textContent = localStatus(snapshot);
}

function renderLocalPlaceholders() {
  for (const sym of SYMBOLS) renderCard(sym, null);
  for (const g of GLOBAL_SYMBOLS) renderGlobalCard(g, null);
  const el = document.getElementById('market-update-time');
  if (el) el.textContent = '💾 本地快照 · 读取中';
}

function ensureRefreshButton() {
  const meta = document.getElementById('market-meta');
  if (!meta || meta.querySelector('[data-market-refresh]')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.marketRefresh = '1';
  btn.className = 'temp-save-btn';
  btn.style.cssText = 'margin-left:8px;padding:2px 8px;font-size:11px';
  btn.textContent = '刷新';
  btn.title = '刷新实时行情';
  meta.appendChild(btn);
  applyMarketHeaderLayout();
  return btn;
}

function applyMarketHeaderLayout() {
  const meta = document.getElementById('market-meta');
  const header = meta && meta.closest('#market-overview > .flex.items-end');
  if (!meta || !header) return;
  const left = header.firstElementChild;
  const compact = window.innerWidth < 640;
  header.style.flexWrap = compact ? 'wrap' : '';
  if (left) left.style.flexBasis = compact ? '100%' : '';
  meta.style.flexBasis = compact ? '100%' : '';
  meta.style.textAlign = compact ? 'left' : '';
}

async function refreshAll() {
  if (refreshing || !canUseExternal()) return;
  refreshing = true;
  try {
    const map = await fetchAll();
    const globalMap = await fetchGlobalQuotes();
    let okCount = 0;
    window.__mktData = window.__mktData || {};
    for (const sym of SYMBOLS) {
      const parsed = parsePayload(map[sym.qq], sym.kind);
      if (!parsed) continue;
      okCount++;
      window.__mktData[sym.qq] = {
        name: sym.name, price: parsed.price, change: parsed.change,
        changePct: parsed.changePct, asOf: null, source: 'live',
      };
      renderCard(sym, parsed);
    }
    for (const g of GLOBAL_SYMBOLS) {
      const parsed = globalMap[g.em];
      if (!parsed) continue;
      okCount++;
      renderGlobalCard(g, parsed);
    }
    if (okCount > 0) {
      hasExternalData = true;
      const el = document.getElementById('market-update-time');
      if (el) {
        el.dataset.everOk = '1';
        el.textContent = `📡 行情 ${getMarketStatusLabel()}`;
      }
    }
  } finally {
    refreshing = false;
  }
}

export function start() {
  renderLocalPlaceholders();
  applyMarketHeaderLayout();
  window.addEventListener('resize', applyMarketHeaderLayout);
  const refreshBtn = ensureRefreshButton();
  loadLocalSnapshot().then(renderLocalSnapshot);
  if (refreshBtn) refreshBtn.addEventListener('click', () => onIdleAfterBoot(refreshAll));
  // 首屏始终读本地快照；实时行情只在用户点击「刷新」后、idle 且满 2.5s 时拉取。
}
