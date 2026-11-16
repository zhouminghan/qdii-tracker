import { expect, test } from '@playwright/test'

test('renders market charts and the DCA strategy matrix', async ({ page }) => {
  await page.goto('/#/market')
  await expect(page.getByRole('heading', { name: '市场', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'VIX & PE 阶梯定投' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'VIX 与 PE 阶梯定投矩阵' })).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible()
  await expect(page.locator('.annual-heat-cell').first()).toContainText('%')
  await page.getByRole('button', { name: '月度', exact: true }).click()
  await expect(page.locator('.monthly-heat-table')).toBeVisible()
  await expect(page.locator('.monthly-heat-table tbody td').first()).toContainText('%')
})

test('keeps the Market route intact while navigating sections', async ({ page }) => {
  await page.goto('/#/market')
  await expect(page.getByRole('heading', { name: '市场', exact: true })).toBeVisible()
  const globalLink = page.getByRole('link', { name: '全球指数' })
  await globalLink.click()
  await expect(page).toHaveURL(/#\/market$/)
  await expect(page.locator('#market-global')).toBeInViewport()
  await expect(globalLink).toHaveAttribute('aria-current', 'location')
})

test('opens an index history drawer and closes it with Escape', async ({ page }) => {
  await page.goto('/#/market')
  await page.locator('.index-card').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '5年' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '10年' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '全部' })).toBeVisible()
  await expect(dialog.getByRole('columnheader', { name: '收盘' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('uses broker-style movement surfaces and a market breadth summary', async ({ page }) => {
  await page.goto('/#/market')
  await expect(page.locator('.index-card.surface-up').first()).toBeVisible()
  await expect(page.locator('.index-card.surface-down').first()).toBeVisible()

  const breadth = page.getByRole('group', { name: '市场广度摘要' })
  await expect(breadth).toBeVisible()
  await expect(breadth).toContainText('上涨')
  await expect(breadth).toContainText('下跌')
  await expect(breadth).toContainText('平均')

  const pulse = page.locator('.pulse-card').filter({ hasText: '纳斯达克100' })
  await expect(pulse).toHaveClass(/surface-(up|down)/)
  const vix = page.locator('.pulse-card').filter({ hasText: 'VIX' })
  await expect(vix).toHaveClass(/surface-flat/)
})

test('labels FX pairs and separates derived gold references from independent quotes', async ({ page }) => {
  await page.goto('/#/market')
  await expect(page.getByText('USD / CNY', { exact: true })).toBeVisible()
  await expect(page.getByText('CNY / HKD', { exact: true })).toBeVisible()

  const goldPanel = page.locator('.gold-market-panel')
  await expect(goldPanel.locator('.source-tag.is-independent')).toHaveText('独立来源')
  await expect(goldPanel.locator('.source-tag.is-derived').first()).toHaveText('折算参考')
  await expect(goldPanel).toContainText('非独立伦敦金')
  await expect(goldPanel).toContainText('无独立伦敦金报价')
})

test('shows explicit brand gold column headings', async ({ page }) => {
  await page.goto('/#/market')
  const table = page.getByRole('table', { name: '品牌金价' })
  await expect(table.getByRole('columnheader', { name: '品牌' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: '足金饰品' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: '投资金条' })).toBeVisible()
})

test('shows a freshness badge for dated market metrics', async ({ page }) => {
  await page.goto('/#/market')
  await expect(page.locator('.pulse-card .freshness-badge').first()).toBeVisible()
  await expect(page.locator('.index-card .freshness-badge').first()).toBeVisible()
  await expect(page.locator('#market-macro .freshness-badge').first()).toBeVisible()
})

test('does not fabricate a DCA strategy when fear-greed is missing', async ({ page }) => {
  await page.route('**/data/cnn-fear-greed.json', (route) => route.fulfill({
    json: { score: null, band: 'neutral', label: '--', history: [] },
  }))
  await page.goto('/#/market')
  await expect(page.getByText('无法生成有效策略')).toBeVisible()
  await expect(page.getByText('数据不足')).toBeVisible()
  await expect(page.getByText('估值偏高，注意回撤风险')).toBeVisible()
})

test('recolors movement surfaces across theme and color preference', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'color preference switch is covered on desktop')
  await page.goto('/#/market')
  const down = page.locator('.index-card.surface-down').first()
  await expect(down).toBeVisible()
  const redUpBackground = await down.evaluate((el) => getComputedStyle(el).backgroundColor)

  await page.getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('主题', { exact: true }).selectOption('dark')
  await page.getByLabel('涨跌颜色', { exact: true }).selectOption('green-up')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'green-up')
  await page.keyboard.press('Escape')

  const greenUpBackground = await down.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(greenUpBackground).not.toBe(redUpBackground)
  await expect(page.locator('.index-card.surface-up').first()).toBeVisible()
  await expect(page.locator('.index-card.surface-down').first()).toBeVisible()
})
