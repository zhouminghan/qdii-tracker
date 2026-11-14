<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ChevronRight, GitCompareArrows, LineChart, Star } from '@lucide/vue'
import type { FundSortKey, FundRow } from '@/shared/lib/funds'
import { classifyBuyStatus, sortFundRows } from '@/shared/lib/funds'
import { daysSince, formatDate, formatPercent, formatPrice, movementClass } from '@/shared/lib/format'
import { useSettingsStore } from '@/stores/settings'
import { useDataStore } from '@/stores/data'

const props = defineProps<{
  rows: FundRow[]
  tab: 'offshore' | 'etf'
  sortKey: FundSortKey
  sortDirection: 'asc' | 'desc'
  totalScale: number
  compareCodes: string[]
}>()
const emit = defineEmits<{
  sort: [key: FundSortKey]
  detail: [row: FundRow]
  compare: [row: FundRow]
}>()

const settings = useSettingsStore()
const data = useDataStore()
const expanded = ref(new Set<string>())

const sortedRows = computed(() => sortFundRows(props.rows, props.sortKey, props.sortDirection))
const columns: Array<{ key: FundSortKey | null; label: string; align?: 'right' | 'center' }> = [
  { key: null, label: '基金系列' },
  { key: 'series_scale', label: '规模', align: 'right' },
  { key: 'price', label: props.tab === 'etf' ? '最新价' : '净值', align: 'right' },
  ...(props.tab === 'etf' ? [{ key: 'premium' as const, label: '溢价率', align: 'right' as const }] : []),
  { key: 'chg_1m', label: '近 1 月', align: 'right' },
  { key: 'chg_ytd', label: '今年来', align: 'right' },
  { key: 'chg_1y', label: '近 1 年', align: 'right' },
  ...(props.tab === 'offshore' ? [
    { key: 'chg_since_inception' as const, label: '成立来', align: 'right' as const },
    { key: 'buy_status' as const, label: '申购', align: 'center' as const },
  ] : []),
  { key: null, label: '操作', align: 'center' },
]

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

function shareSort(rows: FundRow['shares']): FundRow['shares'] {
  return [...rows].sort((a, b) => {
    const currency = (a.currency === '人民币' ? 0 : 1) - (b.currency === '人民币' ? 0 : 1)
    if (currency) return currency
    return a.share_class.localeCompare(b.share_class, 'zh-CN')
  })
}

function logoColor(company: string): string {
  return data.catalog?.data.company_brands[company]?.color ?? '#506070'
}

function logoLetter(company: string): string {
  return data.catalog?.data.company_brands[company]?.letter ?? company.slice(0, 1)
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
              {{ column.label }}
              <span aria-hidden="true">{{ column.key === sortKey ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
            </button>
            <span v-else>{{ column.label }}</span>
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
                <span class="fund-logo" :style="{ color: logoColor(row.company), background: `${logoColor(row.company)}16` }">
                  {{ logoLetter(row.company) }}
                </span>
                <div class="fund-name-block">
                  <strong>{{ tab === 'etf' ? row.defaultShare.name : row.display_name }}</strong>
                  <span>
                    <span class="mono">{{ row.defaultShare.code }}</span>
                    · {{ row.company }}
                    <span class="badge">{{ tab === 'etf' ? 'ETF' : `${row.shares.length} 份额` }}</span>
                  </span>
                </div>
              </div>
            </td>
            <td class="align-right mono">{{ scaleText(row.series_scale) }}</td>
            <td class="align-right">
              <div class="price-cell">
                <strong class="mono">{{ formatPrice(price(row), tab === 'etf') }}</strong>
                <span class="mono" :class="movementClass(dailyChange(row))">{{ formatPercent(dailyChange(row)) }}</span>
                <small v-if="daysSince(row.defaultShare.nav_date) !== null && daysSince(row.defaultShare.nav_date)! >= 1">
                  {{ formatDate(row.defaultShare.nav_date) }} · T-{{ daysSince(row.defaultShare.nav_date) }}
                </small>
              </div>
            </td>
            <td v-if="tab === 'etf'" class="align-right mono premium-cell">
              {{ formatPercent(row.defaultShare.etf_premium) }}
            </td>
            <td class="align-right mono" :class="movementClass(row.defaultShare.chg_1m)">{{ formatPercent(row.defaultShare.chg_1m) }}</td>
            <td class="align-right mono" :class="movementClass(row.defaultShare.chg_ytd)">{{ formatPercent(row.defaultShare.chg_ytd) }}</td>
            <td class="align-right mono" :class="movementClass(row.defaultShare.chg_1y)">{{ formatPercent(row.defaultShare.chg_1y) }}</td>
            <template v-if="tab === 'offshore'">
              <td class="align-right mono" :class="movementClass(row.defaultShare.chg_since_inception)">{{ formatPercent(row.defaultShare.chg_since_inception) }}</td>
              <td class="align-center">
                <span class="badge" :class="statusClass(row)">{{ row.defaultShare.buy_status || '--' }}</span>
              </td>
            </template>
            <td class="align-center">
              <div class="table-action-group">
                <button class="table-action" :class="{ active: compareCodes.includes(row.default_share_code) }" type="button" @click.stop="emit('compare', row)">
                  <GitCompareArrows :size="14" aria-hidden="true" /> 对比
                </button>
                <button class="table-action" type="button" @click.stop="emit('detail', row)">
                  <LineChart :size="14" aria-hidden="true" /> 详情
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="tab === 'offshore' && expanded.has(row.default_share_code)" class="shares-row">
            <td :colspan="columns.length + 1">
              <div class="shares-panel">
                <div class="shares-title">{{ row.display_name }} · {{ row.shares.length }} 个份额</div>
                <table class="data-table compact shares-table">
                  <thead>
                    <tr><th>代码</th><th>份额名称</th><th>币种</th><th class="align-right">净值</th><th class="align-right">近 1 年</th><th>申购</th><th class="align-right">卖出规则</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="share in shareSort(row.shares)" :key="share.code">
                      <td class="mono">{{ share.code }}<span v-if="share.code === row.default_share_code" title="默认份额"> ★</span></td>
                      <td>{{ share.name }}</td>
                      <td><span class="badge">{{ share.currency === '美元' ? '$ 美元' : '¥ 人民币' }}</span></td>
                      <td class="align-right mono">{{ formatPrice(share.nav) }}</td>
                      <td class="align-right mono" :class="movementClass(share.chg_1y)">{{ formatPercent(share.chg_1y) }}</td>
                      <td><span class="badge" :class="classifyBuyStatus(share) === 'paused' ? 'badge-danger' : 'badge-accent'">{{ share.buy_status || '--' }}</span></td>
                      <td class="align-right">{{ share.free_hold_days ? `持有 ${share.free_hold_days} 天免` : '查看详情' }}</td>
                    </tr>
                  </tbody>
                </table>
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
          <span class="fund-logo" :style="{ color: logoColor(row.company), background: `${logoColor(row.company)}16` }">{{ logoLetter(row.company) }}</span>
          <div class="fund-name-block">
            <strong>{{ tab === 'etf' ? row.defaultShare.name : row.display_name }}</strong>
            <span><span class="mono">{{ row.default_share_code }}</span> · {{ row.company }}</span>
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
        <div><span>最新</span><strong class="mono">{{ formatPrice(price(row), tab === 'etf') }}</strong></div>
        <div><span>日涨跌</span><strong class="mono" :class="movementClass(dailyChange(row))">{{ formatPercent(dailyChange(row)) }}</strong></div>
        <div v-if="tab === 'etf'"><span>溢价</span><strong class="mono premium-cell">{{ formatPercent(row.defaultShare.etf_premium) }}</strong></div>
        <div v-else><span>申购</span><span class="badge" :class="statusClass(row)">{{ row.defaultShare.buy_status || '--' }}</span></div>
      </div>
      <div class="fund-mobile-foot">
        <span>近 1 年 <b class="mono" :class="movementClass(row.defaultShare.chg_1y)">{{ formatPercent(row.defaultShare.chg_1y) }}</b></span>
        <div class="fund-mobile-actions">
          <button class="button" :class="{ 'button-primary': compareCodes.includes(row.default_share_code) }" type="button" @click="emit('compare', row)">对比</button>
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
        <div v-for="share in shareSort(row.shares)" :key="share.code" class="fund-mobile-share-row">
          <div>
            <strong>{{ share.name }}</strong>
            <span class="mono">{{ share.code }} · {{ share.currency }}</span>
          </div>
          <div>
            <strong class="mono">{{ formatPrice(share.nav ?? share.etf_price) }}</strong>
            <span class="badge" :class="classifyBuyStatus(share) === 'paused' ? 'badge-danger' : 'badge-accent'">{{ share.buy_status || '--' }}</span>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>
