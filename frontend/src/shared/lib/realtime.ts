export interface TencentQuote {
  price: number
  changePct: number | null
  nav: number | null
  premium: number | null
  asOf: string | null
  updatedAt: string | null
}

export const TENCENT_INDEX_SYMBOLS: Record<string, string> = {
  usDJI: '100.DJIA',
  usINX: '100.SPX',
  usIXIC: '100.NDX',
  usNDX: '100.NDX100',
  sh000001: 'sh000001',
  sh000300: 'sh000300',
  sh000688: 'sh000688',
  hkHSI: '100.HSI',
  hkHSTECH: '124.HSTECH',
}

export function tencentEtfSymbol(code: string): string {
  return /^[56]/.test(code) ? `sh${code}` : `sz${code}`
}

function parseQuoteDate(raw: string | undefined): string | null {
  if (!raw) return null
  const match = raw.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

function parseQuoteInstant(raw: string | undefined): string | null {
  if (!raw) return null
  const match = raw.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})(?:[ T]?(\d{2}):?(\d{2}):?(\d{2}))?/)
  if (!match) return null
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match
  // Exchange quote times are Beijing time; US close timestamps stay date-correct,
  // and isRecentQuote deliberately treats them as stale.
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`
}

export function parseTencentQuote(raw: unknown): TencentQuote | null {
  if (typeof raw !== 'string' || !raw) return null
  const parts = raw.split('~')
  const price = Number(parts[3])
  if (!Number.isFinite(price) || price <= 0) return null
  const nav = Number(parts[78])
  const changePct = Number(parts[32])
  return {
    price,
    changePct: Number.isFinite(changePct) ? changePct : null,
    nav: Number.isFinite(nav) && nav > 0 ? nav : null,
    premium: Number.isFinite(nav) && nav > 0 ? (price - nav) / nav * 100 : null,
    asOf: parseQuoteDate(parts[30]),
    updatedAt: parseQuoteInstant(parts[30]),
  }
}

// A quote is only "realtime" when its own exchange timestamp is recent.
// Fetch time must never be used as the market timestamp.
export function isRecentQuote(
  quote: { updatedAt: string | null } | null | undefined,
  now = Date.now(),
): boolean {
  if (!quote?.updatedAt) return false
  const time = Date.parse(quote.updatedAt)
  if (Number.isNaN(time)) return false
  const delta = now - time
  return delta >= -60_000 && delta <= 15 * 60_000
}
