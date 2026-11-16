import { describe, expect, it } from 'vitest'
import { isRecentQuote, parseTencentQuote, tencentEtfSymbol } from '@/shared/lib/realtime'
import { MARKET_INDEX_LABELS } from '@/shared/constants/funds'

function payload(price: number, change: number, nav: number, stamp = ''): string {
  const fields = Array.from({ length: 83 }, () => '')
  fields[3] = String(price)
  fields[32] = String(change)
  fields[78] = String(nav)
  fields[30] = stamp
  return fields.join('~')
}

describe('Tencent quote adapter', () => {
  it('chooses exchange prefixes from ETF codes', () => {
    expect(tencentEtfSymbol('513100')).toBe('sh513100')
    expect(tencentEtfSymbol('159941')).toBe('sz159941')
  })

  it('parses price, change, and premium', () => {
    const quote = parseTencentQuote(payload(1.2, 2.5, 1))
    expect(quote?.price).toBe(1.2)
    expect(quote?.changePct).toBe(2.5)
    expect(quote?.premium).toBeCloseTo(20)
  })

  it('rejects empty or invalid payloads', () => {
    expect(parseTencentQuote('')).toBeNull()
    expect(parseTencentQuote(payload(0, 1, 1))).toBeNull()
  })

  it('parses exchange timestamps in both quote formats', () => {
    const compact = parseTencentQuote(payload(3600, 0.5, 0, '20261116141957'))
    expect(compact?.asOf).toBe('2026-11-16')
    expect(compact?.updatedAt).toBe('2026-11-16T14:19:57+08:00')

    const separated = parseTencentQuote(payload(27943, -1.22, 0, '2026-11-13 17:15:59'))
    expect(separated?.asOf).toBe('2026-11-13')
    expect(separated?.updatedAt).toBe('2026-11-13T17:15:59+08:00')
  })

  it('only treats recent exchange timestamps as realtime', () => {
    const now = new Date('2026-11-16T14:20:00+08:00').getTime()
    expect(isRecentQuote({ updatedAt: '2026-11-16T14:19:57+08:00' }, now)).toBe(true)
    expect(isRecentQuote({ updatedAt: '2026-11-13T17:15:59+08:00' }, now)).toBe(false)
    expect(isRecentQuote({ updatedAt: null }, now)).toBe(false)
    expect(isRecentQuote(undefined, now)).toBe(false)
  })

  it('keeps Nasdaq Composite and Nasdaq 100 labels distinct', () => {
    expect(MARKET_INDEX_LABELS['100.NDX']).toBe('纳指综合')
    expect(MARKET_INDEX_LABELS['100.NDX100']).toBe('纳斯达克100')
  })
})
