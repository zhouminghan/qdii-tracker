import { expect, test } from '@playwright/test'

test.describe('visual baselines', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop',
      'Visual baselines use desktop Chromium',
    )
  })

  test('Funds desktop light', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/#/funds')
    await expect(page.locator('.fund-row').first()).toBeVisible()
    await expect(page).toHaveScreenshot('funds-desktop-light.png', { fullPage: true })
  })

  test('Market desktop dark', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('qdii-settings-v2', JSON.stringify({ theme: 'dark', colorMode: 'red-up', favorites: [] })))
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/#/market')
    await expect(page.getByRole('heading', { name: '市场', exact: true })).toBeVisible()
    await expect(page).toHaveScreenshot('market-desktop-dark.png', { fullPage: true })
  })

  test('Funds mobile light', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/funds')
    await expect(page.locator('.fund-mobile-card').first()).toBeVisible()
    await expect(page).toHaveScreenshot('funds-mobile-light.png', { fullPage: true })
  })

  test('Market mobile dark', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('qdii-settings-v2', JSON.stringify({ theme: 'dark', colorMode: 'red-up', favorites: [] })))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/market')
    await expect(page.getByRole('heading', { name: '市场', exact: true })).toBeVisible()
    await expect(page).toHaveScreenshot('market-mobile-dark.png', { fullPage: true })
  })

  test('Portfolio mobile dark', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('qdii-settings-v2', JSON.stringify({ theme: 'dark', colorMode: 'red-up', favorites: [] })))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/portfolio')
    await expect(page.getByRole('heading', { name: '投资组合' })).toBeVisible()
    await expect(page).toHaveScreenshot('portfolio-mobile-dark.png', { fullPage: true })
  })

  test('Southbound desktop light', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/#/funds')
    await page.getByRole('button', { name: '南向通' }).click()
    await expect(page.getByRole('heading', { name: '易方达（香港）标普500指数基金' })).toBeVisible()
    await expect(page).toHaveScreenshot('southbound-desktop-light.png', { fullPage: true })
  })

  test('Fund trend desktop light', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/#/funds')
    await page.getByLabel('搜索基金目录（跨分类）').fill('050025')
    await page.locator('.table-action:visible').filter({ hasText: '详情' }).first().click()
    await page.getByRole('tab', { name: '走势' }).click()
    await page.getByRole('button', { name: '5年' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page).toHaveScreenshot('fund-trend-desktop-light.png')
  })
})
