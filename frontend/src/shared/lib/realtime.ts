export interface TencentQuote {
  price: number
  changePct: number | null
  nav: number | null
  premium: number | null
}

export const TENCENT_INDEX_SYMBOLS: Record<string, string> = {
  usDJI: '100.DJIA',
  usINX: '100.SPX',
  usIXIC: '100.NDX',
  usNDX: '100.NDX100',
  sh000001: 'sh000001',
  sh000300: 'sh000300',
  sh000688: 'sh000688',
}

export function tencentEtfSymbol(code: string): string {
  return /^[56]/.test(code) ? `sh${code}` : `sz${code}`
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
  }
}
