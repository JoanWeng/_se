import { expect, test } from '@playwright/test'

const RUN_E2E_RUST = !!process.env.E2E_RUST

async function addMessage(page, name, content) {
  await page.goto('/')
  await page.getByTestId('name-input').fill(name)
  await page.getByTestId('content-input').fill(content)
  await page.getByTestId('submit-btn').click()
}

// 伺服器的留言會跨測試殘留，每個測試開始前先清空（走真實 API，也順便當煙霧測試）
async function clearBoardViaApi(request, base) {
  const response = await request.get(`${base}/api/messages`)
  const { messages } = await response.json()
  for (const message of messages) {
    await request.delete(`${base}/api/messages/${message.id}`)
  }
}

test.describe('留言板（Node 後端）', () => {
  test.beforeEach(async ({ request }) => {
    await clearBoardViaApi(request, '')
  })

  test('頁面與標題正常載入', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('留言板')
    await expect(page.getByRole('heading', { name: '留言板' })).toBeVisible()
    await expect(page.getByTestId('backend-select')).toHaveValue('node')
  })

  test('新增留言後顯示在清單最上方', async ({ page }) => {
    const content = `hello e2e ${Date.now()}`
    await addMessage(page, 'playwright', content)

    const items = page.getByTestId('message-item')
    await expect(items.first()).toContainText(content)
    await expect(items.first()).toContainText('playwright')
    await expect(items.first()).toContainText('剛剛')
  })

  test('空白內容被擋下，不會新增留言', async ({ page }) => {
    const before = await page.getByTestId('message-item').count()
    await addMessage(page, 'playwright', '   ')

    await expect(page.getByTestId('error-msg')).toBeVisible()
    await expect(page.getByTestId('error-msg')).toContainText('內容不可空白')
    const after = await page.getByTestId('message-item').count()
    expect(after).toBe(before)
  })

  test('輸入框用 maxlength 截斷超長輸入', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('name-input').fill('x'.repeat(30))
    await page.getByTestId('content-input').fill('x'.repeat(300))

    // maxlength 先在 UI 層擋下超長輸入，送出即合法，不會出現錯誤
    expect(await page.getByTestId('name-input').inputValue()).toHaveLength(20)
    expect(await page.getByTestId('content-input').inputValue()).toHaveLength(200)

    await page.getByTestId('submit-btn').click()
    await expect(page.getByTestId('error-msg')).toBeHidden()
  })

  test('刪除留言後該則留言消失', async ({ page }) => {
    const content = `delete me ${Date.now()}`
    await addMessage(page, 'playwright', content)

    const item = page.getByTestId('message-item').filter({ hasText: content })
    await expect(item).toHaveCount(1)
    await item.getByTestId('delete-btn').click()
    await expect(item).toHaveCount(0)
  })
})

test.describe('留言板（Rust 後端）', () => {
  test.skip(!RUN_E2E_RUST, '需要 E2E_RUST=1（啟動 Rust 後端）')

  test.beforeEach(async ({ request }) => {
    await clearBoardViaApi(request, 'http://localhost:8000')
  })

  test('切換到 Rust 後端後可以新增留言', async ({ page }) => {
    const content = `hello rust e2e ${Date.now()}`
    await page.goto('/')
    await page.getByTestId('backend-select').selectOption('rust')
    await page.getByTestId('name-input').fill('playwright')
    await page.getByTestId('content-input').fill(content)
    await page.getByTestId('submit-btn').click()

    await expect(page.getByTestId('message-item').first()).toContainText(content)
  })

  test('Rust 後端也會擋下空白內容', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('backend-select').selectOption('rust')
    await page.getByTestId('name-input').fill('playwright')
    await page.getByTestId('content-input').fill('')
    await page.getByTestId('submit-btn').click()

    await expect(page.getByTestId('error-msg')).toBeVisible()
    await expect(page.getByTestId('error-msg')).toContainText('內容不可空白')
  })
})
