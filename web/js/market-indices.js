// ============================================================================
// market-indices.js  —  顶部「市场参照系」指标卡（4 个美股指数 + 美元/人民币汇率）
// ============================================================================
// 数据源：腾讯行情 https://qt.gtimg.cn/q={symbol1,symbol2,...}
//   · 通过 <script> 标签加载（JSONP）→ 天然绕过 CORS
//   · 比东财 push2 更稳定，几乎不限流（与 etf-premium.js 同源同机制）
//
// 标的列表（symbol **必须不含点**，见 why 段）：
//   · usDJI    = 道琼斯
//   · usINX    = 标普 500
//   · usIXIC   = 纳斯达克综合
//   · usNDX    = 纳斯达克 100
//   · fxUSDCNY = 美元/在岸人民币（央行口径，与 QDII 估值最直接相关）
//
// ⚠️ 不要用 'us.DJI' 这种带点的形式：
//   · 腾讯生成的 JSONP 是 `var v_us.DJI = "..."`，**变量名含点是 JS 语法错误**
//   · 整个 <script> 解析就直接挂掉，5 张卡片全部拿不到数据（onload 触发但 window['v_us.DJI'] 全 undefined）
//   · 历史教训：曾两次踩这个坑（先以为限流、后以为编码、其实是 SyntaxError）
//   · 正确写法 `usDJI` → `var v_usDJI = "..."` 合法可执行
//
// 字段映射（~ 分隔，0-based）：
//   美股指数(us*)：[3]=最新价 [4]=昨收 [31]=涨跌额 [32]=涨跌幅%
//   汇率(fx*)   ：[3]=最新价 [12]=涨跌额 [13]=涨跌幅%（实测 2026-05 腾讯返回结构）
//
// 调度策略（由 idle-scheduler 接管，避免长期挂机被 IP 限流）：
//   · 美股开盘（北京 21:30-04:00）：每 60s 刷新
//   · 美股收盘：每 5 分钟刷新
//   · 标签页隐藏 / 用户 10 分钟无交互：暂停轮询
//   · 用户回到页面：立即 catch-up 一次后恢复正常节奏
//
// why 选 USDCNY 而不是 USDCNH：
//   · QDII 净值结算口径以央行中间价（CNY）为准，不是离岸 CNH
//   · 两者偏差通常 <0.3%，但 USDCNY 更准确反映"基金真实汇率影响"
//   · 失败兜底：保留缓存上次成功值，避免卡片消失
// ============================================================================

const SYMBOLS = [
  { qq: 'usDJI',    name: '道琼斯',         emoji: '📈', digits: 2, kind: 'stock' },
  { qq: 'usINX',    name: '标普 500',       emoji: '🇺🇸', digits: 2, kind: 'stock' },
  { qq: 'usIXIC',   name: '纳斯达克综合',   emoji: '💻', digits: 2, kind: 'stock' },
  { qq: 'usNDX',    name: '纳斯达克 100',   emoji: '🚀', digits: 2, kind: 'stock' },
  { qq: 'fxUSDCNY', name: '美元/人民币',    emoji: '💵', digits: 4, kind: 'fx'    },
];

// data-symbol 与 HTML 模板里的旧 secid 对齐（避免必须改 HTML）
const DATA_SYMBOL_MAP = {
  'usDJI':    '100.DJIA',
  'usINX':    '100.SPX',
  'usIXIC':   '100.NDX',     // 纳斯达克综合 → 复用旧 NDX 卡位
  'usNDX':    '100.NDX100',  // 纳斯达克 100 → 复用旧 NDX100 卡位
  'fxUSDCNY': '133.USDCNH',  // 汇率卡位（旧 USDCNH 卡位）
};

// 北京时间美股盘中判断（21:30 - 次日 04:00），且必须是「美股交易日」窗口
// why 加周末判断：原版只看时段，导致周六凌晨 03:00 也被判为「盘中」（其实美股已收盘 = 周五收盘）
// 美股交易日的北京时间映射（夏令时口径，简化处理不细分冬夏令时——差 1h 影响极小）：
//   美股 周一开盘 → 北京周一 21:30 ~ 周二 04:00
//   美股 周二开盘 → 北京周二 21:30 ~ 周三 04:00
//   ...
//   美股 周五开盘 → 北京周五 21:30 ~ 周六 04:00
// 所以「盘中」窗口的北京时间星期数：
//   · 21:30-23:59：周一/二/三/四/五（dow ∈ [1,5]）
//   · 00:00-04:00：周二/三/四/五/六（dow ∈ [2,6]）
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
//   两者口径不一致 → 周末看到「02:59 · 周末休市」非常困惑（其实是离岸汇率盘）
//   用户真正关心的是「现在能不能交易」，而不是「最后一笔报价的分钟数」
//   每行的「净值日」已经精确到日，不需要在顶部再放时间
function getMarketStatusLabel() {
  if (isUsMarketOpen()) return '交易中';
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
  return new Promise((resolve) => {
    const codes = SYMBOLS.map(s => s.qq).join(',');
    const s = document.createElement('script');
    s.src = `https://qt.gtimg.cn/q=${codes}&t=${Date.now()}`;
    s.async = true;
    const cleanup = () => { try { s.remove(); } catch (e) {} };
    const timer = setTimeout(() => { cleanup(); resolve({}); }, 8000);
    s.onload = () => {
      clearTimeout(timer);
      const result = {};
      for (const sym of SYMBOLS) {
        // 腾讯 JSONP 生成 `var v_${symbol} = "..."`，symbol 不带点 → 变量名合法：
        //   · 'usDJI'    → window.v_usDJI
        //   · 'fxUSDCNY' → window.v_fxUSDCNY
        // 早期版本曾用 'us.DJI' 带点形式，导致 `var v_us.DJI = "..."` 整个脚本 SyntaxError
        // 解析失败 → onload 仍触发但 window['v_us.DJI'] 全 undefined → 5 张卡空白
        const key = 'v_' + sym.qq;
        const raw = window[key];
        if (typeof raw === 'string' && raw) result[sym.qq] = raw;
      }
      cleanup();
      resolve(result);
    };
    s.onerror = () => { clearTimeout(timer); cleanup(); resolve({}); };
    document.head.appendChild(s);
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
        <div class="text-[11px] text-stone-300 dark:text-stone-600">📡 暂时无法刷新</div>
      `;
    } else {
      card.innerHTML = `
        <div class="text-[11px] text-stone-400 dark:text-stone-500 mb-0.5">${item.emoji} ${item.name}</div>
        <div class="text-base font-semibold text-stone-300 dark:text-stone-600">-</div>
        <div class="text-[11px] text-stone-300 dark:text-stone-600">数据源加载中…</div>
      `;
    }
    return;
  }
  const { price, change, changePct } = parsed;
  const up = changePct > 0;
  const flat = Math.abs(changePct) < 0.005;
  const colorCls = flat ? 'text-stone-500' : (up ? 'text-rose-600' : 'text-emerald-600');
  const arrow = flat ? '—' : (up ? '↑' : '↓');
  const sign = up ? '+' : '';
  const priceStr = price.toLocaleString('en-US', {
    minimumFractionDigits: item.digits,
    maximumFractionDigits: item.digits,
  });
  const pctStr = `${sign}${changePct.toFixed(2)}%`;
  const changeStr = `${sign}${change.toFixed(item.digits === 4 ? 4 : 2)}`;
  card.dataset.lastPrice = priceStr;  // 缓存上次成功值，下次失败可降级展示
  card.innerHTML = `
    <div class="text-[11px] text-stone-500 dark:text-stone-400 mb-0.5">${item.emoji} ${item.name}</div>
    <div class="text-base sm:text-lg font-semibold tabular-nums">${priceStr}</div>
    <div class="text-[11px] tabular-nums ${colorCls}">${arrow} ${changeStr} (${pctStr})</div>
  `;
}

async function refreshAll() {
  const map = await fetchAll();
  let okCount = 0;
  for (const sym of SYMBOLS) {
    const parsed = parsePayload(map[sym.qq], sym.kind);
    if (parsed) okCount++;
    renderCard(sym, parsed);
  }
  const el = document.getElementById('market-update-time');
  if (el) {
    if (okCount === 0) {
      // 全失败：保持元素现有文本（如果是首屏失败则给个加载中提示）
      // why 不直接覆盖：避免把上一次成功的状态冲掉，让用户误以为「刚刚」失败
      if (!el.dataset.everOk) {
        el.textContent = '📡 行情获取失败（稍后重试）';
      }
    } else {
      el.dataset.everOk = '1';
      // 状态标签：只反映「现在能不能交易」，不带时间戳
      // why 不显示时间：见 getMarketStatusLabel 注释
      el.textContent = `📡 美股 ${getMarketStatusLabel()}`;
    }
  }
}

import { schedule } from './idle-scheduler.js';

export function start() {
  // 调度策略：
  //   · 盘中  → 60s（紧跟实时）
  //   · 平日收盘段（北京 04:00-21:30） → 5min（盘前盘后偶有微跳动，保留较快节奏）
  //   · 周末 → 30min（行情完全静止，但保留低频心跳以备数据源恢复或时间显示纠偏）
  schedule(
    refreshAll,
    () => {
      if (isUsMarketOpen()) return 60 * 1000;
      if (isWeekendOff())   return 30 * 60 * 1000;
      return 5 * 60 * 1000;
    },
  );
}
