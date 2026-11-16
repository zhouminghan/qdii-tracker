import { asNumber } from './format'

// 货币对名称使用明确映射，避免通过字符串替换动态拼接。
export const FX_LABELS: Record<string, string> = {
  fxUSDCNY: 'USD / CNY',
  fxUSDJPY: 'USD / JPY',
  fxCNYHKD: 'CNY / HKD',
  fxUSDHKD: 'USD / HKD',
  fxCNYJPY: 'CNY / JPY',
  fxHKDCNY: 'HKD / CNY',
}

export function fxLabel(key: string): string {
  const mapped = FX_LABELS[key]
  if (mapped) return mapped
  const stripped = key.replace(/^fx/, '')
  return stripped.length === 6
    ? `${stripped.slice(0, 3)} / ${stripped.slice(3)}`
    : stripped
}

export interface MarketBreadth {
  up: number
  down: number
  flat: number
  sample: number
  average: number | null
}

// 按有效涨跌幅统计市场广度，明确排除缺失/异常值，不把缺失当 0。
export function marketBreadth(values: Array<number | null | undefined>): MarketBreadth {
  const valid = values
    .map((value) => asNumber(value))
    .filter((value): value is number => value !== null)
  if (!valid.length) {
    return { up: 0, down: 0, flat: 0, sample: 0, average: null }
  }
  return {
    up: valid.filter((value) => value > 0).length,
    down: valid.filter((value) => value < 0).length,
    flat: valid.filter((value) => value === 0).length,
    sample: valid.length,
    average: valid.reduce((sum, value) => sum + value, 0) / valid.length,
  }
}
