import { expect, test } from '@playwright/test'

test.describe('local research workflow', () => {
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
    await page.getByRole('tab', { name: /基金笔记/ }).click()
    await expect(page.getByText('纳指限购观察')).toBeVisible()
    await page.reload()
    await page.getByRole('tab', { name: /基金笔记/ }).click()
    await expect(page.getByText('纳指限购观察')).toBeVisible()
  })

  test('keeps the previous note version as history', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('button', { name: '新建笔记' }).click()
    await page.getByLabel('标题').fill('历史版本测试')
    await page.getByRole('textbox', { name: '正文' }).fill('第一版内容')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('tab', { name: /基金笔记/ }).click()
    await page.getByRole('button', { name: '编辑笔记' }).click()
    await page.getByRole('textbox', { name: '正文' }).fill('第二版内容')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('button', { name: '历史' }).click()
    await expect(page.getByText('第一版内容')).toBeVisible()
  })

  test('confirms before deleting a research record', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('button', { name: '新建笔记' }).click()
    await page.getByLabel('标题').fill('待删除笔记')
    await page.getByRole('textbox', { name: '正文' }).fill('删除测试')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('tab', { name: /基金笔记/ }).click()

    await page.getByRole('button', { name: '删除笔记' }).click()
    await expect(page.getByRole('dialog', { name: '删除研究记录' })).toBeVisible()
    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByRole('heading', { name: '待删除笔记', exact: true })).toBeVisible()

    await page.getByRole('button', { name: '删除笔记' }).click()
    await page.getByRole('button', { name: '确认删除' }).click()
    await expect(page.getByRole('heading', { name: '待删除笔记', exact: true })).toHaveCount(0)
  })
})
