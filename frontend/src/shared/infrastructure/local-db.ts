import Dexie, { type Table } from 'dexie'
import type {
  LocalBackup,
  MetaRecord,
  NoteRevision,
  Position,
  ResearchNote,
  StrategyLog,
  Trade,
  WatchItem,
} from '@/types/local'

class TrackerDatabase extends Dexie {
  positions!: Table<Position, string>
  trades!: Table<Trade, number>
  notes!: Table<ResearchNote, string>
  watchlist!: Table<WatchItem, string>
  strategyLogs!: Table<StrategyLog, string>
  noteHistory!: Table<NoteRevision, number>
  meta!: Table<MetaRecord, string>

  constructor() {
    super('qdii-tracker')
    this.version(1).stores({
      positions: 'code, updatedAt',
      trades: '++id, date, code, side',
      notes: 'id, fundCode, updatedAt, *tags',
      watchlist: 'id, code, updatedAt',
      strategyLogs: 'id, updatedAt',
      meta: 'key',
    })
    this.version(2).stores({
      noteHistory: '++id, noteId, createdAt',
    })
  }
}

export const db = new TrackerDatabase()
const LEGACY_KEY = 'qdii-portfolio-v1'
const MIGRATION_KEY = 'legacy-portfolio-migrated'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export async function ensureLegacyMigration(): Promise<void> {
  const marker = await db.meta.get(MIGRATION_KEY)
  if (marker) return
  let legacy: Record<string, unknown> | null = null
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    legacy = raw ? JSON.parse(raw) as Record<string, unknown> : null
  } catch {
    legacy = null
  }

  await db.transaction('rw', db.positions, db.trades, db.meta, async () => {
    if (legacy && Array.isArray(legacy.positions)) {
      const now = new Date().toISOString()
      const positions = legacy.positions
        .filter(isRecord)
        .map((item) => ({
          code: String(item.code ?? ''),
          shares: finiteNumber(item.shares),
          avgCost: finiteNumber(item.avgCost),
          platform: String(item.platform ?? ''),
          updatedAt: now,
        }))
        .filter((item) => item.code && item.shares > 0)
      if (positions.length) await db.positions.bulkPut(positions)

      if (Array.isArray(legacy.activity)) {
        const trades: Trade[] = legacy.activity.filter(isRecord).map((item) => ({
          date: String(item.date ?? ''),
          code: String(item.code ?? ''),
          side: item.side === 'sell' ? 'sell' : 'buy',
          qty: finiteNumber(item.qty),
          price: finiteNumber(item.price),
          fee: finiteNumber(item.fee),
          amount: finiteNumber(item.amount),
        })).filter((item) => item.code && item.qty > 0)
        if (trades.length) await db.trades.bulkAdd(trades)
      }
    }
    await db.meta.put({ key: MIGRATION_KEY, value: { migratedAt: new Date().toISOString() } })
  })
}

export async function exportLocalBackup(): Promise<LocalBackup> {
  await ensureLegacyMigration()
  const [positions, trades, notes, noteHistory, watchlist, strategyLogs] = await Promise.all([
    db.positions.toArray(),
    db.trades.toArray(),
    db.notes.toArray(),
    db.noteHistory.toArray(),
    db.watchlist.toArray(),
    db.strategyLogs.toArray(),
  ])
  return {
    schema_version: 2,
    exported_at: new Date().toISOString(),
    positions,
    trades,
    notes,
    noteHistory,
    watchlist,
    strategyLogs,
  }
}

function validateArray<T>(
  value: unknown,
  name: string,
  validator: (item: unknown) => item is T,
): T[] {
  if (!Array.isArray(value)) throw new Error(`${name} 必须是数组`)
  if (!value.every(validator)) throw new Error(`${name} 中存在字段不完整的记录`)
  return value
}

function validatePosition(value: unknown): value is Position {
  return isRecord(value)
    && typeof value.code === 'string'
    && typeof value.shares === 'number'
    && typeof value.avgCost === 'number'
    && typeof value.platform === 'string'
}

function validateTrade(value: unknown): value is Trade {
  return isRecord(value)
    && typeof value.date === 'string'
    && typeof value.code === 'string'
    && (value.side === 'buy' || value.side === 'sell')
    && typeof value.qty === 'number'
    && typeof value.price === 'number'
    && typeof value.fee === 'number'
    && typeof value.amount === 'number'
}

function validateNote(value: unknown): value is ResearchNote {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.body === 'string'
    && typeof value.fundCode === 'string'
    && Array.isArray(value.tags)
    && typeof value.updatedAt === 'string'
}

function validateNoteRevision(value: unknown): value is NoteRevision {
  return isRecord(value)
    && typeof value.noteId === 'string'
    && typeof value.title === 'string'
    && typeof value.body === 'string'
    && typeof value.fundCode === 'string'
    && Array.isArray(value.tags)
    && typeof value.createdAt === 'string'
}

function validateWatchItem(value: unknown): value is WatchItem {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.code === 'string'
    && typeof value.thesis === 'string'
    && typeof value.updatedAt === 'string'
}

function validateStrategyLog(value: unknown): value is StrategyLog {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.thesis === 'string'
    && typeof value.action === 'string'
    && typeof value.result === 'string'
    && typeof value.updatedAt === 'string'
}

export function parseBackup(raw: string): LocalBackup {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('备份不是有效 JSON')
  }
  if (!isRecord(value) || (value.schema_version !== 1 && value.schema_version !== 2)) {
    throw new Error('备份 schema_version 不受支持')
  }
  const schemaVersion = value.schema_version
  return {
    schema_version: 2,
    exported_at: String(value.exported_at ?? ''),
    positions: validateArray(value.positions, 'positions', validatePosition),
    trades: validateArray(value.trades, 'trades', validateTrade),
    notes: validateArray(value.notes, 'notes', validateNote),
    noteHistory: schemaVersion === 2
      ? validateArray(value.noteHistory, 'noteHistory', validateNoteRevision)
      : [],
    watchlist: validateArray(value.watchlist, 'watchlist', validateWatchItem),
    strategyLogs: validateArray(value.strategyLogs, 'strategyLogs', validateStrategyLog),
  }
}

export async function importLocalBackup(backup: LocalBackup): Promise<void> {
  // Validation has already finished before this transaction starts. Any error
  // rolls back all clears and inserts together.
  await db.transaction(
    'rw',
    [db.positions, db.trades, db.notes, db.noteHistory, db.watchlist, db.strategyLogs],
    async () => {
      await Promise.all([
        db.positions.clear(),
        db.trades.clear(),
        db.notes.clear(),
        db.noteHistory.clear(),
        db.watchlist.clear(),
        db.strategyLogs.clear(),
      ])
      await Promise.all([
        db.positions.bulkPut(backup.positions),
        db.trades.bulkPut(backup.trades),
        db.notes.bulkPut(backup.notes),
        db.noteHistory.bulkPut(backup.noteHistory),
        db.watchlist.bulkPut(backup.watchlist),
        db.strategyLogs.bulkPut(backup.strategyLogs),
      ])
    },
  )
}

export async function clearLocalData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.positions, db.trades, db.notes, db.noteHistory, db.watchlist, db.strategyLogs],
    async () => {
      await Promise.all([
        db.positions.clear(),
        db.trades.clear(),
        db.notes.clear(),
        db.noteHistory.clear(),
        db.watchlist.clear(),
        db.strategyLogs.clear(),
      ])
    },
  )
}
