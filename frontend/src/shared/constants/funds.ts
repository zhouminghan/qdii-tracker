import type { FundCategory } from '@/types/data'

export const OFFSHORE_CATEGORIES: Array<{
  key: FundCategory
  label: string
  shortLabel: string
}> = [
  { key: 'sp500', label: '标普500 指数基金', shortLabel: '标普500' },
  { key: 'nasdaq_passive', label: '纳指100 指数基金', shortLabel: '纳指100' },
  { key: 'active', label: '美股主动基金', shortLabel: '主动基金' },
  { key: 'global_index', label: '全球指数基金', shortLabel: '全球指数' },
  { key: 'global_other', label: '全球 / 其他 QDII', shortLabel: '全球其他' },
]

export const ETF_GROUPS = [
  { key: 'sp500', label: '标普500 ETF' },
  { key: 'nasdaq100', label: '纳斯达克 ETF' },
  { key: 'global_other', label: '全球 / 其他 ETF' },
] as const

export const MARKET_INDEX_LABELS: Record<string, string> = {
  '100.DJIA': '道琼斯',
  '100.SPX': '标普500',
  '100.NDX': '纳指综合',
  '100.NDX100': '纳斯达克100',
  '251.SOX': '费城半导体',
  sh000001: '上证指数',
  sh000300: '沪深300',
  sh000688: '科创50',
  '100.HSI': '恒生指数',
  '124.HSTECH': '恒生科技',
  '100.N225': '日经225',
  '100.KS11': '韩国综合',
  au9999: '上海金',
}

export const TECH_LABELS: Record<string, string> = {
  usAAPL: 'Apple',
  usMSFT: 'Microsoft',
  usNVDA: 'NVIDIA',
  usGOOG: 'Alphabet',
  usAMZN: 'Amazon',
  usMETA: 'Meta',
  usTSLA: 'Tesla',
}
