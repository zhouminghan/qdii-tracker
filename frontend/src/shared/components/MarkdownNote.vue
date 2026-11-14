<script setup lang="ts">
import { computed } from 'vue'
import MarkdownInline from '@/shared/components/MarkdownInline.vue'
import { parseMarkdown } from '@/shared/lib/markdown'

const props = defineProps<{ text: string }>()
const blocks = computed(() => parseMarkdown(props.text))
</script>

<template>
  <div class="markdown-note">
    <template v-for="(block, index) in blocks" :key="`${block.type}-${index}`">
      <h1 v-if="block.type === 'heading' && block.level === 1"><MarkdownInline :tokens="block.tokens" /></h1>
      <h2 v-else-if="block.type === 'heading' && block.level === 2"><MarkdownInline :tokens="block.tokens" /></h2>
      <h3 v-else-if="block.type === 'heading'"><MarkdownInline :tokens="block.tokens" /></h3>
      <ul v-else-if="block.type === 'list'">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
          <MarkdownInline :tokens="item" />
        </li>
      </ul>
      <p v-else><MarkdownInline :tokens="block.tokens" /></p>
    </template>
  </div>
</template>
