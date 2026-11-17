import { describe, expect, it } from 'vitest'
import type { FundSeries } from '@/types/data'
import {
  buyStatusLabel,
  compareMissingLast,
  confirmedDailyLimit,
  dailyLimitDisplay,
  dailyLimitTitle,
  limitScopeShort,
  matchesFundQuery,
  sortFundRows,
  type FundRow,
} from '@/shared/lib/funds'

function series(
  id: string,
  name: string,
  code: string,
  scale: number | null,
  chg: number | null,
  limit?: number | null,
  currency = '人民币',
  buyStatus = '限大额',
  scope?: 'share' | 'series_shared' | 'unknown',
  starred = false,
): FundRow {
  const value: FundSeries = {
    series_id: id,
    display_name: name,
    company: '测试基金',
    default_share_code: code,
    series_scale: scale,
    shares: [{
      code,
      name: `${name}A`,
      share_class: 'A',
      currency,
      chg_1y: chg,
      daily_limit: limit ?? null,
      buy_status: buyStatus,
      limit_scope: scope,
    }],
  }
  return {
    ...value,
    category: 'sp500',
    defaultShare: value.shares[0],
    starred,
  }
}

describe('fund view-model helpers', () => {
  it('keeps missing numeric values last in both directions', () => {
    expect(compareMissingLast(10, 5)).toBeGreaterThan(0)
    expect(compareMissingLast(null, 5)).toBe(1)
    expect(compareMissingLast(5, null)).toBe(-1)
    expect(compareMissingLast(null, null)).toBe(0)
  })

  it('pins favorites before applying the selected sort', () => {
    const rows = [
      series('a', 'Apple', '000001', 20, 4),
      series('b', 'Bank', '000002', 100, 2),
      series('c', 'Core', '000003', null, null),
    ]
    rows[2].starred = true
    const sorted = sortFundRows(rows, 'series_scale', 'desc')
    expect(sorted.map((row) => row.series_id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts missing fund values to the bottom', () => {
    const rows = [
      series('a', 'Apple', '000001', null, null),
      series('b', 'Bank', '000002', 20, 2),
      series('c', 'Core', '000003', 100, 4),
    ]
    expect(sortFundRows(rows, 'series_scale', 'asc').map((row) => row.series_id)).toEqual(['b', 'c', 'a'])
    expect(sortFundRows(rows, 'series_scale', 'desc').map((row) => row.series_id)).toEqual(['c', 'b', 'a'])
  })

  it('searches across series names, companies, and nested share codes', () => {
    const row = series('a', '标普核心', '050025', 10, 1)
    expect(matchesFundQuery(row, '标普')).toBe(true)
    expect(matchesFundQuery(row, '050025')).toBe(true)
    expect(matchesFundQuery(row, '不存在')).toBe(false)
  })

  it('sorts daily limits within currency groups, favorites first and missing last', () => {
    const rows = [
      series('a', 'Apple', '000001', 20, 4, 100, '人民币'),
      series('b', 'Bank', '000002', 100, 2, 10, '人民币'),
      series('c', 'Core', '000003', null, null, null, '人民币'),
      series('d', 'Dollar', '000004', 30, 1, 1, '美元'),
      series('e', 'Favorite', '000005', 10, 3, 500, '美元', '限大额', 'unknown', true),
    ]
    expect(sortFundRows(rows, 'daily_limit', 'asc').map((row) => row.series_id))
      .toEqual(['e', 'b', 'a', 'd', 'c'])
    expect(sortFundRows(rows, 'daily_limit', 'desc').map((row) => row.series_id))
      .toEqual(['e', 'a', 'b', 'd', 'c'])
  })

  it('does not compare raw amounts across currencies', () => {
    const rows = [
      series('cny', 'CNY large', '000001', 10, 1, 1_000_000, '人民币'),
      series('usd', 'USD small', '000002', 10, 1, 1, '美元'),
    ]
    // 人民币分组固定在美元前；两个金额不做 1,000,000 vs 1 的跨币种比较。
    expect(sortFundRows(rows, 'daily_limit', 'asc').map((row) => row.series_id))
      .toEqual(['cny', 'usd'])
  })

  it('treats paused limits as missing, not zero', () => {
    const paused = series('paused', 'Paused', '000001', 10, 1, 50, '人民币', '暂停申购')
    const limited = series('limited', 'Limited', '000002', 10, 1, 100, '人民币', '限大额')
    expect(confirmedDailyLimit(paused.defaultShare)).toBeNull()
    expect(dailyLimitDisplay(paused.defaultShare)).toBe('--')
    expect(buyStatusLabel(paused.defaultShare)).toBe('暂停')
    expect(sortFundRows([paused, limited], 'daily_limit', 'asc').map((row) => row.series_id))
      .toEqual(['limited', 'paused'])
  })

  it('does not compare an open share using a stale numeric limit', () => {
    const open = series('open', 'Open', '000001', 10, 1, 100, '人民币', '开放申购')
    const limited = series('limited', 'Limited', '000002', 10, 1, 200, '人民币', '限大额')
    expect(confirmedDailyLimit(open.defaultShare)).toBeNull()
    expect(dailyLimitDisplay(open.defaultShare)).toBe('不限额')
    expect(sortFundRows([open, limited], 'daily_limit', 'asc').map((row) => row.series_id))
      .toEqual(['limited', 'open'])
  })

  it('treats zero as unconfirmed rather than a zero-yuan limit', () => {
    const zero = series('zero', 'Zero', '000001', 10, 1, 0, '人民币', '限大额')
    expect(confirmedDailyLimit(zero.defaultShare)).toBeNull()
    expect(dailyLimitDisplay(zero.defaultShare)).toBe('待核验')
  })

  it('re-sorts normally after a favorite is removed', () => {
    const favorite = series('favorite', 'Favorite', '000001', 30, 1, 300, '人民币', '限大额', 'share', true)
    const smaller = series('small', 'Small', '000002', 10, 1, 10, '人民币', '限大额')
    expect(sortFundRows([favorite, smaller], 'daily_limit', 'asc').map((row) => row.series_id))
      .toEqual(['favorite', 'small'])
    favorite.starred = false
    expect(sortFundRows([favorite, smaller], 'daily_limit', 'asc').map((row) => row.series_id))
      .toEqual(['small', 'favorite'])
  })

  it('keeps existing numeric sorts intact when daily limit is not selected', () => {
    const rows = [
      series('a', 'Apple', '000001', null, 4, 100),
      series('b', 'Bank', '000002', 20, 2, 10),
      series('c', 'Core', '000003', 100, null, 500),
    ]
    expect(sortFundRows(rows, 'series_scale', 'desc').map((row) => row.series_id))
      .toEqual(['c', 'b', 'a'])
    expect(sortFundRows(rows, 'chg_1y', 'asc').map((row) => row.series_id))
      .toEqual(['b', 'a', 'c'])
  })

  it('labels shared, unknown, and open limits explicitly', () => {
    const shared = series('shared', 'Shared', '000001', 10, 1, 100_000, '人民币', '限大额', 'series_shared')
    const unknown = series('unknown', 'Unknown', '000002', 10, 1, 100_000, '人民币', '限大额', 'unknown')
    const open = series('open', 'Open', '000003', 10, 1, null, '人民币', '开放申购')
    expect(dailyLimitDisplay(shared.defaultShare)).toBe('¥10万/日')
    expect(limitScopeShort(shared.defaultShare)).toBe('共享')
    expect(limitScopeShort(unknown.defaultShare)).toBe('待核验')
    expect(dailyLimitDisplay(open.defaultShare)).toBe('不限额')
    expect(buyStatusLabel(shared.defaultShare)).toBe('限大额')
    shared.defaultShare.limit_status = 'active'
    shared.defaultShare.limit_expires_at = '2026-12-31'
    expect(dailyLimitTitle(shared.defaultShare)).toContain('核验有效')
    expect(dailyLimitTitle(shared.defaultShare)).toContain('失效：2026-12-31')
  })

  it('labels shared limits with the actual share classes', () => {
    const shared = series('shared', 'Shared', '019524', 10, 1, 5, '人民币', '限大额', 'series_shared')
    shared.defaultShare.limit_group_id = 'group-aci'
    shared.shares = [
      { ...shared.defaultShare, share_class: 'A', code: '019524' },
      { ...shared.defaultShare, share_class: 'C', code: '019525' },
      { ...shared.defaultShare, share_class: 'I', code: '022664' },
    ]
    expect(limitScopeShort(shared.defaultShare, shared.shares)).toBe('A/C/I 共用')
  })

  it('uses daily-limit ordering for purchase-status sorting', () => {
    const rows = [
      series('a', 'Apple', '000001', 20, 4, 100),
      series('b', 'Bank', '000002', 100, 2, 10),
    ]
    expect(sortFundRows(rows, 'buy_status', 'asc').map((row) => row.series_id))
      .toEqual(['b', 'a'])
  })
})
