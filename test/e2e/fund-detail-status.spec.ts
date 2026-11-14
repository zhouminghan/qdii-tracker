import { expect, test, type Page } from '@playwright/test'

interface StatusHistoryEntry {
  date: string
  buy_status: string
  daily_limit: number | null
}

interface CatalogShare {
  code: string
  currency: string
  buy_status?: string | null
  daily_limit?: number | null
  buy_status_history?: StatusHistoryEntry[]
}

interface CatalogData {
  data: {
    categories: Record<string, {
      series: Array<{ shares: CatalogShare[] }>
    }>
  }
}

function findShare(catalog: CatalogData, code: string): CatalogShare {
  const share = Object.values(catalog.data.categories)
    .flatMap((category) => category.series)
    .flatMap((series) => series.shares)
    .find((item) => item.code === code)
  expect(share, `catalog should contain share ${code}`).toBeTruthy()
  return share!
}

async function openFundDetail(page: Page, code: string): Promise<void> {
  await page.getByLabel('搜索当前基金目录').fill(code)
  await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible')).toHaveCount(1)
  await page
    .locator('.table-action:visible, .fund-mobile-actions button:visible')
    .filter({ hasText: /详情/ })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

function expectedLimit(entry: StatusHistoryEntry, currency: string): string {
  if (entry.buy_status.includes('暂停')) return '暂停申购，无可用额度'
  if (entry.daily_limit === null) {
    if (entry.buy_status.includes('限')) return '限购额度未公布'
    if (entry.buy_status.includes('开放')) return '不限额'
    return '额度未提供'
  }
  const unit = currency === '美元' ? '美元' : currency === '人民币' ? '元' : currency
  const amount = entry.daily_limit.toLocaleString('zh-CN', {
    minimumFractionDigits: Number.isInteger(entry.daily_limit) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return unit ? `${amount} ${unit}` : amount
}

test.describe('fund purchase-status history', () => {
  test('shows recent status and daily limits for 007721', async ({ page }) => {
    const response = await page.request.get('/data/catalog.json')
    expect(response.ok()).toBeTruthy()
    const catalog = await response.json() as CatalogData
    const share = findShare(catalog, '007721')
    const history = [...(share.buy_status_history ?? [])]
      .sort((left, right) => right.date.localeCompare(left.date))
    expect(history.length).toBeGreaterThan(1)

    await page.goto('/#/funds')
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()
    await openFundDetail(page, '007721')

    const section = page.getByRole('region', { name: '申购状态变化' })
    await expect(section).toBeVisible()
    await expect(section.getByText('默认份额 · 人民币 · 由新到旧')).toBeVisible()
    expect(await section.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy()

    const items = section.getByRole('listitem')
    await expect(items).toHaveCount(Math.min(history.length, 6))
    const latest = history[0]
    await expect(items.first()).toContainText(latest.date)
    await expect(items.first()).toContainText(latest.buy_status)
    await expect(items.first()).toContainText(expectedLimit(latest, share.currency))

    const limited = history.find((entry) => entry.daily_limit !== null)
    expect(limited, '007721 should include a recorded daily limit').toBeTruthy()
    const limitedItem = items.filter({ hasText: limited!.date })
    await expect(limitedItem).toContainText(limited!.buy_status)
    await expect(limitedItem).toContainText(expectedLimit(limited!, share.currency))
  })

  test('shows a clean empty state for an ETF without history', async ({ page }) => {
    const response = await page.request.get('/data/catalog.json')
    expect(response.ok()).toBeTruthy()
    const catalog = await response.json() as CatalogData
    const share = findShare(catalog, '513500')
    expect(share.buy_status_history ?? []).toHaveLength(0)

    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text())
    })

    await page.goto('/#/funds')
    await page.getByRole('button', { name: '场内 ETF' }).click()
    await openFundDetail(page, '513500')

    const section = page.getByRole('region', { name: '申购状态变化' })
    await expect(section).toBeVisible()
    await expect(section.getByText('场内 ETF，不适用申购额度变化记录。')).toBeVisible()
    await expect(section.getByRole('listitem')).toHaveCount(0)
    expect(pageErrors).toEqual([])
  })
})
