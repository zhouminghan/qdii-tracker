export type TimeRange = '1m' | '3m' | '6m' | 'ytd' | '1y' | '2y' | '3y' | '5y' | '10y' | 'all'

export const TIME_RANGES: Array<{ key: TimeRange; label: string; days: number | null }> = [
  { key: '1m', label: '1月', days: 30 },
  { key: '3m', label: '3月', days: 90 },
  { key: '6m', label: '6月', days: 180 },
  { key: 'ytd', label: '今年来', days: null },
  { key: '1y', label: '1年', days: 365 },
  { key: '2y', label: '2年', days: 730 },
  { key: '3y', label: '3年', days: 1095 },
  { key: '5y', label: '5年', days: 1825 },
  { key: '10y', label: '10年', days: 3650 },
  { key: 'all', label: '全部', days: null },
]

export interface FilteredSeries {
  startIndex: number
  dates: string[]
  values: number[]
}

export function filterTimeSeries(dates: string[], values: number[], range: TimeRange): FilteredSeries {
  const count = Math.min(dates.length, values.length)
  if (!count) return { startIndex: 0, dates: [], values: [] }
  const safeDates = dates.slice(0, count)
  const safeValues = values.slice(0, count)
  if (range === 'all') {
    return { startIndex: 0, dates: safeDates, values: safeValues }
  }
  let startIndex = 0
  if (range === 'ytd') {
    const year = safeDates[count - 1]?.slice(0, 4)
    startIndex = safeDates.findIndex((value) => value.slice(0, 4) === year)
  } else {
    const days = TIME_RANGES.find((item) => item.key === range)?.days
    if (days) {
      const latest = Date.parse(`${safeDates[count - 1]}T00:00:00Z`)
      const target = new Date(latest - days * 86_400_000).toISOString().slice(0, 10)
      startIndex = safeDates.findIndex((value) => value >= target)
    }
  }
  if (startIndex < 0) startIndex = 0
  return {
    startIndex,
    dates: safeDates.slice(startIndex),
    values: safeValues.slice(startIndex),
  }
}

export function dailyChange(value: number, previous: number | undefined): number | null {
  if (!Number.isFinite(value) || previous === undefined || !Number.isFinite(previous) || previous <= 0) return null
  return (value / previous - 1) * 100
}
