<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from '@lucide/vue'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  eyebrow?: string
  side?: 'right' | 'bottom' | 'responsive'
  width?: string
}>(), {
  eyebrow: '',
  side: 'right',
  width: 'min(560px, 100vw)',
})

const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
let appRoot: HTMLElement | null = null
let appWasInert = false
let previousBodyOverflow = ''
let isActive = false

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(): HTMLElement[] {
  if (!dialog.value) return []
  return [...dialog.value.querySelectorAll<HTMLElement>(focusableSelector)]
    .filter((element) => (
      element.getAttribute('aria-hidden') !== 'true'
      && !element.closest('[inert]')
      && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== 'hidden'
    ))
}

function focusInitialElement(): void {
  const [first] = getFocusableElements()
  ;(first ?? dialog.value)?.focus({ preventScroll: true })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return

  const focusable = getFocusableElements()
  if (!focusable.length) {
    event.preventDefault()
    dialog.value?.focus({ preventScroll: true })
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const activeIndex = active ? focusable.indexOf(active) : -1

  if (event.shiftKey && (activeIndex <= 0)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (activeIndex === -1 || active === last)) {
    event.preventDefault()
    first.focus()
  }
}

async function activate(): Promise<void> {
  if (isActive) return
  isActive = true
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  appRoot = document.getElementById('app')
  if (appRoot) {
    appWasInert = appRoot.inert
    appRoot.inert = true
  }

  document.addEventListener('keydown', onKeydown, true)
  await nextTick()
  if (isActive && props.open) focusInitialElement()
}

function release(): void {
  if (!isActive) return
  isActive = false
  document.removeEventListener('keydown', onKeydown, true)
  document.body.style.overflow = previousBodyOverflow

  if (appRoot) appRoot.inert = appWasInert
  appRoot = null

  const focusTarget = previousFocus
  previousFocus = null
  if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true })
}

watch(() => props.open, (open) => {
  if (open) void activate()
}, { immediate: true })

onBeforeUnmount(release)
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer" @after-leave="release">
      <div v-if="open" class="drawer-layer" @click.self="emit('close')">
        <section
          ref="dialog"
          class="drawer-panel"
          :class="`drawer-${side}`"
          :style="{ '--drawer-width': width }"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
        >
          <header class="drawer-header">
            <div>
              <div v-if="eyebrow" class="eyebrow">{{ eyebrow }}</div>
              <h2>{{ title }}</h2>
            </div>
            <button class="icon-button" type="button" aria-label="关闭" @click="emit('close')">
              <X :size="18" aria-hidden="true" />
            </button>
          </header>
          <div class="drawer-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="drawer-footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
