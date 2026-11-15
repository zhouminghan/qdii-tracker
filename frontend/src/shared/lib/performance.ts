import type { FundShare } from '@/types/data'
import { daysSince, formatPercent } from './format'

export type PerformanceKey =
  | 'chg_1w'
  | 'chg_1m'
  | 'chg_3m'
  | 'chg_6m'
  | 'chg_ytd'
  | 'chg_1y'
  | 'chg_2y'
  | 'chg_3y'
  | 'chg_since_inception'

const PERIOD_META: Record<PerformanceKey, { label: string; days: number | null }> = {
  chg_1w: { label: '1周', days: 7 },
  chg_1m: { label: '1月', days: 30 },
  chg_3m: { label: '3月', days: 90 },
  chg_6m: { label: '6月', days: 180 },
  chg_ytd: { label: '今年来', days: null },
  chg_1y: { label: '1年', days: 365 },
  chg_2y: { label: '2年', days: 730 },
  chg_3y: { label: '3年', days: 1095 },
  chg_since_inception: { label: '成立来', days: null },
}

export function performanceDisplay(
  value: unknown,
  key: PerformanceKey,
  share: Pick<FundShare, 'established' | 'buy_status'>,
): string {
  if (value !== null && value !== undefined && value !== '') return formatPercent(value)
  if (String(share.buy_status || '').includes('封闭')) return '封闭期'
  const requiredDays = PERIOD_META[key].days
  const age = daysSince(share.established)
  if (requiredDays && age !== null && age < requiredDays) return `不足${PERIOD_META[key].label}`
  return '数据不足'
}
