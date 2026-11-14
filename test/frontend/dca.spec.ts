import { describe, expect, it } from 'vitest'
import { peLabel, strategyOf } from '@/shared/lib/dca'

describe('DCA strategy rules', () => {
  it('matches the Python strategy boundaries', () => {
    expect(strategyOf(10, 35, 30).band.key).toBe('extreme_fear')
    expect(strategyOf(25, 28, null).band.key).toBe('fear')
    expect(strategyOf(45, 20, null).band.key).toBe('neutral')
    expect(strategyOf(55, 18, null).band.key).toBe('greed')
    expect(strategyOf(75, 10, null).band.key).toBe('extreme_greed')
  })

  it('reports VIX mismatch without changing the fear-greed band', () => {
    const result = strategyOf(60, 25, null)
    expect(result.band.key).toBe('greed')
    expect(result.matched).toBe(false)
    expect(result.note).toContain('高于')
  })

  it('uses the same PE labels', () => {
    expect(peLabel(35)).toBe('估值偏高，注意回撤风险')
    expect(peLabel(25)).toBe('估值中性，控制节奏')
    expect(peLabel(24)).toBe('估值偏低，长期赔率改善')
  })
})
