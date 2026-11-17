<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ChevronRight, LineChart, Star } from '@lucide/vue'
import type { FundSortKey, FundRow } from '@/shared/lib/funds'
import {
  buyStatusLabel,
  classifyBuyStatus,
  dailyLimitTitle,
  limitScopeShort,
  sortFundRows,
} from '@/shared/lib/funds'
import FundShareComparisonTable from '@/features/funds/FundShareComparisonTable.vue'
import { formatDate, formatPercent, formatPrice, movementClass, movementSurfaceClass } from '@/shared/lib/format'
import { performanceDisplay, type PerformanceKey } from '@/shared/lib/performance'
import { useSettingsStore } from '@/stores/settings'
import { useDataStore } from '@/stores/data'

const props = defineProps<{
  rows: FundRow[]
  tab: 'offshore' | 'etf'
  sortKey: FundSortKey
  sortDirection: 'asc' | 'desc'
  totalScale: number
  navDate: string | null
  categoryLabel: (row: FundRow) => string
  showCategory: boolean
}>()
const emit = defineEmits<{
  sort: [key: FundSortKey]
  detail: [row: FundRow]
}>()

const settings = useSettingsStore()
const data = useDataStore()
const expanded = ref(new Set<string>())

const sortedRows = computed(() => sortFundRows(props.rows, props.sortKey, props.sortDirection))
const columns = computed<Array<{ key: FundSortKey | null; label: string; align?: 'right' | 'center'; sub?: string }>>(() => [
  { key: null, label: '基金系列' },
  { key: 'series_scale', label: '规模', align: 'right' },
  {
    key: 'price',
    label: props.tab === 'etf' ? '最新价' : '净值',
    align: 'right',
    sub: props.navDate ? formatDate(props.navDate) : '',
  },
  ...(props.tab === 'etf' ? [{ key: 'premium' as const, label: '溢价率', align: 'right' as const }] : []),
  { key: 'chg_1m', label: '近 1 月', align: 'right' },
  { key: 'chg_3m', label: '近 3 月', align: 'right' },
  { key: 'chg_6m', label: '近 6 月', align: 'right' },
  { key: 'chg_ytd', label: '今年来', align: 'right' },
  { key: 'chg_1y', label: '近 1 年', align: 'right' },
  { key: 'chg_2y', label: '近 2 年', align: 'right' },
  { key: 'chg_3y', label: '近 3 年', align: 'right' },
  ...(props.tab === 'offshore' ? [
    { key: 'chg_since_inception' as const, label: '成立来', align: 'right' as const },
    { key: 'daily_limit' as const, label: '申购', align: 'center' as const },
  ] : []),
  { key: null, label: '操作', align: 'center' },
])

function toggle(code: string): void {
  const next = new Set(expanded.value)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  expanded.value = next
}

function statusClass(row: FundRow): string {
  const status = classifyBuyStatus(row.defaultShare)
  return status === 'paused' ? 'badge-danger' : status === 'limited' ? 'badge-warn' : 'badge-accent'
}

function purchaseTitle(row: FundRow): string {
  const scope = limitScopeShort(row.defaultShare, row.shares)
  return [dailyLimitTitle(row.defaultShare), scope].filter(Boolean).join(' · ')
}

function scaleText(value: number | null | undefined): string {
  if (!value) return '--'
  return value >= 100 ? `${value.toFixed(0)}亿` : `${value.toFixed(2)}亿`
}

function dailyChange(row: FundRow): number | null {
  return props.tab === 'etf'
    ? row.defaultShare.etf_change_pct ?? row.defaultShare.daily_change ?? null
    : row.defaultShare.daily_change ?? null
}

function price(row: FundRow): number | null {
  return props.tab === 'etf'
    ? row.defaultShare.etf_price ?? row.defaultShare.nav ?? null
    : row.defaultShare.nav ?? null
}

function logoColor(company: string): string {
  return data.catalog?.data.company_brands[company]?.color
    ?? (settings.resolvedTheme === 'dark' ? '#c8d1dc' : '#506070')
}

function logoLetter(company: string): string {
  const configured = data.catalog?.data.company_brands[company]?.letter
  if (configured) return configured
  const sameInitial = new Set(data.allRows
    .map((row) => row.company)
    .filter((name) => name.startsWith(company.slice(0, 1))))
  return sameInitial.size > 1 ? company.slice(0, 2) : company.slice(0, 1)
}

function companySuffix(row: FundRow): string {
  return row.display_name.includes(row.company) ? '' : row.company
}

function metricDisplay(row: FundRow, key: PerformanceKey): string {
  return performanceDisplay(row.defaultShare[key], key, row.defaultShare)
}

function priceDisplay(row: FundRow): string {
  if (price(row) === null && String(row.defaultShare.buy_status || '').includes('封闭')) return '封闭期'
  return formatPrice(price(row), props.tab === 'etf')
}

function mobilePerformance(): Array<{ label: string; key: PerformanceKey }> {
  return [
    { label: '近 1 月', key: 'chg_1m' },
    { label: '近 3 月', key: 'chg_3m' },
    { label: '近 6 月', key: 'chg_6m' },
    { label: '今年来', key: 'chg_ytd' },
    { label: '近 2 年', key: 'chg_2y' },
    { label: '近 3 年', key: 'chg_3y' },
  ]
}
</script>

<template>
  <div class="fund-table-summary">
    <span>{{ sortedRows.length }} 个系列</span>
    <span>{{ sortedRows.reduce((sum, row) => sum + row.shares.length, 0) }} 个份额</span>
    <span>总规模 {{ scaleText(totalScale) }}</span>
  </div>

  <div class="table-shell fund-table-shell">
    <table class="data-table fund-table">
      <thead>
        <tr>
          <th class="expand-col" aria-label="展开" />
          <th
            v-for="column in columns"
            :key="column.label"
            :class="[column.align ? `align-${column.align}` : '', column.key ? 'sortable' : '']"
            :aria-sort="column.key === sortKey ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined"
          >
            <button
              v-if="column.key"
              class="table-sort-button"
              type="button"
              @click="emit('sort', column.key)"
            >
              <span>{{ column.label }} <span aria-hidden="true">{{ column.key === sortKey ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span></span>
              <small v-if="column.sub" class="column-sub">{{ column.sub }}</small>
            </button>
            <template v-else>
              <span>{{ column.label }}</span>
              <small v-if="column.sub" class="column-sub">{{ column.sub }}</small>
            </template>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="row in sortedRows" :key="row.series_id">
          <tr class="fund-row" @click="tab === 'offshore' && toggle(row.default_share_code)">
            <td class="expand-col">
              <button
                v-if="tab === 'offshore'"
                type="button"
                class="expand-button"
                :aria-expanded="expanded.has(row.default_share_code)"
                :aria-label="expanded.has(row.default_share_code) ? '收起份额' : '展开份额'"
                @click.stop="toggle(row.default_share_code)"
              >
                <ChevronDown v-if="expanded.has(row.default_share_code)" :size="15" aria-hidden="true" />
                <ChevronRight v-else :size="15" aria-hidden="true" />
              </button>
            </td>
            <td>
              <div class="fund-identity">
                <button
                  class="favorite-button"
                  type="button"
                  :class="{ active: settings.isFavorite(row.default_share_code) }"
                  :aria-label="settings.isFavorite(row.default_share_code) ? '取消收藏' : '收藏基金'"
                  @click.stop="settings.toggleFavorite(row.default_share_code)"
                >
                  <Star :size="14" :fill="settings.isFavorite(row.default_share_code) ? 'currentColor' : 'none'" aria-hidden="true" />
                </button>
                <span class="fund-logo" :class="{ compact: logoLetter(row.company).length > 1 }" :style="{ color: logoColor(row.company), background: `${logoColor(row.company)}16` }">
                  {{ logoLetter(row.company) }}
                </span>
                <div class="fund-name-block">
                  <strong>{{ tab === 'etf' ? row.defaultShare.name : row.display_name }}</strong>
                  <span>
                    <span class="mono">{{ row.defaultShare.code }}</span>
                    <template v-if="companySuffix(row)"> · {{ companySuffix(row) }}</template>
                    <span v-if="showCategory" class="badge">{{ categoryLabel(row) }}</span>
                    <span class="badge">{{ tab === 'etf' ? 'ETF' : `${row.shares.length} 份额` }}</span>
                  </span>
                </div>
              </div>
            </td>
            <td class="align-right mono">{{ scaleText(row.series_scale) }}</td>
            <td class="align-right">
              <div class="price-cell">
                <strong class="mono">{{ priceDisplay(row) }}</strong>
                <span class="mono" :class="movementClass(dailyChange(row))">{{ formatPercent(dailyChange(row)) }}</span>
              </div>
            </td>
            <td v-if="tab === 'etf'" class="align-right mono premium-cell">
              {{ formatPercent(row.defaultShare.etf_premium) }}
            </td>
            <td class="align-right mono" :class="movementClass(row.defaultShare.chg_1m)">{{ metricDisplay(row, 'chg_1m') }}</td>
            <td class="align-right mono" :class="movementClass(row.defaultShare.chg_3m)">{{ metricDisplay(row, 'chg_3m') }}</td>
            <td class="align-right mono" :class="movementClass(row.defaultShare.chg_6m)">{{ metricDisplay(row, 'chg_6m') }}</td>
            <td class="align-right mono" :class="movementClass(row.defaultShare.chg_ytd)">{{ metricDisplay(row, 'chg_ytd') }}</td>
            <td class="align-right mono" :class="movementClass(row.defaultShare.chg_1y)">{{ metricDisplay(row, 'chg_1y') }}</td>
            <td class="align-right mono" :class="movementClass(row.defaultShare.chg_2y)">{{ metricDisplay(row, 'chg_2y') }}</td>
            <td class="align-right mono" :class="movementClass(row.defaultShare.chg_3y)">{{ metricDisplay(row, 'chg_3y') }}</td>
            <template v-if="tab === 'offshore'">
              <td class="align-right mono" :class="movementClass(row.defaultShare.chg_since_inception)">{{ metricDisplay(row, 'chg_since_inception') }}</td>
              <td class="align-center">
                <div class="purchase-cell" :title="purchaseTitle(row)">
                  <span class="badge" :class="statusClass(row)">{{ buyStatusLabel(row.defaultShare) }}</span>
                </div>
              </td>
            </template>
            <td class="align-center">
              <button class="table-action" type="button" @click.stop="emit('detail', row)">
                <LineChart :size="14" aria-hidden="true" /> 详情
              </button>
            </td>
          </tr>
          <tr v-if="tab === 'offshore' && expanded.has(row.default_share_code)" class="shares-row">
            <td :colspan="columns.length + 1">
              <div class="shares-panel">
                <div class="shares-title">{{ row.display_name }} · {{ row.shares.length }} 个份额</div>
                <FundShareComparisonTable
                  :shares="row.shares"
                  :default-code="row.default_share_code"
                  :nav-date="row.defaultShare.nav_date"
                />
              </div>
            </td>
          </tr>
        </template>
        <tr v-if="!sortedRows.length">
          <td :colspan="columns.length + 1" class="table-empty">没有匹配的基金，请调整分类或搜索词。</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="fund-mobile-list">
    <article v-for="row in sortedRows" :key="row.series_id" class="fund-mobile-card">
      <div class="fund-mobile-head">
        <div class="fund-identity">
          <span class="fund-logo" :class="{ compact: logoLetter(row.company).length > 1 }" :style="{ color: logoColor(row.company), background: `${logoColor(row.company)}16` }">{{ logoLetter(row.company) }}</span>
          <div class="fund-name-block">
            <strong>{{ tab === 'etf' ? row.defaultShare.name : row.display_name }}</strong>
            <span><span class="mono">{{ row.default_share_code }}</span><template v-if="companySuffix(row)"> · {{ companySuffix(row) }}</template> <span v-if="showCategory" class="badge">{{ categoryLabel(row) }}</span></span>
          </div>
        </div>
        <button
          class="favorite-button"
          type="button"
          :class="{ active: settings.isFavorite(row.default_share_code) }"
          :aria-label="settings.isFavorite(row.default_share_code) ? '取消收藏' : '收藏基金'"
          @click="settings.toggleFavorite(row.default_share_code)"
        >
          <Star :size="16" :fill="settings.isFavorite(row.default_share_code) ? 'currentColor' : 'none'" aria-hidden="true" />
        </button>
      </div>
      <div class="fund-mobile-metrics">
        <div><span>最新</span><strong class="mono">{{ priceDisplay(row) }}</strong></div>
        <div><span>日涨跌</span><strong class="mono" :class="movementClass(dailyChange(row))">{{ formatPercent(dailyChange(row)) }}</strong></div>
        <div v-if="tab === 'etf'"><span>溢价</span><strong class="mono premium-cell">{{ formatPercent(row.defaultShare.etf_premium) }}</strong></div>
        <div v-else>
          <span>申购</span>
          <span class="badge" :class="statusClass(row)" :title="purchaseTitle(row)">{{ buyStatusLabel(row.defaultShare) }}</span>
        </div>
      </div>
      <div class="fund-mobile-performance">
        <div
          v-for="item in mobilePerformance()"
          :key="item.key"
          :class="movementSurfaceClass(row.defaultShare[item.key])"
        >
          <span>{{ item.label }}</span>
          <b class="mono" :class="movementClass(row.defaultShare[item.key])">{{ metricDisplay(row, item.key) }}</b>
        </div>
      </div>
      <div class="fund-mobile-foot">
        <span>近 1 年 <b class="mono" :class="movementClass(row.defaultShare.chg_1y)">{{ metricDisplay(row, 'chg_1y') }}</b></span>
        <span v-if="tab === 'etf'">规模 <b class="mono">{{ scaleText(row.series_scale) }}</b></span>
        <div class="fund-mobile-actions">
          <button
            v-if="tab === 'offshore'"
            class="button"
            type="button"
            :aria-expanded="expanded.has(row.default_share_code)"
            @click="toggle(row.default_share_code)"
          >
            {{ expanded.has(row.default_share_code) ? '收起份额' : '查看份额' }}
          </button>
          <button class="button" type="button" @click="emit('detail', row)">查看详情</button>
        </div>
      </div>
      <div v-if="tab === 'offshore' && expanded.has(row.default_share_code)" class="fund-mobile-shares">
        <div class="shares-title">{{ row.shares.length }} 个份额</div>
        <FundShareComparisonTable
          :shares="row.shares"
          :default-code="row.default_share_code"
          :nav-date="row.defaultShare.nav_date"
        />
      </div>
    </article>
  </div>
</template>
