// ============================================================================
// macro-rates.js — 宏观利率与估值区（美债 2/10/30 年 + VIX + 纳指 PE）
// ============================================================================
// 更新链路：update-data.yml → pipeline.* → web/data/*.json → 前端本地读取 → deploy-pages.yml。
//   Actions 于工作日 UTC 14:00（北京 22:00）及每月 1 日 UTC 18:00 启动，
//   pipeline.macro_rates / market_temperature / ndx_pe 写入本地 JSON；数据提交后
//   显式触发 deploy-pages.yml，将 web/ 发布到 Pages。前端只读取同域 JSON，不直连
//   行情接口，也不轮询。
// 数据源：web/data/macro-rates.json（美债）、market-temperature.json（VIX）、
// ndx-pe.json（PE）。展示于「纳指图谱」Tab 顶部。
// ============================================================================

const DATA_URLS = [
  './data/macro-rates.json',
  './data/market-temperature.json',
  './data/ndx-pe.json',
];

// 上游偶发把 treasury.* 写成 null 时，保留上一版随代码发布的有效静态快照；
// 使用它会触发「部分数据较旧」，避免把回退值误报为本轮新数据。
const LAST_GOOD_TREASURY = {
  generated_at: '2026-11-06T15:18:15.960120+08:00',
  date: '2026-11-05',
  source: '东方财富/akshare',
  treasury: { y2: 4.46, y10: 4.84, y30: 5.25 },
};

// 三个文件由同一轮 Actions 生成；任一 generated_at 缺失或落后半天以上即提示较旧。
const SNAPSHOT_SKEW_LIMIT_MS = 12 * 60 * 60 * 1000;

function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(path) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch (_) {
    return null;
  }
}

function smallCard(label, value, unit) {
  return `
    <div class="mr-card">
      <div class="mr-card-label">${label}</div>
      <div class="mr-card-value">${value}<span class="mr-unit">${unit || ''}</span></div>
    </div>`;
}

function formatMetric(value, digits) {
  const n = num(value);
  return n === null ? '--' : n.toFixed(digits);
}

function pickTreasuryValue(treasury, key) {
  const aliases = {
    y2: ['y2', '2y', 'year2'],
    y10: ['y10', '10y', 'year10'],
    y30: ['y30', '30y', 'year30'],
  }[key];
  for (const field of aliases) {
    const value = num(treasury && treasury[field]);
    if (value !== null) return value;
  }
  return null;
}

function readTreasury(mr) {
  const source = mr && mr.treasury ? mr.treasury : {};
  const values = {
    y2: pickTreasuryValue(source, 'y2'),
    y10: pickTreasuryValue(source, 'y10'),
    y30: pickTreasuryValue(source, 'y30'),
  };
  let usedFallback = false;
  for (const key of ['y2', 'y10', 'y30']) {
    if (values[key] === null) {
      values[key] = num(LAST_GOOD_TREASURY.treasury[key]);
      usedFallback = true;
    }
  }
  return { values, usedFallback };
}

function toTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ts = Date.parse(value.trim());
  return Number.isFinite(ts) ? ts : null;
}

function formatBeijing(ts) {
  if (ts === null) return '未知';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ts));
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
}

function summarizeFreshness(entries, usedFallback) {
  const snapshots = entries.map((entry) => ({ ...entry, ts: toTimestamp(entry.generated_at) }));
  const valid = snapshots.filter((entry) => entry.ts !== null);
  const hasMissing = snapshots.some((entry) => entry.ts === null);
  const oldest = valid.length ? valid.reduce((a, b) => (b.ts < a.ts ? b : a)) : null;
  const newest = valid.length ? valid.reduce((a, b) => (b.ts > a.ts ? b : a)) : null;
  const skew = oldest && newest ? newest.ts - oldest.ts : 0;
  const stale = hasMissing || usedFallback || skew > SNAPSHOT_SKEW_LIMIT_MS;
  const latestText = newest ? formatBeijing(newest.ts) : '未知';
  const rangeText = oldest && newest
    ? `最旧 ${formatBeijing(oldest.ts)} / 最新 ${formatBeijing(newest.ts)}`
    : '最旧/最新时间未知';
  const mainText = `数据更新于 ${latestText}（北京时间）· 工作日 22:00 自动更新（Actions → pipeline → JSON → 前端 → Pages）· 数据源：本地静态快照，不直连`;
  const generatedTimes = snapshots
    .map((entry) => `${entry.label} ${entry.ts === null ? 'generated_at 缺失' : formatBeijing(entry.ts)}`)
    .join(' · ');
  const sources = snapshots
    .filter((entry) => entry.source)
    .map((entry) => `${entry.label} ${entry.source}`)
    .join(' / ');
  const title = [
    'GitHub Actions 定时：工作日北京 22:00（UTC 14:00）、每月 1 日 UTC 18:00',
    '链路：update-data.yml → pipeline.* → web/data/*.json → 前端本地读取 → deploy-pages.yml',
    `生成时间：${generatedTimes}`,
    `数据源：${sources || '本地静态快照'}`,
  ].join('\n');
  return {
    mainText,
    rangeText,
    stale,
    title,
    ariaLabel: `${mainText}；${rangeText}${stale ? '；部分数据较旧' : ''}`,
  };
}

function buildViewModel(mr, temp, peData) {
  const treasury = readTreasury(mr);
  const vix = num(temp?.indicators?.vix?.raw?.value);
  const pe = num(peData?.pe);
  const entries = [
    { label: '美债', generated_at: mr?.generated_at, source: mr?.source || LAST_GOOD_TREASURY.source },
    { label: 'VIX', generated_at: temp?.generated_at, source: temp?.indicators?.vix?.source },
    { label: 'PE', generated_at: peData?.generated_at, source: peData?.source },
  ];
  if (treasury.usedFallback) {
    entries.push({
      label: '美债有效值',
      generated_at: LAST_GOOD_TREASURY.generated_at,
      source: `${LAST_GOOD_TREASURY.source}（${LAST_GOOD_TREASURY.date} 快照）`,
    });
  }
  return {
    values: { treasury: treasury.values, vix, pe },
    freshness: summarizeFreshness(entries, treasury.usedFallback),
  };
}

function render(values, freshness) {
  const root = document.getElementById('macro-rates');
  if (!root) return;
  root.innerHTML = `
    <div class="mr-cards">
      ${smallCard('美债 2 年', formatMetric(values.treasury.y2, 2), '%')}
      ${smallCard('美债 10 年', formatMetric(values.treasury.y10, 2), '%')}
      ${smallCard('美债 30 年', formatMetric(values.treasury.y30, 2), '%')}
      ${smallCard('VIX 恐慌指数', formatMetric(values.vix, 1), '')}
      ${smallCard('纳指 100 PE', formatMetric(values.pe, 1), '')}
    </div>
    <div class="mr-status" role="status"></div>`;

  const status = root.querySelector('.mr-status');
  if (!status) return;
  status.title = freshness.title;
  status.setAttribute('aria-label', freshness.ariaLabel);

  const dot = document.createElement('span');
  dot.className = 'mr-status-dot';
  dot.setAttribute('aria-hidden', 'true');

  const main = document.createElement('span');
  main.className = 'mr-status-main';
  main.textContent = freshness.mainText;

  const range = document.createElement('span');
  range.className = 'mr-status-range';
  range.textContent = freshness.rangeText;

  status.append(dot, main, range);
  if (freshness.stale) {
    const hint = document.createElement('span');
    hint.className = 'mr-status-stale';
    hint.textContent = '部分数据较旧';
    hint.title = '存在缺失的 generated_at，或采用了较早的有效快照';
    status.append(hint);
  }
}

export function start() {
  const root = document.getElementById('macro-rates');
  if (!root) return;
  root.innerHTML = '<div class="mr-loading">宏观行情加载中…</div>';

  Promise.allSettled(DATA_URLS.map(fetchJson)).then((results) => {
    const [mr, temp, peData] = results.map((result) => (
      result.status === 'fulfilled' ? result.value : null
    ));
    const model = buildViewModel(mr, temp, peData);
    render(model.values, model.freshness);
  });
}
