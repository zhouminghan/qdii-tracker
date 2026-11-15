import type { FundShare } from '@/types/data'
import { formatPercent } from './format'

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

export function performanceDisplay(
  value: unknown,
  _key: PerformanceKey,
  share: Pick<FundShare, 'buy_status'>,
): string {
  if (value !== null && value !== undefined && value !== '') return formatPercent(value)
  if (String(share.buy_status || '').includes('封闭')) return '封闭期'
  return '-'
}
