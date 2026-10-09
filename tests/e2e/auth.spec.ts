import { expect, test, type Page } from '@playwright/test'
import { ACCOUNT_PASSWORD, signIn, signUp, uniqueEmail, verifyEmail } from './auth-helpers'

const EMULATOR = 'http://127.0.0.1:9099'
const ROOM_PASSWORD = 'local-auth-room'

test('a registered leader keeps the role after reload and cannot select broadcast or create rooms', async ({
  page,
}) => {
  await page.goto('/')
  await signUp(page, undefined, undefined, '예배인도자')
  await expect(page.locator('.account-role-label')).toHaveText('예배인도자 · 로그인됨')
  await expect(page.getByRole('button', { name: '새 방 만들기' })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.account-role-label')).toHaveText('예배인도자 · 로그인됨')
  await expect(page.getByRole('radio')).toHaveCount(0)
})

test('existing email accounts choose their role once after login', async ({ page, request }) => {
  const email = uniqueEmail()
  const response = await request.post(
    `${EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
    { data: { email, password: ACCOUNT_PASSWORD, returnSecureToken: true } },
  )
  expect(response.ok()).toBe(true)
  await page.goto('/')
  await page.getByLabel('이메일', { exact: true }).fill(email)
  await page.getByLabel('비밀번호', { exact: true }).fill(ACCOUNT_PASSWORD)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await verifyEmail(page, email)
  await expect(page.getByRole('heading', { name: '계정 역할 설정' })).toBeVisible()
  await page.getByRole('radio', { name: '방송실', exact: true }).check()
  await page.getByRole('button', { name: '역할을 설정하고 승인 요청' }).click()
  await expect(page.locator('.account-role-label')).toHaveText('방송실 · 로그인됨')
  await page.reload()
  await expect(page.locator('.account-role-label')).toHaveText('방송실 · 로그인됨')
})

test('a legacy anonymous browser is sent to login without creating or deleting an account', async ({
  page,
  request,
}) => {
  const response = await request.post(
    `${EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
    { data: { returnSecureToken: true } },
  )
  const legacy = await response.json()
  expect(legacy.localId).toBeTruthy()
  await page.addInitScript((account) => {
    localStorage.setItem(
      'firebase:authUser:demo-key:[DEFAULT]',
      JSON.stringify({
        uid: account.localId,
        emailVerified: false,
        isAnonymous: true,
        providerData: [],
        apiKey: 'demo-key',
        appName: '[DEFAULT]',
        stsTokenManager: {
          refreshToken: account.refreshToken,
          accessToken: account.idToken,
          expirationTime: Date.now() + 3600000,
        },
      }),
    )
    sessionStorage.setItem(
      'eh:firebase-room:v1',
      JSON.stringify({ id: 'legacy-room-000000000000', code: '000000' }),
    )
  }, legacy)
  const accountMutations: string[] = []
  page.on('request', (request) => {
    if (/accounts:(signUp|delete)/.test(request.url())) accountMutations.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  expect(accountMutations).toHaveLength(0)
  expect(await page.evaluate(() => sessionStorage.getItem('eh:firebase-room:v1'))).toBeNull()
  const lookup = await request.post(
    `${EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-key`,
    { data: { idToken: legacy.idToken } },
  )
  expect(lookup.ok()).toBe(true)
})

async function createRoom(page: Page) {
  await page.getByRole('button', { name: '새 방 만들기' }).click()
  await page.getByLabel('방 비밀번호', { exact: true }).fill(ROOM_PASSWORD)
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(page.locator('.room-name')).toBeVisible()
  await expect(page.getByRole('button', { name: '조정했어요', exact: true })).toBeEnabled()
  return (await page.locator('.room-header').getAttribute('data-room-code'))!
}

async function requestBroadcast(page: Page, code: string) {
  await page.locator(`.room-option[data-room-code="${code}"]`).click()
  await page.getByLabel('방 비밀번호', { exact: true }).fill(ROOM_PASSWORD)
  await page.getByRole('button', { name: '입장하기' }).click()
}

test('visiting and reloading never creates an account; signup validates confirmation and login errors', async ({
  page,
}) => {
  let signupRequests = 0
  page.on('request', (request) => {
    if (request.url().includes('/accounts:signUp')) signupRequests++
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  expect(signupRequests).toBe(0)
  const email = uniqueEmail()
  await page.getByRole('button', { name: '회원가입', exact: true }).click()
  await page.getByRole('radio', { name: '방송실', exact: true }).check()
  await page.getByLabel('이메일', { exact: true }).fill(email)
  await page.getByLabel('비밀번호', { exact: true }).fill(ACCOUNT_PASSWORD)
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('not-the-same-password')
  await page.getByRole('button', { name: '가입 신청하기' }).click()
  await expect(page.getByRole('alert')).toContainText('비밀번호가 서로 다릅니다')
  expect(signupRequests).toBe(0)
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(ACCOUNT_PASSWORD)
  await page.getByRole('button', { name: '가입 신청하기' }).click()
  await expect(page.locator('.account-summary')).toContainText(email)
  expect(signupRequests).toBe(1)
  await page.getByRole('button', { name: '로그아웃' }).click()
  await page.getByLabel('이메일', { exact: true }).fill(email)
  await page.getByLabel('비밀번호', { exact: true }).fill('incorrect-password')
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('이메일 또는 비밀번호가 맞지 않습니다')
  await signIn(page, email)
  expect(signupRequests).toBe(1)
  await page.getByRole('button', { name: '로그아웃' }).click()
  await page.getByRole('button', { name: '회원가입', exact: true }).click()
  await page.getByRole('radio', { name: '방송실', exact: true }).check()
  await page.getByLabel('이메일', { exact: true }).fill(email)
  await page.getByLabel('비밀번호', { exact: true }).fill(ACCOUNT_PASSWORD)
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(ACCOUNT_PASSWORD)
  await page.getByRole('button', { name: '가입 신청하기' }).click()
  await expect(page.getByRole('alert')).toContainText('이미 가입한 이메일입니다')
})

test('stored login survives a browser restart; leaving preserves login and logout clears it', async ({
  browser,
  page,
}) => {
  await page.goto('/')
  const email = await signUp(page)
  await createRoom(page)
  await page.getByRole('button', { name: '나가기', exact: true }).click()
  await page.getByRole('button', { name: '방을 유지하고 나가기' }).click()
  await expect(page.locator('.account-summary')).toContainText(email)
  await page.reload()
  await expect(page.locator('.account-summary')).toContainText(email)
  // Carry only the persistent cookie/localStorage state, never sessionStorage.
  const storageState = await page.context().storageState()
  const restarted = await browser.newContext({ storageState })
  try {
    const next = await restarted.newPage()
    await next.goto('/')
    await expect(next.locator('.account-summary')).toContainText(email)
    await next.getByRole('button', { name: '로그아웃' }).click()
    await next.reload()
    await expect(next.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
    await expect(next.locator('.room-header')).toHaveCount(0)
  } finally {
    await restarted.close()
  }
})

test('same-account tabs cannot duplicate a role and cross-tab logout releases the old seat', async ({
  page,
  context,
  browser,
}) => {
  await page.goto('/')
  const email = await signUp(page)
  const code = await createRoom(page)
  await page.getByRole('button', { name: '조정했어요', exact: true }).click()
  const tab = await context.newPage()
  await tab.goto('/')
  await expect(tab.locator('.account-summary')).toContainText(email)
  await requestBroadcast(tab, code)
  await expect(tab.getByRole('alert')).toContainText(
    '이 계정은 현재 다른 기기나 탭에서 이 방에 참여 중',
  )
  await expect(page.locator('.room-header')).toBeVisible()
  await tab.getByRole('button', { name: '로그아웃' }).click()
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  await expect(page.locator('.message-bubble')).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem('eh:firebase-room:v2'))).toBeNull()
  const nextEmail = await signUp(tab)
  await expect(page.locator('.account-summary')).toContainText(nextEmail)
  await page.reload()
  await expect(page.locator('.account-summary')).toContainText(nextEmail)
  await expect(page.locator('.room-header')).toHaveCount(0)
  const other = await browser.newContext()
  try {
    const replacement = await other.newPage()
    await replacement.goto('/')
    await signIn(replacement, email)
    await requestBroadcast(replacement, code)
    await expect(replacement.locator('.room-header')).toBeVisible()
    await expect(replacement.locator('.message-bubble')).toHaveText('조정했어요')
    await replacement.getByRole('button', { name: '방 닫기', exact: true }).click()
    await replacement
      .getByRole('dialog')
      .getByRole('button', { name: '방 닫기', exact: true })
      .click()
    await expect(replacement.locator('.account-summary')).toContainText(email)
  } finally {
    await other.close()
  }
})

test('password reset issues a Korean reset link and the new password signs in', async ({
  page,
  request,
}) => {
  await page.goto('/')
  const email = await signUp(page)
  await page.getByRole('button', { name: '로그아웃' }).click()
  await page.getByRole('button', { name: '비밀번호 찾기' }).click()
  await page.getByLabel('이메일', { exact: true }).fill(email)
  const outgoing = page.waitForRequest((request) => request.url().includes('/accounts:sendOobCode'))
  await page.getByRole('button', { name: '재설정 메일 보내기' }).click()
  expect((await outgoing).headers()['x-firebase-locale']).toBe('ko')
  await expect(page.getByRole('status')).toContainText('재설정 안내를 보냈습니다')
  const codes = await (
    await request.get(`${EMULATOR}/emulator/v1/projects/demo-eh-broadcast/oobCodes`)
  ).json()
  const code = codes.oobCodes.findLast(
    (item: { email: string; requestType: string }) =>
      item.email === email && item.requestType === 'PASSWORD_RESET',
  )
  expect(code?.oobCode).toBeTruthy()
  const newPassword = 'reset-local-only-456!'
  const reset = await request.post(
    `${EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-key`,
    { data: { oobCode: code.oobCode, newPassword } },
  )
  expect(reset.ok()).toBe(true)
  await page.getByRole('button', { name: '로그인으로 돌아가기' }).click()
  await signIn(page, email, newPassword)
})

test('signup and login remain readable on narrow phones and short landscape screens', async ({
  page,
}, info) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  for (const size of [
    { width: 320, height: 700 },
    { width: 740, height: 300 },
    { width: 1440, height: 950 },
  ]) {
    await page.setViewportSize(size)
    await page.screenshot({
      path: `artifacts/preview/${info.project.name}-login-${size.width}.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: '회원가입', exact: true }).click()
    await page.getByRole('radio', { name: '방송실', exact: true }).check()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByLabel('이메일', { exact: true }).fill('layout@example.invalid')
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('can-reach-this-field')
    await page.screenshot({
      path: `artifacts/preview/${info.project.name}-signup-${size.width}.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: '로그인으로 돌아가기' }).click()
  }
})
