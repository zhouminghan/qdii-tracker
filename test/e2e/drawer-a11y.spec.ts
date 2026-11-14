import { expect, test, type Locator, type Page } from '@playwright/test'

async function openFirstFundDetail(page: Page): Promise<Locator> {
  await page.goto('/#/funds')
  await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()

  const desktopTrigger = page.getByRole('button', { name: '详情' }).first()
  if (await desktopTrigger.isVisible().catch(() => false)) {
    await desktopTrigger.click()
    return desktopTrigger
  }

  const mobileTrigger = page.getByRole('button', { name: '查看详情' }).first()
  await mobileTrigger.click()
  return mobileTrigger
}

async function expectMinimumTouchTarget(locator: Locator, minimum = 44): Promise<void> {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(minimum)
  expect(box!.height).toBeGreaterThanOrEqual(minimum)
}

test('fund detail drawer contains focus and restores the trigger', async ({ page }) => {
  const trigger = await openFirstFundDetail(page)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect.poll(() => page.locator('#app').evaluate((element) => (element as HTMLElement).inert)).toBe(true)
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)

  const focusableCount = await dialog.evaluate((element) => [...element.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )].filter((item) => item.getClientRects().length > 0).length)

  for (let index = 0; index < focusableCount + 3; index += 1) {
    await page.keyboard.press('Tab')
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }

  for (let index = 0; index < focusableCount + 3; index += 1) {
    await page.keyboard.press('Shift+Tab')
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect.poll(() => page.locator('#app').evaluate((element) => (element as HTMLElement).inert)).toBe(false)
  await expect(trigger).toBeFocused()
})

test('portfolio form drawers are right-side on desktop and sheets on mobile', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/portfolio')
  const trigger = page.getByRole('button', { name: '添加第一笔持仓' })
  await expect(trigger).toBeVisible()
  await trigger.click()

  const dialog = page.getByRole('dialog')
  const panel = page.locator('.drawer-panel.drawer-responsive')
  const layer = page.locator('.drawer-layer')
  await expect(dialog).toBeVisible()
  await expect(panel).toHaveClass(/drawer-responsive/)
  await expect(panel).toHaveCSS('transform', 'none')

  const panelBox = await panel.boundingBox()
  const layerBox = await layer.boundingBox()
  expect(panelBox).not.toBeNull()
  expect(layerBox).not.toBeNull()

  if (testInfo.project.name === 'chromium-mobile') {
    expect(Math.abs(panelBox!.x - layerBox!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(panelBox!.width - layerBox!.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(panelBox!.y + panelBox!.height - layerBox!.y - layerBox!.height)).toBeLessThanOrEqual(1)
  } else {
    expect(Math.abs(panelBox!.x + panelBox!.width - layerBox!.x - layerBox!.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(panelBox!.height - layerBox!.height)).toBeLessThanOrEqual(1)
    expect(panelBox!.width).toBeGreaterThanOrEqual(500)
    expect(panelBox!.width).toBeLessThanOrEqual(560)
  }

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('mobile navigation, filters, search, and forms meet the 44px target', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'mobile touch target coverage')

  await page.goto('/#/funds')
  await expect(page.locator('.fund-mobile-card').first()).toBeVisible()
  await page.locator('.skip-link').focus()
  await expectMinimumTouchTarget(page.locator('.skip-link'))
  await expectMinimumTouchTarget(page.locator('.brand-block'))
  await expectMinimumTouchTarget(page.getByRole('button', { name: '打开设置' }))
  await expectMinimumTouchTarget(page.getByRole('button', { name: '收藏基金' }).first())
  await expectMinimumTouchTarget(page.locator('.chip').first())
  await expectMinimumTouchTarget(page.locator('.mobile-sort .button').first())

  const search = page.getByLabel('搜索基金目录（跨分类）')
  await expectMinimumTouchTarget(search)
  await search.fill('易方达')
  await expectMinimumTouchTarget(page.getByRole('button', { name: '清空搜索' }))

  await page.goto('/#/portfolio')
  await expect(page.getByRole('button', { name: '添加第一笔持仓' })).toBeVisible()
  await expectMinimumTouchTarget(page.locator('.segmented button:visible').first())
  await page.getByRole('button', { name: '添加第一笔持仓' }).click()
  await expectMinimumTouchTarget(page.locator('.drawer-body .input').first())
  await expectMinimumTouchTarget(page.getByRole('button', { name: '保存持仓' }))
  await page.keyboard.press('Escape')

  await page.goto('/#/research')
  await expectMinimumTouchTarget(page.locator('.research-tabs button').first())
  await expectMinimumTouchTarget(page.locator('.chip').first())

  await page.goto('/#/market')
  await expectMinimumTouchTarget(page.locator('.anchor-bar a').first())
})
