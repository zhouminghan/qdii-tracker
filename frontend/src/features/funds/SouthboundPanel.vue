<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ExternalLink, Info, Search, X } from '@lucide/vue'
import DataState from '@/shared/components/DataState.vue'
import { fetchJson } from '@/shared/infrastructure/http'
import { formatDate, formatNumber, formatPercent, movementClass } from '@/shared/lib/format'
import type { SouthboundData, SouthboundProduct, SouthboundShare } from '@/types/data'
import { useUiStore } from '@/stores/ui'

const payload = ref<SouthboundData | null>(null)
const loading = ref(true)
const error = ref('')
const ui = useUiStore()
const search = computed({
  get: () => ui.quickSearch,
  set: (value: string) => { ui.quickSearch = value },
})

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
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s（）()【】·•,，。._/\\-]+/g, '')
}

function queryTokens(query: string): string[] {
  return String(query ?? '').trim().split(/\s+/).map(normalized).filter(Boolean)
}

function shareMatches(product: SouthboundProduct, share: SouthboundShare, tokens: string[]): boolean {
  if (!tokens.length) return true
  const haystack = normalized([
    product.name,
    ...(product.aliases ?? []),
    product.index_name,
    product.channel_type,
    ...product.channels,
    share.code,
    share.bank_code,
    share.bank_name,
    share.ticker,
    share.isin,
    share.currency,
    share.currency_code,
    share.share_class,
  ].join('|'))
  return tokens.every((token) => haystack.includes(token))
}

function productGroups(query: string) {
  const tokens = queryTokens(query)
  return (payload.value?.products ?? [])
    .map((product) => {
      const shares = product.shares.filter((share) => shareMatches(product, share, tokens))
      return { product, shares }
    })
    .filter((group) => group.shares.length > 0)
}

const groups = computed(() => productGroups(search.value))
const visibleShareCount = computed(() => groups.value.reduce((sum, group) => sum + group.shares.length, 0))

function clearSearch(): void {
  ui.quickSearch = ''
}

function productSource(product: SouthboundProduct): { label: string; url: string } {
  if (product.official_url) return { label: '产品页', url: product.official_url }
  const source = product.sources[0]
  return { label: '银行名单', url: source?.url ?? '' }
}

function noteCode(share: SouthboundShare): string {
  return share.bank_code ? `${share.bank_name ?? '银行'} ${share.bank_code}` : share.ticker ?? share.code
}

onMounted(load)
</script>

<template>
  <DataState :loading="loading" :error="error" @retry="load">
    <section v-if="payload" class="southbound-view" aria-labelledby="southbound-title">
      <div class="southbound-meta-row">
        <div class="southbound-summary">
          <strong>{{ groups.length }}</strong> 个产品
          <span>·</span>
          <strong>{{ visibleShareCount }}</strong> 个份额
        </div>
        <button v-if="search" class="text-button" type="button" @click="clearSearch">清除筛选</button>
      </div>

      <div class="fund-toolbar southbound-toolbar southbound-mobile-search">
        <label class="inline-search">
          <Search :size="15" aria-hidden="true" />
          <input
            v-model="search"
            type="search"
            placeholder="产品名、代码、ISIN、银行码、币种"
            aria-label="搜索南向通基金代码和份额"
          />
          <button v-if="search" type="button" aria-label="清空南向通搜索" @click="clearSearch">
            <X :size="14" aria-hidden="true" />
          </button>
        </label>
      </div>

      <div class="southbound-coverage">
        <Info :size="15" aria-hidden="true" />
        <p>{{ payload.coverage_note }}</p>
        <a :href="payload.coverage_source_url" target="_blank" rel="noreferrer">
          查看银行完整名单 <ExternalLink :size="13" aria-hidden="true" />
        </a>
      </div>

      <div class="table-shell fund-table-shell southbound-table-shell">
        <table class="data-table fund-table southbound-table">
          <caption id="southbound-title">跨境理财通南向通基金份额</caption>
          <thead>
            <tr>
              <th scope="col" rowspan="2">产品 / 份额</th>
              <th scope="col" rowspan="2">币种</th>
              <th scope="colgroup" colspan="2">代码</th>
              <th scope="colgroup" colspan="2" class="align-right">表现</th>
              <th scope="col" rowspan="2">销售渠道</th>
              <th scope="col" rowspan="2" class="align-center">来源</th>
            </tr>
            <tr>
              <th scope="col">银行码</th>
              <th scope="col">官方代码</th>
              <th scope="col" class="align-right">净值</th>
              <th scope="col" class="align-right">近 1 年</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in groups" :key="group.product.id">
              <tr
                v-for="(share, shareIndex) in group.shares"
                :key="share.isin ?? share.code"
                class="southbound-row"
              >
                <td v-if="shareIndex === 0" :rowspan="group.shares.length" class="southbound-product-cell">
                  <div class="fund-identity">
                    <span class="fund-logo compact southbound-logo">跨</span>
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
                <td class="southbound-bank-code">
                  <strong v-if="share.bank_code" class="mono">{{ share.bank_code }}</strong>
                  <span v-else class="muted">--</span>
                  <small v-if="share.bank_code" class="southbound-sub">{{ share.bank_name }}</small>
                </td>
                <td class="southbound-code-cell">
                  <strong class="mono">{{ share.ticker ?? share.code }}</strong>
                  <small v-if="share.isin" class="southbound-sub">ISIN {{ share.isin }}</small>
                  <small v-else class="southbound-sub">非上市类别 · 无公开 ISIN</small>
                </td>
                <td class="align-right">
                  <strong class="mono">{{ formatNumber(share.nav, 4) }}</strong>
                  <small class="southbound-sub">{{ share.nav_date ? formatDate(share.nav_date) : '待核验' }}</small>
                </td>
                <td class="align-right mono" :class="movementClass(share.one_year_return_pct)">
                  <strong>{{ share.one_year_return_pct == null ? '--' : formatPercent(share.one_year_return_pct) }}</strong>
                </td>
                <td>
                  <div class="southbound-channels">
                    <span v-for="channel in group.product.channels" :key="channel" class="chip">{{ channel }}</span>
                  </div>
                </td>
                <td class="align-center">
                  <a
                    v-if="productSource(group.product).url"
                    class="button button-secondary southbound-official-link"
                    :href="productSource(group.product).url"
                    target="_blank"
                    rel="noreferrer"
                    :aria-label="`查看 ${group.product.name} 来源`"
                  >
                    <ExternalLink :size="14" aria-hidden="true" /> {{ productSource(group.product).label }}
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

      <section class="southbound-notes" aria-labelledby="southbound-notes-title">
        <header class="southbound-notes-head">
          <div>
            <div class="eyebrow">备注说明</div>
            <h2 id="southbound-notes-title">渠道、额度与风险</h2>
          </div>
          <p>以下内容独立于上方基金表，不随搜索筛选折叠，便于直接核对产品备注。</p>
        </header>

        <div class="southbound-note-grid">
          <article v-for="product in payload.products" :key="product.id" class="southbound-note-card">
            <header class="southbound-note-head">
              <div>
                <h3>{{ product.name }}</h3>
                <p>{{ product.index_name }} · {{ product.channel_type }}</p>
              </div>
              <span class="badge">{{ product.verified_at }} 核验</span>
            </header>

            <div class="southbound-note-codes">
              <span v-for="share in product.shares" :key="share.code" class="chip mono">
                {{ share.currency }} · {{ noteCode(share) }}
              </span>
            </div>

            <p class="southbound-note-quota">
              <strong>个人总额度</strong>
              {{ product.quota_note }}
            </p>

            <div class="southbound-note-columns">
              <section>
                <h4>渠道优势</h4>
                <ul>
                  <li v-for="item in product.advantages" :key="item">{{ item }}</li>
                </ul>
              </section>
              <section>
                <h4>风险与核验</h4>
                <ul>
                  <li v-for="item in product.risks" :key="item">{{ item }}</li>
                </ul>
              </section>
            </div>

            <footer class="southbound-note-sources">
              <span>来源</span>
              <a
                v-for="source in product.sources"
                :key="source.url"
                :href="source.url"
                target="_blank"
                rel="noreferrer"
                :title="source.scope"
              >
                {{ source.label }} <ExternalLink :size="12" aria-hidden="true" />
              </a>
            </footer>
          </article>
        </div>

        <p class="inline-note">{{ payload.disclaimer }} {{ payload.source }}</p>
      </section>
    </section>
  </DataState>
</template>
