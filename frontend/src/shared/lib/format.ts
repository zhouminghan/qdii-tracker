export function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function formatNumber(value: unknown, digits = 2): string {
  const number = asNumber(value)
  return number === null ? '--' : number.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatPrice(value: unknown, etf = false): string {
  const number = asNumber(value)
  return number === null ? '--' : number.toFixed(etf ? 3 : 4)
}

export function formatPercent(value: unknown, signed = true): string {
  const number = asNumber(value)
  if (number === null) return '--'
  return `${signed && number > 0 ? '+' : ''}${number.toFixed(2)}%`
}

export function formatCompactMoney(value: unknown): string {
  const number = asNumber(value)
  if (number === null) return '--'
  if (Math.abs(number) >= 100_000_000) return `${(number / 100_000_000).toFixed(2)}亿`
  if (Math.abs(number) >= 10_000) return `${(number / 10_000).toFixed(1)}万`
  return formatNumber(number)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(date)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(date)
}

export function movementClass(value: unknown): string {
  const number = asNumber(value)
  if (number === null || number === 0) return 'is-flat'
  return number > 0 ? 'is-up' : 'is-down'
}

export function formatFee(value: unknown): string {
  const number = asNumber(value)
  if (number === null || number <= 0) return '--'
  return `${parseFloat(number.toFixed(2))}%`
}

export function daysSince(value: string | null | undefined, now = new Date()): number | null {
  if (!value) return null
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00+08:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 86_400_000))
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date())
}
