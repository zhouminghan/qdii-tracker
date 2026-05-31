// ============================================================================
// etf-premium.js  —  场内 ETF 实时溢价率
// ============================================================================
// 数据源：腾讯行情接口 https://qt.gtimg.cn/q={prefix}{code}
//   · 通过 <script> 标签加载（JSONP 模式），绕过 CORS
//   · 返回 v_{prefix}{code} = "字段1~字段2~..." 共 88 个字段（GBK 编码，但浏览器
//     已自动解码为 UTF-8，只要原页面 charset 一致）
//
// 字段映射（0-based）：
//   [3]  = 当前价（场内成交价）
//   [32] = 当日涨跌幅 %
//   [78] = 单位净值（最近收盘披露的官方净值，用作 IOPV 近似）
//   [82] = 货币代码（CNY 等）
//
// 溢价率计算：
//   premium% = (price[3] - nav[78]) / nav[78] × 100
//
// 重要说明：
//   · 这里的 nav[78] 是**最近收盘日**的单位净值，而非盘中实时 IOPV。中国 A 股交易
//     时段美股不开盘，国内行情商也不公开 QDII 的实时盘中估值（受合规限制）。
//   · 所以这里的"溢价率"实际是 (盘中价 vs 上一收盘净值)，包含了「美股已收盘段的
//     价格行情预期 + 汇率波动 + 真溢价」三部分。但这正是用户在 A 股交易时段实际
//     面对的"账面溢价" —— 是有意义的决策参考。
//   · 高溢价（>3%）通常意味着「场内额度紧张 + 资金抢筹」，QDII ETF 限购时尤其常见。
//
// 加载策略：
//   · 启动时延迟一个 tick 拉所有 18 只 ETF（让 loadData 先把 etf.json 装进 STATE）
//   · 拉到后立即重新调用 renderCategory('etf') 让表格刷新
//   · 60 秒轮询，由 idle-scheduler 接管：
//       - 标签页隐藏 → 暂停
//       - 用户 10 分钟无交互 → 暂停
//       - 用户回到页面 → 立即 catch-up 一次后恢复
// ============================================================================

// 上交所 5 开头 → sh，深交所 1 开头 → sz
function prefixOf(code) {
  const c = String(code).trim();
  if (/^[56]/.test(c)) return 'sh';
  if (/^[01]/.test(c)) return 'sz';
  return 'sh'; // 兜底
}

// 把腾讯返回的字符串解析成 { price, changePct, nav, premium }
function parseQtPayload(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const parts = raw.split('~');
  if (parts.length < 83) return null; // 字段数不够，可能是异常数据
  const price = parseFloat(parts[3]);
  const changePct = parseFloat(parts[32]);
  const nav = parseFloat(parts[78]);
  if (!isFinite(price) || price <= 0) return null;
  let premium = null;
  if (isFinite(nav) && nav > 0) {
    premium = (price - nav) / nav * 100;
  }
  return { price, changePct, nav: isFinite(nav) ? nav : null, premium };
}

// 通过 <script> 加载腾讯 JSONP（绕过 CORS）
// codes 形如 ['sh513500', 'sz159941']
// 返回 Promise<Object>：{ '513500': {price, changePct, nav, premium}, ... }
function fetchByJsonp(codes) {
  return new Promise((resolve) => {
    if (!codes.length) { resolve({}); return; }
    const s = document.createElement('script');
    s.src = `https://qt.gtimg.cn/q=${codes.join(',')}&t=${Date.now()}`;
    s.async = true;
    const cleanup = () => { try { s.remove(); } catch (e) {} };
    const timer = setTimeout(() => { cleanup(); resolve({}); }, 6000);
    s.onload = () => {
      clearTimeout(timer);
      const result = {};
      for (const full of codes) {
        // full = 'sh513500'，全局变量 v_sh513500
        const key = 'v_' + full;
        const raw = window[key];
        const parsed = parseQtPayload(raw);
        if (parsed) {
          // 用纯代码做 key（去前缀），方便上层按 share.code 索引
          const pureCode = full.slice(2);
          result[pureCode] = parsed;
        }
      }
      cleanup();
      resolve(result);
    };
    s.onerror = () => { clearTimeout(timer); cleanup(); resolve({}); };
    document.head.appendChild(s);
  });
}

// 收集 STATE.data.etf 中所有 ETF 代码（形如 ['sh513500', ...]）
function collectEtfCodes(state) {
  const out = [];
  const series = state?.data?.etf?.series || [];
  for (const s of series) {
    for (const sh of (s.shares || [])) {
      if (sh.code) out.push(prefixOf(sh.code) + sh.code);
    }
  }
  return out;
}

// 把拉到的数据写回 STATE，供 renderCategory('etf') 使用
function writeBack(state, dataMap) {
  const series = state?.data?.etf?.series || [];
  for (const s of series) {
    for (const sh of (s.shares || [])) {
      const live = dataMap[sh.code];
      if (live) {
        // 实时值优先于静态值
        if (isFinite(live.price)) sh.etf_price = live.price;
        if (isFinite(live.changePct)) sh.etf_change_pct = live.changePct;
        if (live.nav != null) sh.etf_iopv = live.nav;        // 单位净值（IOPV 近似）
        if (live.premium != null) sh.etf_premium = live.premium;  // 溢价率 %
      }
    }
  }
}

import { schedule } from './idle-scheduler.js';

/**
 * 启动 ETF 实时溢价率拉取。
 * @param {object} options
 * @param {object} options.state          全局 STATE 对象（必须包含 data.etf）
 * @param {function} options.onUpdate     拉取完成后调用，通常是 () => renderCategory('etf')
 * @param {number}  [options.intervalMs]  轮询间隔，默认 60s
 */
export function start({ state, onUpdate, intervalMs = 60 * 1000 }) {
  async function tick() {
    const codes = collectEtfCodes(state);
    if (!codes.length) return;
    const map = await fetchByJsonp(codes);
    if (Object.keys(map).length) {
      writeBack(state, map);
      try { onUpdate && onUpdate(); } catch (e) {}
    }
  }
  // 由 idle-scheduler 接管：标签页隐藏 / 用户长时间无操作时自动暂停，避免空轮询
  // firstDelayMs=1500 —— 给主表 loadData() 留时间把 etf.json 装进 STATE
  schedule(tick, () => intervalMs, { firstDelayMs: 1500 });
}
