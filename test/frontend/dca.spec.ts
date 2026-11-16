import { describe, expect, it } from 'vitest'
import { bandOf, peLabel, strategyOf } from '@/shared/lib/dca'

describe('DCA strategy rules', () => {
  it('matches the Python strategy boundaries', () => {
    expect(strategyOf(10, 35, 30).band?.key).toBe('extreme_fear')
    expect(strategyOf(25, 28, null).band?.key).toBe('fear')
    expect(strategyOf(45, 20, null).band?.key).toBe('neutral')
    expect(strategyOf(55, 18, null).band?.key).toBe('greed')
    expect(strategyOf(75, 10, null).band?.key).toBe('extreme_greed')
  })

  it('keeps the documented 0/25/45/55/75/100 ladder', () => {
    expect(strategyOf(0, 35, null).band?.key).toBe('extreme_fear')
    expect(strategyOf(25, 28, null).band?.key).toBe('fear')
    expect(strategyOf(45, 20, null).band?.key).toBe('neutral')
    expect(strategyOf(55, 18, null).band?.key).toBe('greed')
    expect(strategyOf(75, 10, null).band?.key).toBe('extreme_greed')
    expect(strategyOf(100, 10, null).band?.key).toBe('extreme_greed')
  })

  it('reports VIX mismatch without changing the fear-greed band', () => {
    const result = strategyOf(60, 25, null)
    expect(result.band?.key).toBe('greed')
    expect(result.matched).toBe(false)
    expect(result.note).toContain('高于')
  })

  it('returns no valid strategy when fear-greed is missing', () => {
    for (const missing of [null, undefined, Number.NaN, '', 'abc', {}]) {
      const result = strategyOf(missing, 22, 30)
      expect(result.available).toBe(false)
      expect(result.band).toBeNull()
      expect(result.matched).toBe(false)
      expect(result.note).toContain('无法生成有效定投策略')
      // VIX / PE remain available for display even when the band is missing.
      expect(result.vix).toBe(22)
      expect(result.pe).toBe(30)
    }
    expect(bandOf(null)).toBeNull()
    expect(bandOf(Number.NaN)).toBeNull()
  })

  it('surfaces missing VIX without fabricating a match', () => {
    const result = strategyOf(50, null, 30)
    expect(result.matched).toBe(false)
    expect(result.note).toContain('暂无 VIX')
  })

  it('keeps the strategy when PE is missing', () => {
    const result = strategyOf(50, 20, null)
    expect(result.band?.key).toBe('neutral')
    expect(result.matched).toBe(true)
    expect(result.peLabel).toBe('暂无 PE 数据')
  })

  it('uses the same PE labels', () => {
    expect(peLabel(35)).toBe('估值偏高，注意回撤风险')
    expect(peLabel(25)).toBe('估值中性，控制节奏')
    expect(peLabel(24)).toBe('估值偏低，长期赔率改善')
  })
})
