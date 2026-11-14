import { expect, test } from '@playwright/test'

test('renders market charts and the DCA strategy matrix', async ({ page }) => {
  await page.goto('/#/market')
  await expect(page.getByRole('heading', { name: '市场', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'VIX & PE 阶梯定投' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'VIX 与 PE 阶梯定投矩阵' })).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible()
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
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
