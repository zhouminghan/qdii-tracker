import { describe, expect, it } from 'vitest'
import { marketFreshness, quoteFreshness } from '@/shared/lib/market-freshness'

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

  it('uses the exchange quote timestamp for live quotes', () => {
    const recent = quoteFreshness(
      { asOf: '2026-11-16', updatedAt: '2026-11-16T11:55:00+08:00' },
      'index',
      now,
    )
    expect(recent.key).toBe('realtime')

    const sameDayOld = quoteFreshness(
      { asOf: '2026-11-16', updatedAt: '2026-11-16T09:30:00+08:00' },
      'index',
      now,
    )
    expect(sameDayOld.key).toBe('delayed')

    // Friday's US close fetched on the same page must not be labelled realtime.
    const usClose = quoteFreshness(
      { asOf: '2026-11-13', updatedAt: '2026-11-13T17:15:59+08:00' },
      'index',
      now,
    )
    expect(usClose.key).toBe('close')

    expect(quoteFreshness(undefined, 'index', now).key).toBe('missing')
  })
})
