import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

type ThemePreference = 'system' | 'light' | 'dark'
type ColorPreference = 'red-up' | 'green-up'

const STORAGE_KEY = 'qdii-settings-v2'

function readStoredSettings(): {
  theme?: ThemePreference
  colorMode?: ColorPreference
  favorites?: string[]
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
  const favorites = ref<string[]>(Array.isArray(saved.favorites) ? saved.favorites : [])
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
    favorites.value = favorites.value.includes(code)
      ? favorites.value.filter((item) => item !== code)
      : [...favorites.value, code]
  }

  function isFavorite(code: string): boolean {
    return favorites.value.includes(code)
  }

  watch([theme, colorMode, favorites], () => {
    applyTheme()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: theme.value,
      colorMode: colorMode.value,
      favorites: favorites.value,
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
