import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

function fundSearch(page: Page) {
  return page.locator('input[type="search"]:visible').first()
}

function clearFundSearch(page: Page) {
  return page.locator('button[aria-label^="清空"]:visible').first()
}

test.describe('funds workflow', () => {
  test('restores default favorites and shows the D-class daily limit', async ({ page }) => {
    await page.goto('/#/funds')
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '取消收藏' }).first()).toBeVisible()
    await expect(page.locator('.table-action').filter({ hasText: '对比' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '对比', exact: true })).toBeVisible()
    await expect(page.getByText('当前每日可购买 ¥60（仅 A 类）')).toBeVisible()

    await fundSearch(page).fill('022525')
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
    const search = fundSearch(page)
    await search.fill('华宝')
    await expect(page.locator('.fund-row:visible .fund-logo, .fund-mobile-card:visible .fund-logo').first()).toHaveText('华宝')
    await search.fill('华夏')
    await expect(page.locator('.fund-row:visible .fund-logo, .fund-mobile-card:visible .fund-logo').first()).toHaveText('华夏')

    await clearFundSearch(page).click()
    await page.getByRole('button', { name: '南向通' }).click()
    await expect(page.getByRole('table', { name: '跨境理财通南向通基金份额' })).toBeVisible()
    await expect(page.locator('.southbound-row')).toHaveCount(13)
    await expect(page.locator('.southbound-row').filter({ hasText: 'EFHNAAH HK' }).first()).toBeVisible()
    await expect(page.locator('.southbound-row').filter({ hasText: 'EFHNAAR HK' }).first()).toBeVisible()
    await expect(page.locator('.southbound-row').filter({ hasText: 'EFHNAAU HK' }).first()).toBeVisible()
    await expect(page.getByText('易方达（香港）日经225指数基金').first()).toBeVisible()
    await expect(page.getByText('恒生标普500指数ETF（非上市类别）').first()).toBeVisible()
    await expect(page.getByText('ISIN HK0001027009')).toBeVisible()
    await expect(page.getByText('ISIN HK0001026944')).toBeVisible()
    await expect(page.getByText('ISIN HK0001026985')).toBeVisible()
    await expect(page.getByText('香港众安银行 ZA Bank').first()).toBeVisible()
    await expect(page.getByText(/344 个南向通合资格基金份额/)).toBeVisible()
    await expect(page.getByRole('link', { name: '查看银行完整名单' })).toHaveAttribute(
      'href',
      'https://online.asia.ccb.com/PersonalHKWeb/pubmutualfund/webForm/PMF_FundSearchController.jpf?lang=chinese&linkFrom=pubmutualfund',
    )
    await expect(page.getByRole('heading', { name: '渠道、额度与风险' })).toBeVisible()
    await expect(page.locator('.southbound-note-card')).toHaveCount(4)
    await expect(page.getByRole('heading', { name: '渠道优势' }).first()).toBeVisible()
    await expect(page.locator('.southbound-note-card').filter({ hasText: '恒生标普500指数ETF（非上市类别）' })).toContainText('建行亚洲 HM01')

    const southboundSearch = fundSearch(page)
    await southboundSearch.fill('HK0001027009')
    await expect(page.locator('.southbound-row')).toHaveCount(1)
    await expect(page.locator('.southbound-row')).toContainText('港元')
    await expect(page.locator('.southbound-row')).toContainText('EFHNAAH HK')

    await clearFundSearch(page).click()
    await southboundSearch.fill('83004')
    await expect(page.locator('.southbound-row')).toHaveCount(1)
    await expect(page.locator('.southbound-row')).toContainText('EHSPACU HK')
    await expect(page.locator('.southbound-row')).toContainText('83004')

    await southboundSearch.fill('RMB')
    await expect(page.locator('.southbound-row')).toHaveCount(4)
    await expect(page.locator('.southbound-row').first()).toContainText('人民币')

    await southboundSearch.fill('EFHNAAU HK')
    await expect(page.locator('.southbound-row')).toHaveCount(1)
    await expect(page.locator('.southbound-row')).toContainText('美元')

    await southboundSearch.fill('易方达纳斯达克100')
    await expect(page.locator('.southbound-row')).toHaveCount(3)
    await expect(page.locator('.southbound-row').first()).toContainText('EF13')
    await expect(page.locator('.southbound-row').first()).toContainText('建行亚洲')

    await southboundSearch.fill('易方达香港 纳斯达克100指数')
    await expect(page.locator('.southbound-row')).toHaveCount(3)

    await southboundSearch.fill('众安 纳斯达克100')
    await expect(page.locator('.southbound-row')).toHaveCount(3)

    await southboundSearch.fill('易方达标普500')
    await expect(page.locator('.southbound-row')).toHaveCount(3)

    await southboundSearch.fill('日经225')
    await expect(page.locator('.southbound-row')).toHaveCount(4)

    await southboundSearch.fill('HM01')
    await expect(page.locator('.southbound-row')).toHaveCount(1)
    await expect(page.locator('.southbound-row')).toContainText('恒生标普500指数ETF（非上市类别）')
  })

  test('labels closed-period shares without pretending they have a price', async ({ page }) => {
    await page.goto('/#/funds')
    await fundSearch(page).fill('019738')
    await page.locator('.table-action:visible, .fund-mobile-actions button:visible').filter({ hasText: /详情/ }).first().click()
    const dialog = page.getByRole('dialog')
    const closedShare = dialog.locator('.share-comparison-table tbody tr').filter({ hasText: '019738' })
    await expect(closedShare).toContainText('封闭期')
    await expect(closedShare).not.toContainText('--')
  })

  test('shows all share performance, buy fees, and derived sell rules', async ({ page }) => {
    await page.goto('/#/funds')
    await fundSearch(page).fill('050025')
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
    const chartErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('[ECharts]')) chartErrors.push(message.text())
    })
    await page.goto('/#/funds')
    await fundSearch(page).fill('050025')
    await page.locator('.table-action:visible, .fund-mobile-actions button:visible').filter({ hasText: /详情/ }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('tab', { name: '走势' }).click()
    await expect(dialog.getByRole('button', { name: '3年' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '5年' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '10年' })).toBeVisible()
    await expect(dialog.getByRole('columnheader', { name: '单位净值' })).toBeVisible()
    await expect(dialog.locator('.trend-history-shell tbody tr').first()).toBeVisible()
    const chart = dialog.locator('.echart').first()
    await expect(chart).toBeVisible()
    const box = await chart.boundingBox()
    if (box) await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.42)
    await expect(page.locator('.chart-tooltip')).toContainText('日涨幅')
    await expect(page.locator('.chart-tooltip')).toContainText('区间涨幅')
    expect(chartErrors).toEqual([])
  })

  test('compares current holdings with the previous quarter', async ({ page }) => {
    await page.goto('/#/funds')
    await fundSearch(page).fill('096001')
    await page.locator('.table-action:visible, .fund-mobile-actions button:visible').filter({ hasText: /详情/ }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('tab', { name: '持仓' }).click()
    await expect(dialog.getByText(/对比 20\d{2}Q\d/)).toBeVisible()
    await expect(dialog.getByRole('columnheader', { name: '较上季' })).toBeVisible()
    await expect(dialog.locator('tbody tr').first()).toContainText(/新进|持平|[+-]\d+\.\d{2}pct/)
  })

  test('searches, sorts, expands shares, and opens detail', async ({ page }, testInfo) => {
    await page.goto('/#/funds')
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()
    await fundSearch(page).fill('易方达')
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()
    await clearFundSearch(page).click()
    await expect(page.locator('.fund-row:visible, .fund-mobile-card:visible').first()).toBeVisible()

    const sortHeader = page.getByRole('button', { name: '近 1 年' }).first()
    if (await sortHeader.isVisible().catch(() => false)) await sortHeader.click()
    else await page.getByLabel('排序方式').selectOption('chg_1y:desc')
    const expandButton = page.getByRole('button', { name: '展开份额' }).first()
    if (await expandButton.count()) await expandButton.click()
    else await page.getByRole('button', { name: '查看份额' }).first().click()
    await expect(page.locator('.shares-row:visible, .fund-mobile-shares:visible')).toBeVisible()
    if (testInfo.project.name === 'chromium-desktop') {
      const shareRow = page.locator('.share-comparison-table tbody tr').first()
      await shareRow.getByRole('button', { name: /买入和卖出规则/ }).last().click()
      await expect(page.getByRole('tooltip')).toContainText('买入规则')
      await expect(page.getByRole('tooltip')).toContainText('卖出规则')
      await shareRow.getByRole('button', { name: /综合费率构成/ }).click()
      await expect(page.getByRole('tooltip')).toContainText('综合费率')
      await expect(page.getByRole('tooltip')).toContainText('管理费')
    }

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
