import { expect, test, type Locator } from '@playwright/test'

async function expectControlOwnsCenter(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible()
  await locator.page().emulateMedia({ reducedMotion: 'reduce' })
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }))
  await locator.page().waitForTimeout(50)
  const result = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const hit = document.elementFromPoint(x, y)
    const label = element.getAttribute('aria-label')
      || (element.textContent || '').trim().replace(/\s+/g, ' ')
    return {
      inside: Boolean(hit && (hit === element || element.contains(hit))),
      label,
      hit: hit
        ? `${hit.tagName.toLowerCase()}${hit.getAttribute('class') ? `.${hit.getAttribute('class')!.trim().replace(/\s+/g, '.')}` : ''}`
        : 'none',
    }
  })
  expect(result.inside, `"${result.label}" is intercepted by ${result.hit}`).toBe(true)
}

test.describe('mobile hit targets', () => {
  test('all interactive pages keep nested svg icons out of the hit chain', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'mobile hit-target coverage')
    await page.setViewportSize({ width: 390, height: 844 })

    for (const route of ['funds', 'market', 'research', 'portfolio']) {
      await page.goto(`/#/${route}`)
      await expect(page.locator('main')).toBeVisible()
      const interactiveIconCount = await page.locator('button svg, a svg').evaluateAll((icons) => (
        icons.filter((icon) => getComputedStyle(icon).pointerEvents !== 'none').length
      ))
      expect(interactiveIconCount, `interactive svg found on /#/${route}`).toBe(0)
    }
  })

  test('fund icons and controls receive taps through their visual children', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'mobile hit-target coverage')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/funds')
    await expect(page.locator('.fund-mobile-card').first()).toBeVisible()

    const settings = page.getByRole('button', { name: '打开设置' })
    await expectControlOwnsCenter(settings)
    await settings.locator('svg').tap({ force: true })
    const settingsDrawer = page.getByRole('dialog', { name: '设置' })
    await expect(settingsDrawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(settingsDrawer).toBeHidden()

    const favorite = page.locator('.fund-mobile-card').first()
      .getByRole('button', { name: /^(收藏基金|取消收藏)$/ })
    await expectControlOwnsCenter(favorite)
    const previousLabel = await favorite.getAttribute('aria-label')
    await favorite.locator('svg').tap({ force: true })
    await expect(favorite).not.toHaveAttribute('aria-label', previousLabel!)

    const search = page.getByLabel('搜索基金目录（跨分类）')
    await search.fill('易方达')
    const clear = page.getByRole('button', { name: '清空搜索' })
    await expectControlOwnsCenter(clear)
    await clear.locator('svg').tap({ force: true })
    await expect(search).toHaveValue('')
    await expect(clear).toHaveCount(0)
  })

  test('research tabs and create actions run from their icons', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'mobile hit-target coverage')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/research')

    const knowledgeTab = page.getByRole('tab', { name: /知识库/ })
    await expectControlOwnsCenter(knowledgeTab)
    await knowledgeTab.locator('svg').tap({ force: true })
    await expect(knowledgeTab).toHaveAttribute('aria-selected', 'true')

    const newNote = page.getByRole('button', { name: '新建笔记' }).first()
    await expectControlOwnsCenter(newNote)
    await newNote.locator('svg').tap({ force: true })
    const noteDrawer = page.getByRole('dialog', { name: '笔记' })
    await expect(noteDrawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(noteDrawer).toBeHidden()

    const watchlistTab = page.getByRole('tab', { name: /观察清单/ })
    await expectControlOwnsCenter(watchlistTab)
    await watchlistTab.locator('svg').tap({ force: true })
    await expect(watchlistTab).toHaveAttribute('aria-selected', 'true')

    const strategyTab = page.getByRole('tab', { name: /策略记录/ })
    await expectControlOwnsCenter(strategyTab)
    await strategyTab.locator('svg').tap({ force: true })
    await expect(strategyTab).toHaveAttribute('aria-selected', 'true')
  })

  test('market information icons open their metric drawer', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'mobile hit-target coverage')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/market')

    const info = page.getByRole('button', { name: '了解 市场温度' })
    await expectControlOwnsCenter(info)
    await info.locator('svg').tap({ force: true })
    const knowledgeDrawer = page.getByRole('dialog', { name: '市场温度' })
    await expect(knowledgeDrawer).toBeVisible()
    await expect(knowledgeDrawer).toContainText('Market 知识')
  })

  test('portfolio row icon actions receive taps through the icon', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'mobile hit-target coverage')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/portfolio')

    await page.getByRole('button', { name: '添加第一笔持仓' }).tap()
    await page.getByLabel('基金代码', { exact: true }).fill('270042')
    await page.getByLabel('本金', { exact: true }).fill('1000')
    await page.getByLabel('总金额 / 市值', { exact: true }).fill('1200')
    await page.getByRole('button', { name: '保存持仓' }).tap()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByRole('button', { name: '删除持仓' }).first()).toBeVisible()

    const remove = page.getByRole('button', { name: '删除持仓' }).first()
    await expectControlOwnsCenter(remove)
    await remove.locator('svg').tap({ force: true })
    const confirm = page.getByRole('dialog', { name: '删除持仓' })
    await expect(confirm).toBeVisible()
    await page.getByRole('button', { name: '取消' }).tap()
    await expect(confirm).toBeHidden()
  })
})
