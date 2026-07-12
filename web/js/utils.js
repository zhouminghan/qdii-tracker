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

// ==================== JSONP 请求（收拢全项目 7 处重复实现） ====================
//
// 深模块：接口只有 url + 几个选项，实现内部封装 <script> 标签创建/超时/cleanup/onerror
// 这套完整生命周期。调用方只需提供「怎么从结果里取数据」（onData），不用关心
// script 标签怎么创建怎么销毁。
//
// 两种底层模式，由 usesCallback 区分：
//   · usesCallback=false（默认）：普通 <script> 加载，脚本执行时把数据写成全局变量
//     （如腾讯 qt.gtimg.cn 返回 `var v_xxx = "..."`），onData() 在 onload 后被调用，
//     自己去读 window 上的全局变量。适用：main.js fetchStocksLive/fetchPzdHistory、
//     etf-premium.js fetchByJsonp、market-indices.js fetchAll、
//     offshore-live-nav.js fetchPzdLatest。
//   · usesCallback=true：真正的 JSONP，url 必须是函数 (cbName) => urlString，
//     jsonpFetch 会生成唯一回调名、注册 window[cbName] 为接收函数，url 构造时把
//     cbName 塞进查询参数。onData(data) 在回调触发时被调用，data 就是服务端返回的
//     响应体。适用：offshore-live-nav.js fetchLsjzLatest、market-trend.js fetchDayKFromHost。
//
// @param {string|function(string|null): string} urlOrBuilder
//   固定 url 字符串（usesCallback=false 时），或 (cbName) => url 的构造函数
//   （usesCallback=true 时，cbName 会传入，用于拼接 callback 查询参数）。
// @param {object} options
//   @param {number}  [timeoutMs=8000]  超时毫秒数，超时后 resolve(failValue)
//   @param {boolean} [usesCallback=false]  是否用真 JSONP 回调模式（见上）
//   @param {*}       [failValue=null]  超时/网络错误/onData 抛异常时的兜底返回值
//   @param {function} [beforeLoad]  script 创建前执行（如清理上次残留的全局变量）
//   @param {function} onData  必填。usesCallback=true 时接收响应体；
//     usesCallback=false 时不接收参数（自己读 window 全局变量）。
//     返回值即为 Promise 的 resolve 值；返回 undefined 会被视为失败，改用 failValue。
// @returns {Promise<*>}
function jsonpFetch(urlOrBuilder, options) {
  const {
    timeoutMs = 8000,
    usesCallback = false,
    failValue = null,
    beforeLoad = null,
    onData,
  } = options || {};

  return new Promise((resolve) => {
    if (typeof beforeLoad === 'function') {
      try { beforeLoad(); } catch (_) { /* 清理失败不影响主流程 */ }
    }

    const s = document.createElement('script');
    s.async = true;

    let cbName = null;
    const cleanup = () => {
      if (cbName) { try { delete window[cbName]; } catch (_) { window[cbName] = undefined; } }
      try { s.remove(); } catch (_) { /* 已被移除或从未挂载 */ }
    };

    const finish = (rawArg) => {
      let result;
      try { result = onData(rawArg); } catch (_) { result = failValue; }
      cleanup();
      resolve(result === undefined ? failValue : result);
    };

    const timer = setTimeout(() => { cleanup(); resolve(failValue); }, timeoutMs);

    if (usesCallback) {
      cbName = `jsonp_cb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      window[cbName] = (data) => { clearTimeout(timer); finish(data); };
      s.src = urlOrBuilder(cbName);
    } else {
      s.onload = () => { clearTimeout(timer); finish(); };
      s.src = typeof urlOrBuilder === 'function' ? urlOrBuilder(null) : urlOrBuilder;
    }

    s.onerror = () => { clearTimeout(timer); cleanup(); resolve(failValue); };
    document.head.appendChild(s);
  });
}
// 挂到 window：本文件是普通 script（非 ES Module），main.js 直接用裸标识符调用即可；
// 其余 ES Module 文件（offshore-live-nav.js/etf-premium.js/market-indices.js/market-trend.js）
// 需要 window.jsonpFetch(...) 显式引用（项目里跨脚本引用全局函数的既有约定，见 market-trend.js 对
// window.TREND_STATE / window.renderTrendChart 的用法）。
window.jsonpFetch = jsonpFetch;

// ==================== Modal 生命周期（收拢 main.js 两套平行复制） ====================
//
// 深模块：openDetail/closeDetail 与 openTrend/closeTrend 曾各自实现同一套"打开/关闭
// 一个 Modal"的机械步骤（classList.hidden 切换 + body 滚动锁定 + 关闭按钮聚焦 + 焦点恢复）。
// 收拢后调用方只需一行调用，不用关心内部步骤顺序。
//
// 设计约束（保持既有行为不变）：
//   · 焦点恢复的"记住哪个元素"这件事，仍由调用方自己的 LAST_FOCUS 变量持有——
//     openModal 只是把"读取 document.activeElement"这一步做了并返回，不在内部另存状态。
//     这样 main.js 里 openDetail/openTrend 共享同一个 LAST_FOCUS 变量的既有行为
//     （包括嵌套弹窗场景下的既有焦点恢复顺序）完全不变，只是替换了机械步骤的写法。
//
// @param {string} dialogId  Modal 根元素 id（如 'detailModal'）
// @param {object} [options]
//   @param {string} [closeBtnId]  关闭按钮 id，传入则在下一帧自动聚焦该按钮
// @returns {Element|null} 打开前的 document.activeElement（调用方通常存入自己的
//   LAST_FOCUS 变量，供后续 closeModal 时传回）；若 dialogId 找不到对应元素则返回 null
function openModal(dialogId, options) {
  const { closeBtnId } = options || {};
  const modal = document.getElementById(dialogId);
  if (!modal) return null;
  const prevFocus = document.activeElement;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (closeBtnId) {
    requestAnimationFrame(() => {
      const closeBtn = document.getElementById(closeBtnId);
      if (closeBtn) closeBtn.focus();
    });
  }
  return prevFocus;
}

// @param {string} dialogId  Modal 根元素 id
// @param {Element|null} [focusEl]  关闭后要恢复焦点的元素（通常是调用方的 LAST_FOCUS）
function closeModal(dialogId, focusEl) {
  const modal = document.getElementById(dialogId);
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  if (focusEl && typeof focusEl.focus === 'function') {
    focusEl.focus();
  }
}
window.openModal = openModal;
window.closeModal = closeModal;

// ==================== 申购状态分类（收拢 main.js/screenshot.js 两处重复判断） ====================
//
// 两处调用方（main.js statusBadge 的 tooltip 徽章 / screenshot.js statusBadgeHtml 的截图徽章）
// 渲染的 HTML 结构完全不同（一个带历史 tooltip data 属性，一个是纯展示徽章），无法共用同一个
// "拼 HTML"函数；但判断"该显示暂停/限购(带额度)/限购(无额度)/开放/无状态"这条业务规则本身是
// 完全相同的，之前在两个文件里各写了一遍。这里只抽出"判断结果"这一层纯逻辑，两处调用方各自
// 按判断结果去拼各自需要的 HTML，输出保持不变。
//
// @returns {string} 'none' | 'paused' | 'limited' | 'limited_no_amount' | 'open'
function classifyBuyStatus(sh) {
  const st = sh?.buy_status || '';
  if (!st || sh?.currency === '美元') return 'none';
  if (st.includes('暂停')) return 'paused';
  if (st.includes('限') && sh.daily_limit > 0) return 'limited';
  if (st.includes('限') && !sh.daily_limit) return 'limited_no_amount';
  return 'open';
}
window.classifyBuyStatus = classifyBuyStatus;

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
  const def = getDefaultShare(series);
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

// 取日期列表中的最大值（用于 Tab 级表头日期，确保反映最新可用数据）
function pickMaxDate(dates) {
  let maxDate = '';
  for (const d of dates || []) {
    if (d && d > maxDate) maxDate = d;
  }
  return maxDate;
}

// 分组级表头日期：取当前分组的代表日期（众数，并列取更晚日期）。
function pickGroupHeaderDate(seriesList, isEtf = false) {
  if (!Array.isArray(seriesList) || !seriesList.length) return '';
  return pickRepresentativeDate(seriesList.map(series => getSeriesDisplayNavDate(series, isEtf)));
}

// 保留 Tab 级最大日期工具（兼容旧逻辑 / 其他潜在调用）。
function pickTabNavHeaderDate(seriesList, isEtf = false) {
  if (!Array.isArray(seriesList) || !seriesList.length) return '';
  return pickMaxDate(seriesList.map(series => getSeriesDisplayNavDate(series, isEtf)));
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

function getDefaultShare(series) {
  if (!series || !Array.isArray(series.shares) || !series.shares.length) return null;
  return series.shares.find(s => s.code === series.default_share_code) || series.shares[0] || null;
}

// 取 series 上某排序字段的值（series_scale 在 series 本身，其他都是 default share 上的）
function getSortValue(series, key) {
  if (key === 'series_scale') return series.series_scale ?? null;
  const def = getDefaultShare(series);
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

// 涨跌工具（消除 6+ 处重复三元）
function chgCls(v) { return v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''; }
function chgSign(v) { return v == null ? '--' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'; }
function chgArrow(v) { return v == null ? '' : v > 0 ? '↑' : v < 0 ? '↓' : ''; }

function changeCell(v, small = false) {
  if (v === null || v === undefined) {
    return `<td class="${small ? 'py-2' : 'py-3 px-3'} text-right text-stone-400 num">--</td>`;
  }
  const cls = chgCls(v);
  const sign = v > 0 ? '+' : '';
  const arrow = chgArrow(v);
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
