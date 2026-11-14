import type { FundRule, FundShare } from '@/types/data'
import { asNumber } from './format'

export function cleanRuleCondition(condition: string): string {
  return condition
    .replace(/\.0(?=\D|$)/g, '')
    .replace(/365天/g, '1年')
    .replace(/730天/g, '2年')
    .replace(/1095天/g, '3年')
}

export function discountedBuyRate(rate: number): number {
  return rate > 0 && rate < 100 ? Number((rate * 0.1).toFixed(2)) : rate
}

export function formatRuleRate(rate: number, discounted = false): string {
  if (rate >= 100) return `${rate} 元`
  if (rate === 0) return '免费'
  return `${discounted ? discountedBuyRate(rate) : rate}%`
}

export function totalAnnualFee(share: FundShare): number {
  return (asNumber(share.mgmt_fee) ?? 0)
    + (asNumber(share.custody_fee) ?? 0)
    + (asNumber(share.sale_service_fee) ?? 0)
}

export function annualFeeDetail(share: FundShare): string {
  const parts = [
    share.mgmt_fee != null ? `管理费 ${share.mgmt_fee}%` : '',
    share.custody_fee != null ? `托管费 ${share.custody_fee}%` : '',
    share.sale_service_fee ? `销售服务费 ${share.sale_service_fee}%` : '',
  ].filter(Boolean)
  return parts.join(' + ') || '暂无公开费率'
}

export function freeHoldDays(share: FundShare): number | null {
  const explicit = asNumber(share.free_hold_days)
  if (explicit !== null && explicit > 0) return explicit
  const lastRule = share.sell_rules?.[share.sell_rules.length - 1]
  if (!lastRule) return null
  const match = lastRule.condition.match(/(\d+(?:\.\d+)?)\s*(天|年)/)
  if (!match) return null
  const value = Number(match[1])
  return match[2] === '年' ? Math.round(value * 365) : value
}

export function formatHoldPeriod(days: number | null): string {
  if (days === null || days <= 0) return '未公布'
  if (days >= 365 && days % 365 === 0) return `${days / 365} 年`
  return `${days} 天`
}

export function sellRuleLabel(rule: FundRule): string {
  return rule.rate === 0 ? '免费' : `${rule.rate}%`
}
