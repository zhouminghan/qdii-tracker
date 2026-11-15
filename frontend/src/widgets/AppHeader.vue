<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Landmark,
  Moon,
  Search,
  Settings,
  Sun,
  X,
} from '@lucide/vue'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const ui = useUiStore()
const search = ref(ui.quickSearch)

const items = [
  { to: '/market', label: '市场' },
  { to: '/funds', label: '基金' },
  { to: '/research', label: '笔记' },
  { to: '/portfolio', label: '账户' },
]

const currentPath = computed(() => route.path)

watch(() => ui.quickSearch, (value) => {
  search.value = value
})

watch(search, (value) => {
  ui.quickSearch = value.trim()
})

function applySearch(): void {
  ui.quickSearch = search.value.trim()
  if (route.path !== '/funds') void router.push('/funds')
}

function clearSearch(): void {
  search.value = ''
  ui.quickSearch = ''
}
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <RouterLink class="brand-block" to="/funds" aria-label="QDII Tracker 首页">
        <span class="brand-symbol" aria-hidden="true">
          <Landmark :size="17" :stroke-width="2.2" />
        </span>
        <span class="brand-copy">
          <strong>QDII Tracker</strong>
          <small>个人基金与笔记终端</small>
        </span>
      </RouterLink>

      <nav class="desktop-nav" aria-label="主导航">
        <RouterLink
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: currentPath === item.to }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <form class="header-search" role="search" @submit.prevent="applySearch">
        <Search :size="15" aria-hidden="true" />
        <input
          v-model="search"
          type="search"
          aria-label="搜索基金代码、名称或公司"
          placeholder="搜索基金"
          autocomplete="off"
          @keydown.esc="clearSearch"
        />
        <button
          v-if="search"
          class="header-search-clear"
          type="button"
          aria-label="清空基金搜索"
          @click="clearSearch"
        >
          <X :size="13" aria-hidden="true" />
        </button>
      </form>

      <div class="header-actions">
        <a
          class="icon-button"
          href="https://github.com/zhouminghan/qdii-tracker"
          target="_blank"
          rel="noreferrer"
          aria-label="打开 GitHub 仓库"
          title="GitHub 仓库"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.2c-3.23.7-3.91-1.37-3.91-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.06-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.79 2.74 1.27 3.41.97.11-.76.41-1.27.74-1.56-2.58-.29-5.29-1.29-5.29-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.75 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.4-2.72 5.38-5.3 5.67.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.79.56A11.5 11.5 0 0 0 12 .7Z" />
          </svg>
        </a>
        <button
          class="icon-button"
          type="button"
          :aria-label="settings.resolvedTheme === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          :title="settings.resolvedTheme === 'dark' ? '浅色主题' : '深色主题'"
          @click="settings.toggleTheme"
        >
          <Sun v-if="settings.resolvedTheme === 'dark'" :size="17" aria-hidden="true" />
          <Moon v-else :size="17" aria-hidden="true" />
        </button>
        <button
          class="icon-button"
          type="button"
          aria-label="打开设置"
          title="设置"
          @click="settings.settingsOpen = true"
        >
          <Settings :size="17" aria-hidden="true" />
        </button>
      </div>
    </div>
  </header>
</template>
