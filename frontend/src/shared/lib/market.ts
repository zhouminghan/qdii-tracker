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
