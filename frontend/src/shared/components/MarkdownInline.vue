<script setup lang="ts">
import type { MarkdownToken } from '@/shared/lib/markdown'

defineProps<{ tokens: MarkdownToken[] }>()
</script>

<template>
  <template v-for="(token, index) in tokens" :key="`${token.type}-${index}`">
    <a
      v-if="token.type === 'link'"
      :href="token.href"
      target="_blank"
      rel="noreferrer"
    >{{ token.text }}</a>
    <strong v-else-if="token.type === 'strong'">{{ token.text }}</strong>
    <template v-else>{{ token.text }}</template>
  </template>
</template>
