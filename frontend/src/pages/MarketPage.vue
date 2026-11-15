<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, ChevronRight, CircleAlert, Gauge, Landmark, Radio, TrendingUp } from '@lucide/vue'
import DataState from '@/shared/components/DataState.vue'
import EChart from '@/shared/components/EChart.vue'
import BaseDrawer from '@/shared/components/BaseDrawer.vue'
import { MARKET_INDEX_LABELS, TECH_LABELS } from '@/shared/constants/funds'
import { fetchJson } from '@/shared/infrastructure/http'
import {
  asNumber,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  movementClass,
} from '@/shared/lib/format'
import { useDataStore } from '@/stores/data'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { FearGreedData, KlineData, NasdaqHistory } from '@/types/data'
import { DCA_BANDS, strategyOf } from '@/shared/lib/dca'
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
let liveTimer: number | null = null
let liveBootTimer: number | null = null
let sectionObserver: IntersectionObserver | null = null

const positiveColor = computed(() => settings.colorMode === 'green-up' ? '#067647' : '#d92d20')
const negativeColor = computed(() => settings.colorMode === 'green-up' ? '#d92d20' : '#067647')
const market = computed(() => data.market)
function quoteFor(key: string) {
  const base = market.value?.market_indices.items[key]
  const live = data.liveIndices[key]
  if (!base) return undefined
  return live
    ? { ...base, price: live.price, change_pct: live.changePct, as_of: data.indexLiveUpdatedAt.slice(0, 10) || base.as_of }
    : base
}

const indexItems = computed(() => Object.entries(market.value?.market_indices.items ?? {})
  .filter(([key]) => key !== 'au9999')
  .map(([key, quote]) => [key, data.liveIndices[key]
    ? { ...quote, price: data.liveIndices[key].price, change_pct: data.liveIndices[key].changePct }
    : quote] as const))
const techItems = computed(() => Object.entries(market.value?.big_tech.items ?? {}))
const fxItems = computed(() => ['fxUSDCNY', 'fxUSDJPY', 'fxCNYHKD', 'fxUSDHKD']
  .map((key) => [key, market.value?.fx.items[key]] as const)
  .filter(([, item]) => Boolean(item)))
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
      itemStyle: { color: item.return_pct >= 0 ? positiveColor.value : negativeColor.value },
    })) ?? [],
    barMaxWidth: 12,
  }],
}))

const monthLabels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const annualHeatSummary = computed(() => {
  const rows = nasdaq.value?.annual ?? []
  const valid = rows.filter((item) => Number.isFinite(item.return_pct))
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
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
}

function heatCellStyle(value: unknown): Record<string, string> {
  const number = asNumber(value)
  const strength = number === null ? 0 : Math.min(Math.abs(number) / 15, 1)
  return { '--heat-alpha': `${Math.round(8 + strength * 40)}%` }
}

async function refreshLive(): Promise<void> {
  await data.refreshIndexQuotes()
  if (data.indexLiveError) ui.toast(data.indexLiveError, 'error')
  else ui.toast('指数实时行情已刷新', 'success')
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
    color: [settings.resolvedTheme === 'dark' ? '#4fd1c5' : '#0f766e'],
    grid: { left: 16, right: 18, top: 34, bottom: 64, containLabel: true },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: number) => formatNumber(value),
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', height: 18, bottom: 12, borderColor: 'transparent' },
    ],
    xAxis: {
      type: 'category',
      data: filteredKline.value.dates,
      axisLabel: { hideOverlap: true, formatter: (value: string) => value.slice(2, 7) },
    },
    yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { opacity: 0.18 } } },
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
            { offset: 0, color: settings.resolvedTheme === 'dark' ? 'rgba(79,209,197,.32)' : 'rgba(15,118,110,.24)' },
            { offset: 1, color: 'rgba(15,118,110,0)' },
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
        <span v-if="market" class="data-stamp">快照 {{ formatDateTime(market.generated_at) }}</span>
        <span v-if="data.indexLiveError" class="live-status is-error" role="status">实时失败 · 已回退快照</span>
        <span v-else-if="data.indexLiveUpdatedAt" class="live-status" role="status">实时 {{ formatDateTime(data.indexLiveUpdatedAt) }}</span>
        <button class="button button-secondary" type="button" :disabled="data.indexLiveLoading" @click="refreshLive">
          <Radio :size="15" :class="{ spin: data.indexLiveLoading }" aria-hidden="true" /> 实时指数
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
              <div class="eyebrow">市场温度</div>
              <h2>{{ market.temperature.verdict }}</h2>
              <p>{{ market.temperature.summary }}</p>
            </div>
          </div>
          <div class="market-pulse-grid">
            <article class="pulse-card">
              <span>纳斯达克100</span>
              <strong class="mono">{{ formatNumber(quoteFor('100.NDX100')?.price) }}</strong>
              <small :class="movementClass(quoteFor('100.NDX100')?.change_pct)">
                {{ formatPercent(quoteFor('100.NDX100')?.change_pct) }}
              </small>
            </article>
            <article class="pulse-card">
              <span>VIX</span>
              <strong class="mono">{{ formatNumber(market.macro.vix.value) }}</strong>
              <small>{{ formatDate(market.macro.vix.as_of) }}</small>
            </article>
            <article class="pulse-card">
              <span>美国 10 年</span>
              <strong class="mono">{{ formatNumber(market.macro.treasury_10y.value) }}%</strong>
              <small>{{ formatDate(market.macro.treasury_10y.as_of) }}</small>
            </article>
            <article class="pulse-card">
              <span>纳指 PE</span>
              <strong class="mono">{{ formatNumber(market.macro.ndx_pe.value) }}</strong>
              <small>{{ formatDate(market.macro.ndx_pe.as_of) }}</small>
            </article>
          </div>
        </section>

        <section id="market-global" class="section">
          <div class="section-header">
            <div>
              <div class="eyebrow">全球指数</div>
              <h2>全球市场</h2>
              <p>点击指数查看多区间历史走势和每日收盘明细。</p>
            </div>
            <span class="badge">{{ indexItems.length }} 个指数</span>
          </div>
          <div class="index-grid">
            <button
              v-for="[key, quote] in indexItems"
              :key="key"
              class="index-card"
              type="button"
              @click="openIndex(key)"
            >
              <span class="index-name">{{ MARKET_INDEX_LABELS[key] || key }} <ChevronRight :size="13" aria-hidden="true" /></span>
              <strong class="mono">{{ formatNumber(quote.price) }}</strong>
              <span class="mono" :class="movementClass(quote.change_pct)">{{ formatPercent(quote.change_pct) }}</span>
              <small>{{ formatDate(quote.as_of) }}</small>
            </button>
          </div>
        </section>

        <section class="market-split-grid">
          <article class="panel">
            <header class="panel-header">
              <div><h3>科技七姐妹</h3><p class="inline-note">最近收盘快照</p></div>
              <Activity :size="17" aria-hidden="true" />
            </header>
            <div class="market-list">
              <div v-for="[key, quote] in techItems" :key="key" class="market-list-row">
                <div><strong>{{ TECH_LABELS[key] || key }}</strong><span class="mono">{{ key.replace('us', '') }}</span></div>
                <span class="mono">{{ formatNumber(quote.price) }}</span>
                <span class="mono" :class="movementClass(quote.change_pct)">{{ formatPercent(quote.change_pct) }}</span>
              </div>
            </div>
          </article>

          <article class="panel">
            <header class="panel-header">
              <div><h3>品牌金价</h3><p class="inline-note">{{ market.brand_gold.as_of }}</p></div>
              <Landmark :size="17" aria-hidden="true" />
            </header>
            <div class="market-list">
              <div v-for="item in market.brand_gold.brands.slice(0, 7)" :key="item.brand" class="market-list-row gold-row">
                <strong>{{ item.brand }}</strong>
                <span class="mono">{{ formatNumber(item.ornament, 0) }}</span>
                <span class="mono muted">{{ formatNumber(item.investment_bar, 0) }}</span>
              </div>
            </div>
          </article>
          <article class="panel gold-market-panel">
            <header class="panel-header">
              <div><h3>黄金多市场</h3><p class="inline-note">{{ market.gold.as_of }}</p></div>
              <Landmark :size="17" aria-hidden="true" />
            </header>
            <div class="gold-market-grid">
              <div><span>上海金 au9999</span><strong class="mono">{{ formatNumber(market.gold.au9999.price) }}</strong><small>元 / 克</small></div>
              <div><span>XAU / USD</span><strong class="mono">{{ formatNumber(market.gold.xau.price) }}</strong><small :class="movementClass(market.gold.xau.change_pct)">{{ formatPercent(market.gold.xau.change_pct) }}</small></div>
              <div><span>折合国内价</span><strong class="mono">{{ formatNumber(market.gold.converted_cny_per_gram.value) }}</strong><small>元 / 克</small></div>
              <div><span>国内溢价</span><strong class="mono">{{ formatPercent(market.gold.premium_pct.value) }}</strong><small>{{ market.gold.premium_pct.as_of || '源数据缺失' }}</small></div>
            </div>
          </article>
        </section>

        <section id="market-macro" class="section">
          <div class="section-header">
            <div>
              <div class="eyebrow">利率与汇率</div>
              <h2>宏观与汇率</h2>
              <p>利率与汇率读数用于理解 QDII 的估值和汇率敞口。</p>
            </div>
          </div>
          <div class="macro-grid">
            <article v-for="item in [
              ['美国 2 年', market.macro.treasury_2y, '%'],
              ['美国 10 年', market.macro.treasury_10y, '%'],
              ['美国 30 年', market.macro.treasury_30y, '%'],
              ['美元指数', market.macro.dxy, ''],
              ['VIX', market.macro.vix, ''],
              ['纳指 PE', market.macro.ndx_pe, ''],
            ]" :key="item[0]" class="metric-card">
              <span class="metric-label">{{ item[0] }}</span>
              <strong class="metric-value">{{ formatNumber(item[1].value) }}{{ item[2] }}</strong>
              <span class="metric-meta">{{ formatDate(item[1].as_of) }}</span>
            </article>
          </div>
          <div class="fx-strip">
            <div v-for="[key, item] in fxItems" :key="key" class="fx-item">
              <span>{{ key.replace('fx', '').replace('USD', 'USD / ').replace('CNY', 'CNY') }}</span>
              <strong class="mono">{{ formatNumber(item?.price, 4) }}</strong>
              <small class="mono" :class="movementClass(item?.change_pct)">{{ formatPercent(item?.change_pct) }}</small>
            </div>
          </div>
        </section>

        <section id="market-nasdaq" class="section">
          <div class="section-header">
            <div>
              <div class="eyebrow">纳指 100 历史</div>
              <h2>纳指分析</h2>
              <p v-if="nasdaq">年度涨跌与月历热力图覆盖 {{ nasdaq.range.first_year }}–{{ nasdaq.range.last_year }}。</p>
            </div>
            <span v-if="nasdaq" class="badge">{{ nasdaq.annual.length }} 年</span>
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
                  </div>
                  <div v-if="heatmapMode === 'year'" class="annual-heat-grid" role="list" aria-label="纳指年度涨跌热力图">
                    <article
                      v-for="item in nasdaq.annual"
                      :key="item.year"
                      class="annual-heat-cell"
                      :class="item.return_pct > 0 ? 'heat-up' : item.return_pct < 0 ? 'heat-down' : 'heat-flat'"
                      :style="heatCellStyle(item.return_pct)"
                      role="listitem"
                    >
                      <span>{{ item.year }}</span>
                      <strong>{{ formatPercent(item.return_pct) }}</strong>
                      <small>回撤 {{ formatPercent(item.max_drawdown_pct) }}</small>
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
                          <th scope="row">{{ nasdaq.heatmap.years[rowIndex] }}</th>
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
                  <Gauge :size="17" aria-hidden="true" />
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
            <article class="panel dca-panel">
              <header class="panel-header">
                <div><h3>VIX &amp; PE 阶梯定投</h3><p class="inline-note">使用当前恐慌贪婪、VIX 与纳指 PE 读数</p></div>
                <span class="badge" :class="`dca-${dca.band.tone}`">{{ dca.band.label }}</span>
              </header>
              <div class="panel-body dca-body">
                <div class="dca-verdict">
                  <span class="eyebrow">当前动作</span>
                  <h3>{{ dca.band.action }}</h3>
                  <p>{{ dca.band.strategy }}</p>
                  <div class="dca-checks">
                    <span class="badge" :class="dca.matched ? 'badge-accent' : 'badge-warn'">{{ dca.matched ? 'VIX 匹配' : 'VIX 偏离' }} · {{ dca.band.vixText }}</span>
                    <span class="badge">{{ dca.peLabel }}</span>
                  </div>
                  <p v-if="dca.note" class="inline-note">{{ dca.note }}</p>
                </div>
                <div class="dca-matrix" role="table" aria-label="VIX 与 PE 阶梯定投矩阵" tabindex="0">
                  <div class="dca-matrix-row dca-matrix-head" role="row"><span role="columnheader">情绪区间</span><span role="columnheader">状态</span><span role="columnheader">动作</span><span role="columnheader">策略</span></div>
                  <div v-for="band in DCA_BANDS" :key="band.key" class="dca-matrix-row" :class="{ active: dca.band.key === band.key }" role="row">
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
  </div>
</template>
