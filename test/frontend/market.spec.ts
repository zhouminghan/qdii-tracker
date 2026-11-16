import { describe, expect, it } from 'vitest'
import { fxLabel, marketBreadth } from '@/shared/lib/market'

describe('market helpers', () => {
  it('uses explicit FX pair names', () => {
    expect(fxLabel('fxUSDCNY')).toBe('USD / CNY')
    expect(fxLabel('fxUSDJPY')).toBe('USD / JPY')
    expect(fxLabel('fxCNYHKD')).toBe('CNY / HKD')
    expect(fxLabel('fxUSDHKD')).toBe('USD / HKD')
  })

  it('falls back to a readable pair name for unmapped codes', () => {
    expect(fxLabel('fxAUDCAD')).toBe('AUD / CAD')
    expect(fxLabel('odd')).toBe('odd')
  })

  it('computes breadth only from valid change values', () => {
    const breadth = marketBreadth([1.2, -0.4, 0, null, undefined, Number.NaN, 2.8])
    expect(breadth).toMatchObject({ up: 2, down: 1, flat: 1, sample: 4 })
    expect(breadth.average).toBeCloseTo((1.2 - 0.4 + 0 + 2.8) / 4)
  })

  it('reports an empty sample when no change values are usable', () => {
    const breadth = marketBreadth([null, undefined, Number.NaN])
    expect(breadth).toMatchObject({ up: 0, down: 0, flat: 0, sample: 0, average: null })
  })
})
