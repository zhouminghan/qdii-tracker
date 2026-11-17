import { expect, test } from '@playwright/test'

test('renders market charts and the DCA strategy matrix', async ({ page }) => {
  await page.goto('/#/market')
  await expect(page.getByRole('heading', { name: '市场', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'VIX & 纳指100 TTM PE 阶梯定投' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'VIX 与纳指100 TTM PE 阶梯定投矩阵' })).toBeVisible()
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

test('uses broker-style movement surfaces on index and pulse cards', async ({ page }) => {
  await page.goto('/#/market')
  await expect(page.locator('.index-card.surface-up').first()).toBeVisible()
  await expect(page.locator('.index-card.surface-down').first()).toBeVisible()

  // 指数彼此独立，不再给出合计涨跌家数或平均涨跌幅。
  await expect(page.getByRole('group', { name: '市场广度摘要' })).toHaveCount(0)
  // 宏观区不再重复顶部已展示的 VIX / 纳指100 TTM PE。
  await expect(page.locator('#market-macro .metric-card')).toHaveCount(4)

  // 纳斯达克100 只在全球指数列表出现一次；10 年期美债只在收益率曲线出现一次。
  await expect(page.locator('.index-card').filter({ hasText: '纳斯达克100' })).toHaveCount(1)
  await expect(page.locator('.pulse-card').filter({ hasText: '纳斯达克100' })).toHaveCount(0)
  await expect(page.locator('.pulse-card')).toHaveCount(2)
  await expect(page.locator('.pulse-card').filter({ hasText: '美国 10 年' })).toHaveCount(0)
  await expect(page.locator('#market-macro .metric-card').filter({ hasText: '美国 10 年' })).toHaveCount(1)
  const vix = page.locator('.pulse-card').filter({ hasText: 'VIX' })
  await expect(vix).toHaveClass(/surface-flat/)
})

test('shows independent gold with live premium and correct FX labels', async ({ page }) => {
  await page.goto('/#/market')
  await expect(page.getByText('USD / CNY', { exact: true })).toBeVisible()
  await expect(page.getByText('CNY / HKD', { exact: true })).toBeVisible()

  const goldPanel = page.locator('.gold-market-panel')
  // 独立 Au9999 与伦敦金现货都存在时，折合国内价/溢价才有意义。
  await expect(goldPanel.locator('.source-tag.is-independent')).toHaveCount(2)
  await expect(goldPanel).toContainText('伦敦金现货')
  await expect(goldPanel).toContainText('折合国内价')
  await expect(goldPanel).toContainText('国内溢价')
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

test('marks market temperature as degraded when coverage is partial', async ({ page }) => {
  await page.route('**/data/market-snapshot.json', async (route) => {
    const response = await route.fetch()
    const payload = await response.json()
    payload.temperature.coverage = { fresh: 3, total: 4, degraded: true }
    await route.fulfill({ response, json: payload })
  })
  await page.goto('/#/market')
  await expect(page.getByText('数据降级')).toBeVisible()
  await expect(page.getByText('3/4 项数据本次更新成功')).toBeVisible()
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

test('labels YTD, daily drawdown, and TTM PE explicitly', async ({ page }) => {
  await page.goto('/#/market')
  await expect(page.locator('.pulse-card').filter({ hasText: '纳指100 TTM PE' })).toBeVisible()
  await expect(page.locator('#market-nasdaq .badge').first()).toContainText('完整年度')

  const ytdCell = page.locator('.annual-heat-cell').filter({ hasText: 'YTD' })
  await expect(ytdCell).toContainText('日线回撤')

  await page.getByRole('button', { name: '月度', exact: true }).click()
  const ytdRow = page.locator('.monthly-heat-table tbody tr').filter({ hasText: '2026' })
  await expect(ytdRow).toContainText('进行中')
})

test('shows complete-month seasonality with real sample counts', async ({ page }) => {
  await page.goto('/#/market')
  const panel = page.locator('.seasonality-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('近 5 年')
  await expect(panel).toContainText('近 10 年')
  await expect(panel).toContainText('近 20 年')
  await expect(panel).toContainText('n=')
  await expect(panel).not.toContainText('11月 进行中')
})

test('opens metric knowledge for indices, VIX, TTM PE, and gold', async ({ page }) => {
  await page.goto('/#/market')
  await page.getByRole('button', { name: '指数说明' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('纳斯达克综合指数')
  await expect(dialog).toContainText('纳斯达克 100 指数')
  await expect(dialog).toContainText('罗素 2000')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: '了解 VIX' }).click()
  await expect(dialog).toContainText('CBOE')
  await expect(dialog).toContainText('不预测涨跌方向')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '了解 纳指100 TTM PE' }).click()
  await expect(dialog).toContainText('Siblis')
  await expect(dialog).toContainText('不是 Forward PE')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '了解 估值指标 PE' }).click()
  await expect(dialog).toContainText('Forward PE / 预期市盈率')
  await expect(dialog).toContainText('CAPE / 周期调整市盈率')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '了解 伦敦金 XAU/USD' }).click()
  await expect(dialog).toContainText('折算参考')
  await expect(dialog).toContainText('USD/CNH')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
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

test('keeps Market metrics and knowledge usable at 375, 390, and 768 widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'exact responsive widths are covered once')
  for (const [width, height] of [[375, 812], [390, 844], [768, 1024]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/#/market')
    await expect(page.locator('.seasonality-panel')).toBeVisible()
    await expect(page.getByRole('button', { name: '指数说明' })).toBeVisible()
    await page.getByRole('button', { name: '了解 VIX' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeLessThanOrEqual(width + 1)
    await page.keyboard.press('Escape')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  }
})
