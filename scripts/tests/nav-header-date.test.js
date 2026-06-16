const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadUtils() {
  const filePath = path.resolve(__dirname, '../../web/js/utils.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = { console };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: filePath });
  return context;
}

test('pickRepresentativeDate 选择出现次数最多的日期', () => {
  const { pickRepresentativeDate } = loadUtils();
  assert.equal(
    pickRepresentativeDate(['2026-06-12', '2026-06-12', '2026-06-15']),
    '2026-06-12'
  );
});

test('pickRepresentativeDate 并列时取较新的日期', () => {
  const { pickRepresentativeDate } = loadUtils();
  assert.equal(
    pickRepresentativeDate(['2026-06-12', '2026-06-15']),
    '2026-06-15'
  );
});

test('pickTabNavHeaderDate 对场外混合日期取主日期而不是最新工作日', () => {
  const { pickTabNavHeaderDate } = loadUtils();
  const makeSeries = (code, navDate) => ({
    default_share_code: code,
    shares: [{ code, nav_date: navDate, nav: 1.2345 }],
  });
  const seriesList = [
    ...Array.from({ length: 66 }, (_, i) => makeSeries(`A${i}`, '2026-06-12')),
    ...Array.from({ length: 3 }, (_, i) => makeSeries(`B${i}`, '2026-06-15')),
  ];
  assert.equal(pickTabNavHeaderDate(seriesList, false), '2026-06-12');
});

test('pickTabNavHeaderDate 使用与主表一致的场外展示日期', () => {
  const { pickTabNavHeaderDate } = loadUtils();
  const seriesList = [{
    default_share_code: '000001',
    shares: [{
      code: '000001',
      nav: 1.2,
      nav_date: '2026-06-12',
      _live_nav: 1.25,
      _live_nav_date: '2026-06-13',
      _live_daily_change: 1.1,
    }],
  }];
  assert.equal(pickTabNavHeaderDate(seriesList, false), '2026-06-13');
});

test('shouldHideRowNavDate 在行内日期与表头相同且非实时值时返回 true', () => {
  const { shouldHideRowNavDate } = loadUtils();
  assert.equal(shouldHideRowNavDate('2026-06-15', '2026-06-15', false), true);
  assert.equal(shouldHideRowNavDate('2026-06-15', '2026-06-12', false), false);
  assert.equal(shouldHideRowNavDate('2026-06-15', '2026-06-15', true), false);
});

test('syncRowNavDateVisibility 会在表头切换后重新隐藏重复日期', () => {
  const { syncRowNavDateVisibility } = loadUtils();
  const makeDateEl = (navDate, isLive = false) => {
    const classes = new Set();
    return {
      dataset: { navDate, isLive: isLive ? '1' : '0' },
      classList: {
        toggle(cls, force) {
          if (force) classes.add(cls);
          else classes.delete(cls);
        },
        contains(cls) {
          return classes.has(cls);
        },
      },
    };
  };

  const sameDateEl = makeDateEl('2026-06-15');
  const diffDateEl = makeDateEl('2026-06-12');
  const liveDateEl = makeDateEl('2026-06-15', true);
  const container = {
    querySelectorAll() {
      return [sameDateEl, diffDateEl, liveDateEl];
    },
  };

  syncRowNavDateVisibility(container, '2026-06-15');

  assert.equal(sameDateEl.classList.contains('hidden'), true);
  assert.equal(diffDateEl.classList.contains('hidden'), false);
  assert.equal(liveDateEl.classList.contains('hidden'), false);
});

test('renderRowNavDateHtml 为切组同步输出带 data 属性的日期节点', () => {
  const { renderRowNavDateHtml } = loadUtils();
  const sameHtml = renderRowNavDateHtml('2026-06-15', '2026-06-15', false);
  assert.match(sameHtml, /row-nav-date/);
  assert.match(sameHtml, /data-nav-date="2026-06-15"/);
  assert.match(sameHtml, /data-is-live="0"/);
  assert.match(sameHtml, /hidden/);

  const liveHtml = renderRowNavDateHtml('2026-06-15', '2026-06-15', true);
  assert.match(liveHtml, /row-nav-date/);
  assert.doesNotMatch(liveHtml, /hidden/);
  assert.match(liveHtml, /data-is-live="1"/);
});

test('mergeStateLiveFields 在 reloadData 后保留场外与 ETF 的实时字段', () => {
  const { mergeStateLiveFields } = loadUtils();
  const prevData = {
    sp500: {
      series: [{
        default_share_code: '000001',
        shares: [{
          code: '000001',
          nav: 1.2,
          nav_date: '2026-06-15',
          _live_nav: 1.23,
          _live_daily_change: 0.8,
          _live_nav_date: '2026-06-16',
          _live_nav_source: 'lsjz',
          _live_nav_updated_at: '2026-06-16T09:30:00+08:00',
        }],
      }],
    },
    etf: {
      series: [{
        default_share_code: '513500',
        shares: [{
          code: '513500',
          nav: 1.5,
          nav_date: '2026-06-15',
          etf_price: 1.55,
          etf_change_pct: 2.1,
          etf_iopv: 1.5,
          etf_premium: 3.3,
          _live_etf_date: '2026-06-16',
        }],
      }],
    },
  };
  const nextData = {
    sp500: {
      series: [{
        default_share_code: '000001',
        shares: [{ code: '000001', nav: 1.21, nav_date: '2026-06-15' }],
      }],
    },
    etf: {
      series: [{
        default_share_code: '513500',
        shares: [{ code: '513500', nav: 1.5, nav_date: '2026-06-15' }],
      }],
    },
  };

  const merged = mergeStateLiveFields(nextData, prevData);
  const offshore = merged.sp500.series[0].shares[0];
  const etf = merged.etf.series[0].shares[0];

  assert.equal(offshore.nav, 1.21);
  assert.equal(offshore._live_nav, 1.23);
  assert.equal(offshore._live_nav_date, '2026-06-16');
  assert.equal(offshore._live_nav_source, 'lsjz');
  assert.equal(etf.etf_price, 1.55);
  assert.equal(etf.etf_change_pct, 2.1);
  assert.equal(etf.etf_premium, 3.3);
  assert.equal(etf._live_etf_date, '2026-06-16');
});
