<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Download, GitCompareArrows, ImageDown, Info, Radio, RefreshCw, Search, X } from '@lucide/vue'
import { toPng } from 'html-to-image'
import DataState from '@/shared/components/DataState.vue'
import BaseDrawer from '@/shared/components/BaseDrawer.vue'
import EChart from '@/shared/components/EChart.vue'
import FundTable from '@/features/funds/FundTable.vue'
import FundDetailDrawer from '@/features/funds/FundDetailDrawer.vue'
import SouthboundPanel from '@/features/funds/SouthboundPanel.vue'
import { ETF_GROUPS, OFFSHORE_CATEGORIES } from '@/shared/constants/funds'
import type { FundSortKey, FundRow } from '@/shared/lib/funds'
import { confirmedDailyLimit, formatDailyLimit, matchesFundQuery } from '@/shared/lib/funds'
import { downloadCsv } from '@/shared/lib/csv'
import { qualityStatusLabel, qualityWarningText } from '@/shared/lib/data-quality'
import { formatDateTime } from '@/shared/lib/format'
import { useDataStore } from '@/stores/data'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { fetchJson } from '@/shared/infrastructure/http'
import type { FundLimitChannel, KlineData } from '@/types/data'

const data = useDataStore()
const settings = useSettingsStore()
const ui = useUiStore()

const tab = ref<'offshore' | 'etf' | 'southbound'>('offshore')
const selectedGroup = ref('sp500')
const search = ref(ui.quickSearch)
const sortKey = ref<FundSortKey>('series_scale')
const sortDirection = ref<'asc' | 'desc'>('desc')
const sortSelection = computed({
  get: () => `${sortKey.value}:${sortDirection.value}`,
  set: (value: string) => {
    const [key, direction] = value.split(':') as [FundSortKey, 'asc' | 'desc']
    sortKey.value = key
    sortDirection.value = direction
  },
})
const selectedRow = ref<FundRow | null>(null)
const detailOpen = ref(false)
const shareSurface = ref<HTMLElement | null>(null)
const sharing = ref(false)
const compareRows = ref<FundRow[]>([])
const compareOpen = ref(false)
const compareLoading = ref(false)
const compareSeries = ref<Array<{ name: string; values: number[]; dates: string[] }>>([])
const compareError = ref('')
const limitBoardOpen = ref(false)
let liveTimer: number | null = null
let liveBootTimer: number | null = null

const groups = computed(() => {
  if (tab.value === 'southbound') return []
  if (tab.value === 'etf') {
    return ETF_GROUPS.map((group) => ({ ...group, count: data.allRows.filter((row) => row.category === 'etf' && etfGroupOf(row) === group.key).length }))
  }
  return OFFSHORE_CATEGORIES.map((group) => ({ ...group, count: data.categories?.[group.key]?.series.length ?? 0 }))
})

const currentRows = computed(() => data.allRows.filter((row) => {
  if (tab.value === 'southbound') return false
  if (tab.value === 'offshore') {
    return search.value ? row.category !== 'etf' : row.category === selectedGroup.value
  }
  return row.category === 'etf' && (search.value || etfGroupOf(row) === selectedGroup.value)
}))

const visibleRows = computed(() => currentRows.value
  .filter((row) => matchesFundQuery(row, search.value))
  .map((row) => {
    const code = search.value.trim()
    if (!/^\d{6}$/.test(code)) return row
    const matched = row.shares.find((share) => share.code === code)
    if (!matched || matched.code === row.default_share_code) return row
    // 搜索具体份额时展示该份额，避免 D 类被默认 A 类的暂停状态掩盖。
    return {
      ...row,
      defaultShare: matched,
      default_share_code: matched.code,
      starred: settings.isFavorite(matched.code),
    }
  }))
const totalScale = computed(() => visibleRows.value.reduce((sum, row) => sum + (row.series_scale ?? 0), 0))
const currentGroupLabel = computed(() => groups.value.find((group) => group.key === selectedGroup.value)?.label ?? '')
const missingPriceShares = computed(() => data.allRows.flatMap((row) => row.shares
  .filter((share) => share.nav == null && share.etf_price == null)
  .map((share) => ({ code: share.code, name: share.name }))))
const qualityLabel = computed(() => qualityStatusLabel(data.quality?.status))
const pageSubtitle = computed(() => tab.value === 'southbound'
  ? '跨境理财通南向通产品与多币种份额。支持产品名、银行码、Bloomberg、ISIN 和币种搜索。'
  : '场外 QDII 与场内 ETF 的分类、净值、申购状态和限购额度。默认按规模降序，收藏始终置顶。')
const sortOptions = computed(() => {
  const fields: Array<{ key: FundSortKey; label: string }> = [
    { key: 'series_scale', label: '规模' },
    { key: 'price', label: '价格' },
    { key: 'daily_limit', label: '申购' },
    { key: 'chg_1m', label: '近 1 月' },
    { key: 'chg_3m', label: '近 3 月' },
    { key: 'chg_6m', label: '近 6 月' },
    { key: 'chg_ytd', label: '今年来' },
    { key: 'chg_1y', label: '近 1 年' },
    { key: 'chg_2y', label: '近 2 年' },
    { key: 'chg_3y', label: '近 3 年' },
    { key: 'chg_since_inception', label: '成立来' },
  ]
  if (tab.value === 'etf') fields.splice(2, 0, { key: 'premium', label: '溢价率' })
  return fields
    .filter((field) => tab.value !== 'etf' || field.key !== 'daily_limit')
    .flatMap((field) => [
      { value: `${field.key}:desc`, label: `${field.label} · 降序` },
      { value: `${field.key}:asc`, label: `${field.label} · 升序` },
    ])
})
const groupNotices: Record<string, { text: string; tone: 'info' | 'warn' }> = {
  'offshore:sp500': {
    tone: 'info',
    text: '被动跟踪 S&P 500；QDII 限购可能留下 5~10% 现金仓位，长期可能少赚 1~2 个点，但风格不易跑偏。',
  },
  'offshore:nasdaq_passive': {
    tone: 'info',
    text: '被动跟踪纳斯达克100；限购常态化可能拖累 1~2 个点，长期定投仍需关注现金仓位和溢价。',
  },
  'offshore:active': {
    tone: 'warn',
    text: '主动基金需核对季报持仓，部分产品可能实际重仓 A 股或港股，不能只看名称判断美股敞口。',
  },
  'offshore:global_index': {
    tone: 'info',
    text: '覆盖日经225、中韩半导体等非美指数，适合分散区域风险，但汇率和交易时差会放大波动。',
  },
  'offshore:global_other': {
    tone: 'info',
    text: '覆盖全球配置和非美股核心方向，需同时核对底层市场、汇率和申购状态。',
  },
  'etf:sp500': { tone: 'warn', text: '场内交易无申赎费，但高溢价时买入可能承担较大回归风险。' },
  'etf:nasdaq100': { tone: 'warn', text: '盘中价格实时波动，关注溢价率和成交活跃度，避免在异常溢价追高。' },
  'etf:global_other': { tone: 'info', text: '不同市场和交易时段差异较大，折溢价与流动性需要单独核对。' },
}
const activeGroupNotice = computed(() => search.value
  ? null
  : groupNotices[`${tab.value}:${selectedGroup.value}`] ?? null)
const groupPurchaseSummary = computed(() => {
  if (tab.value !== 'offshore' || search.value) return null
  let limited = 0
  let paused = 0
  let open = 0
  let unknown = 0
  let totalLimit = 0
  for (const row of currentRows.value) {
    const share = row.shares.find((item) => (
      String(item.share_class).includes('A') && item.currency === '人民币'
    )) ?? row.shares.find((item) => String(item.share_class).includes('A'))
    if (!share) continue
    const status = String(share.buy_status || '')
    if (status.includes('暂停')) paused += 1
    else if (status.includes('限')) {
      limited += 1
      const limit = confirmedDailyLimit(share)
      if (limit === null) unknown += 1
      else totalLimit += limit
    } else if (status.includes('开放')) open += 1
  }
  if (!limited && !paused && !open) return null
  const parts = []
  if (totalLimit > 0) parts.push(`A 类每日限购合计 ${formatDailyLimit(totalLimit, '人民币')}`)
  parts.push(`限购 ${limited} 只`, `暂停 ${paused} 只`, `开放 ${open} 只`)
  if (unknown) parts.push(`${unknown} 只额度待核验`)
  return parts.join(' · ')
})
interface SharedLimitGroup {
  key: string
  name: string
  shareCodes: string[]
  shareClasses: string[]
  channels: FundLimitChannel[]
  effectiveDate: string | null
  source: string | null
  sourceUrl: string | null
}
const sharedLimitGroups = computed<SharedLimitGroup[]>(() => {
  const groups = new Map<string, SharedLimitGroup>()
  for (const row of data.allRows) {
    const shared = row.shares.filter((share) => (
      share.limit_scope === 'series_shared' && share.limit_group_id
    ))
    if (!shared.length) continue
    const first = shared[0]
    const key = first.limit_group_id as string
    if (groups.has(key)) continue
    groups.set(key, {
      key,
      name: row.display_name,
      shareCodes: shared.map((share) => share.code),
      shareClasses: [...new Set(shared.map((share) => share.share_class))],
      channels: first.limit_channels ?? [],
      effectiveDate: first.limit_effective_date ?? null,
      source: first.limit_source ?? null,
      sourceUrl: first.limit_source_url ?? null,
    })
  }
  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
})
function channelAmount(channel: FundLimitChannel): string {
  return `${formatDailyLimit(channel.amount, channel.currency)}/日`
}

watch(() => ui.quickSearch, (value) => {
  search.value = value
})
watch(search, (value) => {
  ui.quickSearch = value.trim()
})
watch(tab, () => {
  if (liveBootTimer !== null) window.clearTimeout(liveBootTimer)
  if (tab.value === 'southbound') return
  if (sortKey.value === 'daily_limit' && tab.value === 'etf') {
    sortKey.value = 'series_scale'
    sortDirection.value = 'desc'
  }
  selectedGroup.value = tab.value === 'offshore' ? 'sp500' : 'sp500'
  if (tab.value === 'etf' && !navigator.webdriver) {
    liveBootTimer = window.setTimeout(() => {
      if (!document.hidden) void data.refreshEtfQuotes()
    }, 800)
  }
})

function setTab(next: 'offshore' | 'etf' | 'southbound'): void {
  tab.value = next
}

function etfGroupOf(row: FundRow): string {
  return row.etf_target === 'sp500' || row.etf_target === 'nasdaq100' ? row.etf_target : 'global_other'
}

function categoryLabel(row: FundRow): string {
  if (row.category === 'etf') {
    return ETF_GROUPS.find((group) => group.key === etfGroupOf(row))?.label ?? '场内 ETF'
  }
  return OFFSHORE_CATEGORIES.find((group) => group.key === row.category)?.label ?? row.category
}

function sortBy(key: FundSortKey): void {
  if (sortKey.value === key) sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
  else {
    sortKey.value = key
    sortDirection.value = 'desc'
  }
}

function openDetail(row: FundRow): void {
  selectedRow.value = row
  detailOpen.value = true
}

const compareCandidates = computed(() => data.allRows
  .filter((row) => !compareRows.value.some((selected) => selected.default_share_code === row.default_share_code))
  .sort((left, right) => left.display_name.localeCompare(right.display_name, 'zh-CN')))

function openCompareDrawer(): void {
  compareOpen.value = true
  if (compareRows.value.length >= 2) void loadCompareSeries()
}

function addCompareFund(event: Event): void {
  const select = event.target as HTMLSelectElement
  const row = data.allRows.find((candidate) => candidate.default_share_code === select.value)
  select.value = ''
  if (!row) return
  if (compareRows.value.length >= 3) {
    ui.toast('最多同时对比 3 只基金', 'info')
    return
  }
  compareRows.value = [...compareRows.value, row]
  if (compareRows.value.length >= 2) void loadCompareSeries()
  else {
    compareSeries.value = []
    compareError.value = ''
  }
}

function removeCompareFund(code: string): void {
  compareRows.value = compareRows.value.filter((row) => row.default_share_code !== code)
  if (compareRows.value.length >= 2) void loadCompareSeries()
  else {
    compareSeries.value = []
    compareError.value = ''
  }
}

async function loadCompareSeries(): Promise<void> {
  if (compareRows.value.length < 2) {
    compareSeries.value = []
    return
  }
  compareLoading.value = true
  compareError.value = ''
  try {
    const results = await Promise.all(compareRows.value.map(async (row) => {
      const payload = await fetchJson<KlineData>(`data/nav-history/${row.default_share_code}.json`)
      const values = payload.navs ?? payload.close
      const dates = payload.dates
      return { name: row.display_name, dates, values }
    }))
    const dateSet = new Set<string>()
    results.forEach((result) => result.dates.slice(-260).forEach((date) => dateSet.add(date)))
    const dates = [...dateSet].sort()
    compareSeries.value = results.map((result) => {
      const firstIndex = Math.max(0, result.dates.length - 260)
      const base = result.values.slice(firstIndex).find((value) => Number.isFinite(value) && value > 0)
      let cursor = firstIndex
      const values = dates.map((date) => {
        while (cursor + 1 < result.dates.length && result.dates[cursor + 1] <= date) cursor += 1
        const value = result.values[cursor]
        return base && Number.isFinite(value) && value > 0 ? (value / base - 1) * 100 : 0
      })
      return {
        name: result.name,
        dates,
        values,
      }
    })
  } catch (reason) {
    compareError.value = reason instanceof Error ? reason.message : '对比数据加载失败'
  } finally {
    compareLoading.value = false
  }
}

function clearCompare(): void {
  compareRows.value = []
  compareSeries.value = []
  compareError.value = ''
}

function exportRows(): void {
  const isEtf = tab.value === 'etf'
  const headers = isEtf
    ? ['代码', '名称', '公司', '最新价', '涨跌幅%', '溢价率%', '近1月%', '今年来%', '近1年%', '规模(亿)', '净值日期']
    : ['代码', '名称', '公司', '净值', '涨跌幅%', '近1月%', '今年来%', '近1年%', '成立来%', '申购状态', '规模(亿)', '净值日期']
  const rows = visibleRows.value.map((row) => {
    const share = row.defaultShare
    return isEtf
      ? [share.code, share.name, row.company, share.etf_price, share.etf_change_pct, share.etf_premium, share.chg_1m, share.chg_ytd, share.chg_1y, row.series_scale, share.nav_date]
      : [share.code, row.display_name, row.company, share.nav, share.daily_change, share.chg_1m, share.chg_ytd, share.chg_1y, share.chg_since_inception, share.buy_status, row.series_scale, share.nav_date]
  })
  downloadCsv(`qdii-${tab.value}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
  ui.toast('CSV 已生成', 'success')
}

function clearSearch(): void {
  search.value = ''
  ui.quickSearch = ''
}

async function exportImage(): Promise<void> {
  if (!shareSurface.value) return
  sharing.value = true
  try {
    const dataUrl = await toPng(shareSurface.value, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: document.documentElement.dataset.theme === 'dark' ? '#0f1217' : '#f5f7fb',
      filter: (node) => !(node instanceof HTMLElement && node.classList.contains('no-share')),
    })
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = `qdii-${tab.value}-${new Date().toISOString().slice(0, 10)}.png`
    anchor.click()
    ui.toast('分享图片已生成', 'success')
  } catch (reason) {
    ui.toast(reason instanceof Error ? reason.message : '图片生成失败', 'error')
  } finally {
    sharing.value = false
  }
}

async function refreshLive(): Promise<void> {
  await data.refreshEtfQuotes()
  if (data.etfLiveError) ui.toast(data.etfLiveError, 'error')
  else ui.toast('场内 ETF 行情已刷新', 'success')
}

function retry(): void {
  void data.retry()
}

const compareOption = computed(() => {
  const dates = compareSeries.value[0]?.dates ?? []
  return {
    animationDuration: 240,
    color: ['#0b63ce', '#d97706', '#7c3aed'],
    grid: { left: 38, right: 18, top: 34, bottom: 36, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%` },
    legend: { top: 0, textStyle: { fontSize: 11 } },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { hideOverlap: true, color: settings.resolvedTheme === 'dark' ? '#b1bac7' : '#4b5563' },
      axisTick: { show: true, lineStyle: { color: settings.resolvedTheme === 'dark' ? '#485262' : '#cbd5e1' } },
      axisLine: { show: true, lineStyle: { color: settings.resolvedTheme === 'dark' ? '#485262' : '#cbd5e1' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: '{value}%', color: settings.resolvedTheme === 'dark' ? '#b1bac7' : '#4b5563' },
      axisTick: { show: true, lineStyle: { color: settings.resolvedTheme === 'dark' ? '#485262' : '#cbd5e1' } },
      axisLine: { show: true, lineStyle: { color: settings.resolvedTheme === 'dark' ? '#485262' : '#cbd5e1' } },
      splitLine: {
        lineStyle: {
          color: settings.resolvedTheme === 'dark' ? '#2d3540' : '#e5eaf1',
          type: 'dashed',
        },
      },
    },
    series: compareSeries.value.map((series) => ({
      name: series.name,
      type: 'line',
      data: series.values,
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 1.8 },
      emphasis: { focus: 'series' },
    })),
  }
})

onMounted(() => {
  if (navigator.webdriver) return
  liveTimer = window.setInterval(() => {
    if (!document.hidden && tab.value === 'etf') void data.refreshEtfQuotes()
  }, 5 * 60 * 1000)
})

onBeforeUnmount(() => {
  if (liveBootTimer !== null) window.clearTimeout(liveBootTimer)
  if (liveTimer !== null) window.clearInterval(liveTimer)
  data.cancelLiveRefreshes()
})
</script>

<template>
  <div class="page funds-page">
    <header class="page-header">
      <div class="page-title-group">
        <div class="eyebrow">基金全景</div>
        <h1>基金追踪</h1>
        <p class="page-subtitle">{{ pageSubtitle }}</p>
      </div>
      <div class="page-actions">
        <template v-if="tab !== 'southbound'">
          <span v-if="data.generatedAt" class="data-stamp">数据 {{ formatDateTime(data.generatedAt) }}</span>
          <span v-if="tab === 'etf' && data.etfLiveError" class="live-status is-error" role="status">实时失败 · 已回退快照</span>
          <span v-else-if="tab === 'etf' && data.etfLiveUpdatedAt" class="live-status" role="status">实时 {{ formatDateTime(data.etfLiveUpdatedAt) }}</span>
          <button v-if="tab === 'etf'" class="button button-secondary" type="button" :disabled="data.etfLiveLoading" @click="refreshLive">
            <Radio :size="15" :class="{ spin: data.etfLiveLoading }" aria-hidden="true" /> 实时行情
          </button>
          <button class="button button-secondary" type="button" @click="exportRows">
            <Download :size="15" aria-hidden="true" /> CSV
          </button>
          <button class="button button-secondary" type="button" :disabled="sharing" @click="exportImage">
            <ImageDown :size="15" :class="{ spin: sharing }" aria-hidden="true" /> 分享 PNG
          </button>
          <button
            v-if="sharedLimitGroups.length"
            class="button button-secondary"
            type="button"
            @click="limitBoardOpen = true"
          >
            <Info :size="15" aria-hidden="true" /> 共用额度 {{ sharedLimitGroups.length }}
          </button>
          <button
            class="button"
            :class="compareRows.length ? 'button-primary' : 'button-secondary'"
            type="button"
            @click="openCompareDrawer"
          >
            <GitCompareArrows :size="15" aria-hidden="true" /> 对比{{ compareRows.length ? ` ${compareRows.length}` : '' }}
          </button>
          <button class="button button-secondary" type="button" :disabled="data.loading" @click="retry">
            <RefreshCw :size="15" :class="{ spin: data.loading }" aria-hidden="true" /> 刷新
          </button>
        </template>
        <span v-else class="data-stamp">渠道资料 · 2026-11-15</span>
      </div>
    </header>

    <section class="fund-toolbar fund-type-toolbar" aria-label="基金类型">
      <div class="segmented" role="group" aria-label="基金类型">
        <button type="button" :class="{ active: tab === 'offshore' }" :aria-pressed="tab === 'offshore'" @click="setTab('offshore')">场外基金</button>
        <button type="button" :class="{ active: tab === 'etf' }" :aria-pressed="tab === 'etf'" @click="setTab('etf')">场内 ETF</button>
        <button type="button" :class="{ active: tab === 'southbound' }" :aria-pressed="tab === 'southbound'" @click="setTab('southbound')">南向通</button>
      </div>
    </section>

    <SouthboundPanel v-if="tab === 'southbound'" />

    <DataState v-else :loading="data.loading" :error="data.error" @retry="retry">
      <template v-if="data.catalog">
        <div v-if="data.quality?.status !== 'ok'" class="notice notice-warn" role="status">
          <Info :size="15" aria-hidden="true" />
          <span>
            数据目录状态：{{ qualityLabel }}。
            {{ data.quality?.warnings[0] ? qualityWarningText(data.quality.warnings[0]) : '请查看数据诊断。' }}
            <template v-if="missingPriceShares.length">
              缺少价格：
              {{ missingPriceShares.slice(0, 4).map((share) => `${share.code} ${share.name}`).join('、') }}
              <template v-if="missingPriceShares.length > 4">等 {{ missingPriceShares.length }} 个份额</template>
            </template>
          </span>
        </div>

        <section class="fund-toolbar funds-mobile-search" aria-label="基金筛选">
          <label class="inline-search">
            <Search :size="15" aria-hidden="true" />
            <input v-model="search" type="search" placeholder="代码、名称、公司" aria-label="搜索基金目录（跨分类）" />
            <button v-if="search" type="button" aria-label="清空搜索" @click="clearSearch"><X :size="14" aria-hidden="true" /></button>
          </label>
          <div class="mobile-sort">
            <label>
              <span>排序</span>
              <select v-model="sortSelection" class="select" aria-label="排序方式">
                <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
          </div>
        </section>

        <div v-if="!search" class="chip-row" role="group" :aria-label="`${currentGroupLabel} 分类筛选`">
          <button
            v-for="group in groups"
            :key="group.key"
            class="chip"
            :class="{ active: selectedGroup === group.key }"
            type="button"
            :aria-pressed="selectedGroup === group.key"
            @click="selectedGroup = group.key"
          >
            {{ group.label }}
            <span class="chip-count">{{ group.count }}</span>
          </button>
        </div>

        <aside v-if="activeGroupNotice" class="group-brief" :class="`group-brief-${activeGroupNotice.tone}`">
          <Info :size="15" aria-hidden="true" />
          <div>
            <p>{{ activeGroupNotice.text }}</p>
            <p v-if="groupPurchaseSummary"><strong>{{ groupPurchaseSummary }}</strong></p>
          </div>
        </aside>

        <div ref="shareSurface" class="funds-share-surface">
          <div class="list-heading">
            <div>
              <h2>{{ tab === 'offshore' ? '场外 QDII' : '场内 ETF' }}</h2>
              <p>{{ search ? `跨分类搜索“${search}”` : '规模降序 · 收藏置顶' }}</p>
            </div>
            <span class="badge">{{ visibleRows.length }} 个系列</span>
          </div>

          <FundTable
            :rows="visibleRows"
            :tab="tab"
            :sort-key="sortKey"
            :sort-direction="sortDirection"
            :total-scale="totalScale"
            :category-label="categoryLabel"
            :show-category="Boolean(search)"
            @sort="sortBy"
            @detail="openDetail"
          />
        </div>
      </template>
    </DataState>

    <FundDetailDrawer
      :open="detailOpen"
      :row="selectedRow"
      @close="detailOpen = false"
    />

    <BaseDrawer :open="compareOpen" title="基金走势对比" eyebrow="归一化表现" width="min(920px, 100vw)" @close="compareOpen = false">
      <div class="compare-picker">
        <label class="field span-2">
          <span>添加基金</span>
          <select class="select" aria-label="添加对比基金" :disabled="compareRows.length >= 3" @change="addCompareFund">
            <option value="">选择基金加入对比</option>
            <option v-for="row in compareCandidates" :key="row.default_share_code" :value="row.default_share_code">
              {{ row.display_name }} · {{ row.default_share_code }}
            </option>
          </select>
        </label>
        <div v-if="compareRows.length" class="chip-row">
          <button
            v-for="row in compareRows"
            :key="row.default_share_code"
            class="chip active compare-chip"
            type="button"
            :aria-label="`移除 ${row.display_name}`"
            @click="removeCompareFund(row.default_share_code)"
          >
            {{ row.display_name }} <X :size="12" aria-hidden="true" />
          </button>
        </div>
        <button v-if="compareRows.length" class="button button-secondary" type="button" @click="clearCompare">清空</button>
      </div>
      <p class="inline-note">最多选择 3 只，近一年净值按各自首个有效值归一化。</p>
      <div v-if="compareRows.length < 2" class="page-state">再选择 {{ 2 - compareRows.length }} 只基金开始对比。</div>
      <div v-else-if="compareLoading" class="page-state">正在加载对比数据...</div>
      <div v-else-if="compareError" class="notice notice-danger">{{ compareError }}</div>
      <EChart v-else-if="compareSeries.length" :option="compareOption" label="多基金归一化收益对比图" height="420px" />
    </BaseDrawer>

    <BaseDrawer
      :open="limitBoardOpen"
      title="共用额度看板"
      eyebrow="公告口径"
      width="min(760px, 100vw)"
      @close="limitBoardOpen = false"
    >
      <p class="inline-note">
        仅展示公募基金公告正文明确写明“多份额合计”或“合并计算”的记录；同金额、同系列不会自动认定。
      </p>
      <div v-if="sharedLimitGroups.length" class="limit-board-list">
        <article v-for="group in sharedLimitGroups" :key="group.key" class="limit-board-item">
          <header>
            <div>
              <h3>{{ group.name }}</h3>
              <p>{{ group.shareClasses.join(' / ') }} 共用 · {{ group.shareCodes.join(' · ') }}</p>
            </div>
            <span class="badge badge-accent">公告已核验</span>
          </header>
          <div class="limit-channel-grid">
            <div v-for="channel in group.channels" :key="`${group.key}-${channel.channel}-${channel.amount}`" class="limit-channel">
              <span>{{ channel.channel }}</span>
              <strong class="mono">{{ channelAmount(channel) }}</strong>
              <small>{{ channel.includes_installment ? '申购与定投合计' : '仅申购' }}</small>
            </div>
            <div v-if="!group.channels.length" class="limit-channel">
              <span>公告口径</span>
              <strong>见详情</strong>
              <small>未解析出单渠道金额</small>
            </div>
          </div>
          <footer>
            <span>
              {{ group.effectiveDate ? `生效 ${group.effectiveDate}` : '生效日期见公告' }}
              <template v-if="group.source"> · {{ group.source }}</template>
            </span>
            <a v-if="group.sourceUrl" :href="group.sourceUrl" target="_blank" rel="noreferrer">
              查看公告 {{ '↗' }}
            </a>
          </footer>
        </article>
      </div>
      <div v-else class="page-state">暂无已核验的共用额度公告。</div>
    </BaseDrawer>
  </div>
</template>
