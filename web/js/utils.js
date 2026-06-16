/**
 * utils.js — 工具函数集中地（以纯函数为主；允许极少量无状态 UI 同步 helper）
 *
 * why：原内联 JS 中散落 ~20 个工具函数（排序、格式化、颜色、市场时段判断），
 * 它们之间只读不写，是天然的"被 import 项"。抽出来后：
 *   1. index.html 主表关注点更聚焦（保留 DOM 渲染相关）
 *   2. 函数集中后跨场景复用更明显（市场时段判断已被多处使用）
 *   3. 降低单文件高度，便于二分定位 bug
 *
 * 加载方式：与 config.js 一样作为 **普通 script**（非 ES Module），
 * 在 config.js 之后加载，所有 function 直接落到全局作用域，原内联代码 0 改动。
 *
 * 对外依赖（来自 config.js 全局常量）：
 *   - SHARE_CLASS_ORDER（被 shareSort/getSortValue 使用）
 *   - COMPANY_BRAND（被 getLogo 使用）
 */

// ==================== 排序：份额 / 系列 ====================

function shareSort(shares) {
  return [...shares].sort((a, b) => {
    // 币种：人民币 < 美元 < 其他
    const ca = a.currency === '人民币' ? 0 : a.currency === '美元' ? 1 : 2;
    const cb = b.currency === '人民币' ? 0 : b.currency === '美元' ? 1 : 2;
    if (ca !== cb) return ca - cb;
    // 份额类型
    const sa = SHARE_CLASS_ORDER[a.share_class] ?? 99;
    const sb = SHARE_CLASS_ORDER[b.share_class] ?? 99;
    return sa - sb;
  });
}

// 申购状态排序权重：暂停 = 0，其他按 daily_limit 数额（金额越大越靠前）
//   · 暂停申购                    → 0
//   · 限购但未给出 daily_limit    → 1
//   · 限购 ¥100 / ¥1000 / ¥10万    → daily_limit 数值（小额沉底，大额靠前）
//   · 开放申购（无限制）           → +∞（用 Number.MAX_SAFE_INTEGER 代替）
function buyStatusRank(st, limit) {
  if (!st) return 1;
  if (st.includes('暂停')) return 0;
  if (st.includes('开放') && !limit) return Number.MAX_SAFE_INTEGER;
  // 限购或开放但带 daily_limit：直接用金额做权重（500 < 1000 < 100 万）
  if (limit && Number.isFinite(limit)) return limit;
  return 1;
}

// 场外主表显示值（只用于 default share 外层行）：
//   · 当 _live_nav_date 严格晚于本地 nav_date 时，主表采用 _live_* overlay
//   · 否则继续用本地静态 nav/daily_change/nav_date
function getOffshoreDisplayValues(def) {
  if (!def) return { price: null, dailyChange: null, navDate: '', isLive: false };
  const localDate = def.nav_date || '';
  const liveDate = def._live_nav_date || '';
  const hasLive = def._live_nav != null;
  const useLive = !!(hasLive && liveDate && (!localDate || liveDate > localDate));
  return {
    price: useLive ? def._live_nav : (def.nav ?? null),
    dailyChange: useLive ? (def._live_daily_change ?? def.daily_change ?? null) : (def.daily_change ?? null),
    navDate: useLive ? liveDate : localDate,
    isLive: useLive,
  };
}

function getSeriesDisplayNavDate(series, isEtf = false) {
  if (!series || !Array.isArray(series.shares) || !series.shares.length) return '';
  const def = series.shares.find(s => s.code === series.default_share_code) || series.shares[0];
  if (!def) return '';
  return isEtf ? (def._live_etf_date || def.nav_date || '') : (getOffshoreDisplayValues(def).navDate || '');
}

function pickRepresentativeDate(dates) {
  const counts = new Map();
  for (const d of dates || []) {
    if (!d) continue;
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  let bestDate = '';
  let bestCount = 0;
  for (const [date, count] of counts.entries()) {
    if (count > bestCount || (count === bestCount && date > bestDate)) {
      bestDate = date;
      bestCount = count;
    }
  }
  return bestDate;
}

function pickTabNavHeaderDate(seriesList, isEtf = false) {
  if (!Array.isArray(seriesList) || !seriesList.length) return '';
  return pickRepresentativeDate(seriesList.map(series => getSeriesDisplayNavDate(series, isEtf)));
}

function shouldHideRowNavDate(rowNavDate, headerDate, rowIsLive = false) {
  return !!(rowNavDate && headerDate && rowNavDate === headerDate && !rowIsLive);
}

function syncRowNavDateVisibility(container, headerDate) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  container.querySelectorAll('.row-nav-date').forEach(el => {
    if (!el?.classList || typeof el.classList.toggle !== 'function') return;
    const rowNavDate = el.dataset?.navDate || '';
    const rowIsLive = el.dataset?.isLive === '1';
    el.classList.toggle('hidden', shouldHideRowNavDate(rowNavDate, headerDate, rowIsLive));
  });
}

function renderRowNavDateHtml(rowNavDate, headerDate, rowIsLive = false) {
  if (!rowNavDate) return '';
  const hiddenClass = shouldHideRowNavDate(rowNavDate, headerDate, rowIsLive) ? ' hidden' : '';
  const colorClass = rowIsLive ? 'text-indigo-500 dark:text-indigo-400' : 'text-stone-400 dark:text-stone-500';
  return `<div class="row-nav-date text-[10px] ${colorClass}${hiddenClass}" data-nav-date="${rowNavDate}" data-is-live="${rowIsLive ? '1' : '0'}">${fmtMD(rowNavDate)}</div>`;
}

const OFFSHORE_LIVE_FIELD_KEYS = ['_live_nav', '_live_daily_change', '_live_nav_date', '_live_nav_source', '_live_nav_updated_at'];
const ETF_LIVE_FIELD_KEYS = ['etf_price', 'etf_change_pct', 'etf_iopv', 'etf_premium', '_live_etf_date'];

function copyShareFields(nextShare, prevShare, fieldKeys) {
  if (!nextShare || !prevShare) return nextShare;
  fieldKeys.forEach(key => {
    if (prevShare[key] != null) nextShare[key] = prevShare[key];
  });
  return nextShare;
}

function mergeStateLiveFields(nextData, prevData) {
  if (!nextData || !prevData) return nextData;
  Object.entries(nextData).forEach(([cat, catData]) => {
    const nextSeries = catData?.series;
    const prevSeries = prevData?.[cat]?.series;
    if (!Array.isArray(nextSeries) || !Array.isArray(prevSeries) || !prevSeries.length) return;
    const prevShares = new Map();
    prevSeries.forEach(series => {
      (series?.shares || []).forEach(share => {
        if (share?.code) prevShares.set(share.code, share);
      });
    });
    const fieldKeys = cat === 'etf' ? ETF_LIVE_FIELD_KEYS : OFFSHORE_LIVE_FIELD_KEYS;
    nextSeries.forEach(series => {
      (series?.shares || []).forEach(share => {
        const prevShare = share?.code ? prevShares.get(share.code) : null;
        copyShareFields(share, prevShare, fieldKeys);
      });
    });
  });
  return nextData;
}

// 取 series 上某排序字段的值（series_scale 在 series 本身，其他都是 default share 上的）
function getSortValue(series, key) {
  if (key === 'series_scale') return series.series_scale ?? null;
  const def = series.shares.find(s => s.code === series.default_share_code) || series.shares[0];
  if (!def) return null;
  // 净值列点击排序时，排的是「该列对应的当日涨跌幅」
  //   · 场内 ETF —— etf_change_pct（腾讯实时涨跌）
  //   · 场外     —— 主表展示值对应的 dailyChange（优先 _live_daily_change）
  if (key === 'nav') {
    if (def.etf_change_pct != null) return def.etf_change_pct;
    return getOffshoreDisplayValues(def).dailyChange;
  }
  if (key === 'buy_status') return buyStatusRank(def.buy_status, def.daily_limit);
  return def[key] ?? null;
}

function sortSeries(items, key, dir) {
  const mult = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    // starred 永远置顶
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    const va = getSortValue(a, key);
    const vb = getSortValue(b, key);
    // null 永远排在最后（无论升降序）
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * mult;
  });
}

// ==================== 基金公司 Logo（彩色方块 + 公司汉字缩写） ====================

function getLogo(company) {
  const brand = COMPANY_BRAND[company] || { color: '#6b7280', letter: (company || '?').charAt(0) };
  const letterClass = brand.letter.length === 1 ? 'logo-letter-1' : 'logo-letter-2';
  // 用渐变代替纯色，让 logo 更有质感（从品牌色到略深的同色调）
  const bg = `linear-gradient(135deg, ${brand.color} 0%, ${adjustColor(brand.color, -15)} 100%)`;
  return `<div class="logo-avatar ${letterClass}" style="background: ${bg}"><span>${brand.letter}</span></div>`;
}

// 颜色加深/提亮（amount 为负数 = 加深）
function adjustColor(hex, amount) {
  hex = hex.replace('#', '');
  const num = parseInt(hex, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// ==================== 日期 / 市场时段 ====================

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function isTradingDay() {
  const day = new Date().getDay();  // 周日=0，周六=6
  return day >= 1 && day <= 5;
}

// YYYY-MM-DD → MM-DD（去掉年前缀，列表头省空间）
function fmtMD(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const m = dateStr.match(/^\d{4}-(\d{2}-\d{2})/);
  return m ? m[1] : dateStr;
}

// 取某市场（A/HK/US）的当地时间 {weekday, hh, mm}
// 用 Intl.DateTimeFormat 直接换算到目标时区，自动处理美股冬夏令时（DST）
//   · A 股：Asia/Shanghai
//   · 港股：Asia/Hong_Kong
//   · 美股：America/New_York（DST 由系统库自动处理）
function getLocalParts(timeZone) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(now);
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  const wd = get('weekday');  // 'Mon' / 'Tue' / ... / 'Sun'
  const hh = parseInt(get('hour'), 10);
  const mm = parseInt(get('minute'), 10);
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: wdMap[wd] ?? 0, hh, mm, t: hh * 60 + mm };
}

// 判断指定市场当前是不是盘中（含集合竞价不算，仅连续竞价时段）
// 返回 'open' / 'closed'（粗判：法定假日不细究，库里没这个表）
function getMarketSession(market) {
  const m = (market || 'US').toUpperCase();
  if (m === 'A') {
    const p = getLocalParts('Asia/Shanghai');
    if (p.day < 1 || p.day > 5) return 'closed';
    const morning = (p.t >= 9 * 60 + 30 && p.t < 11 * 60 + 30);
    const afternoon = (p.t >= 13 * 60 && p.t < 15 * 60);
    return (morning || afternoon) ? 'open' : 'closed';
  }
  if (m === 'HK') {
    const p = getLocalParts('Asia/Hong_Kong');
    if (p.day < 1 || p.day > 5) return 'closed';
    const morning = (p.t >= 9 * 60 + 30 && p.t < 12 * 60);
    const afternoon = (p.t >= 13 * 60 && p.t < 16 * 60);
    return (morning || afternoon) ? 'open' : 'closed';
  }
  // 默认按美股
  const p = getLocalParts('America/New_York');
  if (p.day < 1 || p.day > 5) return 'closed';
  // 美股常规交易时段 09:30-16:00（DST 由 Intl 自动处理）
  const open = (p.t >= 9 * 60 + 30 && p.t < 16 * 60);
  return open ? 'open' : 'closed';
}

// 探测股票代码所属市场及前缀（腾讯行情接口要求 us/hk/sh/sz 前缀）
//   · 美股：us{CODE}       例 usAAPL
//   · 港股：hk{CODE}       例 hk00700  （5 位数字）
//   · 沪市：sh{CODE}       例 sh600519
//   · 深市：sz{CODE}       例 sz000858
function detectMarketPrefix(code) {
  const c = String(code).trim();
  // 港股：5 位纯数字（00700 / 09988 / 03690）
  if (/^\d{5}$/.test(c)) return { prefix: 'hk', market: 'HK' };
  // A 股：6 位纯数字
  if (/^\d{6}$/.test(c)) {
    const first = c[0];
    if (first === '6' || first === '5' || first === '9') return { prefix: 'sh', market: 'A' };
    if (first === '0' || first === '3' || first === '2') return { prefix: 'sz', market: 'A' };
    return { prefix: 'sh', market: 'A' };
  }
  // 其余当美股（字母 / 字母+数字 / 含点号）
  return { prefix: 'us', market: 'US' };
}

// ==================== 文本规范化 / 持有期格式化 ====================

function cleanCondition(s) {
  if (!s) return s;
  // 1) AKShare 偶发返回的文本式条件，例如 "小于等于6天" → "0天<持有期限<7天"
  s = s.replace(/^小于等于(\d+)天$/, (_, d) => `0天<持有期限<${+d + 1}天`);
  // 2) 去掉冗余的 .0：0.0万→0万, 7.0天→7天, 2.0年→2年
  s = s.replace(/(\d+)\.0(万|天|年)/g, '$1$2');
  // 3) 接近一年的天数（如 365/366）归一化为 "1年"，对齐其他基金
  s = s.replace(/(\d+)天/g, (m, d) => {
    const n = +d;
    if (n >= 360 && n < 400) {
      const yrs = Math.round(n / 365);
      if (Math.abs(n - yrs * 365) <= 5) return yrs + '年';
    }
    return m;
  });
  return s;
}

// 把 free_hold_days（数字）格式化为人类友好文案：366→1年, 730→2年, 30→30天
function formatHoldDays(days) {
  if (days == null) return '';
  if (days >= 360) {
    const years = Math.round(days / 365);
    if (years > 0 && Math.abs(days - years * 365) <= 5) return years + '年';
  }
  return days + '天';
}

// 从赎回规则文本解析出"低于多少天有罚金"的下界（如 "0天<=持有<7天" → 7）
function parseSellRuleLowerDays(cond) {
  if (!cond) return null;
  const m = cond.match(/(\d+(?:\.\d+)?)\s*天\s*<=?\s*持有/);
  if (m) return Math.round(parseFloat(m[1]));
  // 极少数情况下界用"年"，比如「2.0年<=持有期限」
  const my = cond.match(/(\d+(?:\.\d+)?)\s*年\s*<=?\s*持有/);
  if (my) return Math.round(parseFloat(my[1]) * 365);
  return null;
}

// ==================== 表格单元 / 状态徽章 ====================

function changeCell(v, small = false) {
  if (v === null || v === undefined) {
    return `<td class="${small ? 'py-2' : 'py-3 px-3'} text-right text-stone-400 num">--</td>`;
  }
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
  const sign = v > 0 ? '+' : '';
  const arrow = v > 0 ? '↑' : v < 0 ? '↓' : '';
  return `<td class="${small ? 'py-2' : 'py-3 px-3'} text-right num ${cls}">${arrow}${sign}${v.toFixed(2)}%</td>`;
}

function buyStatusClass(status) {
  if (status.includes('暂停')) return 'badge badge-paused';
  if (status.includes('限')) return 'badge badge-limit';
  if (status.includes('开放')) return 'badge badge-open';
  return 'badge bg-stone-100 text-stone-600';
}

// 申购限额金额格式化，与基金公司/天天基金/支付宝 APP 对齐：
//   · < 1 万   → 纯数字（100 / 1000 / 5000），上下文的 ¥ 已表达货币单位
//   · ≥ 1 万   → 「N 万」（1万 / 5万 / 100万）；非整万时保留 1 位小数（1.5万）
//   · ≥ 1 亿   → 「N 亿」（理论上限，个人看板极少见）
function formatLimit(v) {
  if (!v) return '--';
  if (v >= 1e8) {
    const n = v / 1e8;
    return (n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)) + '亿';
  }
  if (v >= 1e4) {
    const n = v / 1e4;
    return (n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)) + '万';
  }
  return v.toFixed(0);
}

// ==================== 走势图 / 持仓详情用的格式化 ====================

function fmtPct(v) {
  if (v == null) return '--';
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
}

function fmtMoney(v) {
  if (v == null || v === 0) return '--';
  if (v >= 10000) return `¥${(v / 10000).toFixed(0)}万`;
  return `¥${v.toFixed(0)}`;
}

function fmtMV(v) {
  // v 单位是万元
  if (v == null) return '--';
  if (v >= 10000) return `${(v / 10000).toFixed(2)}亿`;
  return `${v.toFixed(0)}万`;
}
