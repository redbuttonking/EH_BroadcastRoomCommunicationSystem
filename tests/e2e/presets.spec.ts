import { expect, test, type Page } from '@playwright/test'
import { emulatorWrite, signIn, signUp, uidForEmail } from './auth-helpers'

async function edit(page: Page, name = '빠른 문구 편집') {
  await page.getByRole('button', { name, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '빠른 문구 편집', exact: true })
  await expect(dialog.getByLabel('문구 1 내용', { exact: true })).toBeVisible()
  return dialog
}

test('account presets sync between separate devices, the home and room, and survive closing a room', async ({
  page,
  browser,
}) => {
  await page.goto('/')
  const email = await signUp(page)
  let editor = await edit(page)
  await editor.getByLabel('문구 1 내용', { exact: true }).fill('계정에 저장한 문구')
  await editor.getByRole('button', { name: '저장', exact: true }).click()
  await expect(editor).toHaveCount(0)
  const context = await browser.newContext()
  try {
    const other = await context.newPage()
    await other.goto('/')
    await signIn(other, email)
    editor = await edit(other)
    await expect(editor.getByLabel('문구 1 내용', { exact: true })).toHaveValue(
      '계정에 저장한 문구',
    )
    await page.getByRole('button', { name: '새 방 만들기' }).click()
    await page.getByLabel('방 비밀번호', { exact: true }).fill('preset-test')
    await page.getByRole('button', { name: '방 만들기', exact: true }).click()
    await expect(page.getByRole('button', { name: '계정에 저장한 문구' })).toBeVisible()
    await editor.getByLabel('문구 1 내용', { exact: true }).fill('다른 기기에서 바꾼 문구')
    await editor.getByRole('button', { name: '저장', exact: true }).click()
    await expect(page.getByRole('button', { name: '다른 기기에서 바꾼 문구' })).toBeVisible()
    await page.getByRole('button', { name: '다른 기기에서 바꾼 문구' }).click()
    await expect(page.locator('.message-bubble')).toHaveText('다른 기기에서 바꾼 문구')
    await page.getByRole('button', { name: '방 닫기', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '방 닫기', exact: true }).click()
    await expect(page.getByRole('heading', { name: '열려 있는 방', exact: true })).toBeVisible()
    await page.reload()
    editor = await edit(page)
    await expect(editor.getByLabel('문구 1 내용', { exact: true })).toHaveValue(
      '다른 기기에서 바꾼 문구',
    )
    await editor.getByRole('button', { name: '빠른 문구 편집 닫기' }).click()
    await page.getByRole('button', { name: '로그아웃' }).click()
    await signUp(page)
    editor = await edit(page)
    await expect(editor.getByLabel('문구 1 내용', { exact: true })).toHaveValue('조정했어요')
  } finally {
    await context.close()
  }
})

test('an administrator edits two independent role collections from home on desktop and phone', async ({
  page,
}, info) => {
  await page.goto('/')
  const email = await signUp(page, undefined, undefined, '예배인도자')
  await emulatorWrite(`administrators/${await uidForEmail(email)}`, true)
  await expect(page.getByRole('button', { name: '방송실 문구 편집' })).toBeVisible()
  for (const role of ['방송실', '예배인도자']) {
    const editor = await edit(page, `${role} 문구 편집`)
    await editor.getByLabel('문구 1 내용', { exact: true }).fill(`${role} 전용 문구`)
    await editor.getByRole('button', { name: '저장', exact: true }).click()
    await expect(editor).toHaveCount(0)
  }
  await page.reload()
  for (const role of ['방송실', '예배인도자']) {
    const editor = await edit(page, `${role} 문구 편집`)
    await expect(editor.getByLabel('문구 1 내용', { exact: true })).toHaveValue(`${role} 전용 문구`)
    await editor.getByRole('button', { name: '빠른 문구 편집 닫기' }).click()
  }
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: `artifacts/preview/${info.project.name}-account-presets-${width}.png`,
      fullPage: true,
    })
  }
})

test('concurrent changes and failed saves preserve the draft without overwriting saved account text', async ({
  page,
  browser,
}) => {
  await page.goto('/')
  const email = await signUp(page)
  const editor = await edit(page)
  await editor.getByLabel('문구 1 내용', { exact: true }).fill('아직 저장하지 않은 수정')
  const context = await browser.newContext()
  try {
    const other = await context.newPage()
    await other.goto('/')
    await signIn(other, email)
    const second = await edit(other)
    await second.getByLabel('문구 1 내용', { exact: true }).fill('먼저 저장된 수정')
    await second.getByRole('button', { name: '저장', exact: true }).click()
    await expect(second).toHaveCount(0)
    await expect(editor.getByLabel('문구 1 내용', { exact: true })).toHaveValue(
      '아직 저장하지 않은 수정',
    )
    await editor.getByRole('button', { name: '저장', exact: true }).click()
    await expect(editor.getByRole('alert')).toContainText('다른 기기에서 문구가 변경되었습니다')
    await editor.getByRole('button', { name: '빠른 문구 편집 닫기' }).click()
    await page
      .getByRole('dialog', { name: '변경내용을 취소할까요?' })
      .getByRole('button', { name: '취소하기' })
      .click()
    const latest = await edit(page)
    await expect(latest.getByLabel('문구 1 내용', { exact: true })).toHaveValue('먼저 저장된 수정')
    await latest.getByLabel('문구 1 내용', { exact: true }).fill('실패 후 다시 저장할 문구')
    let fail = true
    await page.route(
      (url) => url.pathname.startsWith('/presets/'),
      async (route) => {
        if (route.request().method() === 'PUT' && fail) {
          fail = false
          await route.abort()
        } else await route.continue()
      },
    )
    await latest.getByRole('button', { name: '저장', exact: true }).click()
    await expect(latest.getByRole('alert')).toContainText('연결이 불안정')
    await expect(latest.getByLabel('문구 1 내용', { exact: true })).toHaveValue(
      '실패 후 다시 저장할 문구',
    )
    await latest.getByRole('button', { name: '저장', exact: true }).click()
    await expect(latest).toHaveCount(0)
    const check = await edit(other)
    await expect(check.getByLabel('문구 1 내용', { exact: true })).toHaveValue(
      '실패 후 다시 저장할 문구',
    )
  } finally {
    await context.close()
  }
})

test('legacy device presets are imported only on request and an empty account list survives reload', async ({
  page,
}) => {
  await page.goto('/')
  await signUp(page)
  await page.evaluate(() =>
    localStorage.setItem(
      'eh:presets:broadcast:v1',
      JSON.stringify([{ id: 'local-only', text: '이 기기의 예전 문구' }]),
    ),
  )
  let editor = await edit(page)
  await expect(editor.getByLabel('문구 1 내용', { exact: true })).toHaveValue('조정했어요')
  await editor.getByRole('button', { name: '이 기기 문구 가져오기' }).click()
  await expect(editor.getByLabel('문구 1 내용', { exact: true })).toHaveValue('이 기기의 예전 문구')
  await editor.getByRole('button', { name: '저장', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await page.reload()
  editor = await edit(page)
  await expect(editor.getByLabel('문구 1 내용', { exact: true })).toHaveValue('이 기기의 예전 문구')
  await editor.getByRole('button', { name: '문구 1 삭제', exact: true }).click()
  await editor.getByRole('button', { name: '저장', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: '빠른 문구 편집', exact: true }).click()
  editor = page.getByRole('dialog', { name: '빠른 문구 편집', exact: true })
  await expect(editor.getByText('자주 쓰는 문구를 추가해 주세요.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('eh:presets:broadcast:v1'))).toContain(
    '이 기기의 예전 문구',
  )
})
