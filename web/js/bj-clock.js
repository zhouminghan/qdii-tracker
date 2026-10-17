/**
 * bj-clock.js — 顶栏北京时间（精确到秒）
 *
 * 用 Intl.DateTimeFormat + timeZone: 'Asia/Shanghai' 直接取北京时间各分量，
 * 每秒刷新一次。数字使用 font-variant-numeric: tabular-nums，保证 0-9 等宽，
 * 秒数变化时宽度不变、不产生 Layout Shift。
 */
(function () {
  const el = document.getElementById('bj-clock');
  if (!el) return;

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  function tick() {
    const parts = fmt.formatToParts(new Date());
    const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';
    const Y = get('year');
    const M = get('month');
    const D = get('day');
    const hh = get('hour');
    const mm = get('minute');
    const ss = get('second');

    const dateEl = el.querySelector('.bj-clock-date');
    const timeEl = el.querySelector('.bj-clock-time');
    if (dateEl) dateEl.textContent = `${M}-${D}`;
    if (timeEl) timeEl.textContent = `${hh}:${mm}:${ss}`;
    el.title = `北京时间 ${Y}-${M}-${D} ${hh}:${mm}:${ss}`;
  }

  tick();
  setInterval(tick, 1000);
})();
