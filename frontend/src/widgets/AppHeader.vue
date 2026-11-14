<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Code2,
  Landmark,
  Moon,
  Search,
  Settings,
  Sun,
} from '@lucide/vue'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const ui = useUiStore()
const search = ref(ui.quickSearch)

const items = [
  { to: '/market', label: 'Market' },
  { to: '/funds', label: 'Funds' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/research', label: 'Research' },
]

const currentPath = computed(() => route.path)

watch(() => ui.quickSearch, (value) => {
  search.value = value
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
          <small>Personal research terminal</small>
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

      <form v-if="currentPath !== '/funds'" class="header-search" role="search" @submit.prevent="applySearch">
        <Search :size="15" aria-hidden="true" />
        <input
          v-model="search"
          type="search"
          aria-label="搜索基金代码、名称或公司"
          placeholder="搜索基金"
          autocomplete="off"
          @keydown.esc="clearSearch"
        />
      </form>

      <div class="header-actions" :class="{ 'header-actions-end': currentPath === '/funds' }">
        <a
          class="icon-button desktop-only"
          href="https://github.com/zhouminghan/qdii-tracker"
          target="_blank"
          rel="noreferrer"
          aria-label="打开 GitHub 仓库"
          title="GitHub 仓库"
        >
          <Code2 :size="17" aria-hidden="true" />
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
