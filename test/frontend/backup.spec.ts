import { describe, expect, it } from 'vitest'
import { parseBackup } from '@/shared/infrastructure/local-db'

describe('local backup validation', () => {
  it('rejects malformed JSON before touching the database', () => {
    expect(() => parseBackup('{broken')).toThrow('备份不是有效 JSON')
  })

  it('rejects unsupported schema versions', () => {
    expect(() => parseBackup(JSON.stringify({ schema_version: 99 }))).toThrow('schema_version')
  })

  it('accepts a complete empty v2 backup', () => {
    const parsed = parseBackup(JSON.stringify({
      schema_version: 2,
      exported_at: '2026-11-14T00:00:00.000Z',
      positions: [],
      trades: [],
      notes: [],
      noteHistory: [],
      watchlist: [],
      strategyLogs: [],
    }))
    expect(parsed.schema_version).toBe(2)
    expect(parsed.positions).toEqual([])
  })

  it('upgrades a v1 backup without losing its content', () => {
    const parsed = parseBackup(JSON.stringify({
      schema_version: 1,
      exported_at: '2026-11-14T00:00:00.000Z',
      positions: [],
      trades: [],
      notes: [],
      watchlist: [],
      strategyLogs: [],
    }))
    expect(parsed.schema_version).toBe(2)
    expect(parsed.noteHistory).toEqual([])
  })

  it('rejects structurally incomplete positions', () => {
    expect(() => parseBackup(JSON.stringify({
      schema_version: 2,
      exported_at: '',
      positions: [{ code: '270042' }],
      trades: [],
      notes: [],
      noteHistory: [],
      watchlist: [],
      strategyLogs: [],
    }))).toThrow('positions')
  })
})
