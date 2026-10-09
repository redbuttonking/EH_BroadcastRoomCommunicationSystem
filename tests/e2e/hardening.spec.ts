import { expect, test } from '@playwright/test'
import { emulatorWrite, signUp, uidForEmail, verifyEmail } from './auth-helpers'

test('an unverified signup remains blocked until email verification and separate administrator approval', async ({
  page,
  browser,
}) => {
  await page.goto('/')
  const adminEmail = await signUp(page)
  await emulatorWrite(`administrators/${await uidForEmail(adminEmail)}`, true)
  await page.getByRole('button', { name: '가입 승인 관리', exact: true }).click()
  const context = await browser.newContext()
  try {
    const applicant = await context.newPage()
    await applicant.goto('/')
    const email = await signUp(applicant, undefined, undefined, '예배인도자', false, false)
    const uid = await uidForEmail(email)
    const row = page.locator(`[data-account-uid="${uid}"]`)
    await expect(row).toContainText('이메일 미인증')
    await expect(row.getByRole('button', { name: '승인', exact: true })).toBeDisabled()
    await applicant.getByRole('button', { name: '인증 완료 확인', exact: true }).click()
    await expect(applicant.getByRole('alert')).toContainText('아직 인증이 확인되지 않았습니다')
    await applicant.setViewportSize({ width: 360, height: 780 })
    await applicant.screenshot({
      path: 'artifacts/preview/hardening-email-verification.png',
      fullPage: true,
    })
    await verifyEmail(applicant, email)
    await expect(
      applicant.getByRole('heading', { name: '관리자 승인을 기다리고 있어요' }),
    ).toBeVisible()
    await expect(row.getByRole('button', { name: '승인', exact: true })).toBeEnabled()
    await row.getByRole('button', { name: '승인', exact: true }).click()
    await page.getByRole('button', { name: '승인하기', exact: true }).click()
    await expect(applicant.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('recent messages are bounded and older history can be loaded without losing newer messages', async ({
  page,
}) => {
  await page.goto('/')
  await signUp(page)
  await page.getByRole('button', { name: '새 방 만들기' }).click()
  await page.getByLabel('방 비밀번호', { exact: true }).fill('history-fixture')
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(page.getByRole('button', { name: '조정했어요', exact: true })).toBeEnabled()
  const session = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('eh:firebase-room:v2')!),
  )
  const messages = Object.fromEntries(
    Array.from({ length: 121 }, (_, index) => {
      const id = `history-${String(index).padStart(5, '0')}`
      return [
        id,
        {
          id,
          uid: session.uid,
          role: 'broadcast',
          text: `기록 ${index}`,
          sentAt: Date.now() - 200000 + index,
        },
      ]
    }),
  )
  await emulatorWrite(`rooms/${session.id}/messages`, messages)
  await expect(page.locator('.message-bubble')).toHaveCount(100)
  await expect(page.getByText('기록 0', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '이전 대화 보기', exact: true }).click()
  await expect(page.locator('.message-bubble')).toHaveCount(121)
  await expect(page.getByText('기록 0', { exact: true })).toBeAttached()
  await expect(page.getByRole('button', { name: '이전 대화 보기', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '조정했어요', exact: true }).click()
  await expect(page.locator('.message-bubble')).toHaveCount(122)
  await page.reload()
  await expect(page.locator('.message-bubble')).toHaveCount(100)
})

test('administrator cleanup blocks occupied rooms and removes an empty room after confirmation', async ({
  page,
  browser,
}) => {
  await page.goto('/')
  const email = await signUp(page)
  await emulatorWrite(`administrators/${await uidForEmail(email)}`, true)
  const context = await browser.newContext()
  try {
    const owner = await context.newPage()
    await owner.goto('/')
    await signUp(owner)
    await owner.getByRole('button', { name: '새 방 만들기' }).click()
    await owner.getByLabel('방 이름', { exact: true }).fill('정리 테스트 방')
    await owner.getByLabel('방 비밀번호', { exact: true }).fill('cleanup-fixture')
    await owner.getByRole('button', { name: '방 만들기', exact: true }).click()
    await expect(owner.getByRole('button', { name: '조정했어요', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '정리 테스트 방 정리', exact: true }).click()
    await page.getByRole('button', { name: '방과 대화 삭제', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('참여자가 있는 방')
    await owner.getByRole('button', { name: '나가기', exact: true }).click()
    await owner.getByRole('button', { name: '방을 유지하고 나가기', exact: true }).click()
    await expect(owner.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
    await page.getByRole('button', { name: '방과 대화 삭제', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(
      page.getByRole('button', { name: '정리 테스트 방 정리', exact: true }),
    ).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('optional screen wake lock is released when leaving a room', async ({ page }) => {
  await page.addInitScript(() => {
    const counts = { requests: 0, releases: 0 }
    Object.assign(window, { wakeCounts: counts })
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: async () => {
          counts.requests++
          const lock = new EventTarget()
          return Object.assign(lock, {
            released: false,
            release: async () => {
              counts.releases++
              lock.dispatchEvent(new Event('release'))
            },
          })
        },
      },
    })
  })
  await page.goto('/')
  await signUp(page)
  await page.getByRole('button', { name: '새 방 만들기' }).click()
  await page.getByLabel('방 비밀번호', { exact: true }).fill('wake-fixture')
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await page.getByRole('button', { name: '화면 유지 켜기', exact: true }).click()
  await expect(page.getByRole('button', { name: '화면 유지 끄기', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '나가기', exact: true }).click()
  await page.getByRole('button', { name: '방을 유지하고 나가기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { wakeCounts: unknown }).wakeCounts))
    .toEqual({ requests: 1, releases: 1 })
})
