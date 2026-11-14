import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db, ensureLegacyMigration } from '@/shared/infrastructure/local-db'
import type { Position, Trade } from '@/types/local'
import { useDataStore } from './data'

export interface PortfolioRow {
  position: Position
  name: string
  price: number | null
  cost: number
  value: number | null
  pnl: number | null
  pnlPercent: number | null
  isEtf: boolean
}

export const usePortfolioStore = defineStore('portfolio', () => {
  const data = useDataStore()
  const positions = ref<Position[]>([])
  const trades = ref<Trade[]>([])
  const loading = ref(false)
  const error = ref('')

  const rows = computed<PortfolioRow[]>(() => positions.value.map((position) => {
    const fund = data.fundByCode.get(position.code)
    const share = fund?.share
    const isEtf = fund?.row.category === 'etf'
    const price = share ? (isEtf ? share.etf_price ?? share.nav ?? null : share.nav ?? null) : null
    const cost = position.shares * position.avgCost
    const value = price === null ? null : position.shares * price
    const pnl = value === null ? null : value - cost
    return {
      position,
      name: share ? (isEtf ? share.name : fund?.row.display_name ?? share.name) : position.code,
      price,
      cost,
      value,
      pnl,
      pnlPercent: cost > 0 && pnl !== null ? pnl / cost * 100 : null,
      isEtf,
    }
  }))

  const cost = computed(() => rows.value.reduce((sum, row) => sum + row.cost, 0))
  const value = computed(() => rows.value.reduce((sum, row) => sum + (row.value ?? row.cost), 0))
  const pnl = computed(() => rows.value.reduce((sum, row) => sum + (row.pnl ?? 0), 0))
  const pnlPercent = computed(() => cost.value > 0 ? pnl.value / cost.value * 100 : null)

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      await ensureLegacyMigration()
      const [positionRows, tradeRows] = await Promise.all([
        db.positions.orderBy('updatedAt').reverse().toArray(),
        db.trades.orderBy('date').reverse().toArray(),
      ])
      positions.value = positionRows
      trades.value = tradeRows
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '本地资产读取失败'
    } finally {
      loading.value = false
    }
  }

  async function savePosition(input: {
    code: string
    principal: number
    total: number
    platform: string
  }): Promise<void> {
    const fund = data.fundByCode.get(input.code)
    if (!fund) throw new Error('基金代码未收录')
    const isEtf = fund.row.category === 'etf'
    const price = isEtf ? fund.share.etf_price ?? fund.share.nav : fund.share.nav
    if (!price || price <= 0) throw new Error('当前净值不可用')
    if (!(input.total > 0) || input.principal < 0) throw new Error('金额必须有效')
    const shares = input.total / price
    const position: Position = {
      code: input.code,
      shares,
      avgCost: input.principal / shares,
      platform: input.platform,
      updatedAt: new Date().toISOString(),
    }
    await db.positions.put(position)
    await load()
  }

  async function removePosition(code: string): Promise<void> {
    await db.positions.delete(code)
    await load()
  }

  async function recordTrade(input: {
    code: string
    side: 'buy' | 'sell'
    amount: number
    price?: number
    fee?: number
    date: string
  }): Promise<void> {
    const fund = data.fundByCode.get(input.code)
    if (!fund) throw new Error('基金代码未收录')
    const isEtf = fund.row.category === 'etf'
    const price = input.price && input.price > 0
      ? input.price
      : isEtf ? fund.share.etf_price ?? fund.share.nav : fund.share.nav
    if (!price || price <= 0) throw new Error('成交价格不可用')
    if (!(input.amount > 0)) throw new Error('交易金额必须大于 0')
    const fee = input.fee ?? 0
    const qty = input.amount / price
    const existing = await db.positions.get(input.code)

    await db.transaction('rw', db.positions, db.trades, async () => {
      if (input.side === 'buy') {
        if (existing) {
          const currentCost = existing.shares * existing.avgCost
          const nextShares = existing.shares + qty
          await db.positions.put({
            ...existing,
            shares: nextShares,
            avgCost: (currentCost + input.amount + fee) / nextShares,
            updatedAt: new Date().toISOString(),
          })
        } else {
          await db.positions.put({
            code: input.code,
            shares: qty,
            avgCost: (input.amount + fee) / qty,
            platform: '',
            updatedAt: new Date().toISOString(),
          })
        }
      } else {
        if (!existing) throw new Error('没有该基金持仓')
        const soldQty = Math.min(qty, existing.shares)
        const nextShares = existing.shares - soldQty
        if (nextShares <= 1e-9) await db.positions.delete(input.code)
        else await db.positions.put({ ...existing, shares: nextShares, updatedAt: new Date().toISOString() })
      }
      await db.trades.add({
        date: input.date,
        code: input.code,
        side: input.side,
        qty,
        price,
        fee,
        amount: input.amount,
      })
    })
    await load()
  }

  async function updateTrade(trade: Trade): Promise<void> {
    if (!trade.id) throw new Error('交易记录缺少 ID')
    await db.trades.put(trade)
    await load()
  }

  async function deleteTrade(id: number): Promise<void> {
    await db.trades.delete(id)
    await load()
  }

  async function refresh(): Promise<void> {
    await load()
  }

  return {
    positions,
    trades,
    rows,
    cost,
    value,
    pnl,
    pnlPercent,
    loading,
    error,
    load,
    savePosition,
    removePosition,
    recordTrade,
    updateTrade,
    deleteTrade,
    refresh,
  }
})
