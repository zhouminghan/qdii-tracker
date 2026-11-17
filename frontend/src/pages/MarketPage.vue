<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, ChevronRight, CircleAlert, Gauge, Landmark, Radio, TrendingUp } from '@lucide/vue'
import DataState from '@/shared/components/DataState.vue'
import EChart from '@/shared/components/EChart.vue'
import BaseDrawer from '@/shared/components/BaseDrawer.vue'
import MetricInfoButton from '@/features/market/MetricInfoButton.vue'
import MetricKnowledgeDrawer from '@/features/market/MetricKnowledgeDrawer.vue'
import { MARKET_INDEX_KNOWLEDGE_IDS, MARKET_MACRO_KNOWLEDGE_IDS } from '@/features/market/metricKnowledge'
import { MARKET_INDEX_LABELS, TECH_LABELS } from '@/shared/constants/funds'
import { fetchJson } from '@/shared/infrastructure/http'
import {
  asNumber,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  movementClass,
  movementSurfaceClass,
} from '@/shared/lib/format'
import { fxLabel } from '@/shared/lib/market'
import { marketFreshness, quoteFreshness, type FreshnessKind } from '@/shared/lib/market-freshness'
import { TENCENT_INDEX_SYMBOLS } from '@/shared/lib/realtime'
import { useDataStore } from '@/stores/data'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { FearGreedData, KlineData, MarketQuote, NasdaqHistory } from '@/types/data'
import { DCA_BANDS, strategyOf } from '@/shared/lib/dca'
import { lineTooltipFormatter } from '@/shared/lib/chart-tooltip'
import { dailyChange, filterTimeSeries, TIME_RANGES, type TimeRange } from '@/shared/lib/time-series'

const data = useDataStore()
const settings = useSettingsStore()
const ui = useUiStore()
const nasdaq = ref<NasdaqHistory | null>(null)
const fearGreed = ref<FearGreedData | null>(null)
const extraLoading = ref(false)
const extraError = ref('')
const selectedIndex = ref('')
const kline = ref<KlineData | null>(null)
const klineLoading = ref(false)
const indexRange = ref<TimeRange>('all')
const activeMarketSection = ref('market-overview')
const heatmapMode = ref<'year' | 'month'>('year')
const selectedKnowledge = ref<string[]>([])
const knowledgeTitle = ref('指标说明')
let liveTimer: number | null = null
let liveBootTimer: number | null = null
let sectionObserver: IntersectionObserver | null = null
let sectionClickLock = 0

const positiveColor = computed(() => settings.colorMode === 'green-up' ? '#067647' : '#d92d20')
const negativeColor = computed(() => settings.colorMode === 'green-up' ? '#d92d20' : '#067647')
const market = computed(() => data.market)

const indexItems = computed(() => Object.entries(market.value?.market_indices.items ?? {})
  .filter(([key]) => key !== 'au9999')
  .map(([key, quote]) => [key, data.liveIndices[key]
    ? {
        ...quote,
        price: data.liveIndices[key].price,
        change_pct: data.liveIndices[key].changePct,
        as_of: data.liveIndices[key].asOf ?? quote.as_of,
      }
    : quote] as const))
const liveIndexCoverage = Object.keys(TENCENT_INDEX_SYMBOLS).length
function indexFreshness(key: string, fallbackAsOf: string | null | undefined) {
  const live = data.liveIndices[key]
  return live?.asOf ? quoteFreshness(live, 'index') : marketFreshness(fallbackAsOf, 'index')
}
function quoteMarketFreshness(quote: MarketQuote | undefined, kind: FreshnessKind) {
  if (!quote) return marketFreshness(undefined, kind)
  return quoteFreshness({ asOf: quote.as_of, updatedAt: quote.source_updated_at ?? null }, kind)
}
const techItems = computed(() => Object.entries(market.value?.big_tech.items ?? {}))
const fxItems = computed(() => ['fxUSDCNY', 'fxUSDJPY', 'fxCNYHKD', 'fxUSDHKD']
  .map((key) => [key, market.value?.fx.items[key]] as const)
  .filter(([, item]) => Boolean(item)))
const techFreshness = computed(() => marketFreshness(market.value?.big_tech.as_of, 'index'))
const brandFreshness = computed(() => marketFreshness(market.value?.brand_gold.as_of, 'gold'))
const goldAuFreshness = computed(() => quoteMarketFreshness(market.value?.gold.au9999, 'gold'))
const goldXauFreshness = computed(() => quoteMarketFreshness(market.value?.gold.xau, 'gold'))
const goldHasPremium = computed(() => market.value?.gold.xau.derived === false
  && market.value?.gold.converted_cny_per_gram.value !== null
  && market.value?.gold.premium_pct.value !== null)

interface PulseCard {
  key: string
  label: string
  value: string
  suffix: string
  as_of: string | null
  freshness: ReturnType<typeof marketFreshness>
}

const pulseCards = computed<PulseCard[]>(() => {
  const snapshot = market.value
  if (!snapshot) return []
  return [
    {
      key: 'vix',
      label: 'VIX',
      value: formatNumber(snapshot.macro.vix.value),
      suffix: '',
      as_of: snapshot.macro.vix.as_of,
      freshness: marketFreshness(snapshot.macro.vix.as_of, 'macro'),
    },
    {
      key: 'ndx_pe',
      label: '纳指100 TTM PE',
      value: formatNumber(snapshot.macro.ndx_pe.value),
      suffix: '',
      as_of: snapshot.macro.ndx_pe.as_of,
      freshness: marketFreshness(snapshot.macro.ndx_pe.as_of, 'monthly'),
    },
  ]
})

interface MacroCard {
  key: string
  label: string
  value: string
  suffix: string
  as_of: string | null
  freshness: ReturnType<typeof marketFreshness>
}

const macroCards = computed<MacroCard[]>(() => {
  const snapshot = market.value
  if (!snapshot) return []
  const rows: Array<{ key: string; label: string; value: string; suffix: string; as_of: string | null; kind: FreshnessKind }> = [
    { key: 'treasury_2y', label: '美国 2 年', value: formatNumber(snapshot.macro.treasury_2y.value), suffix: '%', as_of: snapshot.macro.treasury_2y.as_of, kind: 'macro' },
    { key: 'treasury_10y', label: '美国 10 年', value: formatNumber(snapshot.macro.treasury_10y.value), suffix: '%', as_of: snapshot.macro.treasury_10y.as_of, kind: 'macro' },
    { key: 'treasury_30y', label: '美国 30 年', value: formatNumber(snapshot.macro.treasury_30y.value), suffix: '%', as_of: snapshot.macro.treasury_30y.as_of, kind: 'macro' },
    { key: 'dxy', label: '美元指数', value: formatNumber(snapshot.macro.dxy.value), suffix: '', as_of: snapshot.macro.dxy.as_of, kind: 'macro' },
  ]
  return rows.map((row) => ({ ...row, freshness: marketFreshness(row.as_of, row.kind) }))
})

const fearBand = computed(() => fearGreed.value?.band ?? 'neutral')
const dca = computed(() => strategyOf(
  fearGreed.value?.score,
  market.value?.macro.vix.value,
  market.value?.macro.ndx_pe.value,
))

const annualOption = computed(() => ({
  animationDuration: 260,
  grid: { left: 10, right: 12, top: 20, bottom: 24, containLabel: true },
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: nasdaq.value?.annual.map((item) => item.year) ?? [],
    axisLabel: { hideOverlap: true },
  },
  yAxis: { type: 'value', splitLine: { lineStyle: { opacity: 0.18 } } },
  series: [{
    type: 'bar',
    data: nasdaq.value?.annual.map((item) => ({
      value: item.return_pct,
      itemStyle: {
        color: item.return_pct >= 0 ? positiveColor.value : negativeColor.value,
        opacity: item.is_ytd ? 0.55 : 1,
      },
    })) ?? [],
    barMaxWidth: 12,
  }],
}))

const monthLabels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const annualHeatSummary = computed(() => {
  const rows = nasdaq.value?.annual ?? []
  const valid = rows.filter((item) => !item.is_ytd && Number.isFinite(item.return_pct))
  if (!valid.length) return null
  const average = valid.reduce((sum, item) => sum + item.return_pct, 0) / valid.length
  const best = valid.reduce((left, right) => right.return_pct > left.return_pct ? right : left)
  const worst = valid.reduce((left, right) => right.return_pct < left.return_pct ? right : left)
  return {
    up: valid.filter((item) => item.return_pct > 0).length,
    down: valid.filter((item) => item.return_pct < 0).length,
    average,
    best,
    worst,
  }
})
const annualYtd = computed(() => nasdaq.value?.annual.find((item) => item.is_ytd) ?? null)
const fullYearCount = computed(() => nasdaq.value?.annual.filter((item) => !item.is_ytd).length ?? 0)
const seasonalityWindows = computed(() => [
  { key: '5y', label: '近 5 年' },
  { key: '10y', label: '近 10 年' },
  { key: '20y', label: '近 20 年' },
].map((window) => {
  const rows = (nasdaq.value?.ranking[window.key] ?? [])
    .filter((item) => Number.isFinite(item.avg_pct))
  return {
    ...window,
    top: rows.slice(0, 3),
    bottom: rows.slice(-3).reverse(),
    complete: rows.length === 12,
  }
}))
function monthName(month: number): string {
  return `${month}月`
}
function sampleLabel(sample: number): string {
  return sample < 3 ? `样本不足 (${sample})` : `n=${sample}`
}

const fearOption = computed(() => ({
  animationDuration: 260,
  grid: { left: 10, right: 12, top: 18, bottom: 24, containLabel: true },
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: fearGreed.value?.history.map((item) => item.date) ?? [],
    axisLabel: { hideOverlap: true },
  },
  yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { opacity: 0.18 } } },
  visualMap: {
    show: false,
    pieces: [
      { lte: 25, color: negativeColor.value },
      { gt: 25, lte: 45, color: '#d18a00' },
      { gt: 45, lte: 55, color: '#7a838f' },
      { gt: 55, lte: 75, color: positiveColor.value },
      { gt: 75, color: positiveColor.value },
    ],
  },
  series: [{
    type: 'line',
    showSymbol: false,
    smooth: false,
    lineStyle: { width: 1.8 },
    areaStyle: { opacity: 0.08 },
    data: fearGreed.value?.history.map((item) => item.score) ?? [],
  }],
}))

async function loadExtras(): Promise<void> {
  extraLoading.value = true
  extraError.value = ''
  const results = await Promise.allSettled([
    fetchJson<NasdaqHistory>('data/nasdaq-history.json'),
    fetchJson<FearGreedData>('data/cnn-fear-greed.json'),
  ])
  if (results[0].status === 'fulfilled') nasdaq.value = results[0].value
  if (results[1].status === 'fulfilled') fearGreed.value = results[1].value
  const rejected = results.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') {
    extraError.value = rejected.reason instanceof Error ? rejected.reason.message : '市场扩展数据加载失败'
  }
  extraLoading.value = false
}

async function openIndex(key: string): Promise<void> {
  selectedIndex.value = key
  kline.value = null
  indexRange.value = 'all'
  klineLoading.value = true
  try {
    kline.value = await fetchJson<KlineData>(`data/index-kline/${key}.json`)
  } catch {
    kline.value = null
  } finally {
    klineLoading.value = false
  }
}

function scrollToSection(id: string): void {
  activeMarketSection.value = id
  // 点击锚点后短暂锁定，避免 IntersectionObserver 在滚动完成前抢回上一个分区。
  sectionClickLock = Date.now() + 800
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
}

function openKnowledge(ids: string[], title = '指标说明'): void {
  selectedKnowledge.value = ids
  knowledgeTitle.value = title
}

function openIndexKnowledge(): void {
  openKnowledge([...MARKET_INDEX_KNOWLEDGE_IDS], '指数知识')
}

function openMacroKnowledge(): void {
  openKnowledge([...MARKET_MACRO_KNOWLEDGE_IDS, 'fx'], '宏观与汇率指标')
}

function heatCellStyle(value: unknown): Record<string, string> {
  const number = asNumber(value)
  const strength = number === null ? 0 : Math.min(Math.abs(number) / 15, 1)
  return { '--heat-alpha': `${Math.round(8 + strength * 40)}%` }
}

async function refreshLive(): Promise<void> {
  await data.refreshIndexQuotes()
  if (data.indexLiveError) ui.toast(data.indexLiveError, 'error')
  else ui.toast('指数行情已刷新', 'success')
}

const filteredKline = computed(() => kline.value
  ? filterTimeSeries(kline.value.dates ?? [], kline.value.close ?? [], indexRange.value)
  : { startIndex: 0, dates: [], values: [] })
const klineTableRows = computed(() => filteredKline.value.dates.map((date, index) => {
  const absoluteIndex = filteredKline.value.startIndex + index
  const value = filteredKline.value.values[index]
  return {
    date,
    value,
    change: dailyChange(value, kline.value?.close?.[absoluteIndex - 1]),
  }
}).slice(-30).reverse())
const klineOption = computed(() => {
  return {
    animationDuration: 320,
    color: [settings.resolvedTheme === 'dark' ? '#6cb6ff' : '#0b63ce'],
    grid: { left: 34, right: 20, top: 34, bottom: 70, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: settings.resolvedTheme === 'dark' ? '#181c23' : '#ffffff',
      borderColor: settings.resolvedTheme === 'dark' ? '#485262' : '#dfe5ee',
      textStyle: { color: settings.resolvedTheme === 'dark' ? '#f3f6fb' : '#111827', fontSize: 12 },
      extraCssText: 'border-radius: 8px; box-shadow: 0 10px 30px rgb(0 0 0 / 14%);',
      formatter: lineTooltipFormatter(
        filteredKline.value.dates,
        filteredKline.value.values,
        (value) => formatNumber(value),
        '收盘',
      ),
    },
    axisPointer: {
      type: 'line',
      lineStyle: { color: settings.resolvedTheme === 'dark' ? '#6cb6ff' : '#0b63ce', opacity: 0.55 },
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      {
        type: 'slider',
        height: 18,
        bottom: 12,
        borderColor: 'transparent',
        backgroundColor: settings.resolvedTheme === 'dark' ? '#151a21' : '#f1f5fa',
        fillerColor: settings.resolvedTheme === 'dark' ? 'rgba(108,182,255,.22)' : 'rgba(11,99,206,.14)',
        handleStyle: { color: settings.resolvedTheme === 'dark' ? '#6cb6ff' : '#0b63ce' },
        moveHandleStyle: { color: settings.resolvedTheme === 'dark' ? '#6cb6ff' : '#0b63ce' },
      },
    ],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: filteredKline.value.dates,
      axisLabel: {
        hideOverlap: true,
        color: settings.resolvedTheme === 'dark' ? '#b1bac7' : '#4b5563',
        margin: 10,
        formatter: (value: string) => value.slice(2, 7),
      },
      axisTick: {
        show: true,
        alignWithLabel: true,
        lineStyle: { color: settings.resolvedTheme === 'dark' ? '#485262' : '#cbd5e1' },
      },
      axisLine: {
        show: true,
        lineStyle: { color: settings.resolvedTheme === 'dark' ? '#485262' : '#cbd5e1' },
      },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: settings.resolvedTheme === 'dark' ? '#b1bac7' : '#4b5563' },
      axisTick: { show: true, lineStyle: { color: settings.resolvedTheme === 'dark' ? '#485262' : '#cbd5e1' } },
      axisLine: { show: true, lineStyle: { color: settings.resolvedTheme === 'dark' ? '#485262' : '#cbd5e1' } },
      splitLine: {
        lineStyle: {
          color: settings.resolvedTheme === 'dark' ? '#2d3540' : '#e5eaf1',
          type: 'dashed',
        },
      },
    },
    series: [{
      type: 'line',
      data: filteredKline.value.values,
      showSymbol: false,
      lineStyle: { width: 2.2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: settings.resolvedTheme === 'dark' ? 'rgba(108,182,255,.26)' : 'rgba(11,99,206,.2)' },
            { offset: 1, color: 'rgba(11,99,206,0)' },
          ],
        },
      },
    }],
  }
})

onMounted(() => {
  void data.load()
  void loadExtras()
  if (!navigator.webdriver) {
    liveBootTimer = window.setTimeout(() => {
      if (!document.hidden) void data.refreshIndexQuotes()
    }, 2500)
    liveTimer = window.setInterval(() => {
      if (!document.hidden) void data.refreshIndexQuotes()
    }, 60 * 1000)
  }
})

watch(market, async (value) => {
  if (!value) return
  await nextTick()
  sectionObserver?.disconnect()
  const sections = ['market-overview', 'market-global', 'market-macro', 'market-nasdaq']
    .map((id) => document.getElementById(id))
    .filter((section): section is HTMLElement => Boolean(section))
  if (!sections.length) return
  sectionObserver = new IntersectionObserver((entries) => {
    if (Date.now() < sectionClickLock) return
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0]
    if (visible?.target.id) activeMarketSection.value = visible.target.id
  }, { rootMargin: '-120px 0px -55% 0px', threshold: [0, 0.2, 0.5] })
  sections.forEach((section) => sectionObserver?.observe(section))
}, { immediate: true })

onBeforeUnmount(() => {
  if (liveBootTimer !== null) window.clearTimeout(liveBootTimer)
  if (liveTimer !== null) window.clearInterval(liveTimer)
  sectionObserver?.disconnect()
  data.cancelLiveRefreshes()
})
</script>

<template>
  <div class="page market-page">
    <header class="page-header">
      <div class="page-title-group">
        <div class="eyebrow">市场情报</div>
        <h1>市场</h1>
        <p class="page-subtitle">全球指数、宏观利率、黄金与纳指历史。数据来自本地收盘快照，展示实际日期与来源状态。</p>
      </div>
      <div class="page-actions">
        <span v-if="market" class="data-stamp">基金快照 {{ formatDateTime(market.generated_at) }}</span>
        <span v-if="data.indexLiveError" class="live-status is-error" role="status">刷新失败 · 已回退快照</span>
        <span v-else-if="data.indexLiveUpdatedAt" class="live-status" role="status">行情刷新于 {{ formatDateTime(data.indexLiveUpdatedAt) }}</span>
        <button class="button button-secondary" type="button" :disabled="data.indexLiveLoading" @click="refreshLive">
          <Radio :size="15" :class="{ spin: data.indexLiveLoading }" aria-hidden="true" /> 刷新行情
        </button>
      </div>
    </header>

    <DataState :loading="data.loading" :error="data.error" @retry="data.retry">
      <template v-if="market">
        <nav class="anchor-bar" aria-label="市场分区">
          <a href="#market-overview" :class="{ active: activeMarketSection === 'market-overview' }" :aria-current="activeMarketSection === 'market-overview' ? 'location' : undefined" @click.prevent="scrollToSection('market-overview')">概览</a>
          <a href="#market-global" :class="{ active: activeMarketSection === 'market-global' }" :aria-current="activeMarketSection === 'market-global' ? 'location' : undefined" @click.prevent="scrollToSection('market-global')">全球指数</a>
          <a href="#market-macro" :class="{ active: activeMarketSection === 'market-macro' }" :aria-current="activeMarketSection === 'market-macro' ? 'location' : undefined" @click.prevent="scrollToSection('market-macro')">宏观与汇率</a>
          <a href="#market-nasdaq" :class="{ active: activeMarketSection === 'market-nasdaq' }" :aria-current="activeMarketSection === 'market-nasdaq' ? 'location' : undefined" @click.prevent="scrollToSection('market-nasdaq')">纳指分析</a>
        </nav>

        <section id="market-overview" class="market-overview-band">
          <div class="temperature-panel">
            <div class="temperature-orbit" :class="market.temperature.band" aria-hidden="true">
              <span>{{ market.temperature.score }}</span>
            </div>
            <div>
              <div class="temperature-label">
                <div class="eyebrow">市场温度</div>
                <MetricInfoButton label="市场温度" @open="openKnowledge(['market-temperature'], '市场温度')" />
              </div>
              <h2>{{ market.temperature.verdict }}</h2>
              <p>{{ market.temperature.summary }}</p>
              <div v-if="market.temperature.coverage?.degraded" class="temperature-degraded">
                <span class="badge badge-warn">数据降级</span>
                <small>{{ market.temperature.coverage.fresh }}/{{ market.temperature.coverage.total }} 项数据本次更新成功</small>
              </div>
            </div>
          </div>
          <div class="market-pulse-grid">
            <article v-for="card in pulseCards" :key="card.key" class="pulse-card surface-flat">
              <div class="pulse-label">
                <span>{{ card.label }}</span>
                <MetricInfoButton
                  :label="card.label"
                  @open="openKnowledge([card.key === 'vix' ? 'vix' : 'ttm-pe'], card.label)"
                />
              </div>
              <strong class="mono">{{ card.value }}{{ card.suffix }}</strong>
              <div class="pulse-meta">
                <small class="mono muted">{{ formatDate(card.as_of) }}</small>
                <span class="freshness-badge" :class="`is-${card.freshness.tone}`">{{ card.freshness.label }}</span>
              </div>
            </article>
          </div>
        </section>

        <section id="market-global" class="section">
          <div class="section-header">
            <div>
              <div class="eyebrow">全球指数</div>
              <h2>全球市场</h2>
              <p>点击指数查看多区间历史走势和每日收盘明细。{{ liveIndexCoverage }} 个支持盘中刷新，其余为收盘快照。</p>
            </div>
            <div class="section-header-actions">
              <button class="button button-secondary" type="button" @click="openIndexKnowledge">指数说明</button>
              <span class="badge" :title="`${liveIndexCoverage} 个指数支持盘中刷新`">{{ indexItems.length }} 个指数 · {{ liveIndexCoverage }} 个支持实时</span>
            </div>
          </div>
          <div class="index-grid">
            <button
              v-for="[key, quote] in indexItems"
              :key="key"
              class="index-card"
              :class="movementSurfaceClass(quote.change_pct)"
              type="button"
              @click="openIndex(key)"
            >
              <span class="index-name">{{ MARKET_INDEX_LABELS[key] || key }} <ChevronRight :size="13" aria-hidden="true" /></span>
              <strong class="mono">{{ quote.price === null ? '暂无数据' : formatNumber(quote.price) }}</strong>
              <span class="mono" :class="movementClass(quote.change_pct)">{{ formatPercent(quote.change_pct) }}</span>
              <small class="index-meta">
                <span>{{ formatDate(quote.as_of) }}</span>
                <span class="freshness-badge" :class="`is-${indexFreshness(key, quote.as_of).tone}`">
                  {{ indexFreshness(key, quote.as_of).label }}
                </span>
              </small>
            </button>
          </div>
        </section>

        <section class="market-split-grid">
          <article class="panel">
            <header class="panel-header">
              <div>
                <h3>科技七姐妹</h3>
                <p class="inline-note">
                  {{ formatDate(market.big_tech.as_of) }}
                  <span class="freshness-badge" :class="`is-${techFreshness.tone}`">{{ techFreshness.label }}</span>
                </p>
              </div>
              <Activity :size="17" aria-hidden="true" />
            </header>
            <div class="market-list">
              <div v-for="[key, quote] in techItems" :key="key" class="market-list-row">
                <div><strong>{{ TECH_LABELS[key] || key }}</strong><span class="mono">{{ key.replace('us', '') }}</span></div>
                <span class="mono">{{ formatNumber(quote.price) }}</span>
                <span class="move-chip mono" :class="movementClass(quote.change_pct)">{{ formatPercent(quote.change_pct) }}</span>
              </div>
            </div>
          </article>

          <article class="panel">
            <header class="panel-header">
              <div>
                <h3>品牌金价</h3>
                <p class="inline-note">
                  {{ formatDate(market.brand_gold.as_of) }}
                  <span class="freshness-badge" :class="`is-${brandFreshness.tone}`">{{ brandFreshness.label }}</span>
                </p>
              </div>
              <Landmark :size="17" aria-hidden="true" />
            </header>
            <div class="market-list brand-gold-list" role="table" aria-label="品牌金价">
              <div class="market-list-row gold-row gold-head" role="row">
                <span role="columnheader">品牌</span>
                <span role="columnheader">足金饰品</span>
                <span role="columnheader">投资金条</span>
              </div>
              <div v-for="item in market.brand_gold.brands.slice(0, 7)" :key="item.brand" class="market-list-row gold-row" role="row">
                <strong role="cell">{{ item.brand }}</strong>
                <span role="cell" class="mono">{{ formatNumber(item.ornament, 0) }}</span>
                <span role="cell" class="mono muted">{{ formatNumber(item.investment_bar, 0) }}</span>
              </div>
            </div>
          </article>
          <article class="panel gold-market-panel">
            <header class="panel-header">
              <div>
                <h3>黄金多市场</h3>
                <p class="inline-note">{{ formatDate(market.gold.as_of) }} · 独立行情与本地折算参考分开标注</p>
              </div>
              <div class="panel-header-actions">
                <MetricInfoButton label="伦敦金 XAU/USD" @open="openKnowledge(['xau-usd'], '伦敦金 XAU/USD')" />
                <Landmark :size="17" aria-hidden="true" />
              </div>
            </header>
            <div class="gold-market-grid" :class="{ 'has-premium': goldHasPremium }">
              <div class="gold-market-cell" :class="movementSurfaceClass(market.gold.au9999.change_pct)">
                <span class="source-tag is-independent">独立来源</span>
                <span>上海金 au9999</span>
                <strong class="mono">{{ formatNumber(market.gold.au9999.price) }}</strong>
                <small><span :class="movementClass(market.gold.au9999.change_pct)">{{ formatPercent(market.gold.au9999.change_pct) }}</span> · 元 / 克</small>
                <span class="freshness-badge" :class="`is-${goldAuFreshness.tone}`">{{ goldAuFreshness.label }}</span>
              </div>
              <div class="gold-market-cell" :class="movementSurfaceClass(market.gold.xau.change_pct)">
                <span class="source-tag" :class="market.gold.xau.derived ? 'is-derived' : 'is-independent'">
                  {{ market.gold.xau.derived ? '折算参考' : '独立来源' }}
                </span>
                <span>XAU / USD</span>
                <strong class="mono">{{ formatNumber(market.gold.xau.price) }}</strong>
                <small><span :class="movementClass(market.gold.xau.change_pct)">{{ formatPercent(market.gold.xau.change_pct) }}</span> · {{ market.gold.xau.derived ? '非独立伦敦金' : '伦敦金现货' }}</small>
                <small v-if="market.gold.xau.derived" class="gold-formula">上海金 × 31.1034768 ÷ USDCNH</small>
                <small v-else class="gold-formula">{{ market.gold.xau.source || '独立行情' }}</small>
                <span class="freshness-badge" :class="`is-${goldXauFreshness.tone}`">{{ goldXauFreshness.label }}</span>
              </div>
              <template v-if="goldHasPremium">
                <div class="gold-market-cell">
                  <span class="source-tag is-derived">折算</span>
                  <span>折合国内价</span>
                  <strong class="mono">{{ formatNumber(market.gold.converted_cny_per_gram.value) }}</strong>
                  <small class="muted">元 / 克 · {{ formatDate(market.gold.converted_cny_per_gram.as_of) }}</small>
                </div>
                <div class="gold-market-cell">
                  <span class="source-tag is-derived">价差</span>
                  <span>国内溢价</span>
                  <strong class="mono" :class="movementClass(market.gold.premium_pct.value)">{{ formatPercent(market.gold.premium_pct.value) }}</strong>
                  <small class="muted">
                    {{ market.gold.premium_cny.value === null ? '--' : `${formatNumber(market.gold.premium_cny.value)} 元 / 克` }} · {{ formatDate(market.gold.premium_pct.as_of) }}
                  </small>
                </div>
              </template>
            </div>
            <p v-if="!goldHasPremium" class="gold-footnote">
              <span class="source-tag is-missing">暂缺</span>
              <span>国内溢价：</span>
              <span>无独立伦敦金报价，暂不计算。</span>
            </p>
          </article>
        </section>

        <section id="market-macro" class="section">
          <div class="section-header">
            <div>
              <div class="eyebrow">利率与汇率</div>
              <h2>宏观与汇率</h2>
              <p>利率与汇率读数用于理解 QDII 的估值和汇率敞口。</p>
            </div>
            <div class="section-header-actions">
              <button class="button button-secondary" type="button" @click="openMacroKnowledge">指标说明</button>
            </div>
          </div>
          <div class="macro-grid">
            <article v-for="item in macroCards" :key="item.key" class="metric-card">
              <span class="metric-label">{{ item.label }}</span>
              <strong class="metric-value">{{ item.value }}{{ item.suffix }}</strong>
              <span class="metric-meta">
                {{ formatDate(item.as_of) }}
                <span class="freshness-badge" :class="`is-${item.freshness.tone}`">{{ item.freshness.label }}</span>
              </span>
            </article>
          </div>
          <div class="fx-strip">
            <div v-for="[key, item] in fxItems" :key="key" class="fx-item">
              <span class="fx-label">
                {{ fxLabel(key) }}
                <span v-if="item?.derived" class="source-tag is-derived">折算</span>
              </span>
              <strong class="mono">{{ formatNumber(item?.price, 4) }}</strong>
              <div class="fx-meta">
                <small class="muted">{{ formatDate(item?.as_of) }}</small>
                <span class="move-chip mono" :class="movementClass(item?.change_pct)">{{ formatPercent(item?.change_pct) }}</span>
                <span class="freshness-badge" :class="`is-${quoteMarketFreshness(item, 'fx').tone}`">
                  {{ quoteMarketFreshness(item, 'fx').label }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="market-nasdaq" class="section">
          <div class="section-header">
            <div>
              <div class="eyebrow">纳指 100 历史</div>
              <h2>纳指分析</h2>
              <p v-if="nasdaq">
                年度涨跌覆盖 {{ nasdaq.range.first_year }}–{{ nasdaq.range.last_year }}；月度热力图覆盖
                {{ nasdaq.heatmap.years[0] ?? nasdaq.range.first_year }}–{{ nasdaq.range.last_year }}。
                当前年份为 YTD，未结束月份不参与完整年度/季节性统计。
              </p>
            </div>
            <span v-if="nasdaq" class="badge">
              {{ fullYearCount }} 个完整年度<template v-if="annualYtd"> + {{ annualYtd.year }} YTD</template>
            </span>
          </div>

          <div v-if="extraLoading" class="page-state">正在加载历史图谱...</div>
          <div v-else-if="extraError" class="notice notice-warn">
            <CircleAlert :size="15" aria-hidden="true" /> {{ extraError }}
          </div>
          <template v-else>
            <article class="panel chart-panel">
              <header class="panel-header">
                <div><h3>年度涨跌幅</h3><p class="inline-note">红涨绿跌口径随设置变化，正负号始终可见。</p></div>
                <TrendingUp :size="17" aria-hidden="true" />
              </header>
              <div class="panel-body">
                <EChart v-if="nasdaq" :option="annualOption" label="纳斯达克年度涨跌幅柱状图" height="280px" />
              </div>
            </article>

            <div class="chart-grid">
              <article class="panel chart-panel heatmap-panel">
                <header class="panel-header">
                  <div><h3>纳指热力图</h3><p class="inline-note">每格直接显示区间涨跌幅，颜色只辅助识别方向。</p></div>
                  <div class="segmented" role="group" aria-label="热力图周期">
                    <button type="button" :class="{ active: heatmapMode === 'year' }" :aria-pressed="heatmapMode === 'year'" @click="heatmapMode = 'year'">年度</button>
                    <button type="button" :class="{ active: heatmapMode === 'month' }" :aria-pressed="heatmapMode === 'month'" @click="heatmapMode = 'month'">月度</button>
                  </div>
                </header>
                <div v-if="nasdaq" class="panel-body heatmap-body">
                  <div v-if="annualHeatSummary" class="heatmap-summary">
                    <span>上涨 <strong>{{ annualHeatSummary.up }}</strong> 年</span>
                    <span>下跌 <strong>{{ annualHeatSummary.down }}</strong> 年</span>
                    <span>均值 <strong :class="movementClass(annualHeatSummary.average)">{{ formatPercent(annualHeatSummary.average) }}</strong></span>
                    <span>最佳 <strong>{{ annualHeatSummary.best.year }} · {{ formatPercent(annualHeatSummary.best.return_pct) }}</strong></span>
                    <span>最差 <strong>{{ annualHeatSummary.worst.year }} · {{ formatPercent(annualHeatSummary.worst.return_pct) }}</strong></span>
                    <span v-if="annualYtd">YTD <strong :class="movementClass(annualYtd.return_pct)">{{ annualYtd.year }} · {{ formatPercent(annualYtd.return_pct) }}</strong></span>
                  </div>
                  <div v-if="heatmapMode === 'year'" class="annual-heat-grid" role="list" aria-label="纳指年度涨跌热力图">
                    <article
                      v-for="item in nasdaq.annual"
                      :key="item.year"
                      class="annual-heat-cell"
                      :class="[item.return_pct > 0 ? 'heat-up' : item.return_pct < 0 ? 'heat-down' : 'heat-flat', item.is_ytd ? 'is-ytd' : '']"
                      :style="heatCellStyle(item.return_pct)"
                      role="listitem"
                    >
                      <span>{{ item.year }} <small v-if="item.is_ytd" class="ytd-tag">YTD</small></span>
                      <strong>{{ formatPercent(item.return_pct) }}</strong>
                      <small>日线回撤 {{ formatPercent(item.max_drawdown_pct) }}</small>
                    </article>
                  </div>
                  <div v-else class="monthly-heat-scroll" role="region" tabindex="0" aria-label="纳指月度涨跌热力图，可横向滚动">
                    <table class="monthly-heat-table">
                      <thead>
                        <tr>
                          <th scope="col">年份</th>
                          <th v-for="month in monthLabels" :key="month" scope="col">{{ month }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, rowIndex) in nasdaq.heatmap.rows" :key="nasdaq.heatmap.years[rowIndex]">
                          <th scope="row">
                            {{ nasdaq.heatmap.years[rowIndex] }}
                            <small v-if="nasdaq.heatmap.years[rowIndex] === nasdaq.heatmap.partial_year" class="ytd-tag">进行中</small>
                          </th>
                          <td
                            v-for="(value, monthIndex) in row"
                            :key="`${rowIndex}-${monthIndex}`"
                            :class="value > 0 ? 'heat-up' : value < 0 ? 'heat-down' : 'heat-flat'"
                            :style="heatCellStyle(value)"
                          >
                            {{ formatPercent(value) }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </article>
              <article class="panel">
                <header class="panel-header">
                  <div><h3>情绪与风险</h3><p class="inline-note">CNN 恐慌贪婪指数</p></div>
                  <div class="panel-header-actions">
                    <MetricInfoButton label="CNN 恐慌贪婪指数" @open="openKnowledge(['fear-greed'], 'CNN 恐慌贪婪指数')" />
                    <Gauge :size="17" aria-hidden="true" />
                  </div>
                </header>
                <div class="panel-body fear-greed-summary">
                  <div class="fear-score" :class="fearBand">
                    <strong class="mono">{{ formatNumber(fearGreed?.score, 0) }}</strong>
                    <span>{{ fearGreed?.label || '--' }}</span>
                  </div>
                  <div class="temperature-notes">
                    <div v-for="line in market.temperature.positives" :key="line" class="note-line positive-note">+ {{ line }}</div>
                    <div v-for="line in market.temperature.risks" :key="line" class="note-line risk-note">! {{ line }}</div>
                  </div>
                  <EChart v-if="fearGreed" :option="fearOption" label="恐慌贪婪指数历史走势" height="240px" />
                </div>
              </article>
            </div>
            <article v-if="nasdaq" class="panel seasonality-panel">
              <header class="panel-header">
                <div>
                  <h3>月份季节性</h3>
                  <p class="inline-note">仅使用完整自然月；当前未结束月份不进入均值、上涨比例和样本数。</p>
                </div>
                <span class="badge">样本数按年</span>
              </header>
              <div class="panel-body seasonality-grid">
                <section v-for="window in seasonalityWindows" :key="window.key" class="seasonality-window">
                  <header>
                    <h4>{{ window.label }}</h4>
                    <small>{{ window.complete ? '12 个月均有样本' : '部分月份样本不足' }}</small>
                  </header>
                  <table class="seasonality-table">
                    <thead>
                      <tr><th scope="col">区间</th><th scope="col">月份</th><th scope="col">均值</th><th scope="col">上涨占比</th><th scope="col">样本</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in window.top" :key="`${window.key}-top-${row.month}`">
                        <td><span class="badge">最强</span></td>
                        <td>{{ monthName(row.month) }}</td>
                        <td class="mono" :class="movementClass(row.avg_pct)">{{ formatPercent(row.avg_pct) }}</td>
                        <td class="mono">{{ formatPercent(row.positive_ratio) }}</td>
                        <td class="mono">{{ sampleLabel(row.n) }}</td>
                      </tr>
                      <tr v-for="row in window.bottom" :key="`${window.key}-bottom-${row.month}`">
                        <td><span class="badge badge-warn">最弱</span></td>
                        <td>{{ monthName(row.month) }}</td>
                        <td class="mono" :class="movementClass(row.avg_pct)">{{ formatPercent(row.avg_pct) }}</td>
                        <td class="mono">{{ formatPercent(row.positive_ratio) }}</td>
                        <td class="mono">{{ sampleLabel(row.n) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              </div>
            </article>
            <article class="panel dca-panel">
              <header class="panel-header">
                <div>
                  <h3>VIX &amp; 纳指100 TTM PE 阶梯定投</h3>
                  <p class="inline-note">恐慌贪婪指数决定档位，VIX 校验波动状态，纳指100 TTM PE 补充估值参考</p>
                </div>
                <MetricInfoButton
                  label="估值指标 PE"
                  @open="openKnowledge(['pe', 'ttm-pe', 'forward-pe', 'cape'], '估值指标')"
                />
                <span v-if="dca.band" class="badge" :class="`dca-${dca.band.tone}`">{{ dca.band.label }}</span>
                <span v-else class="badge badge-warn">数据不足</span>
              </header>
              <div class="panel-body dca-body">
                <div class="dca-verdict">
                  <span class="eyebrow">当前动作</span>
                  <template v-if="dca.band">
                    <h3>{{ dca.band.action }}</h3>
                    <p>{{ dca.band.strategy }}</p>
                  </template>
                  <template v-else>
                    <h3>无法生成有效策略</h3>
                    <p>恐慌贪婪指数缺失，暂不给出定投动作。</p>
                  </template>
                  <div class="dca-checks">
                    <span v-if="dca.band" class="badge" :class="dca.matched ? 'badge-accent' : 'badge-warn'">{{ dca.matched ? 'VIX 匹配' : 'VIX 偏离' }} · {{ dca.band.vixText }}</span>
                    <span v-else class="badge badge-warn">{{ dca.vix === null ? 'VIX 缺失' : `VIX ${formatNumber(dca.vix, 1)}` }}</span>
                    <span class="badge">{{ dca.peLabel }}</span>
                  </div>
                  <p v-if="dca.note" class="inline-note">{{ dca.note }}</p>
                </div>
                <div class="dca-matrix" role="table" aria-label="VIX 与纳指100 TTM PE 阶梯定投矩阵" tabindex="0">
                  <div class="dca-matrix-row dca-matrix-head" role="row"><span role="columnheader">情绪区间</span><span role="columnheader">状态</span><span role="columnheader">动作</span><span role="columnheader">策略</span></div>
                  <div v-for="band in DCA_BANDS" :key="band.key" class="dca-matrix-row" :class="{ active: dca.band?.key === band.key }" role="row">
                    <span class="mono" role="cell">{{ band.lo }}–{{ band.hi }}</span>
                    <span role="cell">{{ band.label }}</span>
                    <span role="cell">{{ band.action }}</span>
                    <span role="cell">{{ band.strategy }}</span>
                  </div>
                </div>
              </div>
            </article>
          </template>
        </section>
      </template>
    </DataState>

    <BaseDrawer
      :open="Boolean(selectedIndex)"
      :title="MARKET_INDEX_LABELS[selectedIndex] || selectedIndex"
      eyebrow="市场走势"
      width="min(820px, 100vw)"
      @close="selectedIndex = ''"
    >
      <div v-if="klineLoading" class="page-state">正在加载走势...</div>
      <template v-else-if="kline && filteredKline.values.length">
        <div class="index-trend-toolbar">
          <span class="inline-note">
            {{ filteredKline.dates[0] }} 至 {{ filteredKline.dates[filteredKline.dates.length - 1] }}
          </span>
          <div class="segmented trend-ranges" role="group" aria-label="指数走势区间">
            <button
              v-for="item in TIME_RANGES"
              :key="item.key"
              type="button"
              :class="{ active: indexRange === item.key }"
              @click="indexRange = item.key"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
        <EChart
          :option="klineOption"
          :label="`${MARKET_INDEX_LABELS[selectedIndex] || selectedIndex} 历史走势`"
          height="460px"
        />
        <div class="table-shell trend-history-shell">
          <table class="data-table compact">
            <thead><tr><th>日期</th><th class="align-right">收盘</th><th class="align-right">日涨跌</th></tr></thead>
            <tbody>
              <tr v-for="row in klineTableRows" :key="row.date">
                <td class="mono">{{ row.date }}</td>
                <td class="align-right mono">{{ formatNumber(row.value) }}</td>
                <td class="align-right mono" :class="movementClass(row.change)">{{ formatPercent(row.change) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <div v-else class="page-state">暂无该指数历史走势数据。</div>
    </BaseDrawer>

    <MetricKnowledgeDrawer
      :open="selectedKnowledge.length > 0"
      :metric-ids="selectedKnowledge"
      :title="knowledgeTitle"
      @close="selectedKnowledge = []"
    />
  </div>
</template>
