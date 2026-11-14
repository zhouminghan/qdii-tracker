<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleAlert,
  Download,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  WalletCards,
} from '@lucide/vue'
import DataState from '@/shared/components/DataState.vue'
import BaseDrawer from '@/shared/components/BaseDrawer.vue'
import EChart from '@/shared/components/EChart.vue'
import { downloadJson, formatDate, formatNumber, formatPercent, movementClass, todayIso } from '@/shared/lib/format'
import { exportLocalBackup, importLocalBackup, parseBackup } from '@/shared/infrastructure/local-db'
import { fetchJson } from '@/shared/infrastructure/http'
import type { KlineData } from '@/types/data'
import { useDataStore } from '@/stores/data'
import { usePortfolioStore } from '@/stores/portfolio'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const data = useDataStore()
const portfolio = usePortfolioStore()
const settings = useSettingsStore()
const ui = useUiStore()

const activeView = ref<'positions' | 'trades'>('positions')
const positionOpen = ref(false)
const tradeOpen = ref(false)
const deleteOpen = ref(false)
const deleteCode = ref('')
const deleteTradeOpen = ref(false)
const deleteTradeId = ref<number | null>(null)
const editingTradeId = ref<number | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
const formError = ref('')
const saving = ref(false)
const trendLoading = ref(false)
const trendSeries = ref<Array<{ date: string; pnl: number; value: number }>>([])

const positionForm = ref({
  code: '',
  principal: '',
  total: '',
  gain: '',
  platform: '支付宝',
})
const tradeForm = ref({
  code: '',
  side: 'buy' as 'buy' | 'sell',
  amount: '',
  price: '',
  fee: '',
  date: todayIso(),
})

const totalPnl = computed(() => portfolio.pnl)
const allocation = computed(() => {
  const entries = portfolio.rows
    .map((row) => ({ name: row.name, value: row.value ?? row.cost }))
    .sort((a, b) => b.value - a.value)
  if (entries.length <= 7) return entries
  const head = entries.slice(0, 6)
  const other = entries.slice(6).reduce((sum, item) => sum + item.value, 0)
  return [...head, { name: '其他', value: other }]
})
const allocationOption = computed(() => ({
  animationDuration: 240,
  tooltip: { trigger: 'item', formatter: '{b}<br/>¥{c}<br/>{d}%' },
  legend: { bottom: 0, left: 'center', textStyle: { fontSize: 11 } },
  series: [{
    type: 'pie',
    radius: ['48%', '70%'],
    center: ['50%', '44%'],
    avoidLabelOverlap: true,
    itemStyle: { borderWidth: 2, borderColor: settings.resolvedTheme === 'dark' ? '#191c22' : '#ffffff' },
    label: { show: false },
    data: allocation.value,
  }],
}))
const trendOption = computed(() => ({
  animationDuration: 240,
  grid: { left: 10, right: 12, top: 18, bottom: 25, containLabel: true },
  tooltip: { trigger: 'axis', valueFormatter: (value: number) => `¥${formatNumber(value)}` },
  xAxis: {
    type: 'category',
    data: trendSeries.value.map((item) => item.date),
    axisLabel: { hideOverlap: true },
  },
  yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { opacity: 0.18 } } },
  series: [{
    type: 'line',
    name: '近似收益',
    showSymbol: false,
    lineStyle: { width: 1.8 },
    areaStyle: { opacity: 0.08 },
    data: trendSeries.value.map((item) => item.pnl),
  }],
}))

const positionCodes = computed(() => data.allRows.flatMap((row) => row.shares.map((share) => ({
  code: share.code,
  label: `${share.code} ${share.name}`,
}))))

watch(() => positionForm.value.code, (code) => {
  const fund = data.fundByCode.get(code)
  if (!fund) return
  const isEtf = fund.row.category === 'etf'
  const price = isEtf ? fund.share.etf_price ?? fund.share.nav : fund.share.nav
  if (price && positionOpen.value) {
    const total = Number(positionForm.value.total)
    if (Number.isFinite(total) && total > 0) {
      positionForm.value.total = (total).toFixed(2)
    }
  }
})

function deriveAmounts(): void {
  const principal = positionForm.value.principal === '' ? null : Number(positionForm.value.principal)
  const total = positionForm.value.total === '' ? null : Number(positionForm.value.total)
  const gain = positionForm.value.gain === '' ? null : Number(positionForm.value.gain)
  if (principal !== null && total !== null && gain === null) positionForm.value.gain = (total - principal).toFixed(2)
  else if (principal !== null && gain !== null && total === null) positionForm.value.total = (principal + gain).toFixed(2)
  else if (total !== null && gain !== null && principal === null) positionForm.value.principal = (total - gain).toFixed(2)
}

async function savePosition(): Promise<void> {
  formError.value = ''
  deriveAmounts()
  const principal = Number(positionForm.value.principal)
  const total = Number(positionForm.value.total)
  if (!positionForm.value.code) {
    formError.value = '请输入已收录的基金代码'
    return
  }
  if (!(principal >= 0) || !(total > 0)) {
    formError.value = '请至少填写本金、总金额、持有收益中的两项'
    return
  }
  saving.value = true
  try {
    await portfolio.savePosition({
      code: positionForm.value.code.match(/\d{6}/)?.[0] ?? positionForm.value.code,
      principal,
      total,
      platform: positionForm.value.platform,
    })
    positionOpen.value = false
    ui.toast('持仓已保存', 'success')
    void loadTrend()
  } catch (reason) {
    formError.value = reason instanceof Error ? reason.message : '持仓保存失败'
  } finally {
    saving.value = false
  }
}

async function saveTrade(): Promise<void> {
  formError.value = ''
  saving.value = true
  try {
    const code = tradeForm.value.code.match(/\d{6}/)?.[0] ?? tradeForm.value.code
    if (editingTradeId.value !== null) {
      const existing = portfolio.trades.find((trade) => trade.id === editingTradeId.value)
      if (!existing) throw new Error('交易记录不存在')
      const amount = Number(tradeForm.value.amount)
      const price = Number(tradeForm.value.price)
      if (!(amount > 0) || !(price > 0)) throw new Error('金额和成交价必须大于 0')
      await portfolio.updateTrade({
        ...existing,
        code,
        side: tradeForm.value.side,
        amount,
        price,
        qty: amount / price,
        fee: Number(tradeForm.value.fee) || 0,
        date: tradeForm.value.date,
      })
    } else {
      await portfolio.recordTrade({
        code,
        side: tradeForm.value.side,
        amount: Number(tradeForm.value.amount),
        price: tradeForm.value.price ? Number(tradeForm.value.price) : undefined,
        fee: tradeForm.value.fee ? Number(tradeForm.value.fee) : 0,
        date: tradeForm.value.date,
      })
    }
    tradeOpen.value = false
    editingTradeId.value = null
    ui.toast('交易已保存', 'success')
    void loadTrend()
  } catch (reason) {
    formError.value = reason instanceof Error ? reason.message : '交易记录失败'
  } finally {
    saving.value = false
  }
}

function askDelete(code: string): void {
  deleteCode.value = code
  deleteOpen.value = true
}

async function confirmDelete(): Promise<void> {
  await portfolio.removePosition(deleteCode.value)
  deleteOpen.value = false
  ui.toast('持仓已删除', 'success')
  void loadTrend()
}

function askDeleteTrade(id: number): void {
  deleteTradeId.value = id
  deleteTradeOpen.value = true
}

async function confirmDeleteTrade(): Promise<void> {
  if (deleteTradeId.value === null) return
  await portfolio.deleteTrade(deleteTradeId.value)
  deleteTradeOpen.value = false
  deleteTradeId.value = null
  ui.toast('交易记录已删除', 'success')
}

async function exportBackup(): Promise<void> {
  try {
    const backup = await exportLocalBackup()
    downloadJson(`qdii-tracker-backup-${todayIso()}.json`, backup)
    ui.toast('本地备份已导出', 'success')
  } catch (reason) {
    ui.toast(reason instanceof Error ? reason.message : '备份导出失败', 'error')
  }
}

async function importBackup(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const backup = parseBackup(await file.text())
    await importLocalBackup(backup)
    await Promise.all([portfolio.load(), data.load()])
    ui.toast('备份已校验并恢复', 'success')
    void loadTrend()
  } catch (reason) {
    ui.toast(reason instanceof Error ? reason.message : '备份恢复失败', 'error')
  } finally {
    if (importInput.value) importInput.value.value = ''
  }
}

async function loadTrend(): Promise<void> {
  trendLoading.value = true
  try {
    const histories = await Promise.allSettled(portfolio.positions.map(async (position) => {
      const payload = await fetchJson<KlineData>(`data/nav-history/${position.code}.json`)
      return { position, payload }
    }))
    const valid = histories
      .filter((item): item is PromiseFulfilledResult<{ position: typeof portfolio.positions[number]; payload: KlineData }> => item.status === 'fulfilled')
      .map((item) => item.value)
    if (!valid.length) {
      trendSeries.value = []
      return
    }
    const dateSet = new Set<string>()
    valid.forEach(({ payload }) => payload.dates.slice(-90).forEach((date) => dateSet.add(date)))
    const dates = [...dateSet].sort()
    const result: Array<{ date: string; pnl: number; value: number }> = []
    for (const date of dates) {
      let totalValue = 0
      let totalCost = 0
      for (const { position, payload } of valid) {
        let index = -1
        for (let cursor = payload.dates.length - 1; cursor >= 0; cursor -= 1) {
          if (payload.dates[cursor] <= date) {
            index = cursor
            break
          }
        }
        if (index < 0) continue
        const price = payload.navs?.[index] ?? payload.close?.[index]
        if (price === undefined || price === null) continue
        totalValue += price * position.shares
        totalCost += position.shares * position.avgCost
      }
      if (totalCost > 0) result.push({ date, pnl: totalValue - totalCost, value: totalValue })
    }
    trendSeries.value = result.slice(-60)
  } finally {
    trendLoading.value = false
  }
}

function resetPositionForm(): void {
  positionForm.value = { code: '', principal: '', total: '', gain: '', platform: '支付宝' }
  formError.value = ''
  positionOpen.value = true
}

function resetTradeForm(): void {
  editingTradeId.value = null
  tradeForm.value = { code: '', side: 'buy', amount: '', price: '', fee: '', date: todayIso() }
  formError.value = ''
  tradeOpen.value = true
}

function editTrade(trade: typeof portfolio.trades[number]): void {
  if (!trade.id) return
  editingTradeId.value = trade.id
  tradeForm.value = {
    code: trade.code,
    side: trade.side,
    amount: String(trade.amount),
    price: String(trade.price),
    fee: String(trade.fee),
    date: trade.date,
  }
  formError.value = ''
  tradeOpen.value = true
}

onMounted(async () => {
  await data.load()
  await portfolio.load()
  void loadTrend()
})
</script>

<template>
  <div class="page portfolio-page">
    <header class="page-header">
      <div class="page-title-group">
        <div class="eyebrow">Local portfolio</div>
        <h1>投资组合</h1>
        <p class="page-subtitle">持仓与交易只保存在当前浏览器。价格来自公共目录，个人数据不会上传。</p>
      </div>
      <div class="page-actions">
        <button class="button button-secondary" type="button" @click="exportBackup">
          <Download :size="15" aria-hidden="true" /> 备份
        </button>
        <button class="button button-secondary" type="button" @click="importInput?.click()">
          <Upload :size="15" aria-hidden="true" /> 恢复
        </button>
        <input ref="importInput" class="visually-hidden" type="file" accept="application/json,.json" aria-label="选择本地备份文件" @change="importBackup" />
        <button class="button button-primary" type="button" @click="resetTradeForm">
          <Plus :size="15" aria-hidden="true" /> 记录交易
        </button>
      </div>
    </header>

    <DataState :loading="data.loading || portfolio.loading" :error="data.error || portfolio.error" @retry="portfolio.load">
      <div class="portfolio-metrics">
        <article class="portfolio-metric hero-metric">
          <span>总资产</span>
          <strong class="mono">¥{{ formatNumber(portfolio.value) }}</strong>
          <small>{{ portfolio.positions.length }} 只持仓</small>
        </article>
        <article class="portfolio-metric">
          <span>持仓成本</span>
          <strong class="mono">¥{{ formatNumber(portfolio.cost) }}</strong>
          <small>按当前份额和成本价</small>
        </article>
        <article class="portfolio-metric">
          <span>持有收益</span>
          <strong class="mono" :class="movementClass(totalPnl)">¥{{ formatNumber(totalPnl) }}</strong>
          <small :class="movementClass(portfolio.pnlPercent)">{{ formatPercent(portfolio.pnlPercent) }}</small>
        </article>
        <article class="portfolio-metric">
          <span>交易记录</span>
          <strong class="mono">{{ portfolio.trades.length }}</strong>
          <small>本地 IndexedDB</small>
        </article>
      </div>

      <div class="portfolio-layout">
        <section class="panel portfolio-main">
          <header class="panel-header">
            <div class="segmented" role="group" aria-label="组合视图">
              <button type="button" :class="{ active: activeView === 'positions' }" @click="activeView = 'positions'">持仓</button>
              <button type="button" :class="{ active: activeView === 'trades' }" @click="activeView = 'trades'">交易流水</button>
            </div>
            <button class="button button-secondary" type="button" @click="resetPositionForm">
              <Plus :size="14" aria-hidden="true" /> 添加持仓
            </button>
          </header>

          <div v-if="activeView === 'positions'" class="panel-body no-padding">
            <div v-if="!portfolio.rows.length" class="page-state portfolio-empty">
              <WalletCards :size="22" aria-hidden="true" />
              <div>
                <strong>还没有持仓</strong>
                <p>录入本金和总金额即可开始计算成本、市值与盈亏。</p>
              </div>
              <button class="button button-primary" type="button" @click="resetPositionForm">添加第一笔持仓</button>
            </div>
            <div v-else class="table-shell portfolio-table-shell">
              <table class="data-table">
                <thead><tr><th>基金</th><th class="align-right">份额 / 成本</th><th class="align-right">市值</th><th class="align-right">收益</th><th class="align-right">收益率</th><th class="align-center">操作</th></tr></thead>
                <tbody>
                  <tr v-for="row in portfolio.rows" :key="row.position.code">
                    <td><strong>{{ row.name }}</strong><span class="mono muted"> {{ row.position.code }}</span><small class="platform-tag">{{ row.position.platform || '未标记平台' }}</small></td>
                    <td class="align-right mono">{{ formatNumber(row.position.shares, 2) }}<small>@ {{ formatNumber(row.position.avgCost, 4) }}</small></td>
                    <td class="align-right mono">¥{{ formatNumber(row.value) }}</td>
                    <td class="align-right mono" :class="movementClass(row.pnl)">¥{{ formatNumber(row.pnl) }}</td>
                    <td class="align-right mono" :class="movementClass(row.pnlPercent)">{{ formatPercent(row.pnlPercent) }}</td>
                    <td class="align-center"><button class="icon-button table-delete" type="button" aria-label="删除持仓" @click="askDelete(row.position.code)"><Trash2 :size="14" /></button></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="portfolio.rows.length" class="portfolio-mobile-list">
              <article v-for="row in portfolio.rows" :key="row.position.code" class="portfolio-mobile-card">
                <div class="portfolio-mobile-head">
                  <div>
                    <strong>{{ row.name }}</strong>
                    <span class="mono">{{ row.position.code }} · {{ row.position.platform || '未标记平台' }}</span>
                  </div>
                  <button class="icon-button table-delete" type="button" aria-label="删除持仓" @click="askDelete(row.position.code)"><Trash2 :size="14" /></button>
                </div>
                <div class="portfolio-mobile-metrics">
                  <div><span>市值</span><strong class="mono">¥{{ formatNumber(row.value) }}</strong></div>
                  <div><span>持有收益</span><strong class="mono" :class="movementClass(row.pnl)">¥{{ formatNumber(row.pnl) }}</strong></div>
                  <div><span>收益率</span><strong class="mono" :class="movementClass(row.pnlPercent)">{{ formatPercent(row.pnlPercent) }}</strong></div>
                </div>
                <div class="portfolio-mobile-cost"><span>{{ formatNumber(row.position.shares, 2) }} 份</span><span>成本 {{ formatNumber(row.position.avgCost, 4) }}</span></div>
              </article>
            </div>
          </div>

          <div v-else class="panel-body no-padding">
            <div v-if="!portfolio.trades.length" class="page-state">暂无交易记录。</div>
            <div v-else class="trade-list">
              <div v-for="trade in portfolio.trades.slice(0, 40)" :key="trade.id" class="trade-row">
                <span class="trade-icon" :class="trade.side">
                  <ArrowUpRight v-if="trade.side === 'buy'" :size="15" aria-hidden="true" />
                  <ArrowDownLeft v-else :size="15" aria-hidden="true" />
                </span>
                <div><strong>{{ data.fundByCode.get(trade.code)?.share.name || trade.code }}</strong><span>{{ formatDate(trade.date) }} · {{ trade.side === 'buy' ? '买入' : '卖出' }} {{ formatNumber(trade.qty, 2) }} 份 @ {{ formatNumber(trade.price, 4) }}</span></div>
                <div class="trade-side-actions">
                  <span class="mono">¥{{ formatNumber(trade.amount) }}</span>
                  <button class="icon-button" type="button" aria-label="编辑交易" @click="editTrade(trade)"><FileText :size="13" /></button>
                  <button class="icon-button" type="button" aria-label="删除交易" @click="trade.id && askDeleteTrade(trade.id)"><Trash2 :size="13" /></button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside class="portfolio-side">
          <article class="panel">
            <header class="panel-header"><div><h3>资产分布</h3><p class="inline-note">按当前市值计算</p></div></header>
            <div class="panel-body">
              <EChart v-if="allocation.length" :option="allocationOption" label="投资组合资产分布饼图" height="260px" />
              <div v-else class="mini-empty">暂无资产</div>
            </div>
          </article>
          <article class="panel">
            <header class="panel-header"><div><h3>近似收益趋势</h3><p class="inline-note">按当前份额回看最近净值，不还原历史交易</p></div><RefreshCw :size="15" :class="{ spin: trendLoading }" aria-hidden="true" /></header>
            <div class="panel-body">
              <EChart v-if="trendSeries.length" :option="trendOption" label="当前持仓近似收益趋势图" height="220px" />
              <div v-else class="mini-empty">添加持仓后显示趋势</div>
            </div>
          </article>
        </aside>
      </div>
    </DataState>

    <BaseDrawer :open="positionOpen" title="添加持仓" eyebrow="Local position" side="bottom" @close="positionOpen = false">
      <div class="form-grid">
        <label class="field span-2"><span>基金代码</span><input v-model="positionForm.code" class="input" list="position-funds" aria-label="基金代码" placeholder="输入代码或名称" /><datalist id="position-funds"><option v-for="fund in positionCodes" :key="fund.code" :value="fund.code">{{ fund.label }}</option></datalist></label>
        <label class="field"><span>本金</span><input v-model="positionForm.principal" class="input" aria-label="本金" type="number" step="any" min="0" @blur="deriveAmounts" /></label>
        <label class="field"><span>总金额 / 市值</span><input v-model="positionForm.total" class="input" aria-label="总金额 / 市值" type="number" step="any" min="0" @blur="deriveAmounts" /></label>
        <label class="field"><span>持有收益</span><input v-model="positionForm.gain" class="input" aria-label="持有收益" type="number" step="any" @blur="deriveAmounts" /></label>
        <label class="field"><span>平台</span><select v-model="positionForm.platform" class="select" aria-label="平台"><option>支付宝</option><option>天天基金</option><option>理财通</option><option>基金公司 App</option><option>券商 App</option><option>其他</option></select></label>
      </div>
      <p class="form-help">本金 + 持有收益 = 总金额；填写任意两项会自动补第三项。</p>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <template #footer><button class="button button-secondary" type="button" @click="positionOpen = false">取消</button><button class="button button-primary" type="button" :disabled="saving" @click="savePosition">保存持仓</button></template>
    </BaseDrawer>

    <BaseDrawer :open="tradeOpen" :title="editingTradeId ? '修改交易' : '记录交易'" eyebrow="Local trade" side="bottom" @close="tradeOpen = false">
      <div class="form-grid">
        <div class="field span-2"><span>方向</span><div class="segmented"><button type="button" :class="{ active: tradeForm.side === 'buy' }" @click="tradeForm.side = 'buy'">买入</button><button type="button" :class="{ active: tradeForm.side === 'sell' }" @click="tradeForm.side = 'sell'">卖出</button></div></div>
        <label class="field span-2"><span>基金代码</span><input v-model="tradeForm.code" class="input" list="position-funds" aria-label="基金代码" /></label>
        <label class="field"><span>交易金额</span><input v-model="tradeForm.amount" class="input" aria-label="交易金额" type="number" step="any" min="0" /></label>
        <label class="field"><span>成交价（可选）</span><input v-model="tradeForm.price" class="input" aria-label="成交价（可选）" type="number" step="any" min="0" /></label>
        <label class="field"><span>手续费</span><input v-model="tradeForm.fee" class="input" aria-label="手续费" type="number" step="any" min="0" /></label>
        <label class="field"><span>日期</span><input v-model="tradeForm.date" class="input" aria-label="日期" type="date" /></label>
      </div>
      <p v-if="editingTradeId" class="form-help">修改只更新交易流水，不会自动重算持仓成本。</p>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <template #footer><button class="button button-secondary" type="button" @click="tradeOpen = false">取消</button><button class="button button-primary" type="button" :disabled="saving" @click="saveTrade">保存交易</button></template>
    </BaseDrawer>

    <BaseDrawer :open="deleteOpen" title="删除持仓" eyebrow="Permanent action" side="bottom" @close="deleteOpen = false">
      <div class="notice notice-danger"><CircleAlert :size="16" aria-hidden="true" />删除持仓不会删除历史交易。该操作不可撤销。</div>
      <p class="confirm-copy">确认删除 {{ deleteCode }} 的持仓？</p>
      <template #footer><button class="button button-secondary" type="button" @click="deleteOpen = false">取消</button><button class="button button-danger" type="button" @click="confirmDelete"><Trash2 :size="14" />确认删除</button></template>
    </BaseDrawer>

    <BaseDrawer :open="deleteTradeOpen" title="删除交易" eyebrow="Permanent action" side="bottom" @close="deleteTradeOpen = false">
      <div class="notice notice-danger"><CircleAlert :size="16" aria-hidden="true" />只删除这条交易流水，不修改当前持仓。</div>
      <p class="confirm-copy">确认删除这条交易记录？</p>
      <template #footer><button class="button button-secondary" type="button" @click="deleteTradeOpen = false">取消</button><button class="button button-danger" type="button" @click="confirmDeleteTrade"><Trash2 :size="14" />确认删除</button></template>
    </BaseDrawer>
  </div>
</template>
