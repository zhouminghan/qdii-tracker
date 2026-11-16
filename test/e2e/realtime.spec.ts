import { expect, test, type Page, type Route } from '@playwright/test'

function quotePayload(price: number, change: number, nav: number): string {
  const fields = Array.from({ length: 83 }, () => '')
  fields[3] = String(price)
  fields[32] = String(change)
  fields[78] = String(nav)
  return fields.join('~')
}

async function fulfillQuotes(route: Route, prices: Record<string, [number, number, number]>) {
  const url = new URL(route.request().url())
  const symbols = decodeURIComponent(url.pathname.replace(/^\/q=/, '').split('&')[0])
    .split(',')
    .filter(Boolean)
  const body = symbols
    .filter((symbol) => prices[symbol])
    .map((symbol) => `var v_${symbol}=${JSON.stringify(quotePayload(...prices[symbol]))};`)
    .join('\n')
  await route.fulfill({ status: 200, contentType: 'application/javascript', body })
}

async function installEtfQuoteRoute(page: Page): Promise<void> {
  await page.route('https://qt.gtimg.cn/**', (route) => fulfillQuotes(route, {
    sh513100: [9.876, 1.23, 9],
    sh513110: [9.876, 1.23, 9],
    sh513290: [9.876, 1.23, 9],
    sh513300: [9.876, 1.23, 9],
    sh513390: [9.876, 1.23, 9],
    sh513500: [9.876, 1.23, 9],
    sh513650: [9.876, 1.23, 9],
    sh513850: [9.876, 1.23, 9],
    sh513870: [9.876, 1.23, 9],
    sh513880: [9.876, 1.23, 9],
    sz159501: [9.876, 1.23, 9],
    sz159509: [9.876, 1.23, 9],
    sz159513: [9.876, 1.23, 9],
    sz159577: [9.876, 1.23, 9],
    sz159612: [9.876, 1.23, 9],
    sz159632: [9.876, 1.23, 9],
    sz159655: [9.876, 1.23, 9],
    sz159659: [9.876, 1.23, 9],
    sz159660: [9.876, 1.23, 9],
    sz159696: [9.876, 1.23, 9],
    sz159941: [9.876, 1.23, 9],
  }))
}

test('ETF live quote refresh applies and falls back to static on failure', async ({ page }) => {
  await installEtfQuoteRoute(page)
  await page.goto('/#/funds')
  await page.getByRole('button', { name: '场内 ETF' }).click()
  const firstRow = page.locator('.fund-row:visible, .fund-mobile-card:visible').first()
  await expect(firstRow).toBeVisible()
  const staticText = await firstRow.innerText()

  await page.getByRole('button', { name: '实时行情' }).click()
  await expect(page.getByText('场内 ETF 行情已刷新')).toBeVisible()
  await expect(firstRow.getByText('9.876', { exact: true })).toBeVisible()

  await page.unroute('https://qt.gtimg.cn/**')
  await page.route('https://qt.gtimg.cn/**', (route) => route.abort('failed'))
  await page.getByRole('button', { name: '实时行情' }).click()
  await expect(page.getByText(/实时行情加载失败|实时行情请求超时/)).toBeVisible()
  await expect(firstRow.getByText('9.876', { exact: true })).toBeHidden()
  await expect(firstRow).toContainText(staticText.split('\n')[0])
})

test('index live refresh uses the correct Nasdaq labels', async ({ page }) => {
  await page.route('https://qt.gtimg.cn/**', (route) => fulfillQuotes(route, {
    usDJI: [52000, 0.1, 0],
    usINX: [7500, 0.2, 0],
    usIXIC: [22222, 0.3, 0],
    usNDX: [25555, 0.4, 0],
    sh000001: [3600, 0.5, 0],
    sh000300: [4000, 0.6, 0],
    sh000688: [1200, 0.7, 0],
  }))
  await page.goto('/#/market')
  await page.getByRole('button', { name: '实时指数' }).click()
  await expect(page.getByText('指数实时行情已刷新')).toBeVisible()
  const pulse = page.locator('.pulse-card').first()
  await expect(pulse).toContainText('纳斯达克100')
  await expect(pulse).toContainText('25,555.00')
  await expect(pulse).toHaveClass(/surface-up/)
  await expect(pulse.getByText('实时', { exact: true })).toBeVisible()
  await expect(page.locator('.index-card').filter({ hasText: '纳指综合' })).toContainText('22,222.00')
  await expect(page.locator('.index-card').filter({ hasText: '纳斯达克100' })).toContainText('25,555.00')
})
