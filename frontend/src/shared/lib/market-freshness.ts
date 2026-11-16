import { daysSince } from './format'

export type FreshnessKind = 'index' | 'fx' | 'macro' | 'monthly' | 'gold'
export type FreshnessTone = 'ok' | 'warn' | 'muted' | 'accent'

export interface MarketFreshness {
  key: 'realtime' | 'close' | 'delayed' | 'monthly' | 'stale' | 'missing'
  label: string
  tone: FreshnessTone
  days: number | null
}

const kindLimits: Record<FreshnessKind, { close: number; delayed: number }> = {
  index: { close: 3, delayed: 7 },
  fx: { close: 3, delayed: 7 },
  macro: { close: 3, delayed: 7 },
  monthly: { close: 45, delayed: 75 },
  gold: { close: 3, delayed: 10 },
}

export function marketFreshness(
  asOf: string | null | undefined,
  kind: FreshnessKind,
  live = false,
  now = new Date(),
): MarketFreshness {
  if (live) return { key: 'realtime', label: '实时', tone: 'accent', days: 0 }
  const days = daysSince(asOf, now)
  if (days === null) return { key: 'missing', label: '暂无数据', tone: 'muted', days: null }

  const limits = kindLimits[kind]
  if (kind === 'monthly' && days <= limits.close) {
    return { key: 'monthly', label: '月度数据', tone: 'muted', days }
  }
  if (days <= limits.close) return { key: 'close', label: '最新收盘', tone: 'ok', days }
  if (days <= limits.delayed) return { key: 'delayed', label: '延迟', tone: 'warn', days }
  return { key: 'stale', label: '陈旧', tone: 'warn', days }
}
