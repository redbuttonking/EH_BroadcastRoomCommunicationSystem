import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@playwright/test'

export const ACCOUNT_PASSWORD = 'local-account-only-123!'
export const uniqueEmail = () => `test-${randomUUID()}@example.invalid`

export async function signUp(
  page: Page,
  email = uniqueEmail(),
  password = ACCOUNT_PASSWORD,
  role = '방송실',
  approve = true,
) {
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '회원가입', exact: true }).click()
  await page.getByRole('radio', { name: role, exact: true }).check()
  await page.getByLabel('이메일', { exact: true }).fill(email)
  await page.getByLabel('비밀번호', { exact: true }).fill(password)
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(password)
  const signedUp = page.waitForResponse(
    (response) => response.url().includes('/accounts:signUp') && response.ok(),
  )
  await page.getByRole('button', { name: '가입 신청하기' }).click()
  const { localId: uid } = await (await signedUp).json()
  await expect(page.locator('.account-summary')).toContainText(email)
  await expect(page.getByRole('heading', { name: '관리자 승인을 기다리고 있어요' })).toBeVisible()
  if (approve) {
    await seedApproval(uid)
    await expect(page.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
  }
  return email
}

export async function seedApproval(uid: string, status: 'approved' | 'rejected' = 'approved') {
  await emulatorWrite(`access/${uid}`, {
    status,
    reviewedBy: 'test-fixture',
    reviewedAt: { '.sv': 'timestamp' },
  })
}

export async function emulatorWrite(path: string, value: unknown) {
  const response = await fetch(
    `http://127.0.0.1:9000/${path}.json?ns=demo-eh-broadcast-default-rtdb`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify(value),
    },
  )
  if (!response.ok) throw new Error(`Emulator fixture failed: ${response.status}`)
}

export async function uidForEmail(email: string) {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-eh-broadcast/accounts:batchGet?maxResults=1000',
    { headers: { Authorization: 'Bearer owner' } },
  )
  const { users } = await response.json()
  const account = users.find((user: { email?: string }) => user.email === email)
  if (!account) throw new Error('Emulator account not found')
  return account.localId as string
}

export async function signIn(page: Page, email: string, password = ACCOUNT_PASSWORD) {
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  await page.getByLabel('이메일', { exact: true }).fill(email)
  await page.getByLabel('비밀번호', { exact: true }).fill(password)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page.locator('.account-summary')).toContainText(email)
}

export async function ensureSignedIn(page: Page, role = '방송실') {
  await expect(page.locator('.auth-form, .account-summary, .room-header').first()).toBeVisible()
  if (await page.locator('.auth-form').isVisible()) await signUp(page, undefined, undefined, role)
}
