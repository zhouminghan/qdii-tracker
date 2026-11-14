<script setup lang="ts">
import { useRoute } from 'vue-router'
import {
  BookOpen,
  ChartNoAxesCombined,
  Landmark,
  WalletCards,
} from '@lucide/vue'

const route = useRoute()
const items = [
  { to: '/market', label: 'Market', icon: ChartNoAxesCombined },
  { to: '/funds', label: 'Funds', icon: Landmark },
  { to: '/portfolio', label: 'Portfolio', icon: WalletCards },
  { to: '/research', label: 'Research', icon: BookOpen },
]
</script>

<template>
  <nav class="bottom-nav" aria-label="移动端主导航">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="bottom-nav-link"
      :class="{ active: route.path === item.to }"
    >
      <component :is="item.icon" :size="20" :stroke-width="1.9" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>
