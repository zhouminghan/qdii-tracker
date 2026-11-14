import { describe, expect, it } from 'vitest'
import type { FundSeries } from '@/types/data'
import {
  compareMissingLast,
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
      currency: '人民币',
      chg_1y: chg,
    }],
  }
  return {
    ...value,
    category: 'sp500',
    defaultShare: value.shares[0],
    starred: false,
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
})
