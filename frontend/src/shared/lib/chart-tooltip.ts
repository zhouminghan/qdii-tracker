type TooltipParam = {
  dataIndex?: number
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function toneClass(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value === 0) return ''
  return value > 0 ? 'is-up' : 'is-down'
}

export function lineTooltipFormatter(
  dates: string[],
  values: number[],
  valueFormatter: (value: number) => string,
  valueLabel: string,
) {
  return (params: unknown): string => {
    const entries = (Array.isArray(params) ? params : [params]) as TooltipParam[]
    const index = entries[0]?.dataIndex ?? 0
    const value = values[index]
    if (!Number.isFinite(value)) return ''

    const previous = values[index - 1]
    const daily = Number.isFinite(previous) && previous !== 0 ? (value / previous - 1) * 100 : null
    const first = values.find((candidate) => Number.isFinite(candidate) && candidate > 0)
    const range = first && Number.isFinite(first) && first !== 0 ? (value / first - 1) * 100 : null

    return `
      <div class="chart-tooltip">
        <div class="chart-tooltip-date">${dates[index] ?? '--'}</div>
        <div class="chart-tooltip-row">
          <span>${valueLabel}</span>
          <strong>${valueFormatter(value)}</strong>
        </div>
        <div class="chart-tooltip-row">
          <span>日涨幅</span>
          <strong class="${toneClass(daily)}">${formatPercent(daily)}</strong>
        </div>
        <div class="chart-tooltip-row">
          <span>区间涨幅</span>
          <strong class="${toneClass(range)}">${formatPercent(range)}</strong>
        </div>
      </div>
    `
  }
}
