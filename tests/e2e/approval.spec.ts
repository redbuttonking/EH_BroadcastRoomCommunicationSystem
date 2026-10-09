import { expect, test } from '@playwright/test'
import {
  ACCOUNT_PASSWORD,
  emulatorWrite,
  signIn,
  signUp,
  uidForEmail,
  uniqueEmail,
} from './auth-helpers'

test('an administrator rejects, approves and revokes an account with live room access changes', async ({
  page,
  browser,
}, info) => {
  await page.goto('/')
  const adminEmail = await signUp(page)
  const adminUid = await uidForEmail(adminEmail)
  await emulatorWrite(`administrators/${adminUid}`, true)
  await page.getByRole('button', { name: '새 방 만들기' }).click()
  await page.getByLabel('방 이름', { exact: true }).fill('승인 기능 시험방')
  await page.getByLabel('방 비밀번호', { exact: true }).fill('approval-test')
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  const code = await page.locator('.room-header').getAttribute('data-room-code')
  await page.getByRole('button', { name: '나가기', exact: true }).click()
  await page.getByRole('button', { name: '방을 유지하고 나가기' }).click()
  await page.getByRole('button', { name: '가입 승인 관리', exact: true }).click()
  await expect(page.getByRole('heading', { name: '가입 승인 관리', exact: true })).toBeVisible()
  const context = await browser.newContext()
  try {
    const applicant = await context.newPage()
    await applicant.goto('/')
    const email = await signUp(applicant, undefined, undefined, '예배인도자', false)
    const uid = await uidForEmail(email)
    await expect(applicant.locator('.room-option')).toHaveCount(0)
    await expect(
      applicant.getByRole('button', { name: '가입 승인 관리', exact: true }),
    ).toHaveCount(0)
    const row = page.locator(`[data-account-uid="${uid}"]`)
    await expect(row).toContainText(email)
    await expect(row).toContainText('예배인도자')
    for (const size of [
      { width: 1440, height: 900 },
      { width: 320, height: 740 },
      { width: 740, height: 300 },
    ]) {
      await page.setViewportSize(size)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await row.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: `artifacts/preview/${info.project.name}-approval-admin-${size.width}.png`,
        fullPage: false,
      })
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await row.getByRole('button', { name: '거절', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '거절하기', exact: true }).click()
    await expect(
      applicant.getByRole('heading', { name: '이용 승인이 거절되었습니다' }),
    ).toBeVisible()
    await page.getByRole('button', { name: /^거절됨/ }).click()
    await row.getByRole('button', { name: '승인', exact: true }).click()
    let fail = true
    await page.route(
      (url) => url.pathname === `/access/${uid}.json`,
      async (route) => {
        if (route.request().method() === 'PUT' && fail) {
          fail = false
          await route.abort()
        } else await route.continue()
      },
    )
    await page.getByRole('dialog').getByRole('button', { name: '승인하기', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('연결이 불안정')
    await expect(
      applicant.getByRole('heading', { name: '이용 승인이 거절되었습니다' }),
    ).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: '승인하기', exact: true }).click()
    await expect(applicant.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
    await expect(applicant.getByRole('button', { name: '새 방 만들기' })).toHaveCount(0)
    await applicant.locator(`.room-option[data-room-code="${code}"]`).click()
    await applicant.getByLabel('방 비밀번호', { exact: true }).fill('approval-test')
    await applicant.getByRole('button', { name: '입장하기', exact: true }).click()
    await applicant
      .getByRole('button', { name: '인도자 모니터 소리가 작아요', exact: true })
      .click()
    await expect(applicant.locator('.message-bubble')).toHaveCount(1)
    const session = await applicant.evaluate(() =>
      JSON.parse(sessionStorage.getItem('eh:firebase-room:v2')!),
    )
    await page.getByRole('button', { name: /^승인됨/ }).click()
    await row.getByRole('button', { name: '승인 취소', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '승인 취소하기', exact: true })
      .click()
    await expect(
      applicant.getByRole('heading', { name: '이용 승인이 거절되었습니다' }),
    ).toBeVisible()
    await expect(applicant.locator('.room-header')).toHaveCount(0)
    await expect(applicant.locator('.message-bubble')).toHaveCount(0)
    expect(await applicant.evaluate(() => sessionStorage.getItem('eh:firebase-room:v2'))).toBeNull()
    await expect
      .poll(async () => {
        const response = await fetch(
          `http://127.0.0.1:9000/rooms/${session.id}/connections/${uid}.json?ns=demo-eh-broadcast-default-rtdb`,
          { headers: { Authorization: 'Bearer owner' } },
        )
        return response.json()
      })
      .toBeNull()
    await applicant.reload()
    await expect(
      applicant.getByRole('heading', { name: '이용 승인이 거절되었습니다' }),
    ).toBeVisible()
  } finally {
    await context.close()
  }
})

test('an administrator lands on home and can create, approve and reenter with either role without fixing an account role', async ({
  page,
  request,
  browser,
}) => {
  const email = uniqueEmail()
  const response = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
    { data: { email, password: ACCOUNT_PASSWORD, returnSecureToken: true } },
  )
  expect(response.ok()).toBe(true)
  const { localId: uid } = await response.json()
  await emulatorWrite(`administrators/${uid}`, true)
  await emulatorWrite(`access/${uid}`, {
    status: 'approved',
    reviewedBy: uid,
    reviewedAt: Date.now(),
  })
  const readProfile = async () => {
    const result = await request.get(
      `http://127.0.0.1:9000/profiles/${uid}.json?ns=demo-eh-broadcast-default-rtdb`,
      { headers: { Authorization: 'Bearer owner' } },
    )
    expect(result.ok()).toBe(true)
    return result.json()
  }
  await page.goto('/')
  await signIn(page, email)
  await expect(page.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '가입 승인 관리', exact: true })).toHaveCount(0)
  await expect(page.locator('.account-role-label')).toHaveText('관리자 · 로그인됨')
  await expect(page.getByRole('radio')).toHaveCount(0)
  expect(await readProfile()).toBeNull()
  await page.reload()
  await expect(page.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
  await page.getByRole('button', { name: '새 방 만들기' }).click()
  await expect(page.getByRole('radio')).toHaveCount(0)
  await page.getByLabel('방 이름', { exact: true }).fill('관리자 역할 시험방')
  await page.getByLabel('방 비밀번호', { exact: true }).fill('admin-roles-test')
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(page.locator('.room-role')).toHaveText('방송실')
  const code = await page.locator('.room-header').getAttribute('data-room-code')
  await page.getByRole('textbox', { name: '메시지 입력' }).fill('관리자 방송실 대화')
  await page.getByRole('textbox', { name: '메시지 입력' }).press('Enter')
  await expect(page.locator('.message-bubble')).toContainText('관리자 방송실 대화')
  const secondDevice = await browser.newContext()
  try {
    const duplicate = await secondDevice.newPage()
    await duplicate.goto('/')
    await signIn(duplicate, email)
    await duplicate.locator(`.room-option[data-room-code="${code}"]`).click()
    await duplicate.getByLabel('방 비밀번호', { exact: true }).fill('admin-roles-test')
    for (const role of ['방송실', '예배인도자']) {
      await duplicate.getByRole('radio', { name: role, exact: true }).check()
      await duplicate.getByRole('button', { name: '입장하기', exact: true }).click()
      await expect(duplicate.getByRole('alert')).toContainText(
        '이 계정은 현재 다른 기기나 탭에서 이 방에 참여 중',
      )
      await expect(duplicate.getByRole('alert')).not.toContainText('비밀번호')
      await expect(duplicate.locator('.room-header')).toHaveCount(0)
      await expect(page.locator('.room-role')).toHaveText('방송실')
    }
    // A duplicated tab may restore the same room hint without going through the join form.
    const hint = await page.evaluate(() => sessionStorage.getItem('eh:firebase-room:v2'))
    await duplicate.evaluate((value) => sessionStorage.setItem('eh:firebase-room:v2', value!), hint)
    await duplicate.reload()
    await expect(duplicate.locator('.lobby-notice')).toContainText(
      '이 계정은 현재 다른 기기나 탭에서 이 방에 참여 중',
    )
    await expect(page.locator('.room-role')).toHaveText('방송실')
    await expect(page.locator('.message-bubble')).toHaveText('관리자 방송실 대화')
  } finally {
    await secondDevice.close()
  }
  await page.reload()
  await expect(page.locator('.room-role')).toHaveText('방송실')
  await page.getByRole('button', { name: '나가기', exact: true }).click()
  await page.getByRole('button', { name: '방을 유지하고 나가기' }).click()
  await expect(page.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
  await page.getByRole('button', { name: '가입 승인 관리', exact: true }).click()
  const context = await browser.newContext()
  try {
    const applicant = await context.newPage()
    await applicant.goto('/')
    const applicantEmail = await signUp(applicant, undefined, undefined, '예배인도자', false)
    const applicantUid = await uidForEmail(applicantEmail)
    const row = page.locator(`[data-account-uid="${applicantUid}"]`)
    await expect(row).toContainText(applicantEmail)
    await row.getByRole('button', { name: '승인', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '승인하기', exact: true }).click()
    await expect(applicant.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
    expect(await readProfile()).toBeNull()
    await page.getByRole('button', { name: '기본 홈', exact: true }).click()
    await expect(page.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
    await page.locator(`.room-option[data-room-code="${code}"]`).click()
    await expect(page.getByRole('group', { name: '이번 방에서 사용할 역할' })).toBeVisible()
    await page.getByRole('radio', { name: '예배인도자', exact: true }).check()
    await page.getByLabel('방 비밀번호', { exact: true }).fill('admin-roles-test')
    await page.getByRole('button', { name: '입장하기', exact: true }).click()
    await expect(page.locator('.room-role')).toHaveText('예배인도자')
    await page.getByRole('button', { name: '인도자 모니터 소리가 작아요', exact: true }).click()
    await expect(page.locator('.message-bubble')).toHaveCount(2)
    await page.reload()
    await expect(page.locator('.room-role')).toHaveText('예배인도자')
    await expect(page.locator('.message-bubble')).toHaveCount(2)
    expect(await readProfile()).toBeNull()
    await page.getByRole('button', { name: '나가기', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '나가기', exact: true }).click()
    await expect(page.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
    // An earlier fixed profile must not restrict an administrator's next room role.
    await emulatorWrite(`profiles/${uid}`, { email, role: 'leader', createdAt: 100 })
    await page.reload()
    await expect(page.getByRole('button', { name: '새 방 만들기' })).toBeVisible()
    await page.locator(`.room-option[data-room-code="${code}"]`).click()
    await page.getByRole('radio', { name: '방송실', exact: true }).check()
    await page.getByLabel('방 비밀번호', { exact: true }).fill('admin-roles-test')
    await page.getByRole('button', { name: '입장하기', exact: true }).click()
    await expect(page.locator('.room-role')).toHaveText('방송실')
    await page.getByRole('button', { name: '조정했어요', exact: true }).click()
    await expect(page.locator('.message-bubble')).toHaveCount(3)
    await page.reload()
    await expect(page.locator('.room-role')).toHaveText('방송실')
    await page.getByRole('button', { name: '나가기', exact: true }).click()
    await page.getByRole('button', { name: '방을 완전히 닫기' }).click()
    await expect(page.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
    expect(await readProfile()).toEqual({ email, role: 'leader', createdAt: 100 })
    await page.getByRole('button', { name: '로그아웃', exact: true }).click()
    await signIn(page, email)
    await expect(page.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('existing role profiles require approval and ordinary broadcast users have no administration access', async ({
  page,
  request,
}) => {
  const email = uniqueEmail()
  const response = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
    { data: { email, password: ACCOUNT_PASSWORD, returnSecureToken: true } },
  )
  const { localId: uid } = await response.json()
  await emulatorWrite(`profiles/${uid}`, { role: 'broadcast', createdAt: 100 })
  await page.goto('/')
  await signIn(page, email)
  await expect(page.getByRole('heading', { name: '관리자 승인을 기다리고 있어요' })).toBeVisible()
  await expect(page.getByRole('button', { name: '새 방 만들기' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '가입 승인 관리', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: '관리자 승인을 기다리고 있어요' })).toBeVisible()
  await expect
    .poll(async () => {
      const r = await fetch(
        `http://127.0.0.1:9000/profiles/${uid}.json?ns=demo-eh-broadcast-default-rtdb`,
        { headers: { Authorization: 'Bearer owner' } },
      )
      return r.json()
    })
    .toEqual({ role: 'broadcast', createdAt: 100, email })
})
