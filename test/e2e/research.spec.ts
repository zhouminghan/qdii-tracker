import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.describe('local research workflow', () => {
  test('seeds the dated Southbound note', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('tab', { name: /笔记/ }).click()
    const note = page.locator('.research-card').filter({ hasText: '跨境理财通南向通' })
    await expect(note).toContainText('2026-11-15')
    await expect(note).toContainText('83004')
    await expect(note).toContainText('香港众安银行')
    await note.click()
    const reader = page.getByRole('dialog', { name: /跨境理财通南向通/ })
    await expect(reader).toBeVisible()
    await expect(reader.getByText(/南向通个人额度上限 300 万元/)).toBeVisible()
    await expect(reader).not.toContainText('待核验')
    const image = reader.getByRole('img', { name: '南向通渠道资料截图' })
    await expect(image).toBeAttached()
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expect(reader.getByRole('link', { name: '南向通渠道资料截图' })).toHaveAttribute(
      'href',
      'https://images.weserv.nl/?url=pbs.twimg.com/media/HXJIJHnaIAAkxNN%3Fformat%3Djpg%26name%3Dlarge',
    )
  })

  test('shows knowledge articles expanded with contextual actions', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('tab', { name: /知识库/ }).click()
    await expect(page.getByRole('button', { name: '新建笔记' })).toBeVisible()
    await expect(page.locator('.knowledge-card')).toHaveCount(14)
    await expect(page.locator('details.knowledge-card')).toHaveCount(0)
    await expect(page.locator('.knowledge-card').first()).toContainText('场内 ETF 与场外基金')
    await expect(page.locator('.knowledge-card').first()).toContainText('场外基金按交易日收盘后的基金净值确认份额')

    await page.getByRole('tab', { name: /观察清单/ }).click()
    await expect(page.getByRole('button', { name: '添加标的' })).toBeVisible()
    await page.getByRole('tab', { name: /策略记录/ }).click()
    await expect(page.getByRole('button', { name: '记录策略' })).toBeVisible()
  })

  test('seeds dated market notes with external image links', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('tab', { name: /笔记/ }).click()
    await expect(page.locator('.research-card')).toHaveCount(14)
    await expect(page.getByText('2026-11-27 · 5万美元便利换汇额度与银行美元理财')).toBeVisible()
    await expect(page.getByText('2026-11-26 · 美股卖出后：CRS、境外所得与资金回流')).toBeVisible()
    await expect(page.getByText('2026-11-26 · 买红利ETF别只看名字：三只对比')).toBeVisible()
    await expect(page.getByText('2026-11-25 · 易方达香港标普500：三种币种份额怎么选')).toBeVisible()
    await expect(page.getByText('2026-11-24 · 港版纳指100基金币种选择')).toBeVisible()
    await expect(page.getByText('2026-11-23 · 国内合规买纳指：场内、场外、南向通怎么选')).toBeVisible()
    await expect(page.getByText('2026-11-23 · 10万元投纳指100：30年费率差异')).toBeVisible()
    await expect(page.getByText('2026-11-23 · 场内基金溢价46%与散户接盘讨论')).toBeVisible()
    await expect(page.getByText('2026-11-22 · 为什么要选择美股')).toBeVisible()
    await expect(page.getByText('2026-11-21 · 定投美股宽基指数：忍住不卖')).toBeVisible()
    await expect(page.getByText('2026-11-21 · 纳指跌20%，到底要多久才能回本')).toBeVisible()
    await expect(page.getByText('2026-11-15 · 七巨头与 QQQ 年内收益对比')).toBeVisible()
    await expect(page.getByText('2026-11-15 · 主动基金亏损案例与指数定投讨论')).toBeVisible()

    const usStocksNote = page.locator('.research-card').filter({ hasText: '为什么要选择美股' })
    await usStocksNote.click()
    const usStocksReader = page.getByRole('dialog')
    await expect(usStocksReader).toContainText('为什么要选择美股，这是我见过最好的答案。')
    await expect(usStocksReader).toContainText('看着不舒服，但是道理确实正确的。')
    await expect(usStocksReader.locator('img')).toHaveCount(1)
    await expect(usStocksReader.getByRole('link', { name: '为什么要选择美股' })).toHaveAttribute(
      'href',
      'https://pbs.twimg.com/media/HXsks22aAAArHQy?format=jpg&name=large',
    )
    await page.keyboard.press('Escape')

    const nasdaqNote = page.locator('.research-card').filter({ hasText: '纳指跌20%' })
    await nasdaqNote.click()
    const nasdaqReader = page.getByRole('dialog')
    await expect(nasdaqReader).toContainText('跌20%，需要涨25%才能回本')
    await expect(nasdaqReader.locator('img')).toHaveCount(1)
    await expect(nasdaqReader.getByRole('link', { name: '纳指回撤与回本时间' })).toHaveAttribute(
      'href',
      'https://pbs.twimg.com/media/HXnVneRbwAEYeWs?format=jpg&name=large',
    )
    await page.keyboard.press('Escape')

    const dcaNote = page.locator('.research-card').filter({ hasText: '定投美股宽基指数' })
    await dcaNote.click()
    const dcaReader = page.getByRole('dialog')
    await expect(dcaReader).toContainText('真正难的从来不是“买什么”，而是“忍住不卖”。')
    await expect(dcaReader).toContainText('千万不能动摇。')
    await expect(dcaReader.locator('img')).toHaveCount(1)
    await expect(dcaReader.getByRole('link', { name: '定投美股宽基指数' })).toHaveAttribute(
      'href',
      'https://pbs.twimg.com/media/HXoiL7gbMAALzgr?format=jpg&name=large',
    )
    await page.keyboard.press('Escape')

    const sevenNote = page.locator('.research-card').filter({ hasText: '七巨头与 QQQ' })
    await sevenNote.click()
    const sevenReader = page.getByRole('dialog')
    await expect(sevenReader.locator('img')).toHaveCount(1)
    await page.keyboard.press('Escape')

    const activeFundNote = page.locator('.research-card').filter({ hasText: '主动基金亏损案例' })
    await activeFundNote.click()
    const reader = page.getByRole('dialog')
    await expect(reader.locator('img')).toHaveCount(5)
  })

  test('seeds the fund premium discussion with images and a comment summary', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('tab', { name: /笔记/ }).click()
    const note = page.locator('.research-card').filter({ hasText: '场内基金溢价46%' })
    await note.click()
    const reader = page.getByRole('dialog')
    await expect(reader).toContainText('溢价46%')
    await expect(reader).toContainText('评论总结')
    await expect(reader).toContainText('不追热点，不重仓押注')
    await expect(reader).not.toContainText('引用帖子')
    await expect(reader).not.toContainText('是不是管不住手就要挨打呀')
    await expect(reader.locator('img')).toHaveCount(2)
    await expect(reader.getByRole('link', { name: '场内基金溢价截图 1' })).toHaveAttribute(
      'href',
      'https://pbs.twimg.com/media/HXxq8rAaoAAOD68?format=jpg&name=large',
    )
    await expect(reader.getByRole('link', { name: '场内基金溢价截图 2' })).toHaveAttribute(
      'href',
      'https://pbs.twimg.com/media/HXxftipaUAEPTa3?format=jpg&name=large',
    )
  })

  test('seeds the Nasdaq fee comparison note', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('tab', { name: /笔记/ }).click()
    const note = page.locator('.research-card').filter({ hasText: '10万元投纳指100' })
    await note.click()
    const reader = page.getByRole('dialog')
    await expect(reader).toContainText('QQQM：约96.52万元。')
    await expect(reader).toContainText('广发纳指C：约71.97万元。')
    await expect(reader).toContainText('评论总结')
    await expect(reader).not.toContainText('蓝天云VPN')
  })

  test('seeds the Nasdaq channel comparison note', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('tab', { name: /笔记/ }).click()
    const note = page.locator('.research-card').filter({ hasText: '国内合规买纳指' })
    await note.click()
    const reader = page.getByRole('dialog')
    await expect(reader).toContainText('几万块小定投')
    await expect(reader).toContainText('几十万～300万大资金')
    await expect(reader).toContainText('顶着 15%～20% 溢价往里冲')
    await expect(reader).not.toContainText('analytics')
  })

  test('seeds the Hong Kong Nasdaq currency note with three images', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('tab', { name: /笔记/ }).click()
    const note = page.locator('.research-card').filter({ hasText: '港版纳指100基金币种选择' })
    await note.click()
    const reader = page.getByRole('dialog')
    await expect(reader).toContainText('港元 +3.39% ｜ 美元 +2.67% ｜ 人民币 -3.73%')
    await expect(reader).toContainText('评论补充')
    await expect(reader).toContainText('作者回复“没错”')
    await expect(reader.locator('img')).toHaveCount(3)
    await expect(reader.getByRole('link', { name: '币种对比截图 3' })).toHaveAttribute(
      'href',
      'https://pbs.twimg.com/media/HX39qToaYAEEhWV?format=jpg&name=large',
    )
  })

  test('seeds the Hong Kong S&P 500 currency note', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('tab', { name: /笔记/ }).click()
    const note = page.locator('.research-card').filter({ hasText: '三种币种份额怎么选' })
    await note.click()
    const reader = page.getByRole('dialog')
    await expect(reader).toContainText('港币份额涨 +10.33%')
    await expect(reader).toContainText('看钱从哪来、回哪去')
    await expect(reader.locator('img')).toHaveCount(1)
    await expect(reader.getByRole('link', { name: '三种币种份额收益对比' })).toHaveAttribute(
      'href',
      'https://pbs.twimg.com/media/HX9hO5kbcAEJO5e?format=jpg&name=large',
    )
  })

  test('seeds the dividend ETF comparison note', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('tab', { name: /笔记/ }).click()
    const note = page.locator('.research-card').filter({ hasText: '买红利ETF别只看名字' })
    await note.click()
    const reader = page.getByRole('dialog')
    await expect(reader).toContainText('华泰红利ETF（510880）')
    await expect(reader).toContainText('南方标普红利低波50ETF（515450）')
    await expect(reader).toContainText('评论补充')
    await expect(reader.locator('img')).toHaveCount(1)
    await expect(reader.getByRole('link', { name: '三只红利ETF对比' })).toHaveAttribute(
      'href',
      'https://pbs.twimg.com/media/HX_0zXyboAA2Vds?format=jpg&name=large',
    )
  })

  test('seeds the overseas income and CRS note', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('tab', { name: /笔记/ }).click()
    const note = page.locator('.research-card').filter({ hasText: '美股卖出后：CRS' })
    await note.click()
    const reader = page.getByRole('dialog')
    await expect(reader).toContainText('没有 CRS 交换，不等于不知道。')
    await expect(reader).toContainText('几个流传最广的误解')
    await expect(reader).toContainText('具体以税务局和各家官网为准')
    await expect(reader.locator('img')).toHaveCount(7)
  })

  test('seeds the USD deposit and FX quota note', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('tab', { name: /笔记/ }).click()
    const note = page.locator('.research-card').filter({ hasText: '5万美元便利换汇额度' })
    await note.click()
    const reader = page.getByRole('dialog')
    await expect(reader).toContainText('年化在3.2%左右')
    await expect(reader).toContainText('非保本，也不保证收益')
    await expect(reader).toContainText('我不具备金融执业资格')
    await expect(reader).toContainText('补充')
    await expect(reader.locator('img')).toHaveCount(4)
  })

  test('creates a note and keeps it after refresh', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('button', { name: '新建笔记' }).click()
    await page.getByLabel('标题').fill('纳指限购观察')
    await page.getByRole('textbox', { name: '基金代码' }).fill('270042')
    await page.getByRole('textbox', { name: '标签' }).fill('限购, 纳指')
    await page.getByRole('textbox', { name: '正文' }).fill('观察额度恢复后的申购状态。')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('tab', { name: /笔记/ }).click()
    await expect(page.getByText('纳指限购观察')).toBeVisible()
    await page.reload()
    await page.getByRole('tab', { name: /笔记/ }).click()
    await expect(page.getByText('纳指限购观察')).toBeVisible()
  })

  test('renders Markdown links and exports a standalone note', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('button', { name: '新建笔记' }).click()
    await page.getByLabel('标题').fill('Markdown 链接测试')
    await page.getByRole('textbox', { name: '基金代码' }).fill('022525')
    await page.getByRole('textbox', { name: '正文（Markdown）' }).fill('## 外部资料\n\n- [纳斯达克官网](https://www.nasdaq.com/)')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('tab', { name: /笔记/ }).click()

    const note = page.locator('.research-card').filter({ hasText: 'Markdown 链接测试' })
    await expect(note.getByRole('link', { name: '纳斯达克官网' })).toHaveAttribute('href', 'https://www.nasdaq.com/')
    const downloadPromise = page.waitForEvent('download')
    await note.getByRole('button', { name: '导出 Markdown' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('Markdown-链接测试.md')
    const path = await download.path()
    expect(path).toBeTruthy()
    const content = await readFile(path!, 'utf8')
    expect(content).toContain('# Markdown 链接测试')
    expect(content).toContain('- 基金代码：022525')
    expect(content).toContain('[纳斯达克官网](https://www.nasdaq.com/)')
  })

  test('confirms before deleting a research record', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('button', { name: '新建笔记' }).click()
    await page.getByLabel('标题').fill('待删除笔记')
    await page.getByRole('textbox', { name: '正文' }).fill('删除测试')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('tab', { name: /笔记/ }).click()

    const note = () => page.locator('.research-card').filter({ hasText: '待删除笔记' })
    await note().getByRole('button', { name: '删除笔记' }).click()
    await expect(page.getByRole('dialog', { name: '删除记录' })).toBeVisible()
    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByRole('heading', { name: '待删除笔记', exact: true })).toBeVisible()

    await note().getByRole('button', { name: '删除笔记' }).click()
    await page.getByRole('button', { name: '确认删除' }).click()
    await expect(page.getByRole('heading', { name: '待删除笔记', exact: true })).toHaveCount(0)
  })
})
