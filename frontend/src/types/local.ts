export interface Position {
  code: string
  shares: number
  avgCost: number
  platform: string
  updatedAt: string
}

export interface Trade {
  id?: number
  date: string
  code: string
  side: 'buy' | 'sell'
  qty: number
  price: number
  fee: number
  amount: number
  note?: string
}

export interface ResearchNote {
  id: string
  title: string
  body: string
  fundCode: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface WatchItem {
  id: string
  code: string
  thesis: string
  targetPrice: number | null
  createdAt: string
  updatedAt: string
}

export interface StrategyLog {
  id: string
  title: string
  thesis: string
  action: string
  result: string
  createdAt: string
  updatedAt: string
}

export interface NoteRevision {
  id?: number
  noteId: string
  title: string
  body: string
  fundCode: string
  tags: string[]
  createdAt: string
}

export interface MetaRecord {
  key: string
  value: unknown
}

export interface LocalBackup {
  schema_version: 2
  exported_at: string
  positions: Position[]
  trades: Trade[]
  notes: ResearchNote[]
  noteHistory: NoteRevision[]
  watchlist: WatchItem[]
  strategyLogs: StrategyLog[]
}
