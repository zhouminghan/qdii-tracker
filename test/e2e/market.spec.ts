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
