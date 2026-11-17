export type FundCategory =
  | 'sp500'
  | 'nasdaq_passive'
  | 'active'
  | 'global_index'
  | 'global_other'
  | 'etf'

export type FundTab = 'offshore' | 'etf'

export interface FundRule {
  condition: string
  rate: number
}

export interface BuyStatusHistory {
  date: string
  buy_status: string
  daily_limit: number | null
}

export interface FundShare {
  code: string
  name: string
  channel_type: string
  share_class: string
  currency: string
  isin: string
  ticker: string
  official_url: string
  nav?: number | null
  nav_cum?: number | null
  nav_date?: string | null
  daily_change?: number | null
  chg_1w?: number | null
  chg_1m?: number | null
  chg_3m?: number | null
  chg_6m?: number | null
  chg_ytd?: number | null
  chg_1y?: number | null
  chg_2y?: number | null
  chg_3y?: number | null
  chg_since_inception?: number | null
  scale?: number | null
  scale_raw?: string | null
  established?: string | null
  manager?: string | null
  buy_status?: string | null
  daily_limit?: number | null
  limit_scope?: 'share' | 'series_shared' | 'unknown' | null
  limit_group_id?: string | null
  limit_currency?: string | null
  limit_source?: string | null
  limit_source_url?: string | null
  limit_effective_date?: string | null
  limit_expires_at?: string | null
  limit_verified_at?: string | null
  limit_confidence?: 'official' | 'verified' | 'unverified' | null
  limit_status?: 'active' | 'expired' | 'unverified' | 'unknown' | null
  buy_status_history?: BuyStatusHistory[]
  buy_rules?: FundRule[]
  sell_rules?: FundRule[]
  mgmt_fee?: number | null
  custody_fee?: number | null
  sale_service_fee?: number | null
  first_buy_rate?: number | null
  free_hold_days?: number | null
  etf_price?: number | null
  etf_change_pct?: number | null
  etf_premium?: number | null
}

export interface FundSeries {
  series_id: string
  display_name: string
  company: string
  default_share_code: string
  series_scale?: number | null
  etf_target?: string | null
  shares: FundShare[]
}

export interface CatalogCategory {
  label: string
  count: number
  share_count: number
  series: FundSeries[]
}

export interface CompanyBrand {
  color: string
  letter: string
}

export interface CatalogEnvelope {
  schema_version: number
  generated_at: string
  source: string
  status: 'ok' | 'degraded' | 'error'
  data: {
    categories: Record<FundCategory, CatalogCategory>
    summary: {
      series_count: number
      share_count: number
      category_count: number
      newest_nav_date: string | null
    }
    company_brands: Record<string, CompanyBrand>
  }
  quality: {
    status: 'ok' | 'degraded' | 'error'
    checked_at: string
    missing_nav: number
    expected_no_nav: number
    stale_nav: number
    warnings: string[]
    errors: string[]
  }
}

export interface SouthboundShare {
  code: string
  bank_code: string | null
  bank_name: string | null
  bank_code_status: string | null
  share_class: string
  currency: string
  currency_code: 'HKD' | 'RMB' | 'USD' | 'JPY'
  isin: string | null
  ticker: string | null
  nav: number | null
  nav_date: string | null
  one_year_return_pct: number | null
  return_as_of: string | null
  inception_date: string | null
  management_fee_pct: number | null
  subscription_fee: string | null
}

export interface SouthboundSource {
  label: string
  url: string
  scope: string
}

export interface SouthboundProduct {
  id: string
  name: string
  aliases: string[]
  index_name: string
  channel_type: string
  official_url: string | null
  verified_at: string
  sources: SouthboundSource[]
  channels: string[]
  personal_quota_cny: number
  quota_note: string
  status: string
  advantages: string[]
  risks: string[]
  shares: SouthboundShare[]
}

export interface SouthboundData {
  schema_version: number
  generated_at: string
  source: string
  disclaimer: string
  coverage_note: string
  coverage_source_url: string
  products: SouthboundProduct[]
}

export interface MarketQuote {
  price: number | null
  change: number | null
  change_pct: number | null
  as_of: string | null
  source?: string
  source_updated_at?: string | null
  derived?: boolean
}

export interface MarketSnapshot {
  schema_version: number
  generated_at: string
  source: string
  market_indices: { as_of: string; items: Record<string, MarketQuote> }
  big_tech: { as_of: string; items: Record<string, MarketQuote> }
  fx: { as_of: string; items: Record<string, MarketQuote> }
  gold: {
    as_of: string
    au9999: MarketQuote
    comex?: MarketQuote
    xau: MarketQuote
    usdcnh: MarketQuote
    converted_cny_per_gram: { value: number | null; as_of?: string | null; source?: string | null; derived?: boolean }
    premium_cny: { value: number | null; as_of?: string | null; source?: string | null; derived?: boolean }
    premium_pct: { value: number | null; as_of?: string | null; source?: string | null; derived?: boolean }
  }
  brand_gold: {
    generated_at: string
    as_of: string
    brands: Array<{
      brand: string
      ornament: number | null
      investment_bar: number | null
      as_of: string | null
    }>
  }
  macro: {
    vix: { value: number | null; as_of: string | null }
    dxy: { value: number | null; as_of: string | null }
    treasury_2y: { value: number | null; as_of: string | null }
    treasury_10y: { value: number | null; as_of: string | null }
    treasury_30y: { value: number | null; as_of: string | null }
    ndx_pe: {
      value: number | null
      as_of: string | null
      index?: string
      pe_type?: 'TTM' | 'Forward'
      frequency?: string
      observation_period?: 'month_end' | 'daily' | string
    }
  }
  temperature: {
    score: number
    band: 'green' | 'yellow' | 'red'
    verdict: string
    summary: string
    weights?: Record<string, number>
    coverage?: { fresh: number; total: number; degraded: boolean }
    positives: string[]
    risks: string[]
    indicators: Record<
      string,
      {
        score: number
        label: string
        note: string
        stale: boolean
      }
    >
  }
}

export interface NasdaqHistory {
  schema_version: number
  generated_at: string
  source: string
  as_of?: string | null
  drawdown_basis?: 'daily_close' | 'monthly_close'
  range: { first_year: number; last_year: number }
  summary: { best_month: number; worst_month: number; text: string }
  annual: Array<{
    year: number
    close: number
    return_pct: number
    max_drawdown_pct: number
    max_drawdown_basis?: 'daily_close' | 'monthly_close'
    peak_month: number
    trough_month: number
    is_ytd?: boolean
  }>
  heatmap: { years: number[]; rows: number[][]; partial_year?: number | null }
  ranking: Record<string, Array<{ month: number; avg_pct: number; positive_ratio: number; n: number }>>
  drawdown_histogram?: Array<{ month: number; count: number }>
  index?: { symbol: string; name: string; currency: string } | string
  disclaimer?: string
}

export interface FearGreedData {
  schema_version: number
  generated_at: string
  source: string
  score: number
  previous?: number
  label: string
  rating?: string
  band: string
  history: Array<{ date: string; score: number }>
  disclaimer?: string
}

export interface KlineData {
  code: string
  dates: string[]
  close: number[]
  open?: number[]
  high?: number[]
  low?: number[]
  navs?: number[]
  updated_at: string
}

export interface HoldingItem {
  rank: number
  stock_code: string
  stock_name: string
  weight: number
  shares?: number
  market_value?: number
}

export interface HoldingsData {
  code: string
  latest_quarter: string
  holdings_count: number
  total_weight: number
  holdings: HoldingItem[]
  heavy_count?: number
  fetched_at?: string
  all_quarters?: Record<string, HoldingItem[]>
}
