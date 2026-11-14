<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  BookOpen,
  ChevronDown,
  CircleAlert,
  Download,
  Eye,
  FileText,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from '@lucide/vue'
import BaseDrawer from '@/shared/components/BaseDrawer.vue'
import DataState from '@/shared/components/DataState.vue'
import MarkdownNote from '@/shared/components/MarkdownNote.vue'
import { KNOWLEDGE_ARTICLES, KNOWLEDGE_CATEGORIES } from '@/features/research/knowledge'
import { downloadJson, downloadText, formatNumber, todayIso } from '@/shared/lib/format'
import { exportLocalBackup, importLocalBackup, parseBackup } from '@/shared/infrastructure/local-db'
import type { ResearchNote, StrategyLog, WatchItem } from '@/types/local'
import { useDataStore } from '@/stores/data'
import { useResearchStore } from '@/stores/research'
import { useUiStore } from '@/stores/ui'

const data = useDataStore()
const research = useResearchStore()
const ui = useUiStore()

const activeView = ref<'knowledge' | 'notes' | 'watchlist' | 'strategies'>('knowledge')
const knowledgeFilter = ref('all')
const noteSearch = ref('')
const editorOpen = ref(false)
const editorType = ref<'note' | 'watch' | 'strategy'>('note')
const formError = ref('')
const saving = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
const historyOpen = ref(false)
const historyNote = ref<ResearchNote | null>(null)
const deleteTarget = ref<{ kind: 'note' | 'watch' | 'strategy'; id: string; title: string } | null>(null)
const deleting = ref(false)

const noteForm = ref({
  id: '',
  title: '',
  body: '',
  fundCode: '',
  tags: '',
})
const watchForm = ref({
  id: '',
  code: '',
  thesis: '',
  targetPrice: '',
})
const strategyForm = ref({
  id: '',
  title: '',
  thesis: '',
  action: '',
  result: '',
})

const filteredArticles = computed(() => knowledgeFilter.value === 'all'
  ? KNOWLEDGE_ARTICLES
  : KNOWLEDGE_ARTICLES.filter((item) => item.category === knowledgeFilter.value))
const filteredNotes = computed(() => {
  const query = noteSearch.value.trim().toLowerCase()
  if (!query) return research.notes
  return research.notes.filter((note) =>
    `${note.title} ${note.body} ${note.fundCode} ${note.tags.join(' ')}`.toLowerCase().includes(query),
  )
})

function fundName(code: string): string {
  return data.fundByCode.get(code)?.share.name ?? code
}

function knowledgeCategoryLabel(key: string): string {
  return KNOWLEDGE_CATEGORIES.find((category) => category.key === key)?.label ?? key
}

function openNote(note?: ResearchNote): void {
  editorType.value = 'note'
  noteForm.value = {
    id: note?.id ?? '',
    title: note?.title ?? '',
    body: note?.body ?? '',
    fundCode: note?.fundCode ?? '',
    tags: note?.tags.join(', ') ?? '',
  }
  formError.value = ''
  editorOpen.value = true
}

function openWatch(item?: WatchItem): void {
  editorType.value = 'watch'
  watchForm.value = {
    id: item?.id ?? '',
    code: item?.code ?? '',
    thesis: item?.thesis ?? '',
    targetPrice: item?.targetPrice === null || item?.targetPrice === undefined ? '' : String(item.targetPrice),
  }
  formError.value = ''
  editorOpen.value = true
}

function openStrategy(item?: StrategyLog): void {
  editorType.value = 'strategy'
  strategyForm.value = {
    id: item?.id ?? '',
    title: item?.title ?? '',
    thesis: item?.thesis ?? '',
    action: item?.action ?? '',
    result: item?.result ?? '',
  }
  formError.value = ''
  editorOpen.value = true
}

async function saveEditor(): Promise<void> {
  formError.value = ''
  saving.value = true
  try {
    if (editorType.value === 'note') {
      await research.saveNote({
        id: noteForm.value.id || undefined,
        title: noteForm.value.title,
        body: noteForm.value.body,
        fundCode: noteForm.value.fundCode.match(/\d{6}/)?.[0] ?? noteForm.value.fundCode,
        tags: noteForm.value.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        createdAt: research.notes.find((note) => note.id === noteForm.value.id)?.createdAt,
      })
    } else if (editorType.value === 'watch') {
      await research.saveWatchItem({
        id: watchForm.value.id || undefined,
        code: watchForm.value.code.match(/\d{6}/)?.[0] ?? watchForm.value.code,
        thesis: watchForm.value.thesis,
        targetPrice: watchForm.value.targetPrice ? Number(watchForm.value.targetPrice) : null,
        createdAt: research.watchlist.find((item) => item.id === watchForm.value.id)?.createdAt,
      })
    } else {
      await research.saveStrategy({
        id: strategyForm.value.id || undefined,
        title: strategyForm.value.title,
        thesis: strategyForm.value.thesis,
        action: strategyForm.value.action,
        result: strategyForm.value.result,
        createdAt: research.strategyLogs.find((item) => item.id === strategyForm.value.id)?.createdAt,
      })
    }
    editorOpen.value = false
    ui.toast('研究记录已保存', 'success')
  } catch (reason) {
    formError.value = reason instanceof Error ? reason.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function openHistory(note: ResearchNote): Promise<void> {
  historyNote.value = note
  await research.loadNoteHistory(note.id)
  historyOpen.value = true
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    if (deleteTarget.value.kind === 'note') await research.deleteNote(deleteTarget.value.id)
    else if (deleteTarget.value.kind === 'watch') await research.deleteWatchItem(deleteTarget.value.id)
    else await research.deleteStrategy(deleteTarget.value.id)
    deleteTarget.value = null
    ui.toast('研究记录已删除', 'success')
  } catch (reason) {
    ui.toast(reason instanceof Error ? reason.message : '删除失败', 'error')
  } finally {
    deleting.value = false
  }
}

function exportNoteMarkdown(note: ResearchNote): void {
  const filename = `${note.title.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-') || note.id}.md`
  const tags = note.tags.length ? note.tags.map((tag) => `#${tag}`).join(' ') : ''
  const metadata = [
    note.fundCode ? `- 基金代码：${note.fundCode}` : '',
    tags ? `- 标签：${tags}` : '',
    `- 更新时间：${note.updatedAt.slice(0, 16).replace('T', ' ')}`,
  ].filter(Boolean).join('\n')
  downloadText(filename, `# ${note.title}\n\n${metadata}\n\n${note.body}\n`)
}

async function exportBackup(): Promise<void> {
  try {
    const backup = await exportLocalBackup()
    downloadJson(`qdii-tracker-backup-${todayIso()}.json`, backup)
    ui.toast('本地备份已导出', 'success')
  } catch (reason) {
    ui.toast(reason instanceof Error ? reason.message : '导出失败', 'error')
  }
}

async function importBackup(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const backup = parseBackup(await file.text())
    await importLocalBackup(backup)
    await research.load()
    ui.toast('备份已校验并恢复', 'success')
  } catch (reason) {
    ui.toast(reason instanceof Error ? reason.message : '恢复失败', 'error')
  } finally {
    if (importInput.value) importInput.value.value = ''
  }
}

onMounted(async () => {
  await data.load()
  await research.load()
})
</script>

<template>
  <div class="page research-page">
    <header class="page-header">
      <div class="page-title-group">
        <div class="eyebrow">个人研究</div>
        <h1>研究</h1>
        <p class="page-subtitle">知识库、基金笔记、观察清单和策略复盘。个人记录只保存在 IndexedDB。</p>
      </div>
      <div class="page-actions">
        <button class="button button-secondary" type="button" @click="exportBackup"><Download :size="15" aria-hidden="true" />备份</button>
        <button class="button button-secondary" type="button" @click="importInput?.click()"><Upload :size="15" aria-hidden="true" />恢复</button>
        <input ref="importInput" class="visually-hidden" type="file" accept="application/json,.json" aria-label="选择本地备份文件" @change="importBackup" />
      </div>
    </header>

    <div class="research-tabs" role="tablist" aria-label="研究工作区">
      <button type="button" role="tab" :class="{ active: activeView === 'knowledge' }" :aria-selected="activeView === 'knowledge'" @click="activeView = 'knowledge'"><BookOpen :size="16" />知识库</button>
      <button type="button" role="tab" :class="{ active: activeView === 'notes' }" :aria-selected="activeView === 'notes'" @click="activeView = 'notes'"><FileText :size="16" />基金笔记 <span>{{ research.notes.length }}</span></button>
      <button type="button" role="tab" :class="{ active: activeView === 'watchlist' }" :aria-selected="activeView === 'watchlist'" @click="activeView = 'watchlist'"><Eye :size="16" />观察清单 <span>{{ research.watchlist.length }}</span></button>
      <button type="button" role="tab" :class="{ active: activeView === 'strategies' }" :aria-selected="activeView === 'strategies'" @click="activeView = 'strategies'"><ShieldCheck :size="16" />策略记录 <span>{{ research.strategyLogs.length }}</span></button>
    </div>

    <DataState :loading="research.loading" :error="research.error" @retry="research.load">
      <section v-if="activeView === 'knowledge'" class="knowledge-section">
        <div class="research-toolbar">
          <div><strong>知识库</strong><p>{{ filteredArticles.length }} 篇 · 按主题展开阅读关键概念</p></div>
          <button class="button button-primary" type="button" @click="openNote()"><Plus :size="15" aria-hidden="true" />新建笔记</button>
        </div>
        <div class="chip-row" role="group" aria-label="知识分类">
          <button v-for="category in KNOWLEDGE_CATEGORIES" :key="category.key" class="chip" :class="{ active: knowledgeFilter === category.key }" type="button" :aria-pressed="knowledgeFilter === category.key" @click="knowledgeFilter = category.key">{{ category.label }}</button>
        </div>
        <div class="knowledge-grid">
          <details v-for="article in filteredArticles" :key="article.id" class="knowledge-card">
            <summary>
              <div><span class="eyebrow">{{ knowledgeCategoryLabel(article.category) }}</span><h2>{{ article.title }}</h2></div>
              <span class="knowledge-check"><ChevronDown :size="14" aria-hidden="true" /></span>
            </summary>
            <p>{{ article.summary }}</p>
            <ul>
              <li v-for="point in article.points" :key="point">{{ point }}</li>
            </ul>
          </details>
        </div>
      </section>

      <section v-else-if="activeView === 'notes'" class="research-workspace">
        <div class="research-toolbar">
          <label class="inline-search"><Search :size="15" /><input v-model="noteSearch" type="search" placeholder="搜索标题、正文、代码或标签" aria-label="搜索研究笔记" /></label>
          <button class="button button-primary" type="button" @click="openNote()"><Plus :size="15" />新建笔记</button>
        </div>
        <div v-if="!filteredNotes.length" class="page-state">
          <FileText :size="20" />
          <div v-if="noteSearch">
            <strong>未找到匹配笔记</strong>
            <p>换一个关键词，或清空搜索查看全部笔记。</p>
            <button class="button button-secondary" type="button" @click="noteSearch = ''">清空搜索</button>
          </div>
          <div v-else><strong>暂无研究笔记</strong><p>记录基金逻辑、风险点和后续验证条件。</p></div>
        </div>
        <div v-else class="research-card-grid">
          <article v-for="note in filteredNotes" :key="note.id" class="research-card">
            <div class="research-card-head">
              <div><span class="eyebrow">{{ note.fundCode || '通用' }}</span><h3>{{ note.title }}</h3></div>
              <div class="row-actions"><button class="button button-secondary history-button" type="button" @click="openHistory(note)">历史</button><button class="icon-button" type="button" aria-label="导出 Markdown" title="导出 Markdown" @click="exportNoteMarkdown(note)"><Download :size="14" /></button><button class="icon-button" type="button" aria-label="编辑笔记" @click="openNote(note)"><FileText :size="14" /></button><button class="icon-button" type="button" aria-label="删除笔记" @click="deleteTarget = { kind: 'note', id: note.id, title: note.title }"><Trash2 :size="14" /></button></div>
            </div>
            <MarkdownNote :text="note.body" />
            <div class="tag-row"><span v-for="tag in note.tags" :key="tag" class="badge">{{ tag }}</span></div>
          </article>
        </div>
      </section>

      <section v-else-if="activeView === 'watchlist'" class="research-workspace">
        <div class="research-toolbar"><div><strong>观察清单</strong><p>记录关注理由和触发条件，不用把想法留在聊天记录里。</p></div><button class="button button-primary" type="button" @click="openWatch()"><Plus :size="15" />添加标的</button></div>
        <div v-if="!research.watchlist.length" class="page-state"><Eye :size="20" /><span>暂无观察标的</span></div>
        <div v-else class="research-card-grid">
          <article v-for="item in research.watchlist" :key="item.id" class="research-card">
            <div class="research-card-head"><div><span class="eyebrow">{{ item.code }}</span><h3>{{ fundName(item.code) }}</h3></div><div class="row-actions"><button class="icon-button" type="button" aria-label="编辑观察项" @click="openWatch(item)"><FileText :size="14" /></button><button class="icon-button" type="button" aria-label="删除观察项" @click="deleteTarget = { kind: 'watch', id: item.id, title: fundName(item.code) }"><Trash2 :size="14" /></button></div></div>
            <p>{{ item.thesis || '暂未填写观察逻辑。' }}</p>
            <div class="tag-row"><span v-if="item.targetPrice" class="badge">目标价 {{ formatNumber(item.targetPrice, 4) }}</span></div>
          </article>
        </div>
      </section>

      <section v-else class="research-workspace">
        <div class="research-toolbar"><div><strong>策略记录</strong><p>把假设、动作和结果写在一起，方便复盘而不是只记结论。</p></div><button class="button button-primary" type="button" @click="openStrategy()"><Plus :size="15" />记录策略</button></div>
        <div v-if="!research.strategyLogs.length" class="page-state"><ShieldCheck :size="20" /><span>暂无策略记录</span></div>
        <div v-else class="strategy-list">
          <article v-for="item in research.strategyLogs" :key="item.id" class="strategy-card">
            <div class="research-card-head"><div><span class="eyebrow">策略复盘</span><h3>{{ item.title }}</h3></div><div class="row-actions"><button class="icon-button" type="button" aria-label="编辑策略" @click="openStrategy(item)"><FileText :size="14" /></button><button class="icon-button" type="button" aria-label="删除策略" @click="deleteTarget = { kind: 'strategy', id: item.id, title: item.title }"><Trash2 :size="14" /></button></div></div>
            <div class="strategy-flow"><div><span>假设</span><p>{{ item.thesis || '--' }}</p></div><div><span>动作</span><p>{{ item.action || '--' }}</p></div><div><span>结果</span><p>{{ item.result || '--' }}</p></div></div>
          </article>
        </div>
      </section>
    </DataState>

    <BaseDrawer :open="editorOpen" :title="editorType === 'note' ? '研究笔记' : editorType === 'watch' ? '观察标的' : '策略记录'" eyebrow="本地研究" side="responsive" @close="editorOpen = false">
      <div v-if="editorType === 'note'" class="form-grid">
        <label class="field span-2"><span>标题</span><input v-model="noteForm.title" class="input" /></label>
        <label class="field"><span>基金代码</span><input v-model="noteForm.fundCode" class="input" placeholder="可选" /></label>
        <label class="field"><span>标签</span><input v-model="noteForm.tags" class="input" placeholder="用逗号分隔" /></label>
        <label class="field span-2"><span>正文（Markdown）</span><textarea v-model="noteForm.body" class="textarea" rows="7" placeholder="支持 [链接](https://example.com) 和外部图表地址" /></label>
      </div>
      <div v-else-if="editorType === 'watch'" class="form-grid">
        <label class="field"><span>基金代码</span><input v-model="watchForm.code" class="input" /></label>
        <label class="field"><span>目标价</span><input v-model="watchForm.targetPrice" class="input" type="number" step="any" /></label>
        <label class="field span-2"><span>观察逻辑</span><textarea v-model="watchForm.thesis" class="textarea" rows="6" /></label>
      </div>
      <div v-else class="form-grid">
        <label class="field span-2"><span>标题</span><input v-model="strategyForm.title" class="input" /></label>
        <label class="field span-2"><span>假设</span><textarea v-model="strategyForm.thesis" class="textarea" rows="3" /></label>
        <label class="field span-2"><span>动作</span><textarea v-model="strategyForm.action" class="textarea" rows="3" /></label>
        <label class="field span-2"><span>结果</span><textarea v-model="strategyForm.result" class="textarea" rows="3" /></label>
      </div>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <template #footer><button class="button button-secondary" type="button" @click="editorOpen = false">取消</button><button class="button button-primary" type="button" :disabled="saving" @click="saveEditor">保存</button></template>
    </BaseDrawer>

    <BaseDrawer :open="historyOpen" :title="`${historyNote?.title || '笔记'} · 历史`" eyebrow="历史版本" side="bottom" @close="historyOpen = false">
      <div v-if="!research.noteHistory.length" class="page-state">暂无历史版本。修改笔记后会保留修改前内容。</div>
      <div v-else class="revision-list">
        <article v-for="revision in research.noteHistory" :key="revision.id" class="revision-card">
          <div><strong>{{ revision.title }}</strong><time>{{ revision.createdAt.slice(0, 16).replace('T', ' ') }}</time></div>
          <MarkdownNote :text="revision.body" />
        </article>
      </div>
    </BaseDrawer>

    <BaseDrawer :open="Boolean(deleteTarget)" title="删除研究记录" eyebrow="不可撤销操作" side="responsive" @close="deleteTarget = null">
      <div class="notice notice-danger">
        <CircleAlert :size="16" aria-hidden="true" />
        删除后无法在当前设备恢复。需要保留时请先导出备份。
      </div>
      <p class="confirm-copy">确认删除“{{ deleteTarget?.title }}”？</p>
      <template #footer>
        <button class="button button-secondary" type="button" @click="deleteTarget = null">取消</button>
        <button class="button button-danger" type="button" :disabled="deleting" @click="confirmDelete">
          <Trash2 :size="14" aria-hidden="true" />确认删除
        </button>
      </template>
    </BaseDrawer>
  </div>
</template>
