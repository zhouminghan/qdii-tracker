import { beforeEach, describe, expect, it } from 'vitest'
import { db, ensureLegacyMigration, importLocalBackup, parseBackup } from '@/shared/infrastructure/local-db'
import type { LocalBackup } from '@/types/local'

beforeEach(async () => {
  localStorage.clear()
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('IndexedDB migration and backup recovery', () => {
  it('migrates the legacy localStorage portfolio once', async () => {
    localStorage.setItem('qdii-portfolio-v1', JSON.stringify({
      version: 1,
      cash: 100,
      positions: [{ code: '270042', shares: 10, avgCost: 6, platform: '支付宝' }],
      activity: [{ date: '2026-11-01', code: '270042', side: 'buy', qty: 2, price: 6, fee: 1, amount: 12 }],
    }))
    await ensureLegacyMigration()
    await ensureLegacyMigration()
    expect(await db.positions.count()).toBe(1)
    expect(await db.trades.count()).toBe(1)
    expect((await db.positions.get('270042'))?.shares).toBe(10)
  })

  it('rolls back the whole replacement when one table write fails', async () => {
    await db.positions.put({
      code: '000001',
      shares: 1,
      avgCost: 1,
      platform: '旧数据',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const invalid = {
      schema_version: 2,
      exported_at: '',
      positions: [],
      trades: [{ date: '', code: '', side: 'buy', qty: 1, price: 1, fee: (() => 1) as unknown as number, amount: 1 }],
      notes: [],
      noteHistory: [],
      watchlist: [],
      strategyLogs: [],
    } as unknown as LocalBackup

    await expect(importLocalBackup(invalid)).rejects.toBeTruthy()
    expect(await db.positions.get('000001')).toBeTruthy()
  })

  it('rejects backup arrays before starting a transaction', () => {
    expect(() => parseBackup(JSON.stringify({
      schema_version: 2,
      exported_at: '',
      positions: null,
      trades: [],
      notes: [],
      watchlist: [],
      strategyLogs: [],
    }))).toThrow('positions')
  })
})
