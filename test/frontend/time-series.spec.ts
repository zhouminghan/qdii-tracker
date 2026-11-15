import { describe, expect, it } from 'vitest'
import { dailyChange, filterTimeSeries } from '@/shared/lib/time-series'

describe('time-series filters', () => {
  const dates = ['2024-12-31', '2025-06-01', '2025-12-31', '2026-01-02', '2026-06-01', '2026-11-14']
  const values = [1, 1.1, 1.2, 1.25, 1.3, 1.4]

  it('filters by calendar range and YTD', () => {
    expect(filterTimeSeries(dates, values, '1y').dates[0]).toBe('2025-12-31')
    expect(filterTimeSeries(dates, values, 'ytd').dates).toEqual(['2026-01-02', '2026-06-01', '2026-11-14'])
    expect(filterTimeSeries(dates, values, 'all').values).toEqual(values)
  })

  it('computes daily change from the previous close', () => {
    expect(dailyChange(1.1, 1)).toBeCloseTo(10)
    expect(dailyChange(1, undefined)).toBeNull()
  })
})
