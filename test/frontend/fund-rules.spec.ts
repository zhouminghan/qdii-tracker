import { describe, expect, it } from 'vitest'
import type { FundShare } from '@/types/data'
import {
  cleanRuleCondition,
  discountedBuyRate,
  formatHoldPeriod,
  freeHoldDays,
  totalAnnualFee,
} from '@/shared/lib/fund-rules'
import { formatDailyLimit } from '@/shared/lib/funds'

function share(overrides: Partial<FundShare> = {}): FundShare {
  return {
    code: '000001',
    name: '测试基金',
    share_class: 'A',
    currency: '人民币',
    ...overrides,
  }
}

describe('fund rule helpers', () => {
  it('formats discounted buy and daily-limit values', () => {
    expect(discountedBuyRate(1.2)).toBe(0.12)
    expect(discountedBuyRate(0)).toBe(0)
    expect(formatDailyLimit(100, '人民币')).toBe('¥100')
    expect(formatDailyLimit(10_000, '人民币')).toBe('¥1万')
    expect(formatDailyLimit(1, '美元')).toBe('$1')
  })

  it('normalizes rule text and derives the free holding period', () => {
    expect(cleanRuleCondition('7.0天<=持有期限<365.0天')).toBe('7天<=持有期限<1年')
    expect(freeHoldDays(share({
      sell_rules: [
        { condition: '7天<=持有期限', rate: 0 },
      ],
    }))).toBe(7)
    expect(formatHoldPeriod(365)).toBe('1 年')
  })

  it('sums the disclosed annual fee components', () => {
    expect(totalAnnualFee(share({
      mgmt_fee: 0.6,
      custody_fee: 0.2,
      sale_service_fee: 0.25,
    }))).toBe(1.05)
  })
})
