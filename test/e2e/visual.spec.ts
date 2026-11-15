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
    await expect(page.getByRole('table', { name: '跨境理财通南向通基金份额' })).toBeVisible()
    await expect(page.locator('.southbound-row')).toHaveCount(6)
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

  test('Southbound note reader desktop light', async ({ page }) => {
    await page.route('https://images.weserv.nl/**', (route) => route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">',
        '<rect width="1200" height="900" fill="#ffffff"/>',
        '<rect x="48" y="48" width="1104" height="804" rx="12" fill="#f8fafc" stroke="#cbd5e1"/>',
        '<polyline fill="none" stroke="#dc2626" stroke-width="8" points="90,620 210,560 330,590 450,430 570,470 690,330 810,360 930,220 1050,250"/>',
        '<line x1="90" y1="760" x2="1110" y2="760" stroke="#94a3b8" stroke-width="3"/>',
        '</svg>',
      ].join(''),
    }))
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/#/research')
    await page.getByRole('tab', { name: /基金笔记/ }).click()
    const note = page.locator('.research-card').filter({ hasText: '跨境理财通南向通' })
    await note.getByRole('button', { name: '查看全文' }).click()
    const reader = page.getByRole('dialog')
    await expect(reader).toBeVisible()
    const noteImage = reader.getByRole('img', { name: '南向通渠道资料截图' })
    await expect.poll(() => noteImage.evaluate(async (element) => {
      const image = element as HTMLImageElement
      if (!image.complete || image.naturalWidth === 0) return false
      try {
        await image.decode()
        return true
      } catch {
        return false
      }
    })).toBe(true)
    await expect(page).toHaveScreenshot('southbound-note-reader-desktop-light.png')
  })
})
