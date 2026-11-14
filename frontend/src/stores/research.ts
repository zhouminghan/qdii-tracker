import { ref } from 'vue'
import { defineStore } from 'pinia'
import { db, ensureLegacyMigration } from '@/shared/infrastructure/local-db'
import type { NoteRevision, ResearchNote, StrategyLog, WatchItem } from '@/types/local'

function id(): string {
  return crypto.randomUUID()
}

export const useResearchStore = defineStore('research', () => {
  const notes = ref<ResearchNote[]>([])
  const watchlist = ref<WatchItem[]>([])
  const strategyLogs = ref<StrategyLog[]>([])
  const noteHistory = ref<NoteRevision[]>([])
  const loading = ref(false)
  const error = ref('')

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      await ensureLegacyMigration()
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
    const existing = input.id ? await db.notes.get(input.id) : null
    const changed = existing && (
      existing.title !== input.title.trim()
      || existing.body !== input.body.trim()
      || existing.fundCode !== (input.fundCode?.trim() ?? '')
      || existing.tags.join('\n') !== (input.tags ?? []).join('\n')
    )
    if (existing && changed) {
      await db.noteHistory.add({
        noteId: existing.id,
        title: existing.title,
        body: existing.body,
        fundCode: existing.fundCode,
        tags: existing.tags,
        createdAt: now,
      })
    }
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

  async function loadNoteHistory(noteId: string): Promise<void> {
    noteHistory.value = await db.noteHistory.where('noteId').equals(noteId).reverse().sortBy('createdAt')
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
    noteHistory,
    loading,
    error,
    load,
    loadNoteHistory,
    saveNote,
    deleteNote,
    saveWatchItem,
    deleteWatchItem,
    saveStrategy,
    deleteStrategy,
  }
})
