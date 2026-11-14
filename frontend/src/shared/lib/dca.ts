import { asNumber } from './format'

export interface DcaBand {
  key: string
  lo: number
  hi: number
  label: string
  action: string
  strategy: string
  vixLo: number | null
  vixHi: number | null
  vixText: string
  tone: 'green' | 'amber' | 'red'
}

export const DCA_BANDS: DcaBand[] = [
  { key: 'extreme_fear', lo: 0, hi: 25, label: '极度恐慌', action: '黄金坑策略', strategy: '大胆加仓 / 倍定投', vixLo: 30, vixHi: null, vixText: 'VIX > 30', tone: 'green' },
  { key: 'fear', lo: 25, hi: 45, label: '恐惧', action: '低位定投', strategy: '正常定投 / 小幅加仓', vixLo: 25, vixHi: 30, vixText: 'VIX 25-30', tone: 'green' },
  { key: 'neutral', lo: 45, hi: 55, label: '中性', action: '常态定投', strategy: '维持规律定投', vixLo: 15, vixHi: 25, vixText: 'VIX 15-25', tone: 'amber' },
  { key: 'greed', lo: 55, hi: 75, label: '贪婪', action: '风险预警', strategy: '停止加仓，保持观望', vixLo: 12, vixHi: 20, vixText: 'VIX 12-20', tone: 'amber' },
  { key: 'extreme_greed', lo: 75, hi: 100, label: '极度贪婪', action: '泡沫高危', strategy: '卖出 / 买入对冲', vixLo: null, vixHi: 15, vixText: 'VIX < 15', tone: 'red' },
]

export function peLabel(pe: unknown): string {
  const value = asNumber(pe)
  if (value === null) return '暂无 PE 数据'
  if (value >= 35) return '估值偏高，注意回撤风险'
  if (value >= 25) return '估值中性，控制节奏'
  return '估值偏低，长期赔率改善'
}

export function bandOf(fearGreed: unknown): DcaBand {
  const raw = asNumber(fearGreed) ?? 50
  const value = Math.max(0, Math.min(100, raw))
  return DCA_BANDS.find((band, index) => value >= band.lo && (index === DCA_BANDS.length - 1 || value < band.hi))
    ?? DCA_BANDS[DCA_BANDS.length - 1]
}

export function strategyOf(fearGreed: unknown, vix: unknown, pe: unknown): {
  band: DcaBand
  matched: boolean
  note: string
  peLabel: string
} {
  const band = bandOf(fearGreed)
  const vixValue = asNumber(vix)
  let matched = true
  let note = ''
  if (vixValue === null) {
    matched = false
    note = '暂无 VIX 数据。'
  } else if (band.vixLo !== null && vixValue < band.vixLo) {
    matched = false
    note = `VIX ${vixValue.toFixed(1)} 低于该阶梯的 ${band.vixText}，恐慌情绪偏弱。`
  } else if (band.vixHi !== null && vixValue > band.vixHi) {
    matched = false
    note = `VIX ${vixValue.toFixed(1)} 高于该阶梯的 ${band.vixText}，波动风险偏高。`
  }
  return { band, matched, note, peLabel: peLabel(pe) }
}
