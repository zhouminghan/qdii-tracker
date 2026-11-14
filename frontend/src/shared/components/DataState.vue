<script setup lang="ts">
import { CircleAlert, LoaderCircle } from '@lucide/vue'

defineProps<{
  loading?: boolean
  error?: string
  empty?: boolean
  emptyText?: string
}>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="loading" class="page-state" role="status">
    <LoaderCircle class="spin" :size="20" aria-hidden="true" />
    <span>正在读取本地数据...</span>
  </div>
  <div v-else-if="error" class="page-state page-state-error" role="alert">
    <CircleAlert :size="20" aria-hidden="true" />
    <span>{{ error }}</span>
    <button class="button button-secondary" type="button" @click="$emit('retry')">重试</button>
  </div>
  <div v-else-if="empty" class="page-state">
    <span>{{ emptyText || '暂无数据' }}</span>
    <slot />
  </div>
  <slot v-else />
</template>
