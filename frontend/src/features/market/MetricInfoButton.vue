<script setup lang="ts">
import { Info } from '@lucide/vue'

defineProps<{
  label: string
}>()

const emit = defineEmits<{
  open: []
}>()
</script>

<template>
  <button
    class="metric-info-button"
    type="button"
    :aria-label="`了解 ${label}`"
    :title="`了解 ${label}`"
    @click.stop="emit('open')"
  >
    <Info :size="13" aria-hidden="true" />
  </button>
</template>
