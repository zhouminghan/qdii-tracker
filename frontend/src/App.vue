<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import AppHeader from '@/widgets/AppHeader.vue'
import BottomNav from '@/widgets/BottomNav.vue'
import SettingsDrawer from '@/widgets/SettingsDrawer.vue'
import ToastHost from '@/shared/components/ToastHost.vue'
import { useDataStore } from '@/stores/data'
import { useUiStore } from '@/stores/ui'

const data = useDataStore()
const ui = useUiStore()

function focusMain(): void {
  document.getElementById('main-content')?.focus()
}

onMounted(async () => {
  try {
    await data.load()
  } catch {
    ui.toast('公共数据加载失败，请稍后重试', 'error')
  }
})
</script>

<template>
  <a class="skip-link" href="#main-content" @click.prevent="focusMain">跳到主内容</a>
  <AppHeader />
  <main id="main-content" class="app-main" tabindex="-1">
    <RouterView />
  </main>
  <BottomNav />
  <SettingsDrawer />
  <ToastHost />
</template>
