import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.describe('funds workflow', () => {
  test('restores default favorites and shows the D-class daily limit', async ({ page }) => {
    await page.goto('/#/funds')
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '取消收藏' }).first()).toBeVisible()
    await expect(page.locator('.table-action').filter({ hasText: '对比' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '对比', exact: true })).toBeVisible()
    await expect(page.getByText('当前每日可购买 ¥60（仅 A 类）')).toBeVisible()

    await page.getByLabel('搜索基金目录（跨分类）').fill('022525')
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible')).toHaveCount(1)
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible')).toContainText('纳指100 指数基金')
    await page
      .locator('.table-action:visible, .fund-mobile-actions button:visible')
      .filter({ hasText: /详情/ })
      .first()
      .click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.metric-card.surface-up, .metric-card.surface-down').first()).toBeVisible()
    const dShare = dialog.locator('.share-comparison-table tbody tr').filter({ hasText: '022525' })
    await expect(dShare).toContainText('限 ¥100')
  })

  test('uses distinct company logos and exposes the Southbound category', async ({ page }) => {
    await page.goto('/#/funds')
    const search = page.getByLabel('搜索基金目录（跨分类）')
    await search.fill('华宝')
    await expect(page.locator('.fund-row:visible .fund-logo, .fund-mobile-card:visible .fund-logo').first()).toHaveText('华宝')
    await search.fill('华夏')
    await expect(page.locator('.fund-row:visible .fund-logo, .fund-mobile-card:visible .fund-logo').first()).toHaveText('华夏')

    await page.getByRole('button', { name: '清空搜索' }).click()
    await page.getByRole('button', { name: '南向通' }).click()
    await expect(page.getByRole('heading', { name: '易方达（香港）标普500指数基金' })).toBeVisible()
    await expect(page.getByText('83004', { exact: true })).toBeVisible()
    await expect(page.getByText('香港众安银行 ZA Bank').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: '易方达（香港）纳斯达克100指数基金' })).toBeVisible()
    await expect(page.getByText('ISIN HK0001026985')).toBeVisible()
    await expect(page.getByText('EFHNAAU HK', { exact: true }).first()).toBeVisible()
  })

  test('labels closed-period shares without pretending they have a price', async ({ page }) => {
    await page.goto('/#/funds')
    await page.getByLabel('搜索基金目录（跨分类）').fill('019738')
    await page.locator('.table-action:visible, .fund-mobile-actions button:visible').filter({ hasText: /详情/ }).first().click()
    const dialog = page.getByRole('dialog')
    const closedShare = dialog.locator('.share-comparison-table tbody tr').filter({ hasText: '019738' })
    await expect(closedShare).toContainText('封闭期')
    await expect(closedShare).not.toContainText('--')
  })

  test('shows all share performance, buy fees, and derived sell rules', async ({ page }) => {
    await page.goto('/#/funds')
    await page.getByLabel('搜索基金目录（跨分类）').fill('050025')
    await page.locator('.table-action:visible, .fund-mobile-actions button:visible').filter({ hasText: /详情/ }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    for (const label of ['近 1 周', '近 2 年', '近 3 年']) {
      const metric = dialog.locator('.metric-card').filter({ hasText: label })
      await expect(metric.locator('.metric-value')).toContainText('%')
    }
    await expect(dialog.getByText('3 年免', { exact: true }).first()).toBeVisible()

    await dialog.getByRole('tab', { name: '费率' }).click()
    await dialog.getByRole('button', { name: /C · 006075/ }).click()
    await expect(dialog.locator('.metric-card').filter({ hasText: '免赎回费持有期' }).locator('.metric-value')).toHaveText('7 天')
    await expect(dialog.locator('.fee-rule-block').first().getByText('免费', { exact: true })).toBeVisible()

    await dialog.getByRole('button', { name: /A · 050025/ }).click()
    await expect(dialog.locator('.fee-rule-block').first().locator('del').first()).toBeVisible()
  })

  test('supports long trend ranges and a net-value table', async ({ page }) => {
    await page.goto('/#/funds')
    await page.getByLabel('搜索基金目录（跨分类）').fill('050025')
    await page.locator('.table-action:visible, .fund-mobile-actions button:visible').filter({ hasText: /详情/ }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('tab', { name: '走势' }).click()
    await expect(dialog.getByRole('button', { name: '3年' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '5年' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '10年' })).toBeVisible()
    await expect(dialog.getByRole('columnheader', { name: '单位净值' })).toBeVisible()
    await expect(dialog.locator('.trend-history-shell tbody tr').first()).toBeVisible()
  })

  test('compares current holdings with the previous quarter', async ({ page }) => {
    await page.goto('/#/funds')
    await page.getByLabel('搜索基金目录（跨分类）').fill('096001')
    await page.locator('.table-action:visible, .fund-mobile-actions button:visible').filter({ hasText: /详情/ }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('tab', { name: '持仓' }).click()
    await expect(dialog.getByText(/对比 20\d{2}Q\d/)).toBeVisible()
    await expect(dialog.getByRole('columnheader', { name: '较上季' })).toBeVisible()
    await expect(dialog.locator('tbody tr').first()).toContainText(/新进|持平|[+-]\d+\.\d{2}pct/)
  })

  test('searches, sorts, expands shares, and opens detail', async ({ page }) => {
    await page.goto('/#/funds')
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()
    await page.getByLabel('搜索基金目录（跨分类）').fill('易方达')
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()
    await page.getByLabel('清空搜索').click()
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()

    const sortHeader = page.getByRole('button', { name: '近 1 年' }).first()
    if (await sortHeader.isVisible().catch(() => false)) await sortHeader.click()
    else await page.getByLabel('排序方式').selectOption('chg_1y:desc')
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
    await page.getByRole('button', { name: '对比', exact: true }).click()
    const picker = page.getByLabel('添加对比基金')
    await picker.selectOption('050025')
    await picker.selectOption('017641')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('img', { name: '多基金归一化收益对比图' })).toBeVisible()
  })
})
