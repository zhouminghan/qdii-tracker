/**
 * bj-time.js — 北京时间公共工具
 * 提取自 offshore-live-nav.js，供 etf-premium.js 等模块共用。
 */

/**
 * 获取当前北京时间各分量。
 * @returns {{ date: string, hh: number, mm: number, minutes: number, ts: number, weekday: number }}
 *   weekday: 0=周日 .. 6=周六（北京时间）
 */
export function bjNowParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hh = parseInt(get('hour'), 10) || 0;
  const mm = parseInt(get('minute'), 10) || 0;
  const weekdayName = get('weekday'); // 'Sun'..'Sat'
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${year}-${month}-${day}`,
    hh,
    mm,
    minutes: hh * 60 + mm,
    ts: Date.now(),
    weekday: weekdayMap[weekdayName] ?? 0,
  };
}
