import { expect, test } from '@playwright/test'

test.describe('core navigation', () => {
  test('lands on Funds and exposes all four primary views', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/#\/funds$/)
    await expect(page.getByRole('heading', { name: '基金追踪' })).toBeVisible()
    await page.getByRole('link', { name: 'Market' }).first().click()
    await expect(page.getByRole('heading', { name: '市场', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Portfolio' }).first().click()
    await expect(page.getByRole('heading', { name: '投资组合' })).toBeVisible()
    await page.getByRole('link', { name: 'Research' }).first().click()
    await expect(page.getByRole('heading', { name: '研究', exact: true })).toBeVisible()
  })

  test('settings persist theme and color preference', async ({ page }) => {
    await page.goto('/#/funds')
    await page.getByRole('button', { name: '打开设置' }).click()
    await page.getByLabel('主题', { exact: true }).selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByLabel('涨跌颜色', { exact: true }).selectOption('green-up')
    await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'green-up')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'green-up')
  })
})
