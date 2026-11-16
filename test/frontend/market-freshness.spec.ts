import { describe, expect, it } from 'vitest'
import { marketFreshness } from '@/shared/lib/market-freshness'

const now = new Date('2026-11-16T12:00:00+08:00')

describe('market freshness', () => {
  it('uses different thresholds for close and monthly data', () => {
    expect(marketFreshness('2026-11-15', 'index', false, now).key).toBe('close')
    expect(marketFreshness('2026-11-08', 'index', false, now).key).toBe('stale')
    expect(marketFreshness('2026-10-31', 'monthly', false, now).key).toBe('monthly')
    expect(marketFreshness('2026-08-31', 'monthly', false, now).key).toBe('stale')
  })

  it('marks live, delayed, and missing data explicitly', () => {
    expect(marketFreshness('2026-11-10', 'macro', true, now).key).toBe('realtime')
    expect(marketFreshness('2026-11-10', 'macro', false, now).key).toBe('delayed')
    expect(marketFreshness(null, 'index', false, now).key).toBe('missing')
  })
})
