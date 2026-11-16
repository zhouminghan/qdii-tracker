<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { FundShare } from '@/types/data'
import { buyStatusLabel, classifyBuyStatus } from '@/shared/lib/funds'
import {
  annualFeeDetail,
  cleanRuleCondition,
  formatHoldPeriod,
  formatRuleRate,
  freeHoldDays,
  sellRuleLabel,
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

type RuleMode = 'buy' | 'fee' | 'sell'

const ruleShare = ref<FundShare | null>(null)
const ruleMode = ref<RuleMode>('buy')
const ruleStyle = ref<Record<string, string>>({})
let hideTimer: number | null = null

function cancelRuleHide(): void {
  if (hideTimer !== null) window.clearTimeout(hideTimer)
  hideTimer = null
}

function hideRulesSoon(): void {
  cancelRuleHide()
  hideTimer = window.setTimeout(() => {
    ruleShare.value = null
  }, 140)
}

function showRules(share: FundShare, event: Event, mode: RuleMode): void {
  cancelRuleHide()
  const trigger = event.currentTarget as HTMLElement
  const rect = trigger.getBoundingClientRect()
  const width = Math.min(360, window.innerWidth - 24)
  const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))
  const top = Math.min(rect.bottom + 8, window.innerHeight - 300)
  ruleStyle.value = {
    left: `${left}px`,
    top: `${Math.max(12, top)}px`,
    width: `${width}px`,
  }
  ruleShare.value = share
  ruleMode.value = mode
}

onBeforeUnmount(cancelRuleHide)
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
          <td class="align-center">
            <span
              class="badge"
              :class="classifyBuyStatus(share) === 'paused' ? 'badge-danger' : classifyBuyStatus(share) === 'limited' ? 'badge-warn' : 'badge-accent'"
              :title="share.buy_status || '--'"
            >{{ buyStatusLabel(share) }}</span>
          </td>
          <td class="align-right rule-anchor-cell">
            <button
              class="rule-hover-trigger mono"
              type="button"
              :aria-label="`查看 ${share.code} 买入规则`"
              @mouseenter="showRules(share, $event, 'buy')"
              @mouseleave="hideRulesSoon"
              @focus="showRules(share, $event, 'buy')"
              @blur="hideRulesSoon"
              @click="showRules(share, $event, 'buy')"
            >
              {{ buyFee(share) }}
            </button>
          </td>
          <td class="align-right rule-anchor-cell">
            <button
              class="rule-hover-trigger mono"
              type="button"
              :aria-label="`查看 ${share.code} 综合费率构成`"
              @mouseenter="showRules(share, $event, 'fee')"
              @mouseleave="hideRulesSoon"
              @focus="showRules(share, $event, 'fee')"
              @blur="hideRulesSoon"
              @click="showRules(share, $event, 'fee')"
            >
              {{ annualFee(share) }}
            </button>
          </td>
          <td class="align-right rule-anchor-cell">
            <button
              class="rule-hover-trigger"
              type="button"
              :aria-label="`查看 ${share.code} 卖出规则`"
              @mouseenter="showRules(share, $event, 'sell')"
              @mouseleave="hideRulesSoon"
              @focus="showRules(share, $event, 'sell')"
              @blur="hideRulesSoon"
              @click="showRules(share, $event, 'sell')"
            >
              {{ sellRule(share) }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <Teleport to="body">
    <div
      v-if="ruleShare"
      class="rule-floating-popover"
      :style="ruleStyle"
      role="tooltip"
      @mouseenter="cancelRuleHide"
      @mouseleave="hideRulesSoon"
    >
      <div class="rule-popover-head">
        <strong>{{ ruleShare.share_class }}</strong>
        <span class="mono">{{ ruleShare.code }} · {{ ruleShare.currency }}</span>
      </div>
      <section v-if="ruleMode === 'fee'" class="rule-popover-section">
        <h4>综合费率</h4>
        <div class="rule-popover-row">
          <span>合计</span>
          <strong class="mono">{{ annualFee(ruleShare) }}</strong>
        </div>
        <p class="rule-popover-note">{{ annualFeeDetail(ruleShare) }}</p>
      </section>
      <section v-if="ruleMode === 'buy'" class="rule-popover-section">
        <h4>买入规则</h4>
        <div v-for="rule in ruleShare.buy_rules ?? []" :key="rule.condition" class="rule-popover-row">
          <span>{{ cleanRuleCondition(rule.condition) }}</span>
          <strong class="mono">{{ formatRuleRate(rule.rate, true) }}</strong>
        </div>
        <p v-if="!ruleShare.buy_rules?.length" class="muted">暂无公开买入规则。</p>
      </section>
      <section v-if="ruleMode === 'sell'" class="rule-popover-section">
        <h4>卖出规则</h4>
        <div v-for="rule in ruleShare.sell_rules ?? []" :key="rule.condition" class="rule-popover-row">
          <span>{{ cleanRuleCondition(rule.condition) }}</span>
          <strong class="mono">{{ sellRuleLabel(rule) }}</strong>
        </div>
        <p v-if="!ruleShare.sell_rules?.length" class="muted">场内交易无申赎规则。</p>
      </section>
    </div>
  </Teleport>
</template>
