import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.describe('funds workflow', () => {
  test('searches, sorts, expands shares, and opens detail', async ({ page }) => {
    await page.goto('/#/funds')
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()
    await page.getByLabel('搜索当前基金目录').fill('易方达')
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible')).toHaveCount(1)
    await page.getByLabel('清空搜索').click()
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()

    const sortHeader = page.getByRole('button', { name: '近 1 年' }).first()
    if (await sortHeader.isVisible().catch(() => false)) await sortHeader.click()
    else await page.getByLabel('排序字段').selectOption('chg_1y')
    const expandButton = page.getByRole('button', { name: '展开份额' }).first()
    if (await expandButton.count()) await expandButton.click()
    else await page.getByRole('button', { name: '查看份额' }).first().click()
    await expect(page.locator('.shares-row:visible, .fund-mobile-shares:visible')).toBeVisible()

    await page.getByRole('button', { name: '详情' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('业绩表现')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('switches to ETF and keeps premium visible', async ({ page }) => {
    await page.goto('/#/funds')
    await page.getByRole('button', { name: '场内 ETF' }).click()
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()
    await expect(page.locator('.premium-cell:visible').first()).toBeVisible()
  })

  test('exports a non-empty PNG share image', async ({ page }) => {
    await page.goto('/#/funds')
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '分享 PNG' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^qdii-offshore-\d{4}-\d{2}-\d{2}\.png$/)
    const filePath = await download.path()
    expect(filePath).toBeTruthy()
    const bytes = await readFile(filePath!)
    expect(bytes.length).toBeGreaterThan(10_000)
    expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  })

  test('compares up to multiple funds on one normalized chart', async ({ page }) => {
    await page.goto('/#/funds')
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()
    const compareButtons = page
      .locator('button.table-action:visible, .fund-mobile-actions button:visible')
      .filter({ hasText: '对比' })
    await compareButtons.nth(0).click()
    await compareButtons.nth(1).click()
    await page.getByRole('button', { name: '对比 2' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('img', { name: '多基金归一化收益对比图' })).toBeVisible()
  })
})
