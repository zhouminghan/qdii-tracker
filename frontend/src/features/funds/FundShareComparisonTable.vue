<script setup lang="ts">
import { computed } from 'vue'
import type { FundShare } from '@/types/data'
import { buyStatusLabel, classifyBuyStatus, formatDailyLimit } from '@/shared/lib/funds'
import {
  formatHoldPeriod,
  formatRuleRate,
  freeHoldDays,
  totalAnnualFee,
} from '@/shared/lib/fund-rules'
import { formatPrice, movementClass } from '@/shared/lib/format'
import { performanceDisplay } from '@/shared/lib/performance'

const props = withDefaults(defineProps<{
  shares: FundShare[]
  defaultCode: string
  navDate?: string | null
}>(), {
  navDate: null,
})

const orderedShares = computed(() => [...props.shares].sort((left, right) => {
  const currency = (left.currency === '人民币' ? 0 : 1) - (right.currency === '人民币' ? 0 : 1)
  if (currency) return currency
  return left.share_class.localeCompare(right.share_class, 'zh-CN')
}))

const headerDate = computed(() => {
  if (props.navDate) return props.navDate
  return props.shares.find((share) => share.nav_date)?.nav_date ?? ''
})

function scaleText(share: FundShare): string {
  if (share.scale_raw) return share.scale_raw
  return share.scale ? `${share.scale.toFixed(2)}亿` : '--'
}

function dailyLimitText(share: FundShare): string {
  if (String(share.buy_status || '').includes('封闭')) return '封闭期'
  if (classifyBuyStatus(share) === 'paused') return '暂停'
  if (!share.buy_status || !share.buy_status.includes('限')) return share.buy_status?.includes('开放') ? '不限' : '--'
  return formatDailyLimit(share.daily_limit, share.currency)
}

function navDisplay(share: FundShare): string {
  if (share.nav == null && share.etf_price == null && String(share.buy_status || '').includes('封闭')) return '封闭期'
  return formatPrice(share.nav ?? share.etf_price)
}

function buyFee(share: FundShare): string {
  if (share.first_buy_rate == null) return '--'
  return formatRuleRate(share.first_buy_rate, true)
}

function annualFee(share: FundShare): string {
  const rate = totalAnnualFee(share)
  return rate > 0 ? `${parseFloat(rate.toFixed(2))}%/年` : '--'
}

function sellRule(share: FundShare): string {
  const days = freeHoldDays(share)
  if (days !== null) return `${formatHoldPeriod(days)}免`
  const firstRate = share.sell_rules?.[0]?.rate
  return firstRate == null ? '--' : `${firstRate}%起`
}
</script>

<template>
  <div class="table-shell share-comparison-shell">
    <table class="data-table compact share-comparison-table">
      <thead>
        <tr>
          <th>代码</th>
          <th>份额名称</th>
          <th>币种</th>
          <th class="align-right">规模</th>
          <th class="align-right">净值<small>{{ headerDate }}</small></th>
          <th class="align-right">近 1 月</th>
          <th class="align-right">近 3 月</th>
          <th class="align-right">近 6 月</th>
          <th class="align-right">今年来</th>
          <th class="align-right">近 1 年</th>
          <th class="align-right">近 3 年</th>
          <th class="align-right">成立来</th>
          <th class="align-center">日限额</th>
          <th class="align-center">申购</th>
          <th class="align-right">买入费</th>
          <th class="align-right">综合费率</th>
          <th class="align-right">卖出规则</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="share in orderedShares" :key="share.code">
          <td class="mono">{{ share.code }}<span v-if="share.code === defaultCode" class="default-share-mark">★</span></td>
          <td>{{ share.name }}</td>
          <td><span class="badge">{{ share.currency === '美元' ? '$ 美元' : '¥ 人民币' }}</span></td>
          <td class="align-right mono">{{ scaleText(share) }}</td>
          <td class="align-right mono">{{ navDisplay(share) }}</td>
          <td class="align-right mono" :class="movementClass(share.chg_1m)">{{ performanceDisplay(share.chg_1m, 'chg_1m', share) }}</td>
          <td class="align-right mono" :class="movementClass(share.chg_3m)">{{ performanceDisplay(share.chg_3m, 'chg_3m', share) }}</td>
          <td class="align-right mono" :class="movementClass(share.chg_6m)">{{ performanceDisplay(share.chg_6m, 'chg_6m', share) }}</td>
          <td class="align-right mono" :class="movementClass(share.chg_ytd)">{{ performanceDisplay(share.chg_ytd, 'chg_ytd', share) }}</td>
          <td class="align-right mono" :class="movementClass(share.chg_1y)">{{ performanceDisplay(share.chg_1y, 'chg_1y', share) }}</td>
          <td class="align-right mono" :class="movementClass(share.chg_3y)">{{ performanceDisplay(share.chg_3y, 'chg_3y', share) }}</td>
          <td class="align-right mono" :class="movementClass(share.chg_since_inception)">{{ performanceDisplay(share.chg_since_inception, 'chg_since_inception', share) }}</td>
          <td class="align-center mono">{{ dailyLimitText(share) }}</td>
          <td class="align-center">
            <span
              class="badge"
              :class="classifyBuyStatus(share) === 'paused' ? 'badge-danger' : classifyBuyStatus(share) === 'limited' ? 'badge-warn' : 'badge-accent'"
              :title="share.buy_status || '--'"
            >{{ buyStatusLabel(share) }}</span>
          </td>
          <td class="align-right mono">{{ buyFee(share) }}</td>
          <td class="align-right mono">{{ annualFee(share) }}</td>
          <td class="align-right">{{ sellRule(share) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
