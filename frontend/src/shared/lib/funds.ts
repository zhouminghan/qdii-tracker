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

export function representativeNavDate(dates: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>()
  for (const date of dates) {
    if (!date) continue
    counts.set(date, (counts.get(date) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [date, count] of counts) {
    if (count > bestCount || (count === bestCount && (!best || date > best))) {
      best = date
      bestCount = count
    }
  }
  return best
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
  | 'daily_limit'
  | 'buy_status'

export function limitCurrency(share: FundShare): string {
  return share.limit_currency || share.currency || ''
}

export function currencyRank(currency: string | null | undefined): number {
  if (!currency) return 2
  if (currency.includes('人民币')) return 0
  if (currency.includes('美元')) return 1
  return 2
}

export function currencyPrefix(currency: string | null | undefined): string {
  if (!currency) return '¥'
  if (currency.includes('美元')) return '$'
  if (currency.includes('港币')) return 'HK$'
  if (currency.includes('日元')) return '¥'
  return '¥'
}

export function confirmedDailyLimit(share: FundShare): number | null {
  const limit = asNumber(share.daily_limit)
  const kind = classifyBuyStatus(share)
  if (limit === null || limit <= 0 || kind === 'paused' || kind === 'open') return null
  return limit
}

export function limitScopeLabel(share: FundShare): string {
  if (share.limit_scope === 'series_shared') return '系列共享额度'
  if (share.limit_scope === 'share') return '单份额额度'
  return '额度范围待核验'
}

export function limitScopeShort(share: FundShare, shares?: FundShare[]): string {
  if (share.limit_scope === 'series_shared') {
    const group = (shares ?? [share]).filter((item) => (
      !share.limit_group_id || item.limit_group_id === share.limit_group_id
    ))
    const classes = [...new Set(group
      .map((item) => String(item.share_class || '').trim())
      .filter(Boolean))]
    return classes.length > 1 ? `${classes.join('/')} 共用` : '共享'
  }
  if (share.limit_scope === 'unknown' && confirmedDailyLimit(share) !== null) return '待核验'
  return ''
}

export function dailyLimitDisplay(share: FundShare): string {
  const kind = classifyBuyStatus(share)
  if (kind === 'paused') return '--'
  const limit = confirmedDailyLimit(share)
  if (limit === null) {
    if (kind === 'limited') return '待核验'
    if (kind === 'open') return '不限额'
    return '--'
  }
  return `${formatDailyLimit(limit, limitCurrency(share))}/日`
}

export function purchaseActionLabel(share: FundShare): string {
  const kind = classifyBuyStatus(share)
  if (kind === 'paused') return '暂停买入与定投'
  if (kind === 'limited') return '可买入与定投，受每日额度限制'
  if (kind === 'open') return '可买入与定投'
  return '申购状态待确认'
}

export function limitChannelSummary(share: FundShare): string {
  return (share.limit_channels ?? [])
    .map((item) => {
      const suffix = item.includes_installment ? '（含定投）' : ''
      return `${item.channel} ${formatDailyLimit(item.amount, item.currency)}/日${suffix}`
    })
    .join(' · ')
}

export function dailyLimitTitle(share: FundShare): string {
  const parts = [limitScopeLabel(share), purchaseActionLabel(share)]
  if (share.limit_status === 'active') parts.push('核验有效')
  if (share.limit_status === 'expired') parts.push('公告已失效')
  if (share.limit_status === 'unverified') parts.push('待核验')
  if (share.limit_source) parts.push(`来源：${share.limit_source}`)
  if (share.limit_confidence) parts.push(`置信度：${share.limit_confidence}`)
  if (share.limit_effective_date) parts.push(`生效：${share.limit_effective_date}`)
  if (share.limit_expires_at) parts.push(`失效：${share.limit_expires_at}`)
  if (share.limit_verified_at) parts.push(`核验：${share.limit_verified_at}`)
  const channels = limitChannelSummary(share)
  if (channels) parts.push(channels)
  if (share.limit_notice_title) parts.push(`公告：${share.limit_notice_title}`)
  if (share.buy_status_source) parts.push(`申购状态来源：${share.buy_status_source}`)
  if (share.buy_status_verified_at) parts.push(`状态核验：${share.buy_status_verified_at}`)
  if (share.limit_source_url) parts.push(share.limit_source_url)
  return parts.join(' · ')
}

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
      case 'daily_limit': return confirmedDailyLimit(share)
      case 'buy_status': return confirmedDailyLimit(share)
    }
  }

  const multiplier = direction === 'desc' ? -1 : 1
  const byName = (a: FundRow, b: FundRow) => a.display_name.localeCompare(b.display_name, 'zh-CN')
  return [...rows].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1
    if (key === 'daily_limit' || key === 'buy_status') {
      const left = confirmedDailyLimit(a.defaultShare)
      const right = confirmedDailyLimit(b.defaultShare)
      if (left === null && right === null) return byName(a, b)
      if (left === null) return 1
      if (right === null) return -1
      const currencyDiff = currencyRank(limitCurrency(a.defaultShare)) - currencyRank(limitCurrency(b.defaultShare))
      if (currencyDiff !== 0) return currencyDiff
      const compared = left - right
      return compared === 0 ? byName(a, b) : compared * multiplier
    }
    const left = valueOf(a)
    const right = valueOf(b)
    if (typeof left === 'string' || typeof right === 'string') {
      return String(left ?? '').localeCompare(String(right ?? ''), 'zh-CN') * multiplier
    }
    if (left === null) return 1
    if (right === null) return -1
    const compared = left - right
    return compared === 0 ? byName(a, b) : compared * multiplier
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
  const prefix = currencyPrefix(currency)
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
  if (kind === 'limited') {
    const limit = confirmedDailyLimit(share)
    return limit === null
      ? (share.buy_status || '限购')
      : `限 ${formatDailyLimit(limit, limitCurrency(share))}`
  }
  return share.buy_status || '开放'
}
