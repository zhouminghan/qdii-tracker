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
    await expect(reader.getByText('对比内地 QDII、场内 ETF 和南向通三种渠道的综合成本。')).toBeVisible()
    const image = reader.getByRole('img', { name: '南向通渠道资料截图' })
    await expect(image).toBeAttached()
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expect(reader.getByRole('link', { name: '南向通渠道资料截图' })).toHaveAttribute(
      'href',
      'https://images.weserv.nl/?url=pbs.twimg.com/media/HXJIJHnaIAAkxNN%3Fformat%3Djpg%26name%3Dlarge',
    )
  })

  test('uses contextual actions and collapses knowledge by default', async ({ page }) => {
    await page.goto('/#/research')
    await expect(page.getByRole('button', { name: '新建笔记' })).toBeVisible()
    await expect(page.locator('.knowledge-card[open]')).toHaveCount(0)

    await page.getByRole('tab', { name: /观察清单/ }).click()
    await expect(page.getByRole('button', { name: '添加标的' })).toBeVisible()
    await page.getByRole('tab', { name: /策略记录/ }).click()
    await expect(page.getByRole('button', { name: '记录策略' })).toBeVisible()
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

  test('keeps the previous note version as history', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('button', { name: '新建笔记' }).click()
    await page.getByLabel('标题').fill('历史版本测试')
    await page.getByRole('textbox', { name: '正文' }).fill('第一版内容')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('tab', { name: /笔记/ }).click()
    const note = page.locator('.research-card').filter({ hasText: '历史版本测试' })
    await note.getByRole('button', { name: '编辑笔记' }).click()
    await page.getByRole('textbox', { name: '正文' }).fill('第二版内容')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await note.getByRole('button', { name: '历史' }).click()
    await expect(page.getByText('第一版内容')).toBeVisible()
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
