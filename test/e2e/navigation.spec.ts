import { expect, test } from '@playwright/test'

test.describe('core navigation', () => {
  test('lands on Funds and exposes all four primary views', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/#\/funds$/)
    await expect(page.getByRole('heading', { name: '基金追踪' })).toBeVisible()
    await expect(page.getByRole('link', { name: '打开 GitHub 仓库' })).toBeVisible()
    await page.getByRole('link', { name: '市场', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: '市场', exact: true })).toBeVisible()
    await expect(page.locator('#main-content')).toBeFocused()
    await page.getByRole('link', { name: '组合', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: '投资组合' })).toBeVisible()
    await page.getByRole('link', { name: '研究', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: '研究', exact: true })).toBeVisible()
  })

  test('provides a working skip link without changing the route', async ({ page }) => {
    await page.goto('/#/funds')
    await expect(page.locator('.skip-link')).toBeAttached()
    await page.locator('.skip-link').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
    await expect(page).toHaveURL(/#\/funds$/)
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

  test('uses the header search cross-site without duplicating it on Funds', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'header search is hidden on mobile')
    await page.goto('/#/funds')
    await expect(page.getByRole('searchbox', { name: '搜索基金代码、名称或公司' })).toHaveCount(0)
    await expect(page.getByRole('searchbox', { name: '搜索基金目录（跨分类）' })).toBeVisible()

    await page.getByRole('link', { name: '市场', exact: true }).first().click()
    const headerSearch = page.getByRole('searchbox', { name: '搜索基金代码、名称或公司' })
    await expect(headerSearch).toBeVisible()
    await headerSearch.fill('易方达')
    await headerSearch.press('Enter')
    await expect(page).toHaveURL(/#\/funds$/)
    await expect(page.getByRole('searchbox', { name: '搜索基金目录（跨分类）' })).toHaveValue('易方达')
  })
})
