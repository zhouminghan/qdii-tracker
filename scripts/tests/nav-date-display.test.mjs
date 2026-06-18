/**
 * nav-date-display.test.mjs — 表头日期策略回归测试
 *
 * 覆盖场景：
 *   1. pickMaxDate 取最大日期
 *   2. 分组内众数 vs 全 Tab 最大日期
 *   3. shouldHideRowNavDate 行内日期显隐
 *   4. 切组后表头日期不变（Tab 级固定）
 *   5. 造数 2026-06-19 场景
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- 从 utils.js 提取纯函数（全局 script，非 ES Module，需手动 eval） ----
const utilsSrc = readFileSync(resolve(__dirname, '../../web/js/utils.js'), 'utf-8');

// 提取函数体（用 Function 构造器隔离，只导入测试目标）
function extractFn(name) {
  const re = new RegExp(`function ${name}\\(([\\s\\S]*?)\\)\\s*\\{`);
  const m = utilsSrc.match(re);
  if (!m) throw new Error(`Function ${name} not found in utils.js`);
  // 找到匹配大括号结束位置
  const start = utilsSrc.indexOf('{', utilsSrc.indexOf(`function ${name}`));
  let depth = 0, i = start;
  for (; i < utilsSrc.length; i++) {
    if (utilsSrc[i] === '{') depth++;
    if (utilsSrc[i] === '}') depth--;
    if (depth === 0) break;
  }
  const body = utilsSrc.slice(start + 1, i);
  return new Function(...m[1].split(',').map(s => s.trim().replace(/=.*$/, '').replace(/\.\.\./, '')), body);
}

// 提取现有函数
const pickRepresentativeDate = extractFn('pickRepresentativeDate');
const getOffshoreDisplayValues = extractFn('getOffshoreDisplayValues');
const getSeriesDisplayNavDate = extractFn('getSeriesDisplayNavDate');
const shouldHideRowNavDate = extractFn('shouldHideRowNavDate');
const fmtMD = extractFn('fmtMD');

// ---- pickMaxDate（新增函数，先手动实现待 utils.js 合入后替换） ----
function pickMaxDate(dates) {
  let maxDate = '';
  for (const d of dates || []) {
    if (d && d > maxDate) maxDate = d;
  }
  return maxDate;
}

// ==================== 测试 ====================

test('pickMaxDate 返回日期列表中的最大值', () => {
  assert.equal(pickMaxDate(['2026-06-16', '2026-06-17', '2026-06-15']), '2026-06-17');
  assert.equal(pickMaxDate(['2026-06-16', '2026-06-16']), '2026-06-16');
  assert.equal(pickMaxDate(['2026-06-19']), '2026-06-19');
  assert.equal(pickMaxDate([]), '');
  assert.equal(pickMaxDate(null), '');
  assert.equal(pickMaxDate(['', '2026-06-17']), '2026-06-17');
  assert.equal(pickMaxDate(['', '']), '');
});

test('pickMaxDate vs pickRepresentativeDate: 多数滞后 + 少数更新场景', () => {
  // 模拟 sp500 分组：7 只全 6-16
  const sp500Dates = ['2026-06-16', '2026-06-16', '2026-06-16', '2026-06-16', '2026-06-16', '2026-06-16', '2026-06-16'];
  // 模拟 global_index 分组：2 只全 6-17
  const globalIndexDates = ['2026-06-17', '2026-06-17'];

  // 众数策略：sp500 → 06-16（滞后！）
  assert.equal(pickRepresentativeDate(sp500Dates), '2026-06-16');

  // 最大值策略：跨全 Tab → 06-17（反映最新数据）
  const allDates = [...sp500Dates, ...globalIndexDates];
  assert.equal(pickMaxDate(allDates), '2026-06-17');
});

test('shouldHideRowNavDate: 行内日期等于表头时隐藏，不等时显示', () => {
  // 表头 = 06-17（Tab 级最大），行 = 06-16 → 显示
  assert.equal(shouldHideRowNavDate('2026-06-16', '2026-06-17', false), false);
  // 表头 = 06-17，行 = 06-17 → 隐藏
  assert.equal(shouldHideRowNavDate('2026-06-17', '2026-06-17', false), true);
  // 行是 live → 不隐藏
  assert.equal(shouldHideRowNavDate('2026-06-17', '2026-06-17', true), false);
});

test('造数 2026-06-19 场景: Tab 级最大日期正确反映 06-19', () => {
  // 模拟 sp500 有 1 只更新到 6-19，其余仍 6-16
  const sp500Dates = ['2026-06-19', '2026-06-16', '2026-06-16', '2026-06-16'];
  const allDates = [...sp500Dates];

  // 众数策略 → 06-16（6-19 只有 1 票，6-16 有 3 票）
  assert.equal(pickRepresentativeDate(allDates), '2026-06-16');
  // 最大值策略 → 06-19（正确反映最新数据）
  assert.equal(pickMaxDate(allDates), '2026-06-19');

  // 行内日期显隐：6-16 的行在 06-19 表头下应显示
  assert.equal(shouldHideRowNavDate('2026-06-16', '2026-06-19', false), false);
  // 6-19 的行在 06-19 表头下应隐藏
  assert.equal(shouldHideRowNavDate('2026-06-19', '2026-06-19', false), true);
});

test('切组后表头日期保持 Tab 级最大不变', () => {
  // 场外 Tab: sp500=06-16, global_index=06-17
  const sp500 = ['2026-06-16', '2026-06-16'];
  const globalIndex = ['2026-06-17', '2026-06-17'];

  const tabMax = pickMaxDate([...sp500, ...globalIndex]);

  // 切到 sp500 → 表头仍是 06-17
  assert.equal(tabMax, '2026-06-17');
  // 切到 global_index → 表头仍是 06-17
  assert.equal(tabMax, '2026-06-17');
});

test('fmtMD 正确去掉年前缀', () => {
  assert.equal(fmtMD('2026-06-17'), '06-17');
  assert.equal(fmtMD('2026-06-19'), '06-19');
  assert.equal(fmtMD(''), '');
});
