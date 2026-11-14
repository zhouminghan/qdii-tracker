import { expect, test } from '@playwright/test'

test.describe('local research workflow', () => {
  test('creates a note and keeps it after refresh', async ({ page }) => {
    await page.goto('/#/research')
    await page.getByRole('button', { name: '新建' }).click()
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
    await page.getByRole('button', { name: '新建' }).click()
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
})
