import { expect, test } from '@playwright/test'

test('renders market charts and the DCA strategy matrix', async ({ page }) => {
  await page.goto('/#/market')
  await expect(page.getByRole('heading', { name: '市场', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'VIX & PE 阶梯定投' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'VIX 与 PE 阶梯定投矩阵' })).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible()
})
