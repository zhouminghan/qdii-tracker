import test from 'node:test';
import assert from 'node:assert/strict';

import { ETF_BOOTSTRAP_RETRY_MS, getEtfNextIntervalMs } from '../../web/js/etf-premium.js';

test('getEtfNextIntervalMs 在 etf 数据未装载时使用 bootstrap retry 间隔', () => {
  const preOpen = { minutes: 8 * 60 };
  assert.equal(getEtfNextIntervalMs(preOpen, false, 0, false), ETF_BOOTSTRAP_RETRY_MS);
  assert.equal(getEtfNextIntervalMs(preOpen, false, 0, true), 5 * 60 * 1000);
});
