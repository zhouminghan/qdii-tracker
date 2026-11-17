import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const theme of ['light', 'dark'] as const) {
  for (const path of ['/funds', '/market', '/portfolio', '/research']) {
    test(`has no serious accessibility violations: ${theme} ${path}`, async ({ page }) => {
      if (theme === 'dark') {
        await page.addInitScript(() => localStorage.setItem(
          'qdii-settings-v2',
          JSON.stringify({ theme: 'dark', colorMode: 'red-up', favorites: [] }),
        ))
      }
      await page.goto(`/#${path}`)
      await page.waitForTimeout(600)
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      const serious = result.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious')
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
    })
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`Southbound shares have no serious accessibility violations: ${theme}`, async ({ page }) => {
    if (theme === 'dark') {
      await page.addInitScript(() => localStorage.setItem(
        'qdii-settings-v2',
        JSON.stringify({ theme: 'dark', colorMode: 'red-up', favorites: [] }),
      ))
    }
    await page.goto('/#/funds')
    await page.getByRole('button', { name: '南向通' }).click()
    await expect(page.locator('.southbound-row')).toHaveCount(13)
    await page.waitForTimeout(600)
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = result.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious')
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`Market metric knowledge has no serious accessibility violations: ${theme}`, async ({ page }) => {
    if (theme === 'dark') {
      await page.addInitScript(() => localStorage.setItem(
        'qdii-settings-v2',
        JSON.stringify({ theme: 'dark', colorMode: 'red-up', favorites: [] }),
      ))
    }
    await page.goto('/#/market')
    await page.getByRole('button', { name: '指数说明' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(300)
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = result.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious')
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })
}
