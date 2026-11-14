import type { FundCategory, FundSeries, FundShare } from '@/types/data'
import { asNumber, formatCompactMoney } from './format'

export interface FundRow extends FundSeries {
  category: FundCategory
  defaultShare: FundShare
  starred: boolean
}

export function getDefaultShare(series: FundSeries): FundShare {
  return series.shares.find((share) => share.code === series.default_share_code)
    ?? series.shares[0]
    ?? {
      code: series.default_share_code,
      name: series.display_name,
      share_class: '默认',
      currency: '人民币',
    }
}

export function fundPrice(series: FundSeries, isEtf: boolean): number | null {
  const share = getDefaultShare(series)
  return asNumber(isEtf ? share.etf_price ?? share.nav : share.nav)
}

export function fundChange(series: FundSeries, isEtf: boolean): number | null {
  const share = getDefaultShare(series)
  return asNumber(isEtf ? share.etf_change_pct ?? share.daily_change : share.daily_change)
}

export function compareMissingLast(a: unknown, b: unknown): number {
  const left = asNumber(a)
  const right = asNumber(b)
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return left - right
}

export type FundSortKey =
  | 'series_scale'
  | 'price'
  | 'premium'
  | 'chg_1m'
  | 'chg_3m'
  | 'chg_6m'
  | 'chg_ytd'
  | 'chg_1y'
  | 'chg_2y'
  | 'chg_3y'
  | 'chg_since_inception'
  | 'buy_status'

export function sortFundRows(
  rows: FundRow[],
  key: FundSortKey,
  direction: 'asc' | 'desc',
): FundRow[] {
  const valueOf = (row: FundRow): number | string | null => {
    const share = row.defaultShare
    switch (key) {
      case 'series_scale': return asNumber(row.series_scale)
      case 'price': return asNumber(row.category === 'etf' ? share.etf_price ?? share.nav : share.nav)
      case 'premium': return asNumber(share.etf_premium)
      case 'chg_1m': return asNumber(share.chg_1m)
      case 'chg_3m': return asNumber(share.chg_3m)
      case 'chg_6m': return asNumber(share.chg_6m)
      case 'chg_ytd': return asNumber(share.chg_ytd)
      case 'chg_1y': return asNumber(share.chg_1y)
      case 'chg_2y': return asNumber(share.chg_2y)
      case 'chg_3y': return asNumber(share.chg_3y)
      case 'chg_since_inception': return asNumber(share.chg_since_inception)
      case 'buy_status': return share.buy_status ?? ''
    }
  }

  const multiplier = direction === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1
    const left = valueOf(a)
    const right = valueOf(b)
    if (typeof left === 'string' || typeof right === 'string') {
      return String(left ?? '').localeCompare(String(right ?? ''), 'zh-CN') * multiplier
    }
    if (left === null) return 1
    if (right === null) return -1
    const compared = left - right
    return compared === 0 ? a.display_name.localeCompare(b.display_name, 'zh-CN') : compared * multiplier
  })
}

export function matchesFundQuery(row: FundRow, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return [
    row.display_name,
    row.company,
    row.defaultShare.code,
    row.defaultShare.name,
    ...row.shares.map((share) => `${share.code} ${share.name}`),
  ].some((value) => value.toLowerCase().includes(normalized))
}

export function classifyBuyStatus(share: FundShare): 'open' | 'limited' | 'paused' | 'none' {
  const status = share.buy_status ?? ''
  if (!status) return 'none'
  if (status.includes('暂停')) return 'paused'
  if (status.includes('限')) return 'limited'
  return 'open'
}

export function formatDailyLimit(value: unknown, currency?: string | null): string {
  const limit = asNumber(value)
  if (limit === null || limit <= 0) return '--'
  const prefix = currency === '美元' ? '$' : '¥'
  const amount = limit >= 100_000_000
    ? `${parseFloat((limit / 100_000_000).toFixed(1))}亿`
    : limit >= 10_000
      ? `${parseFloat((limit / 10_000).toFixed(1))}万`
      : Number.isInteger(limit)
        ? limit.toFixed(0)
        : formatCompactMoney(limit)
  return `${prefix}${amount}`
}

export function buyStatusLabel(share: FundShare): string {
  const kind = classifyBuyStatus(share)
  if (kind === 'none') return '--'
  if (kind === 'paused') return '暂停'
  if (kind === 'limited') return share.buy_status || '限购'
  return share.buy_status || '开放'
}
