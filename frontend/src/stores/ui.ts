import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface ToastMessage {
  id: number
  tone: 'info' | 'success' | 'error'
  message: string
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<ToastMessage[]>([])
  const quickSearch = ref('')
  let id = 0

  function toast(message: string, tone: ToastMessage['tone'] = 'info'): void {
    const toastId = ++id
    toasts.value.push({ id: toastId, tone, message })
    window.setTimeout(() => dismiss(toastId), 3600)
  }

  function dismiss(toastId: number): void {
    toasts.value = toasts.value.filter((item) => item.id !== toastId)
  }

  return { toasts, quickSearch, toast, dismiss }
})
