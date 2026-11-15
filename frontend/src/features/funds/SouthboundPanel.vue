<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { CircleAlert, Info, Landmark, ShieldCheck } from '@lucide/vue'
import DataState from '@/shared/components/DataState.vue'
import { fetchJson } from '@/shared/infrastructure/http'
import { formatNumber, formatPercent, movementClass, movementSurfaceClass } from '@/shared/lib/format'
import type { SouthboundData } from '@/types/data'

const payload = ref<SouthboundData | null>(null)
const loading = ref(true)
const error = ref('')

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

onMounted(load)
</script>

<template>
  <DataState :loading="loading" :error="error" @retry="load">
    <section v-for="product in payload?.products ?? []" :key="product.code" class="southbound-panel">
      <header class="southbound-head">
        <div>
          <div class="eyebrow">跨境理财通 · 南向通</div>
          <h2>{{ product.name }}</h2>
          <p>{{ product.status }}</p>
        </div>
        <span class="badge badge-accent">{{ product.channel_type }} · 香港代销</span>
      </header>

      <div class="southbound-hero">
        <div class="southbound-code">
          <span>{{ product.code === product.ticker ? '港交所代码' : '银行渠道代码' }}</span>
          <strong class="mono">{{ product.code }}</strong>
          <small>{{ product.share_class }} · {{ product.currency }}</small>
          <small>ISIN {{ product.isin }}</small>
          <small v-if="product.code !== product.ticker">官方 {{ product.ticker }}</small>
        </div>
        <div class="southbound-return" :class="movementSurfaceClass(product.one_year_return_pct)">
          <span>近一年收益</span>
          <strong class="mono" :class="movementClass(product.one_year_return_pct)">{{ product.one_year_return_pct == null ? '待核验' : formatPercent(product.one_year_return_pct) }}</strong>
          <small>以渠道页面为准</small>
        </div>
        <div class="southbound-quota">
          <span>个人总额度</span>
          <strong class="mono">¥{{ formatNumber(product.personal_quota_cny, 0) }}</strong>
          <small>资格与额度以监管及银行审核为准</small>
        </div>
      </div>

      <div class="southbound-channel-row">
        <Landmark :size="16" aria-hidden="true" />
        <span v-for="channel in product.channels" :key="channel" class="chip">{{ channel }}</span>
      </div>

      <div class="southbound-notes">
        <article>
          <h3><ShieldCheck :size="16" aria-hidden="true" />渠道优势</h3>
          <ul>
            <li v-for="item in product.advantages" :key="item">{{ item }}</li>
          </ul>
        </article>
        <article>
          <h3><CircleAlert :size="16" aria-hidden="true" />风险与核验</h3>
          <ul>
            <li v-for="item in product.risks" :key="item">{{ item }}</li>
          </ul>
        </article>
      </div>

      <div class="notice">
        <Info :size="15" aria-hidden="true" />
        <span>{{ product.quota_note }} {{ payload?.disclaimer }}</span>
      </div>
      <a class="button button-secondary southbound-official-link" :href="product.official_url" target="_blank" rel="noreferrer">
        查看基金公司官方产品页
      </a>
    </section>
  </DataState>
</template>
