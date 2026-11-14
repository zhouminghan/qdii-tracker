<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, X } from '@lucide/vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const icons = { info: Info, success: CircleCheck, error: CircleAlert }
</script>

<template>
  <Teleport to="body">
    <div class="toast-region" aria-live="polite" aria-atomic="false">
      <div
        v-for="toast in ui.toasts"
        :key="toast.id"
        class="toast"
        :class="`toast-${toast.tone}`"
      >
        <component :is="icons[toast.tone]" :size="17" aria-hidden="true" />
        <span>{{ toast.message }}</span>
        <button type="button" class="toast-close" aria-label="关闭提示" @click="ui.dismiss(toast.id)">
          <X :size="14" aria-hidden="true" />
        </button>
      </div>
    </div>
  </Teleport>
</template>
