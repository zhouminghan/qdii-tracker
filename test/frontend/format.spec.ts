import { describe, expect, it } from 'vitest'
import {
  asNumber,
  daysSince,
  formatCompactMoney,
  formatPercent,
  formatPrice,
  movementClass,
} from '@/shared/lib/format'

describe('format helpers', () => {
  it('treats invalid numeric values as missing', () => {
    expect(asNumber('')).toBeNull()
    expect(asNumber('nan')).toBeNull()
    expect(asNumber(0)).toBe(0)
  })

  it('formats signed percentages and movement classes', () => {
    expect(formatPercent(1.234)).toBe('+1.23%')
    expect(formatPercent(-1.235)).toBe('-1.24%')
    expect(formatPercent(null)).toBe('--')
    expect(movementClass(1)).toBe('is-up')
    expect(movementClass(-1)).toBe('is-down')
    expect(movementClass(null)).toBe('is-flat')
  })

  it('uses different precision for OTC funds and ETFs', () => {
    expect(formatPrice(1.23456)).toBe('1.2346')
    expect(formatPrice(1.23456, true)).toBe('1.235')
    expect(formatCompactMoney(120_000_000)).toBe('1.20亿')
  })

  it('calculates date age in whole days', () => {
    expect(daysSince('2026-11-12', new Date('2026-11-14T12:00:00+08:00'))).toBeGreaterThanOrEqual(2)
  })
})
