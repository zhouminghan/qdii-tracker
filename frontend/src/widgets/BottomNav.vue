<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import {
  BookOpen,
  ChartNoAxesCombined,
  Landmark,
  WalletCards,
} from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const items = [
  { to: '/market', label: '市场', icon: ChartNoAxesCombined },
  { to: '/funds', label: '基金', icon: Landmark },
  { to: '/research', label: '笔记', icon: BookOpen },
  { to: '/portfolio', label: '账户', icon: WalletCards },
]

function navigate(to: string): void {
  if (route.path !== to) void router.push(to)
}
</script>

<template>
  <nav class="bottom-nav" aria-label="移动端主导航">
    <a
      v-for="item in items"
      :key="item.to"
      :href="`#${item.to}`"
      class="bottom-nav-link"
      :class="{ active: route.path === item.to }"
      :aria-current="route.path === item.to ? 'page' : undefined"
      @click.prevent="navigate(item.to)"
      @touchend.prevent="navigate(item.to)"
    >
      <component :is="item.icon" :size="20" :stroke-width="1.9" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </a>
  </nav>
</template>
