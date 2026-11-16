import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type {
  CatalogEnvelope,
  FundCategory,
  MarketSnapshot,
} from '@/types/data'
import { fetchJson } from '@/shared/infrastructure/http'
import { loadScriptJsonp } from '@/shared/infrastructure/jsonp'
import { getDefaultShare, type FundRow } from '@/shared/lib/funds'
import { useSettingsStore } from './settings'
import { parseTencentQuote, TENCENT_INDEX_SYMBOLS, tencentEtfSymbol } from '@/shared/lib/realtime'

export const useDataStore = defineStore('data', () => {
  const catalog = shallowRef<CatalogEnvelope | null>(null)
  const market = shallowRef<MarketSnapshot | null>(null)
  const loading = ref(false)
  const error = ref('')
  const loadedAt = ref<string>('')
  const etfLiveUpdatedAt = ref('')
  const indexLiveUpdatedAt = ref('')
  const etfLiveError = ref('')
  const indexLiveError = ref('')
  const etfLiveLoading = ref(false)
  const indexLiveLoading = ref(false)
  const liveQuotes = ref<Record<string, {
    price: number
    changePct: number | null
    nav: number | null
    premium: number | null
  }>>({})
  const liveIndices = ref<Record<string, {
    price: number
    changePct: number | null
    asOf: string | null
    updatedAt: string | null
  }>>({})
  let loadPromise: Promise<void> | null = null
  let etfLivePromise: Promise<void> | null = null
  let indexLivePromise: Promise<void> | null = null
  let etfLiveController: AbortController | null = null
  let indexLiveController: AbortController | null = null

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
          defaultShare: liveQuotes.value[defaultShare.code]
            ? {
                ...defaultShare,
                etf_price: liveQuotes.value[defaultShare.code].price,
                etf_change_pct: liveQuotes.value[defaultShare.code].changePct,
                etf_premium: liveQuotes.value[defaultShare.code].premium,
              }
            : defaultShare,
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

  async function refreshEtfQuotes(): Promise<void> {
    if (etfLivePromise) return etfLivePromise
    if (!catalog.value) return
    const etfs = catalog.value.data.categories.etf.series.flatMap((series) => series.shares)
    const symbols = etfs.map((share) => tencentEtfSymbol(share.code))
    if (!symbols.length) return
    etfLiveLoading.value = true
    etfLiveError.value = ''
    const controller = new AbortController()
    etfLiveController = controller
    etfLivePromise = (async () => {
      try {
        const payload = await loadScriptJsonp(
          `https://qt.gtimg.cn/q=${symbols.join(',')}&t=${Date.now()}`,
          () => {
            const result: typeof liveQuotes.value = {}
            for (const symbol of symbols) {
              const raw = (window as unknown as Record<string, unknown>)[`v_${symbol}`]
              if (typeof raw !== 'string') continue
              const quote = parseTencentQuote(raw)
              if (quote) result[symbol.slice(2)] = quote
            }
            return result
          },
          { signal: controller.signal },
        )
        if (!Object.keys(payload).length) throw new Error('实时行情暂无有效报价')
        liveQuotes.value = payload
        etfLiveUpdatedAt.value = new Date().toISOString()
      } catch (reason) {
        liveQuotes.value = {}
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        etfLiveError.value = reason instanceof Error ? reason.message : '实时行情刷新失败'
      } finally {
        if (etfLiveController === controller) etfLiveController = null
        etfLiveLoading.value = false
        etfLivePromise = null
      }
    })()
    return etfLivePromise
  }

  async function refreshIndexQuotes(): Promise<void> {
    if (indexLivePromise) return indexLivePromise
    const symbols = Object.keys(TENCENT_INDEX_SYMBOLS)
    indexLiveLoading.value = true
    indexLiveError.value = ''
    const controller = new AbortController()
    indexLiveController = controller
    indexLivePromise = (async () => {
      try {
        const payload = await loadScriptJsonp(
          `https://qt.gtimg.cn/q=${symbols.join(',')}&t=${Date.now()}`,
          () => {
            const result: typeof liveIndices.value = {}
            for (const symbol of symbols) {
              const raw = (window as unknown as Record<string, unknown>)[`v_${symbol}`]
              if (typeof raw !== 'string') continue
              const quote = parseTencentQuote(raw)
              if (!quote) continue
              result[TENCENT_INDEX_SYMBOLS[symbol]] = {
                price: quote.price,
                changePct: quote.changePct,
                asOf: quote.asOf,
                updatedAt: quote.updatedAt,
              }
            }
            return result
          },
          { signal: controller.signal },
        )
        if (!Object.keys(payload).length) throw new Error('实时指数暂无有效报价')
        liveIndices.value = payload
        indexLiveUpdatedAt.value = new Date().toISOString()
      } catch (reason) {
        liveIndices.value = {}
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        indexLiveError.value = reason instanceof Error ? reason.message : '实时指数刷新失败'
      } finally {
        if (indexLiveController === controller) indexLiveController = null
        indexLiveLoading.value = false
        indexLivePromise = null
      }
    })()
    return indexLivePromise
  }

  function cancelLiveRefreshes(): void {
    etfLiveController?.abort()
    indexLiveController?.abort()
  }

  return {
    catalog,
    market,
    loading,
    error,
    loadedAt,
    etfLiveUpdatedAt,
    indexLiveUpdatedAt,
    etfLiveError,
    indexLiveError,
    etfLiveLoading,
    indexLiveLoading,
    liveQuotes,
    liveIndices,
    categories,
    generatedAt,
    quality,
    allRows,
    fundByCode,
    load,
    retry,
    refreshEtfQuotes,
    refreshIndexQuotes,
    cancelLiveRefreshes,
  }
})
