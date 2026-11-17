<script setup lang="ts">
import { computed } from 'vue'
import BaseDrawer from '@/shared/components/BaseDrawer.vue'
import { metricKnowledge, type MetricKnowledge } from './metricKnowledge'

const props = defineProps<{
  open: boolean
  metricIds: string[]
  title?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const entries = computed(() => props.metricIds
  .map((id) => metricKnowledge(id))
  .filter((entry): entry is MetricKnowledge => Boolean(entry)))
</script>

<template>
  <BaseDrawer
    :open="open"
    :title="title || '指标说明'"
    eyebrow="Market 知识"
    width="min(680px, 100vw)"
    @close="emit('close')"
  >
    <div class="metric-knowledge-list">
      <details
        v-for="entry in entries"
        :key="entry.id"
        class="metric-knowledge"
        :open="entries.length === 1"
      >
        <summary>
          <span class="eyebrow">{{ entry.name }}</span>
          <p>{{ entry.oneLiner }}</p>
        </summary>
        <div class="metric-knowledge-body">
          <section v-if="entry.formula">
            <h4>公式</h4>
            <p class="mono">{{ entry.formula }}</p>
          </section>
          <section>
            <h4>主要用途</h4>
            <p>{{ entry.purpose }}</p>
          </section>
          <section>
            <h4>如何解读</h4>
            <ul>
              <li v-for="line in entry.interpretation" :key="line">{{ line }}</li>
            </ul>
          </section>
          <section>
            <h4>常见误区</h4>
            <ul>
              <li v-for="line in entry.pitfalls" :key="line">{{ line }}</li>
            </ul>
          </section>
          <section>
            <h4>当前项目口径</h4>
            <p>{{ entry.methodology }}</p>
            <p class="metric-knowledge-source">来源：{{ entry.source }}</p>
          </section>
        </div>
      </details>
      <p v-if="!entries.length" class="muted">暂无该指标说明。</p>
    </div>
  </BaseDrawer>
</template>
