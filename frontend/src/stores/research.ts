import { ref } from 'vue'
import { defineStore } from 'pinia'
import { db, ensureLegacyMigration } from '@/shared/infrastructure/local-db'
import { DEFAULT_RESEARCH_NOTES } from '@/features/research/default-notes'
import type { ResearchNote, StrategyLog, WatchItem } from '@/types/local'

const SEEDED_NOTES_KEY = 'qdii-default-notes-seeded-v10'
const LEGACY_SOUTHBOUND_UPDATED_AT = new Set([
  '2026-11-15T15:30:00+08:00',
  '2026-11-15T16:45:00+08:00',
  '2026-11-15T16:55:00+08:00',
  '2026-11-15T17:05:00+08:00',
  '2026-11-15T20:00:00+08:00',
  '2026-11-15T19:20:00+08:00',
  '2026-11-15T21:45:00+08:00',
])

async function seedDefaultNotes(): Promise<void> {
  try {
    if (localStorage.getItem(SEEDED_NOTES_KEY)) return
    await db.transaction('rw', db.notes, async () => {
      for (const note of DEFAULT_RESEARCH_NOTES) {
        const existing = await db.notes.get(note.id)
        const hasLegacyPendingSection = existing?.body.includes('## 待核验') ?? false
        if (!existing || LEGACY_SOUTHBOUND_UPDATED_AT.has(existing.updatedAt) || hasLegacyPendingSection) {
          await db.notes.put(note)
        }
      }
    })
    localStorage.setItem(SEEDED_NOTES_KEY, '1')
  } catch {
    // Seeding is best effort; existing local notes must remain usable.
  }
}

function id(): string {
  return crypto.randomUUID()
}

export const useResearchStore = defineStore('research', () => {
  const notes = ref<ResearchNote[]>([])
  const watchlist = ref<WatchItem[]>([])
  const strategyLogs = ref<StrategyLog[]>([])
  const loading = ref(false)
  const error = ref('')

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      await ensureLegacyMigration()
      await seedDefaultNotes()
      const [noteRows, watchRows, strategyRows] = await Promise.all([
        db.notes.orderBy('updatedAt').reverse().toArray(),
        db.watchlist.orderBy('updatedAt').reverse().toArray(),
        db.strategyLogs.orderBy('updatedAt').reverse().toArray(),
      ])
      notes.value = noteRows
      watchlist.value = watchRows
      strategyLogs.value = strategyRows
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '研究数据读取失败'
    } finally {
      loading.value = false
    }
  }

  async function saveNote(input: Partial<ResearchNote> & { title: string; body: string }): Promise<void> {
    const now = new Date().toISOString()
    const note: ResearchNote = {
      id: input.id ?? id(),
      title: input.title.trim(),
      body: input.body.trim(),
      fundCode: input.fundCode?.trim() ?? '',
      tags: input.tags ?? [],
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    }
    if (!note.title) throw new Error('笔记标题不能为空')
    await db.notes.put(note)
    await load()
  }

  async function deleteNote(noteId: string): Promise<void> {
    await db.notes.delete(noteId)
    await load()
  }

  async function saveWatchItem(input: Partial<WatchItem> & { code: string; thesis: string }): Promise<void> {
    const now = new Date().toISOString()
    const item: WatchItem = {
      id: input.id ?? id(),
      code: input.code.trim(),
      thesis: input.thesis.trim(),
      targetPrice: input.targetPrice ?? null,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    }
    if (!item.code) throw new Error('观察标的代码不能为空')
    await db.watchlist.put(item)
    await load()
  }

  async function deleteWatchItem(itemId: string): Promise<void> {
    await db.watchlist.delete(itemId)
    await load()
  }

  async function saveStrategy(input: Partial<StrategyLog> & {
    title: string
    thesis: string
    action: string
    result: string
  }): Promise<void> {
    const now = new Date().toISOString()
    const item: StrategyLog = {
      id: input.id ?? id(),
      title: input.title.trim(),
      thesis: input.thesis.trim(),
      action: input.action.trim(),
      result: input.result.trim(),
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    }
    if (!item.title) throw new Error('策略标题不能为空')
    await db.strategyLogs.put(item)
    await load()
  }

  async function deleteStrategy(itemId: string): Promise<void> {
    await db.strategyLogs.delete(itemId)
    await load()
  }

  return {
    notes,
    watchlist,
    strategyLogs,
    loading,
    error,
    load,
    saveNote,
    deleteNote,
    saveWatchItem,
    deleteWatchItem,
    saveStrategy,
    deleteStrategy,
  }
})
