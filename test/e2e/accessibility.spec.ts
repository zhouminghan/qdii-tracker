import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const path of ['/funds', '/market', '/portfolio', '/research']) {
  test(`has no serious accessibility violations: ${path}`, async ({ page }) => {
    await page.goto(`/#${path}`)
    await page.waitForTimeout(600)
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = result.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious')
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })
}
