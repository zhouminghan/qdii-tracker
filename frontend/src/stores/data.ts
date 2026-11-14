import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type {
  CatalogEnvelope,
  FundCategory,
  MarketSnapshot,
} from '@/types/data'
import { fetchJson } from '@/shared/infrastructure/http'
import { getDefaultShare, type FundRow } from '@/shared/lib/funds'
import { useSettingsStore } from './settings'

export const useDataStore = defineStore('data', () => {
  const catalog = shallowRef<CatalogEnvelope | null>(null)
  const market = shallowRef<MarketSnapshot | null>(null)
  const loading = ref(false)
  const error = ref('')
  const loadedAt = ref<string>('')
  let loadPromise: Promise<void> | null = null

  const settings = useSettingsStore()

  const categories = computed(() => catalog.value?.data.categories ?? null)
  const generatedAt = computed(() => catalog.value?.generated_at ?? '')
  const quality = computed(() => catalog.value?.quality ?? null)

  const allRows = computed<FundRow[]>(() => {
    if (!categories.value) return []
    const rows: FundRow[] = []
    for (const [category, value] of Object.entries(categories.value)) {
      for (const series of value.series) {
        const defaultShare = getDefaultShare(series)
        rows.push({
          ...series,
          category: category as FundCategory,
          defaultShare,
          starred: settings.isFavorite(defaultShare.code),
        })
      }
    }
    return rows
  })

  const fundByCode = computed(() => {
    const index = new Map<string, { row: FundRow; share: FundRow['defaultShare'] }>()
    for (const row of allRows.value) {
      for (const share of row.shares) index.set(share.code, { row, share })
    }
    return index
  })

  async function load(): Promise<void> {
    if (catalog.value && market.value) return
    if (loadPromise) return loadPromise
    loading.value = true
    error.value = ''
    loadPromise = Promise.all([
      fetchJson<CatalogEnvelope>('data/catalog.json'),
      fetchJson<MarketSnapshot>('data/market-snapshot.json'),
    ])
      .then(([catalogData, marketData]) => {
        catalog.value = catalogData
        market.value = marketData
        loadedAt.value = new Date().toISOString()
      })
      .catch((reason: unknown) => {
        catalog.value = null
        market.value = null
        error.value = reason instanceof Error ? reason.message : '公共数据加载失败'
        throw reason
      })
      .finally(() => {
        loading.value = false
        loadPromise = null
      })
    return loadPromise
  }

  async function retry(): Promise<void> {
    catalog.value = null
    market.value = null
    await load()
  }

  return {
    catalog,
    market,
    loading,
    error,
    loadedAt,
    categories,
    generatedAt,
    quality,
    allRows,
    fundByCode,
    load,
    retry,
  }
})
