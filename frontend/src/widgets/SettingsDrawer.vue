<script setup lang="ts">
import { computed } from 'vue'
import { Database, Download, Palette, RefreshCw, Trash2, Upload } from '@lucide/vue'
import BaseDrawer from '@/shared/components/BaseDrawer.vue'
import DataState from '@/shared/components/DataState.vue'
import { formatDateTime } from '@/shared/lib/format'
import { useDataStore } from '@/stores/data'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const data = useDataStore()
const qualityTone = computed(() => data.quality?.status === 'ok' ? 'ok' : 'warn')
</script>

<template>
  <BaseDrawer
    :open="settings.settingsOpen"
    title="设置"
    eyebrow="Preferences & local data"
    @close="settings.settingsOpen = false"
  >
    <section class="settings-section">
      <div class="section-heading">
        <Palette :size="17" aria-hidden="true" />
        <div>
          <h3>显示</h3>
          <p>主题与涨跌颜色仅保存在当前浏览器。</p>
        </div>
      </div>
      <div class="form-row">
        <label for="theme-select">主题</label>
        <select id="theme-select" v-model="settings.theme" class="input">
          <option value="system">跟随系统</option>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
        </select>
      </div>
      <div class="form-row">
        <label for="color-select">涨跌颜色</label>
        <select id="color-select" v-model="settings.colorMode" class="input">
          <option value="red-up">红涨绿跌</option>
          <option value="green-up">绿涨红跌</option>
        </select>
      </div>
    </section>

    <section class="settings-section">
      <div class="section-heading">
        <Database :size="17" aria-hidden="true" />
        <div>
          <h3>数据状态</h3>
          <p>公共目录与浏览器本地数据彼此分离。</p>
        </div>
      </div>
      <DataState :loading="data.loading" :error="data.error" @retry="data.retry">
        <dl class="settings-kv">
          <div>
            <dt>基金目录</dt>
            <dd>{{ data.catalog?.data.summary.series_count ?? '--' }} 个系列</dd>
          </div>
          <div>
            <dt>数据日期</dt>
            <dd>{{ formatDateTime(data.generatedAt) }}</dd>
          </div>
          <div>
            <dt>质量</dt>
            <dd><span class="status-dot" :class="qualityTone" />{{ data.quality?.status ?? '--' }}</dd>
          </div>
        </dl>
        <p v-if="data.quality?.warnings.length" class="inline-note">
          {{ data.quality.warnings[0] }}
        </p>
      </DataState>
    </section>

    <section class="settings-section">
      <div class="section-heading">
        <Database :size="17" aria-hidden="true" />
        <div>
          <h3>个人数据</h3>
          <p>资产、交易和研究记录不上传。备份操作在 Portfolio 和 Research 中执行。</p>
        </div>
      </div>
      <div class="button-row">
        <RouterLink class="button button-secondary" to="/portfolio" @click="settings.settingsOpen = false">
          <Upload :size="15" aria-hidden="true" /> 打开本地工作区
        </RouterLink>
        <button class="button button-secondary" type="button" disabled>
          <Download :size="15" aria-hidden="true" /> 全量备份（Portfolio 内）
        </button>
      </div>
    </section>

    <section class="settings-section danger-zone">
      <div class="section-heading">
        <Trash2 :size="17" aria-hidden="true" />
        <div>
          <h3>维护</h3>
          <p>清除数据需要输入确认，恢复失败不会覆盖现有数据。</p>
        </div>
      </div>
      <div class="button-row">
        <button class="button button-secondary" type="button" @click="data.retry">
          <RefreshCw :size="15" aria-hidden="true" /> 重新读取公共数据
        </button>
      </div>
    </section>
  </BaseDrawer>
</template>
