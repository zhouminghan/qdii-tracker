import { describe, expect, it } from 'vitest'
import {
  MARKET_INDEX_KNOWLEDGE_IDS,
  MARKET_MACRO_KNOWLEDGE_IDS,
  MARKET_METRIC_KNOWLEDGE,
} from '@/features/market/metricKnowledge'

describe('market metric knowledge', () => {
  it('covers every required index and metric', () => {
    const required = [
      ...MARKET_INDEX_KNOWLEDGE_IDS,
      ...MARKET_MACRO_KNOWLEDGE_IDS,
      'pe',
      'ttm-pe',
      'forward-pe',
      'cape',
      'vix',
      'fear-greed',
      'market-temperature',
      'xau-usd',
      'fx',
    ]
    for (const id of required) {
      expect(MARKET_METRIC_KNOWLEDGE[id], id).toBeTruthy()
    }
  })

  it('keeps every entry complete', () => {
    for (const [id, entry] of Object.entries(MARKET_METRIC_KNOWLEDGE)) {
      expect(entry.id, id).toBe(id)
      expect(entry.name.length, id).toBeGreaterThan(0)
      expect(entry.oneLiner.length, id).toBeGreaterThan(0)
      expect(entry.purpose.length, id).toBeGreaterThan(0)
      expect(entry.interpretation.length, id).toBeGreaterThan(0)
      expect(entry.pitfalls.length, id).toBeGreaterThan(0)
      expect(entry.source.length, id).toBeGreaterThan(0)
      expect(entry.methodology.length, id).toBeGreaterThan(0)
    }
  })

  it('states the actual TTM PE, VIX, DXY and internal temperature semantics', () => {
    expect(MARKET_METRIC_KNOWLEDGE['ttm-pe'].source).toContain('Siblis')
    expect(MARKET_METRIC_KNOWLEDGE['ttm-pe'].methodology).toContain('不是 Forward PE')
    expect(MARKET_METRIC_KNOWLEDGE.vix.oneLiner).toContain('不预测涨跌方向')
    expect(MARKET_METRIC_KNOWLEDGE.dxy.oneLiner).toContain('不是美元兑人民币汇率')
    expect(MARKET_METRIC_KNOWLEDGE['market-temperature'].oneLiner).toContain('内部参考')
    expect(MARKET_METRIC_KNOWLEDGE['market-temperature'].methodology).toContain('40%')
    expect(MARKET_METRIC_KNOWLEDGE['xau-usd'].methodology).toContain('折算参考')
    expect(MARKET_METRIC_KNOWLEDGE['xau-usd'].methodology).toContain('独立')
  })

  it('does not contain unverified buy/sell instructions', () => {
    const text = Object.values(MARKET_METRIC_KNOWLEDGE)
      .map((entry) => [entry.oneLiner, entry.purpose, ...entry.interpretation, ...entry.pitfalls, entry.methodology].join(' '))
      .join(' ')
    expect(text).not.toContain('建议买入')
    expect(text).not.toContain('建议卖出')
  })
})
