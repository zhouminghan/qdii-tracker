<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, ChevronRight, CircleAlert, Gauge, Globe2, Landmark, Radio, TrendingUp } from '@lucide/vue'
import DataState from '@/shared/components/DataState.vue'
import EChart from '@/shared/components/EChart.vue'
import BaseDrawer from '@/shared/components/BaseDrawer.vue'
import { MARKET_INDEX_LABELS, TECH_LABELS } from '@/shared/constants/funds'
import { fetchJson } from '@/shared/infrastructure/http'
import {
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
const activeMarketSection = ref('market-overview')
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

const heatmapOption = computed(() => {
  const values: Array<[number, number, number]> = []
  nasdaq.value?.heatmap.rows.forEach((row, yearIndex) => {
    row.forEach((value, monthIndex) => values.push([monthIndex, yearIndex, value]))
  })
  return {
    animationDuration: 220,
    grid: { left: 42, right: 52, top: 12, bottom: 28 },
    tooltip: {
      position: 'top',
      formatter: (params: { value: [number, number, number] }) => {
        const [month, year, value] = params.value
        return `${nasdaq.value?.heatmap.years[year]} 年 ${month + 1} 月<br/>${value > 0 ? '+' : ''}${value.toFixed(2)}%`
      },
    },
    xAxis: {
      type: 'category',
      data: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category',
      data: nasdaq.value?.heatmap.years ?? [],
      axisLabel: { interval: 2 },
      splitArea: { show: true },
    },
    visualMap: {
      min: -20,
      max: 20,
      calculable: false,
      orient: 'vertical',
      right: 4,
      top: 'middle',
      text: ['涨', '跌'],
      inRange: { color: [negativeColor.value, '#f5f5f5', positiveColor.value] },
    },
    series: [{ type: 'heatmap', data: values, emphasis: { itemStyle: { borderColor: '#111318', borderWidth: 1 } } }],
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

async function refreshLive(): Promise<void> {
  await data.refreshIndexQuotes()
  if (data.indexLiveError) ui.toast(data.indexLiveError, 'error')
  else ui.toast('指数实时行情已刷新', 'success')
}

const klineOption = computed(() => {
  const values = kline.value?.close?.slice(-180) ?? []
  return {
    animationDuration: 220,
    grid: { left: 10, right: 12, top: 18, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: kline.value?.dates?.slice(-180) ?? [],
      axisLabel: { hideOverlap: true },
    },
    yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { opacity: 0.18 } } },
    series: [{
      type: 'line',
      data: values,
      showSymbol: false,
      lineStyle: { width: 1.8 },
      areaStyle: { opacity: 0.07 },
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
        <div class="eyebrow">Market intelligence</div>
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
              <div class="eyebrow">Market temperature</div>
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
              <div class="eyebrow">Global indices</div>
              <h2>全球市场</h2>
              <p>点击指数查看近 180 个交易日走势。</p>
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
              <div class="eyebrow">Rates & currencies</div>
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
              <div class="eyebrow">NASDAQ 100 history</div>
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
                  <div><h3>月度热力图</h3><p class="inline-note">颜色表达强度，悬停读取精确数值。</p></div>
                  <Globe2 :size="17" aria-hidden="true" />
                </header>
                <div class="panel-body">
                  <EChart v-if="nasdaq" :option="heatmapOption" label="纳斯达克月度涨跌热力图" height="520px" />
                </div>
              </article>
              <article class="panel">
                <header class="panel-header">
                  <div><h3>情绪与风险</h3><p class="inline-note">CNN Fear &amp; Greed</p></div>
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
                  <span class="eyebrow">Current action</span>
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
      eyebrow="Market series"
      width="min(820px, 100vw)"
      @close="selectedIndex = ''"
    >
      <div v-if="klineLoading" class="page-state">正在加载走势...</div>
      <EChart
        v-else-if="kline"
        :option="klineOption"
        :label="`${MARKET_INDEX_LABELS[selectedIndex] || selectedIndex} 历史走势`"
        height="460px"
      />
      <div v-else class="page-state">暂无该指数历史走势数据。</div>
    </BaseDrawer>
  </div>
</template>
