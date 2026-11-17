<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CircleAlert, ExternalLink, History, Star, TrendingUp } from '@lucide/vue'
import BaseDrawer from '@/shared/components/BaseDrawer.vue'
import EChart from '@/shared/components/EChart.vue'
import FundShareComparisonTable from '@/features/funds/FundShareComparisonTable.vue'
import {
  buyStatusLabel,
  dailyLimitDisplay,
  dailyLimitTitle,
  limitScopeLabel,
  type FundRow,
} from '@/shared/lib/funds'
import { lineTooltipFormatter } from '@/shared/lib/chart-tooltip'
import { asNumber, daysSince, formatDate, formatPercent, formatPrice, movementClass, movementSurfaceClass } from '@/shared/lib/format'
import { annualFeeDetail, cleanRuleCondition, formatHoldPeriod, formatRuleRate, freeHoldDays, sellRuleLabel, totalAnnualFee } from '@/shared/lib/fund-rules'
import { performanceDisplay, type PerformanceKey } from '@/shared/lib/performance'
import { dailyChange, filterTimeSeries, TIME_RANGES, type TimeRange } from '@/shared/lib/time-series'
import { fetchJson } from '@/shared/infrastructure/http'
import type { BuyStatusHistory, FundShare, HoldingItem, HoldingsData, KlineData } from '@/types/data'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{
  open: boolean
  row: FundRow | null
}>()
const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()
const mode = ref<'overview' | 'trend' | 'holdings' | 'fees'>('overview')
const range = ref<TimeRange>('1y')
const history = ref<KlineData | null>(null)
const holdings = ref<HoldingsData | null>(null)
const loading = ref(false)
const loadError = ref('')
const selectedFeeShareCode = ref('')
const isEtf = computed(() => props.row?.category === 'etf')
const defaultShare = computed(() => props.row?.defaultShare ?? null)
const feeShare = computed(() => {
  if (!props.row) return null
  return props.row.shares.find((share) => share.code === selectedFeeShareCode.value)
    ?? props.row.shares.find((share) => share.code === props.row?.default_share_code)
    ?? props.row.shares[0]
    ?? null
})
const navAge = computed(() => daysSince(defaultShare.value?.nav_date))
const buyStatusHistory = computed(() => {
  if (isEtf.value) return []
  return [...(defaultShare.value?.buy_status_history ?? [])]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 6)
})
function historyReturn(calendarDays: number): number | null {
  const payload = history.value
  if (!payload) return null
  const dates = payload.dates ?? []
  const values = payload.navs ?? payload.close
  if (!dates.length || !values?.length) return null
  const latestDate = Date.parse(`${dates[dates.length - 1]}T00:00:00Z`)
  if (Number.isNaN(latestDate)) return null
  const target = new Date(latestDate - calendarDays * 86_400_000).toISOString().slice(0, 10)
  let baseIndex = -1
  for (let index = 0; index < dates.length - 1; index += 1) {
    if (dates[index] <= target) baseIndex = index
  }
  if (baseIndex < 0) return null
  const latest = asNumber(values[values.length - 1])
  const base = asNumber(values[baseIndex])
  if (latest === null || base === null || base <= 0) return null
  return ((latest / base) - 1) * 100
}

const performanceMetrics = computed(() => {
  const share = defaultShare.value
  if (!share) return []
  return [
    { label: '近 1 周', key: 'chg_1w' as PerformanceKey, value: share.chg_1w ?? historyReturn(7) },
    { label: '近 1 月', key: 'chg_1m' as PerformanceKey, value: share.chg_1m ?? historyReturn(30) },
    { label: '近 3 月', key: 'chg_3m' as PerformanceKey, value: share.chg_3m ?? historyReturn(90) },
    { label: '近 6 月', key: 'chg_6m' as PerformanceKey, value: share.chg_6m ?? historyReturn(180) },
    { label: '今年来', key: 'chg_ytd' as PerformanceKey, value: share.chg_ytd },
    { label: '近 1 年', key: 'chg_1y' as PerformanceKey, value: share.chg_1y ?? historyReturn(365) },
    { label: '近 2 年', key: 'chg_2y' as PerformanceKey, value: share.chg_2y ?? historyReturn(730) },
    { label: '近 3 年', key: 'chg_3y' as PerformanceKey, value: share.chg_3y ?? historyReturn(1095) },
    { label: '成立来', key: 'chg_since_inception' as PerformanceKey, value: share.chg_since_inception },
    { label: '基金规模', value: props.row?.series_scale, scale: true },
  ]
})
const annualFeeRate = computed(() => feeShare.value ? totalAnnualFee(feeShare.value) : 0)
const holdFreeDays = computed(() => feeShare.value ? freeHoldDays(feeShare.value) : null)
const holdingsQuarters = computed(() => Object.keys(holdings.value?.all_quarters ?? {}).sort().reverse())
const previousHoldingsQuarter = computed(() => {
  const latest = holdings.value?.latest_quarter
  return holdingsQuarters.value.find((quarter) => quarter !== latest) ?? null
})
const previousHoldingByCode = computed(() => new Map(
  (previousHoldingsQuarter.value
    ? holdings.value?.all_quarters?.[previousHoldingsQuarter.value] ?? []
    : []
  ).map((item) => [item.stock_code, item]),
))

const filteredSeries = computed(() => {
  if (!history.value) return { startIndex: 0, dates: [], values: [] }
  const dates = history.value.dates ?? []
  const values = history.value.navs ?? history.value.close ?? []
  return filterTimeSeries(dates, values, range.value)
})

const historyTableRows = computed(() => {
  const fullValues = history.value?.navs ?? history.value?.close ?? []
  return filteredSeries.value.dates.map((date, index) => {
    const absoluteIndex = filteredSeries.value.startIndex + index
    const value = filteredSeries.value.values[index]
    return {
      date,
      value,
      change: dailyChange(value, fullValues[absoluteIndex - 1]),
    }
  }).slice(-30).reverse()
})

const trendOption = computed(() => ({
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
      filteredSeries.value.dates,
      filteredSeries.value.values,
      (value) => value.toFixed(4),
      '单位净值',
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
    data: filteredSeries.value.dates,
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
    axisLabel: {
      color: settings.resolvedTheme === 'dark' ? '#b1bac7' : '#4b5563',
      formatter: (value: number) => value.toFixed(2),
    },
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
    data: filteredSeries.value.values,
    showSymbol: false,
    smooth: false,
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
}))

async function loadDetail(): Promise<void> {
  const row = props.row
  if (!row) return
  const code = row.default_share_code
  loading.value = true
  loadError.value = ''
  try {
    const tasks: Array<Promise<void>> = []
    tasks.push(
      fetchJson<KlineData>(`data/nav-history/${code}.json`)
        .then((value) => { history.value = value })
        .catch(() => { history.value = null }),
    )
    if (!isEtf.value) {
      tasks.push(
        fetchJson<HoldingsData>(`data/holdings/${code}.json`)
          .then((value) => { holdings.value = value })
          .catch(() => { holdings.value = null }),
      )
    }
    await Promise.all(tasks)
  } catch (reason) {
    loadError.value = reason instanceof Error ? reason.message : '详情加载失败'
  } finally {
    loading.value = false
  }
}

watch(() => [props.open, props.row?.default_share_code], ([open]) => {
  if (open) {
    mode.value = 'overview'
    range.value = '1y'
    selectedFeeShareCode.value = props.row?.default_share_code ?? ''
    history.value = null
    holdings.value = null
    void loadDetail()
  }
}, { immediate: true })

function statusTone(status = defaultShare.value?.buy_status): string {
  if (!status) return ''
  if (status.includes('暂停')) return 'badge-danger'
  if (status.includes('限')) return 'badge-warn'
  return 'badge-accent'
}

function isCurrentHistoryEntry(entry: BuyStatusHistory, index: number): boolean {
  const share = defaultShare.value
  return index === 0
    && share?.buy_status === entry.buy_status
    && share.daily_limit === entry.daily_limit
}

function historyLimitText(entry: BuyStatusHistory): string {
  if (entry.buy_status.includes('暂停')) return '暂停申购，无可用额度'
  const limit = asNumber(entry.daily_limit)
  if (limit === null || limit <= 0) {
    if (entry.buy_status.includes('限')) return '限购额度未公布'
    if (entry.buy_status.includes('开放')) return '不限额'
    return '额度未提供'
  }
  const currency = defaultShare.value?.currency
  const unit = currency === '美元' ? '美元' : currency === '人民币' ? '元' : currency ?? ''
  const amount = limit.toLocaleString('zh-CN', {
    minimumFractionDigits: Number.isInteger(limit) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return unit ? `${amount} ${unit}` : amount
}

function setRange(value: TimeRange): void {
  range.value = value
}

function shareBuyFee(share: FundShare): string {
  if (share.first_buy_rate == null) return '--'
  return formatRuleRate(share.first_buy_rate, true)
}

function holdingWeightChange(item: HoldingItem): number | null {
  const previous = previousHoldingByCode.value.get(item.stock_code)
  return previous ? item.weight - previous.weight : null
}

function holdingChangeLabel(item: HoldingItem): string {
  if (!previousHoldingsQuarter.value) return '--'
  const change = holdingWeightChange(item)
  if (change === null) return '新进'
  if (Math.abs(change) < 0.005) return '持平'
  return `${change > 0 ? '+' : ''}${change.toFixed(2)}pct`
}

function holdingChangeClass(item: HoldingItem): string {
  const change = holdingWeightChange(item)
  return change === null ? 'is-flat' : movementClass(change)
}
</script>

<template>
  <BaseDrawer
    :open="open && Boolean(row)"
    :title="row?.display_name ?? '基金详情'"
    eyebrow="基金详情"
    width="min(760px, 100vw)"
    @close="emit('close')"
  >
    <template v-if="row && defaultShare">
      <div class="detail-hero">
        <div class="detail-identity">
          <div class="fund-logo" :style="{ background: `${row.company ? '#506070' : '#506070'}18` }">
            {{ row.company?.slice(0, 1) || '基' }}
          </div>
          <div>
            <div class="detail-price-row">
              <strong class="detail-price">
                {{ formatPrice(isEtf ? defaultShare.etf_price ?? defaultShare.nav : defaultShare.nav, isEtf) }}
              </strong>
              <span :class="movementClass(isEtf ? defaultShare.etf_change_pct ?? defaultShare.daily_change : defaultShare.daily_change)">
                {{ formatPercent(isEtf ? defaultShare.etf_change_pct ?? defaultShare.daily_change : defaultShare.daily_change) }}
              </span>
            </div>
            <div class="detail-meta">
              <span>{{ defaultShare.code }}</span>
              <span>{{ row.company }}</span>
              <span>{{ defaultShare.share_class }} 类</span>
              <span v-if="defaultShare.currency === '美元'">美元份额</span>
            </div>
          </div>
        </div>
        <div class="detail-actions">
          <button
            class="button"
            type="button"
            :aria-pressed="settings.isFavorite(defaultShare.code)"
            @click="settings.toggleFavorite(defaultShare.code)"
          >
            <Star :size="15" :fill="settings.isFavorite(defaultShare.code) ? 'currentColor' : 'none'" aria-hidden="true" />
            {{ settings.isFavorite(defaultShare.code) ? '已收藏' : '收藏' }}
          </button>
          <span class="badge" :class="statusTone()" :title="defaultShare.buy_status || '场内交易'">{{ buyStatusLabel(defaultShare) }}</span>
        </div>
      </div>

      <div v-if="navAge !== null && navAge >= 1" class="notice notice-warn">
        <CircleAlert :size="15" aria-hidden="true" />
        净值日期 {{ formatDate(defaultShare.nav_date) }}，距今 {{ navAge }} 天。
      </div>

      <div class="segmented detail-tabs" role="tablist" aria-label="详情视图">
        <button type="button" :class="{ active: mode === 'overview' }" role="tab" :aria-selected="mode === 'overview'" @click="mode = 'overview'">概览</button>
        <button type="button" :class="{ active: mode === 'trend' }" role="tab" :aria-selected="mode === 'trend'" @click="mode = 'trend'">走势</button>
        <button v-if="!isEtf" type="button" :class="{ active: mode === 'holdings' }" role="tab" :aria-selected="mode === 'holdings'" @click="mode = 'holdings'">持仓</button>
        <button type="button" :class="{ active: mode === 'fees' }" role="tab" :aria-selected="mode === 'fees'" @click="mode = 'fees'">费率</button>
      </div>

      <div v-if="loadError" class="notice notice-danger">{{ loadError }}</div>

      <section v-if="mode === 'overview'" class="detail-section">
        <h3>业绩表现</h3>
        <div class="metric-grid">
          <div
            v-for="item in performanceMetrics"
            :key="item.label"
            class="metric-card"
            :class="item.scale ? 'surface-flat' : movementSurfaceClass(item.value)"
          >
            <span class="metric-label">{{ item.label }}</span>
            <strong class="metric-value" :class="item.scale ? '' : movementClass(item.value)">
              {{ item.scale
                ? (asNumber(item.value) ? `${asNumber(item.value)?.toFixed(0)}亿` : '--')
                : item.key ? performanceDisplay(item.value, item.key, defaultShare) : '--' }}
            </strong>
          </div>
        </div>
        <section class="purchase-history-block" aria-labelledby="purchase-history-title">
          <div class="section-header purchase-history-heading">
            <div>
              <h3 id="purchase-history-title">申购状态变化</h3>
              <p :title="dailyLimitTitle(defaultShare)">
                默认份额 · {{ defaultShare.currency }}
                <template v-if="!isEtf"> · 单日限购 {{ dailyLimitDisplay(defaultShare) }} · {{ limitScopeLabel(defaultShare) }}</template>
                · 由新到旧
              </p>
            </div>
            <span class="badge" :class="statusTone()">{{ defaultShare.buy_status || '--' }}</span>
          </div>
          <ol
            v-if="buyStatusHistory.length"
            class="purchase-history-list"
            aria-label="申购状态变化记录，由新到旧"
          >
            <li
              v-for="(entry, index) in buyStatusHistory"
              :key="`${entry.date}-${entry.buy_status}-${entry.daily_limit}-${index}`"
              class="purchase-history-item"
              :class="{ current: isCurrentHistoryEntry(entry, index) }"
              :aria-current="isCurrentHistoryEntry(entry, index) ? 'true' : undefined"
            >
              <div class="purchase-history-date">
                <time :datetime="entry.date">{{ entry.date }}</time>
                <span v-if="isCurrentHistoryEntry(entry, index)" class="purchase-history-current">当前</span>
              </div>
              <div class="purchase-history-event">
                <span class="badge" :class="statusTone(entry.buy_status)">{{ entry.buy_status }}</span>
                <span class="purchase-history-limit">
                  <span>单日限购</span>
                  <strong>{{ historyLimitText(entry) }}</strong>
                </span>
              </div>
            </li>
          </ol>
          <div v-else class="purchase-history-empty">
            <History :size="16" aria-hidden="true" />
            <span>{{ isEtf ? '场内 ETF，不适用申购额度变化记录。' : '暂无可用的申购状态变化记录。' }}</span>
          </div>
        </section>
        <h3>全部份额</h3>
        <FundShareComparisonTable
          :shares="row.shares"
          :default-code="row.default_share_code"
          :nav-date="defaultShare.nav_date"
        />
      </section>

      <section v-else-if="mode === 'trend'" class="detail-section">
        <div class="section-header">
          <div>
            <h3>历史净值</h3>
            <p v-if="history">更新于 {{ formatDate(history.updated_at) }}</p>
          </div>
          <div class="segmented trend-ranges" role="group" aria-label="走势区间">
            <button v-for="item in TIME_RANGES" :key="item.key" type="button" :class="{ active: range === item.key }" @click="setRange(item.key)">{{ item.label }}</button>
          </div>
        </div>
        <div v-if="loading" class="page-state">正在加载走势...</div>
        <template v-else-if="filteredSeries.values.length">
          <EChart :option="trendOption" label="历史净值走势图" height="380px" />
          <div class="table-shell trend-history-shell">
            <table class="data-table compact">
              <thead><tr><th>日期</th><th class="align-right">单位净值</th><th class="align-right">日涨跌</th></tr></thead>
              <tbody>
                <tr v-for="point in historyTableRows" :key="point.date">
                  <td class="mono">{{ point.date }}</td>
                  <td class="align-right mono">{{ point.value.toFixed(4) }}</td>
                  <td class="align-right mono" :class="movementClass(point.change)">{{ formatPercent(point.change) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <div v-else class="page-state">
          <TrendingUp :size="18" aria-hidden="true" />
          暂无可用走势数据
        </div>
      </section>

      <section v-else-if="mode === 'holdings'" class="detail-section">
        <div class="section-header">
          <div>
            <h3>前十大重仓</h3>
            <p v-if="holdings">
              {{ holdings.latest_quarter }}
              <template v-if="previousHoldingsQuarter"> · 对比 {{ previousHoldingsQuarter }}</template>
              · 合计权重 {{ holdings.total_weight.toFixed(2) }}%
            </p>
          </div>
        </div>
        <div v-if="loading" class="page-state">正在加载持仓...</div>
        <div v-else-if="holdings?.holdings.length" class="table-shell">
          <table class="data-table compact">
            <thead><tr><th>#</th><th>股票</th><th class="align-right">权重</th><th class="align-right">较上季</th><th class="align-right">市值</th></tr></thead>
            <tbody>
              <tr v-for="stock in holdings.holdings" :key="stock.stock_code">
                <td class="muted">{{ stock.rank }}</td>
                <td><strong>{{ stock.stock_name }}</strong><span class="mono muted stock-code"> · {{ stock.stock_code }}</span></td>
                <td class="align-right mono">{{ stock.weight.toFixed(2) }}%</td>
                <td class="align-right mono" :class="holdingChangeClass(stock)">{{ holdingChangeLabel(stock) }}</td>
                <td class="align-right mono">{{ stock.market_value ? stock.market_value.toFixed(0) : '--' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="page-state">该基金暂未抓取到持仓数据。</div>
      </section>

      <section v-else class="detail-section">
        <h3>费率与申赎规则</h3>
        <div class="chip-row" role="group" aria-label="选择费率份额">
          <button
            v-for="share in row.shares"
            :key="share.code"
            class="chip"
            :class="{ active: feeShare?.code === share.code }"
            type="button"
            :aria-pressed="feeShare?.code === share.code"
            @click="selectedFeeShareCode = share.code"
          >
            {{ share.share_class }} · {{ share.code }}
          </button>
        </div>
        <template v-if="feeShare">
          <div class="metric-grid">
            <div class="metric-card"><span class="metric-label">首档买入费</span><strong class="metric-value">{{ shareBuyFee(feeShare) }}</strong><small class="metric-meta">代销平台通常 1 折</small></div>
            <div class="metric-card"><span class="metric-label">综合年费率</span><strong class="metric-value">{{ annualFeeRate > 0 ? `${parseFloat(annualFeeRate.toFixed(2))}%` : '--' }}</strong><small class="metric-meta">{{ annualFeeDetail(feeShare) }}</small></div>
            <div class="metric-card"><span class="metric-label">免赎回费持有期</span><strong class="metric-value">{{ formatHoldPeriod(holdFreeDays) }}</strong><small class="metric-meta">{{ feeShare.free_hold_days ? '基金公开费率' : '按卖出规则末档推算' }}</small></div>
          </div>
          <div class="fee-block fee-rule-block">
            <div class="fee-block-heading">
              <h4>买入规则</h4>
              <span>{{ feeShare.share_class }} 类 · 原费率 / 代销 1 折</span>
            </div>
            <div v-for="rule in feeShare.buy_rules ?? []" :key="rule.condition" class="fee-rule fee-rule-detailed">
              <span>{{ cleanRuleCondition(rule.condition) }}</span>
              <span class="fee-rule-rates">
                <del v-if="rule.rate > 0 && rule.rate < 100">{{ formatRuleRate(rule.rate) }}</del>
                <strong class="mono" :class="{ 'fee-free': rule.rate === 0 }">{{ formatRuleRate(rule.rate, true) }}</strong>
              </span>
            </div>
            <p v-if="!feeShare.buy_rules?.length" class="muted">暂无公开买入规则。</p>
          </div>
          <div class="fee-block fee-rule-block">
            <div class="fee-block-heading">
              <h4>卖出规则</h4>
              <span>{{ feeShare.share_class }} 类 · 按持有期限</span>
            </div>
            <div v-for="rule in feeShare.sell_rules ?? []" :key="rule.condition" class="fee-rule fee-rule-detailed">
              <span>{{ cleanRuleCondition(rule.condition) }}</span>
              <strong class="mono" :class="{ 'fee-free': rule.rate === 0 }">{{ sellRuleLabel(rule) }}</strong>
            </div>
            <p v-if="!feeShare.sell_rules?.length" class="muted">场内交易无基金申赎规则。</p>
          </div>
          <a
            class="button button-secondary"
            :href="`https://fund.eastmoney.com/${feeShare.code}.html`"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink :size="15" aria-hidden="true" /> 查看该份额公开页面
          </a>
        </template>
      </section>
    </template>
  </BaseDrawer>
</template>
