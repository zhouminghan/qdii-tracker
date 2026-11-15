<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ExternalLink, Search, X } from '@lucide/vue'
import DataState from '@/shared/components/DataState.vue'
import { fetchJson } from '@/shared/infrastructure/http'
import { formatDate, formatNumber, formatPercent, movementClass } from '@/shared/lib/format'
import type { SouthboundData, SouthboundShare } from '@/types/data'

const payload = ref<SouthboundData | null>(null)
const loading = ref(true)
const error = ref('')
const search = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    payload.value = await fetchJson<SouthboundData>('data/southbound.json')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '南向通资料加载失败'
  } finally {
    loading.value = false
  }
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function shareMatches(share: SouthboundShare, query: string): boolean {
  if (!query) return true
  return [
    share.code,
    share.bank_code,
    share.ticker,
    share.isin,
    share.currency,
    share.currency_code,
    share.share_class,
  ].some((value) => normalized(value).includes(query))
}

function productGroups(query: string) {
  const q = normalized(query)
  return (payload.value?.products ?? [])
    .map((product) => {
      const productMatches = [
        product.name,
        ...(product.aliases ?? []),
        product.index_name,
        product.channel_type,
        ...product.channels,
      ].some((value) => normalized(value).includes(q))
      const shares = product.shares.filter((share) => !q || productMatches || shareMatches(share, q))
      return { product, shares }
    })
    .filter((group) => group.shares.length > 0)
}

const groups = computed(() => productGroups(search.value))
const visibleShareCount = computed(() => groups.value.reduce((sum, group) => sum + group.shares.length, 0))

function clearSearch(): void {
  search.value = ''
}

function codeLabel(share: SouthboundShare): string {
  return share.bank_code ? `银行 ${share.bank_code}` : share.ticker
}

onMounted(load)
</script>

<template>
  <DataState :loading="loading" :error="error" @retry="load">
    <section v-if="payload" class="southbound-view" aria-labelledby="southbound-title">
      <div class="fund-toolbar southbound-toolbar">
        <label class="inline-search">
          <Search :size="15" aria-hidden="true" />
          <input
            v-model="search"
            type="search"
            placeholder="产品名、代码、ISIN、彭博代码、币种"
            aria-label="搜索南向通基金代码和份额"
          />
          <button v-if="search" type="button" aria-label="清空南向通搜索" @click="clearSearch">
            <X :size="14" aria-hidden="true" />
          </button>
        </label>
        <div class="southbound-summary">
          <strong>{{ groups.length }}</strong> 个产品
          <span>·</span>
          <strong>{{ visibleShareCount }}</strong> 个份额
        </div>
      </div>

      <div class="table-shell fund-table-shell southbound-table-shell">
        <table class="data-table fund-table southbound-table">
          <caption id="southbound-title">跨境理财通南向通基金份额</caption>
          <thead>
            <tr>
              <th scope="col">产品 / 份额</th>
              <th scope="col">币种</th>
              <th scope="col">代码</th>
              <th scope="col" class="align-right">净值</th>
              <th scope="col" class="align-right">近 1 年</th>
              <th scope="col">销售渠道</th>
              <th scope="col">核验状态</th>
              <th scope="col" class="align-center">官方</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in groups" :key="group.product.id">
              <tr
                v-for="(share, shareIndex) in group.shares"
                :key="share.isin"
                class="southbound-row"
              >
                <td v-if="shareIndex === 0" :rowspan="group.shares.length" class="southbound-product-cell">
                  <div class="fund-identity">
                    <span class="fund-logo compact southbound-logo">易</span>
                    <div class="fund-name-block">
                      <strong>{{ group.product.name }}</strong>
                      <span>{{ group.product.index_name }} · {{ group.product.channel_type }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="badge southbound-currency" :class="`currency-${share.currency_code.toLowerCase()}`">
                    {{ share.currency }}
                  </span>
                  <small class="southbound-sub">{{ share.share_class }}</small>
                </td>
                <td class="southbound-code-cell">
                  <strong class="mono">{{ codeLabel(share) }}</strong>
                  <small class="southbound-sub">ISIN {{ share.isin }}</small>
                  <small class="southbound-sub">
                    {{ share.bank_code ? `Bloomberg ${share.ticker}` : '银行渠道码待核验' }}
                  </small>
                </td>
                <td class="align-right">
                  <strong class="mono">{{ formatNumber(share.nav, 4) }}</strong>
                  <small class="southbound-sub">{{ share.nav_date ? formatDate(share.nav_date) : '待核验' }}</small>
                </td>
                <td class="align-right mono" :class="movementClass(share.one_year_return_pct)">
                  {{ share.one_year_return_pct == null ? '--' : formatPercent(share.one_year_return_pct) }}
                </td>
                <td>
                  <div class="southbound-channels">
                    <span v-for="channel in group.product.channels" :key="channel" class="chip">{{ channel }}</span>
                  </div>
                </td>
                <td>
                  <span class="badge badge-warn">{{ group.product.status }}</span>
                </td>
                <td class="align-center">
                  <a
                    class="button button-secondary southbound-official-link"
                    :href="group.product.official_url"
                    target="_blank"
                    rel="noreferrer"
                    :aria-label="`查看 ${group.product.name} 官方产品页`"
                  >
                    <ExternalLink :size="14" aria-hidden="true" /> 产品页
                  </a>
                </td>
              </tr>
            </template>
            <tr v-if="groups.length === 0">
              <td colspan="8" class="table-empty">没有匹配的南向通代码或份额。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="southbound-disclosure-list">
        <details v-for="product in payload.products" :key="product.id" class="southbound-disclosure">
          <summary>{{ product.name }} · 渠道、额度与风险</summary>
          <div class="southbound-disclosure-body">
            <p>{{ product.quota_note }}</p>
            <div class="southbound-disclosure-grid">
              <section>
                <h3>渠道优势</h3>
                <ul>
                  <li v-for="item in product.advantages" :key="item">{{ item }}</li>
                </ul>
              </section>
              <section>
                <h3>风险与核验</h3>
                <ul>
                  <li v-for="item in product.risks" :key="item">{{ item }}</li>
                </ul>
              </section>
            </div>
            <p class="inline-note">{{ payload.disclaimer }} 数据来源：{{ payload.source }}</p>
          </div>
        </details>
      </div>
    </section>
  </DataState>
</template>
