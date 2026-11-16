import { describe, expect, it } from 'vitest'
import { fxLabel } from '@/shared/lib/market'

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
})
