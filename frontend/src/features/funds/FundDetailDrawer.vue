<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CircleAlert, ExternalLink, History, Star, TrendingUp } from '@lucide/vue'
import BaseDrawer from '@/shared/components/BaseDrawer.vue'
import EChart from '@/shared/components/EChart.vue'
import type { FundRow } from '@/shared/lib/funds'
import { asNumber, daysSince, formatDate, formatFee, formatPercent, formatPrice, movementClass } from '@/shared/lib/format'
import { fetchJson } from '@/shared/infrastructure/http'
import type { BuyStatusHistory, HoldingsData, KlineData } from '@/types/data'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{
  open: boolean
  row: FundRow | null
}>()
const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()
const mode = ref<'overview' | 'trend' | 'holdings' | 'fees'>('overview')
const range = ref<'1m' | '3m' | '1y' | 'all'>('1y')
const history = ref<KlineData | null>(null)
const holdings = ref<HoldingsData | null>(null)
const loading = ref(false)
const loadError = ref('')
const isEtf = computed(() => props.row?.category === 'etf')
const defaultShare = computed(() => props.row?.defaultShare ?? null)
const navAge = computed(() => daysSince(defaultShare.value?.nav_date))
const buyStatusHistory = computed(() => {
  if (isEtf.value) return []
  return [...(defaultShare.value?.buy_status_history ?? [])]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 6)
})

const filteredHistory = computed(() => {
  if (!history.value) return []
  const dates = history.value.dates ?? []
  const values = history.value.navs ?? history.value.close ?? []
  const count = range.value === '1m' ? 22 : range.value === '3m' ? 66 : range.value === '1y' ? 252 : values.length
  return dates.slice(-count).map((date, index) => [date, values.slice(-count)[index]] as [string, number])
})

const trendOption = computed(() => ({
  animationDuration: 260,
  grid: { left: 12, right: 16, top: 24, bottom: 30, containLabel: true },
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: filteredHistory.value.map((item) => item[0]),
    axisLabel: { hideOverlap: true },
  },
  yAxis: {
    type: 'value',
    scale: true,
    splitLine: { lineStyle: { opacity: 0.22 } },
  },
  series: [{
    type: 'line',
    data: filteredHistory.value.map((item) => item[1]),
    showSymbol: false,
    smooth: false,
    lineStyle: { width: 1.8 },
    areaStyle: { opacity: 0.08 },
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

function setRange(value: string): void {
  if (value === '1m' || value === '3m' || value === '1y' || value === 'all') {
    range.value = value
  }
}
</script>

<template>
  <BaseDrawer
    :open="open && Boolean(row)"
    :title="row?.display_name ?? '基金详情'"
    eyebrow="Fund detail"
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
          <span class="badge" :class="statusTone()">{{ defaultShare.buy_status || '场内交易' }}</span>
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
          <div v-for="item in [
            ['近 1 月', defaultShare.chg_1m],
            ['今年来', defaultShare.chg_ytd],
            ['近 1 年', defaultShare.chg_1y],
            ['成立来', defaultShare.chg_since_inception],
            ['规模', row.series_scale],
          ]" :key="item[0]" class="metric-card">
            <span class="metric-label">{{ item[0] }}</span>
            <strong class="metric-value" :class="item[0] === '规模' ? '' : movementClass(item[1])">
              {{ item[0] === '规模' ? (asNumber(item[1]) ? `${asNumber(item[1])?.toFixed(0)}亿` : '--') : formatPercent(item[1]) }}
            </strong>
          </div>
        </div>
        <section class="purchase-history-block" aria-labelledby="purchase-history-title">
          <div class="section-header purchase-history-heading">
            <div>
              <h3 id="purchase-history-title">申购状态变化</h3>
              <p>默认份额 · {{ defaultShare.currency }} · 由新到旧</p>
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
        <div class="table-shell">
          <table class="data-table compact">
            <thead>
              <tr><th>代码</th><th>份额</th><th class="align-right">净值</th><th class="align-right">近 1 年</th><th>申购</th></tr>
            </thead>
            <tbody>
              <tr v-for="share in row.shares" :key="share.code">
                <td class="mono">{{ share.code }}</td>
                <td>{{ share.name }}</td>
                <td class="align-right mono">{{ formatPrice(share.nav ?? share.etf_price) }}</td>
                <td class="align-right mono" :class="movementClass(share.chg_1y)">{{ formatPercent(share.chg_1y) }}</td>
                <td><span class="badge">{{ share.buy_status || '--' }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else-if="mode === 'trend'" class="detail-section">
        <div class="section-header">
          <div>
            <h3>历史净值</h3>
            <p v-if="history">更新于 {{ formatDate(history.updated_at) }}</p>
          </div>
          <div class="segmented" role="group" aria-label="走势区间">
            <button v-for="item in [['1m', '1月'], ['3m', '3月'], ['1y', '1年'], ['all', '全部']]" :key="item[0]" type="button" :class="{ active: range === item[0] }" @click="setRange(item[0])">{{ item[1] }}</button>
          </div>
        </div>
        <div v-if="loading" class="page-state">正在加载走势...</div>
        <EChart v-else-if="filteredHistory.length" :option="trendOption" label="历史净值走势图" height="320px" />
        <div v-else class="page-state">
          <TrendingUp :size="18" aria-hidden="true" />
          暂无可用走势数据
        </div>
      </section>

      <section v-else-if="mode === 'holdings'" class="detail-section">
        <div class="section-header">
          <div>
            <h3>前十大重仓</h3>
            <p v-if="holdings">{{ holdings.latest_quarter }} · 合计权重 {{ holdings.total_weight.toFixed(2) }}%</p>
          </div>
        </div>
        <div v-if="loading" class="page-state">正在加载持仓...</div>
        <div v-else-if="holdings?.holdings.length" class="table-shell">
          <table class="data-table compact">
            <thead><tr><th>#</th><th>股票</th><th class="align-right">权重</th><th class="align-right">市值</th></tr></thead>
            <tbody>
              <tr v-for="stock in holdings.holdings" :key="stock.stock_code">
                <td class="muted">{{ stock.rank }}</td>
                <td><strong>{{ stock.stock_name }}</strong><span class="mono muted"> {{ stock.stock_code }}</span></td>
                <td class="align-right mono">{{ stock.weight.toFixed(2) }}%</td>
                <td class="align-right mono">{{ stock.market_value ? stock.market_value.toFixed(0) : '--' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="page-state">该基金暂未抓取到持仓数据。</div>
      </section>

      <section v-else class="detail-section">
        <h3>费率与申赎规则</h3>
        <div class="metric-grid">
          <div class="metric-card"><span class="metric-label">管理费</span><strong class="metric-value">{{ formatFee(defaultShare.mgmt_fee) }}</strong></div>
          <div class="metric-card"><span class="metric-label">托管费</span><strong class="metric-value">{{ formatFee(defaultShare.custody_fee) }}</strong></div>
          <div class="metric-card"><span class="metric-label">首次买入</span><strong class="metric-value">{{ formatFee(defaultShare.first_buy_rate) }}</strong></div>
        </div>
        <div class="fee-block">
          <h4>买入规则</h4>
          <div v-for="rule in defaultShare.buy_rules ?? []" :key="rule.condition" class="fee-rule">
            <span>{{ rule.condition }}</span><strong class="mono">{{ formatFee(rule.rate) }}</strong>
          </div>
          <p v-if="!defaultShare.buy_rules?.length" class="muted">暂无公开买入规则。</p>
        </div>
        <div class="fee-block">
          <h4>卖出规则</h4>
          <div v-for="rule in defaultShare.sell_rules ?? []" :key="rule.condition" class="fee-rule">
            <span>{{ rule.condition }}</span><strong class="mono">{{ formatFee(rule.rate) }}</strong>
          </div>
          <p v-if="!defaultShare.sell_rules?.length" class="muted">场内交易无基金申赎规则。</p>
        </div>
        <a
          class="button button-secondary"
          :href="`https://fund.eastmoney.com/${defaultShare.code}.html`"
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink :size="15" aria-hidden="true" /> 查看基金公司公开页面
        </a>
      </section>
    </template>
  </BaseDrawer>
</template>
