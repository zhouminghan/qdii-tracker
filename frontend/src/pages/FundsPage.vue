<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Download, GitCompareArrows, ImageDown, Info, Radio, RefreshCw, Search, X } from '@lucide/vue'
import { toPng } from 'html-to-image'
import DataState from '@/shared/components/DataState.vue'
import BaseDrawer from '@/shared/components/BaseDrawer.vue'
import EChart from '@/shared/components/EChart.vue'
import FundTable from '@/features/funds/FundTable.vue'
import FundDetailDrawer from '@/features/funds/FundDetailDrawer.vue'
import { ETF_GROUPS, OFFSHORE_CATEGORIES } from '@/shared/constants/funds'
import type { FundSortKey, FundRow } from '@/shared/lib/funds'
import { matchesFundQuery } from '@/shared/lib/funds'
import { downloadCsv } from '@/shared/lib/csv'
import { qualityStatusLabel, qualityWarningText } from '@/shared/lib/data-quality'
import { formatDateTime } from '@/shared/lib/format'
import { useDataStore } from '@/stores/data'
import { useUiStore } from '@/stores/ui'
import { fetchJson } from '@/shared/infrastructure/http'
import type { KlineData } from '@/types/data'

const data = useDataStore()
const ui = useUiStore()

const tab = ref<'offshore' | 'etf'>('offshore')
const selectedGroup = ref('sp500')
const search = ref(ui.quickSearch)
const sortKey = ref<FundSortKey>('series_scale')
const sortDirection = ref<'asc' | 'desc'>('desc')
const selectedRow = ref<FundRow | null>(null)
const detailOpen = ref(false)
const shareSurface = ref<HTMLElement | null>(null)
const sharing = ref(false)
const compareRows = ref<FundRow[]>([])
const compareOpen = ref(false)
const compareLoading = ref(false)
const compareSeries = ref<Array<{ name: string; values: number[]; dates: string[] }>>([])
const compareError = ref('')
let liveTimer: number | null = null
let liveBootTimer: number | null = null

const groups = computed(() => {
  if (tab.value === 'etf') {
    return ETF_GROUPS.map((group) => ({ ...group, count: data.allRows.filter((row) => row.category === 'etf' && etfGroupOf(row) === group.key).length }))
  }
  return OFFSHORE_CATEGORIES.map((group) => ({ ...group, count: data.categories?.[group.key]?.series.length ?? 0 }))
})

const currentRows = computed(() => data.allRows.filter((row) => {
  if (tab.value === 'offshore') {
    return search.value ? row.category !== 'etf' : row.category === selectedGroup.value
  }
  return row.category === 'etf' && (search.value || etfGroupOf(row) === selectedGroup.value)
}))

const visibleRows = computed(() => currentRows.value.filter((row) => matchesFundQuery(row, search.value)))
const totalScale = computed(() => visibleRows.value.reduce((sum, row) => sum + (row.series_scale ?? 0), 0))
const currentGroupLabel = computed(() => groups.value.find((group) => group.key === selectedGroup.value)?.label ?? '')
const visibleNavDate = computed(() => visibleRows.value
  .map((row) => row.defaultShare.nav_date)
  .filter((date): date is string => Boolean(date))
  .sort()
  .at(-1) ?? data.catalog?.data.summary.newest_nav_date ?? null)
const missingPriceShares = computed(() => data.allRows.flatMap((row) => row.shares
  .filter((share) => share.nav == null && share.etf_price == null)
  .map((share) => ({ code: share.code, name: share.name }))))
const qualityLabel = computed(() => qualityStatusLabel(data.quality?.status))

watch(() => ui.quickSearch, (value) => {
  search.value = value
})
watch(search, (value) => {
  ui.quickSearch = value.trim()
})
watch(tab, () => {
  selectedGroup.value = tab.value === 'offshore' ? 'sp500' : 'sp500'
  if (liveBootTimer !== null) window.clearTimeout(liveBootTimer)
  if (tab.value === 'etf' && !navigator.webdriver) {
    liveBootTimer = window.setTimeout(() => {
      if (!document.hidden) void data.refreshEtfQuotes()
    }, 800)
  }
})

function setTab(next: 'offshore' | 'etf'): void {
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

async function toggleCompare(row: FundRow): Promise<void> {
  const existing = compareRows.value.some((item) => item.default_share_code === row.default_share_code)
  if (existing) {
    compareRows.value = compareRows.value.filter((item) => item.default_share_code !== row.default_share_code)
    return
  }
  if (compareRows.value.length >= 3) {
    ui.toast('最多同时对比 3 只基金', 'info')
    return
  }
  compareRows.value = [...compareRows.value, row]
}

async function openCompare(): Promise<void> {
  if (!compareRows.value.length) return
  compareOpen.value = true
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
  compareOpen.value = false
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
      backgroundColor: document.documentElement.dataset.theme === 'dark' ? '#111318' : '#f4f5f7',
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
    color: ['#0f766e', '#d97706', '#2563eb'],
    grid: { left: 10, right: 12, top: 32, bottom: 28, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%` },
    legend: { top: 0, textStyle: { fontSize: 11 } },
    xAxis: { type: 'category', data: dates, axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' }, splitLine: { lineStyle: { opacity: 0.18 } } },
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
        <p class="page-subtitle">场外 QDII 与场内 ETF 的分类、净值、申购状态和限购额度。默认按规模降序，收藏始终置顶。</p>
      </div>
      <div class="page-actions">
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
        <button v-if="compareRows.length" class="button button-primary" type="button" @click="openCompare">
          <GitCompareArrows :size="15" aria-hidden="true" /> 对比 {{ compareRows.length }}
        </button>
        <button class="button button-secondary" type="button" :disabled="data.loading" @click="retry">
          <RefreshCw :size="15" :class="{ spin: data.loading }" aria-hidden="true" /> 刷新
        </button>
      </div>
    </header>

    <DataState :loading="data.loading" :error="data.error" @retry="retry">
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

        <section class="fund-toolbar" aria-label="基金筛选">
          <div class="segmented" role="group" aria-label="市场类型">
            <button type="button" :class="{ active: tab === 'offshore' }" :aria-pressed="tab === 'offshore'" @click="setTab('offshore')">场外基金</button>
            <button type="button" :class="{ active: tab === 'etf' }" :aria-pressed="tab === 'etf'" @click="setTab('etf')">场内 ETF</button>
          </div>
          <label class="inline-search">
            <Search :size="15" aria-hidden="true" />
            <input v-model="search" type="search" placeholder="代码、名称、公司" aria-label="搜索基金目录（跨分类）" />
            <button v-if="search" type="button" aria-label="清空搜索" @click="clearSearch"><X :size="14" aria-hidden="true" /></button>
          </label>
          <div class="mobile-sort">
            <label>
              <span>排序</span>
              <select v-model="sortKey" class="select" aria-label="排序字段">
                <option value="series_scale">规模</option>
                <option value="price">价格</option>
                <option value="chg_1m">近 1 月</option>
                <option value="chg_ytd">今年来</option>
                <option value="chg_1y">近 1 年</option>
                <option v-if="tab === 'etf'" value="premium">溢价率</option>
              </select>
            </label>
            <button class="button" type="button" :aria-label="sortDirection === 'desc' ? '切换为升序' : '切换为降序'" @click="sortDirection = sortDirection === 'desc' ? 'asc' : 'desc'">
              {{ sortDirection === 'desc' ? '降序' : '升序' }}
            </button>
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

        <div ref="shareSurface" class="funds-share-surface">
          <div class="list-heading">
            <div>
              <h2>{{ tab === 'offshore' ? '场外 QDII' : '场内 ETF' }}</h2>
              <p>{{ search ? `跨分类搜索“${search}”` : `${currentGroupLabel} · 按分类展示` }}</p>
            </div>
            <span class="badge">{{ visibleRows.length }} 个系列</span>
          </div>

          <FundTable
            :rows="visibleRows"
            :tab="tab"
            :sort-key="sortKey"
            :sort-direction="sortDirection"
            :total-scale="totalScale"
            :nav-date="visibleNavDate"
            :category-label="categoryLabel"
            :compare-codes="compareRows.map((row) => row.default_share_code)"
            @sort="sortBy"
            @detail="openDetail"
            @compare="toggleCompare"
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
      <div class="compare-toolbar">
        <div class="chip-row">
          <span v-for="row in compareRows" :key="row.default_share_code" class="chip active">{{ row.display_name }}</span>
        </div>
        <button class="button button-secondary" type="button" @click="clearCompare">清空</button>
      </div>
      <p class="inline-note">近一年净值按各自首个有效值归一化，只比较走势，不叠加汇率或费用之外的额外推算。</p>
      <div v-if="compareLoading" class="page-state">正在加载对比数据...</div>
      <div v-else-if="compareError" class="notice notice-danger">{{ compareError }}</div>
      <EChart v-else-if="compareSeries.length" :option="compareOption" label="多基金归一化收益对比图" height="420px" />
    </BaseDrawer>
  </div>
</template>
