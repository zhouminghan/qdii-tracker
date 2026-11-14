import { describe, expect, it } from 'vitest'
import { parseTencentQuote, tencentEtfSymbol } from '@/shared/lib/realtime'

function payload(price: number, change: number, nav: number): string {
  const fields = Array.from({ length: 83 }, () => '')
  fields[3] = String(price)
  fields[32] = String(change)
  fields[78] = String(nav)
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
})
