import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

type ThemePreference = 'system' | 'light' | 'dark'
type ColorPreference = 'red-up' | 'green-up'

const STORAGE_KEY = 'qdii-settings-v2'
const LEGACY_FAVORITES_KEY = 'qdii-favs'
const LEGACY_HIDDEN_FAVORITES_KEY = 'qdii-favs-hidden'

export const DEFAULT_FAVORITES = [
  '050025',
  '160213',
  '513500',
  '513100',
  '513390',
  '513300',
  '159501',
] as const

function readStringList(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value.map(String) : []
  } catch {
    return []
  }
}

function readStoredSettings(): {
  theme?: ThemePreference
  colorMode?: ColorPreference
  favorites?: string[]
  hiddenDefaultFavorites?: string[]
} {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const saved = readStoredSettings()
  const theme = ref<ThemePreference>(saved.theme ?? 'system')
  const colorMode = ref<ColorPreference>(saved.colorMode ?? 'red-up')
  const explicitFavorites = ref<string[]>(
    Array.isArray(saved.favorites) ? saved.favorites : readStringList(LEGACY_FAVORITES_KEY),
  )
  const hiddenDefaultFavorites = ref<string[]>(
    Array.isArray(saved.hiddenDefaultFavorites)
      ? saved.hiddenDefaultFavorites
      : readStringList(LEGACY_HIDDEN_FAVORITES_KEY),
  )
  const favorites = computed(() => [...new Set([
    ...explicitFavorites.value,
    ...DEFAULT_FAVORITES.filter((code) => !hiddenDefaultFavorites.value.includes(code)),
  ])])
  const settingsOpen = ref(false)
  const systemDark = ref(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)

  const resolvedTheme = computed<'light' | 'dark'>(() => {
    if (theme.value === 'system') return systemDark.value ? 'dark' : 'light'
    return theme.value
  })

  function applyTheme(): void {
    const root = document.documentElement
    root.dataset.theme = resolvedTheme.value
    root.dataset.colorMode = colorMode.value
    root.style.colorScheme = resolvedTheme.value
  }

  function toggleTheme(): void {
    theme.value = resolvedTheme.value === 'dark' ? 'light' : 'dark'
  }

  function toggleFavorite(code: string): void {
    if (DEFAULT_FAVORITES.includes(code as typeof DEFAULT_FAVORITES[number])) {
      if (favorites.value.includes(code)) {
        hiddenDefaultFavorites.value = [...new Set([...hiddenDefaultFavorites.value, code])]
        explicitFavorites.value = explicitFavorites.value.filter((item) => item !== code)
      } else {
        hiddenDefaultFavorites.value = hiddenDefaultFavorites.value.filter((item) => item !== code)
      }
      return
    }
    explicitFavorites.value = explicitFavorites.value.includes(code)
      ? explicitFavorites.value.filter((item) => item !== code)
      : [...explicitFavorites.value, code]
  }

  function isFavorite(code: string): boolean {
    return favorites.value.includes(code)
  }

  watch([theme, colorMode, explicitFavorites, hiddenDefaultFavorites], () => {
    applyTheme()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: theme.value,
      colorMode: colorMode.value,
      favorites: explicitFavorites.value,
      hiddenDefaultFavorites: hiddenDefaultFavorites.value,
    }))
  }, { deep: true })

  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  media?.addEventListener('change', (event) => {
    systemDark.value = event.matches
    applyTheme()
  })
  applyTheme()

  return {
    theme,
    colorMode,
    favorites,
    settingsOpen,
    resolvedTheme,
    toggleTheme,
    toggleFavorite,
    isFavorite,
    applyTheme,
  }
})
