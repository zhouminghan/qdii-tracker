import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DEFAULT_FAVORITES, useSettingsStore } from '@/stores/settings'

describe('default favorites', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('restores legacy defaults and keeps them pinned', () => {
    const settings = useSettingsStore()
    expect(settings.favorites).toEqual(expect.arrayContaining([...DEFAULT_FAVORITES]))
    expect(settings.isFavorite('050025')).toBe(true)

    settings.toggleFavorite('050025')
    expect(settings.isFavorite('050025')).toBe(false)

    settings.toggleFavorite('050025')
    expect(settings.isFavorite('050025')).toBe(true)
  })

  it('still allows adding a non-default favorite', () => {
    const settings = useSettingsStore()
    settings.toggleFavorite('018043')
    expect(settings.isFavorite('018043')).toBe(true)
    settings.toggleFavorite('018043')
    expect(settings.isFavorite('018043')).toBe(false)
  })
})
