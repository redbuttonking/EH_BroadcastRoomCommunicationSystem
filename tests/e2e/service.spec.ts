import { expect, test, type Page } from '@playwright/test'

import { ensureSignedIn, signUp } from './auth-helpers'

const PASSWORD = ' local-test-only '

test('retrying an interrupted typed message uses the original message ID', async ({ page }) => {
  await createRoom(page)
  const writes: string[] = []
  let failNext = true
  await page.route(
    (url) => url.pathname.includes('/messages/'),
    async (route) => {
      if (route.request().method() === 'PUT') {
        writes.push(new URL(route.request().url()).pathname)
        if (failNext) {
          failNext = false
          await route.abort()
          return
        }
      }
      await route.continue()
    },
  )
  const input = page.getByRole('textbox', { name: '메시지 입력' })
  await input.fill('전송 중 연결 오류 시험')
  await input.press('Enter')
  await expect(page.getByRole('button', { name: '다시 전송' })).toBeVisible()
  await input.press('Enter')
  await expect(page.locator('.message:not(.pending-message) .message-bubble')).toHaveCount(1)
  await expect(page.locator('.pending-message')).toHaveCount(0)
  expect(writes).toHaveLength(2)
  expect(writes[0]).toBe(writes[1])
})
async function createRoom(page: Page, name?: string) {
  await page.goto('/')
  await ensureSignedIn(page)
  await expect(page.locator('.preview-strip')).toContainText('Firebase 에뮬레이터')
  await page.getByRole('button', { name: '새 방 만들기' }).click()
  await expect(page.getByLabel('방 이름', { exact: true })).toHaveValue(/^대화방 \d{6}$/)
  if (name) await page.getByLabel('방 이름', { exact: true }).fill(name)
  await page.getByLabel('방 비밀번호', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^대화 - / })).toBeVisible()
  return (await page.locator('.room-header').getAttribute('data-room-code'))!
}

test('custom room names survive reentry and only the creator sees room closing actions', async ({
  page,
  browser,
}) => {
  const code = await createRoom(page, '주일 오전 예배')
  await expect(page.locator('.room-name')).toHaveText('주일 오전 예배')
  await page.getByRole('button', { name: '나가기', exact: true }).click()
  await page.getByRole('button', { name: '방을 유지하고 나가기' }).click()
  await expect(page.locator(`.room-option[data-room-code="${code}"]`)).toContainText(
    '주일 오전 예배',
  )
  const otherContext = await browser.newContext()
  try {
    const other = await otherContext.newPage()
    await joinRoom(other, code, '방송실')
    await expect(other.locator('.room-name')).toHaveText('주일 오전 예배')
    await expect(other.getByRole('button', { name: '방 닫기', exact: true })).toHaveCount(0)
    await other.getByRole('button', { name: '나가기', exact: true }).click()
    await expect(other.getByRole('button', { name: '방을 완전히 닫기' })).toHaveCount(0)
    await other.getByRole('dialog').getByRole('button', { name: '나가기', exact: true }).click()
    await joinRoom(page, code, '방송실')
    await expect(page.getByRole('button', { name: '방 닫기', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '방 닫기', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '방 닫기', exact: true }).click()
    await expect(page.locator(`.room-option[data-room-code="${code}"]`)).toHaveCount(0)
  } finally {
    await otherContext.close()
  }
})

test('desktop, phone and fullscreen share toolbar controls and aligned panel headings', async ({
  page,
}, info) => {
  await createRoom(page, '예배 소통 화면 점검')
  const controls = await page
    .locator('.room-toolbar button')
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label') || button.textContent?.trim()),
    )
  const dimensions = await page.locator('.room-toolbar button').evaluateAll((buttons) =>
    buttons.map((button) => ({
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    })),
  )
  for (const size of [
    { width: 1440, height: 900 },
    { width: 740, height: 300 },
  ]) {
    await page.setViewportSize(size)
    expect(
      await page
        .locator('.room-toolbar button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label') || button.textContent?.trim()),
        ),
    ).toEqual(controls)
    expect(
      await page.locator('.room-toolbar button').evaluateAll((buttons) =>
        buttons.map((button) => ({
          width: button.getBoundingClientRect().width,
          height: button.getBoundingClientRect().height,
        })),
      ),
    ).toEqual(dimensions)
    const headings = await page.locator('.panel-heading').evaluateAll((nodes) =>
      nodes.map((node) => ({
        height: node.getBoundingClientRect().height,
        top: node.getBoundingClientRect().top,
      })),
    )
    expect(headings[0]).toEqual(headings[1])
    await expect(page.getByRole('textbox', { name: '메시지 입력' })).toBeVisible()
    await expect(page.getByRole('button', { name: '직접 입력', exact: true })).toHaveCount(0)
    await page.screenshot({
      path: `artifacts/preview/${info.project.name}-room-layout-${size.width}.png`,
    })
  }
  await page.getByRole('button', { name: '전체 화면', exact: true }).click()
  const headings = await page.locator('.panel-heading').evaluateAll((nodes) =>
    nodes.map((node) => ({
      height: node.getBoundingClientRect().height,
      top: node.getBoundingClientRect().top,
    })),
  )
  expect(headings[0]).toEqual(headings[1])
  await page.getByRole('button', { name: '전체 화면 종료', exact: true }).click()
})

test('supported phones request landscape, while portrait tablets keep the room visible', async ({
  page,
  browser,
}) => {
  const code = await createRoom(page)
  for (const size of [
    { width: 740, height: 300 },
    { width: 768, height: 1024 },
  ]) {
    const context = await browser.newContext({
      viewport: size,
      screen: size,
      isMobile: true,
      hasTouch: true,
    })
    try {
      const mobile = await context.newPage()
      await mobile.addInitScript(() => {
        const target = window as Window & { requestedDirections?: string[] }
        target.requestedDirections = []
        Object.defineProperty(screen.orientation, 'lock', {
          value: async (direction: string) => {
            target.requestedDirections!.push(direction)
          },
        })
      })
      await joinRoom(mobile, code)
      await expect(mobile.getByRole('heading', { name: /^대화 - / })).toBeVisible()
      await expect(mobile.locator('.rotate-guide')).not.toBeVisible()
      expect(
        await mobile.evaluate(
          () => (window as Window & { requestedDirections?: string[] }).requestedDirections,
        ),
      ).toEqual(size.width === 740 ? ['landscape'] : [])
      await mobile.getByRole('button', { name: '나가기', exact: true }).click()
      await mobile.getByRole('dialog').getByRole('button', { name: '나가기', exact: true }).click()
    } finally {
      await context.close()
    }
  }
})
async function joinRoom(page: Page, code: string, role = '예배인도자') {
  await page.goto('/')
  await ensureSignedIn(page, role)
  await page.locator(`.room-option[data-room-code="${code}"]`).click()
  await page.getByLabel('방 비밀번호', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '입장하기' }).click()
  await expect(page.getByRole('heading', { name: /^대화 - / })).toBeVisible()
}

test('preset drag and keyboard reorder preserve text, confirm movement and keep the footer visible', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1100, height: 900 })
  await createRoom(page)
  await page.getByRole('button', { name: '빠른 문구 편집' }).click()
  const editor = page.getByRole('dialog', { name: '빠른 문구 편집' })
  const texts = editor.locator('textarea')
  const original = await texts.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLTextAreaElement).value),
  )
  await expect(editor.getByText('분류', { exact: true })).toHaveCount(0)
  await expect(editor.locator('.editor-scrollbar')).not.toBeVisible()
  const footerY = (await editor.getByRole('button', { name: '저장', exact: true }).boundingBox())!.y
  await editor.getByRole('button', { name: '문구 1 아래로', exact: true }).click()
  await expect(texts.nth(1)).toHaveValue(original[0])
  await expect(editor.locator('.editor-item').nth(1).locator('.reorder-pulse')).toHaveCount(1)
  const handle = editor.getByRole('button', { name: '문구 2 드래그하여 이동', exact: true })
  const start = (await handle.boundingBox())!
  const destination = (await editor.locator('.editor-item').first().boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2, start.y - 12, { steps: 4 })
  await expect(editor.locator('.preset-drag-preview')).toHaveText(original[0])
  await page.screenshot({ path: `artifacts/preview/${info.project.name}-preset-drag.png` })
  await page.mouse.move(start.x + start.width / 2, destination.y + destination.height / 2, {
    steps: 14,
  })
  await page.mouse.up()
  await expect(texts.first()).toHaveValue(original[0])
  await expect(editor.locator('.preset-drag-preview')).toHaveCount(0)
  await editor.getByRole('button', { name: '문구 1 드래그하여 이동', exact: true }).focus()
  await page.keyboard.press('Space', { delay: 60 })
  await expect(editor.locator('.preset-drag-preview')).toBeVisible()
  await page.keyboard.press('ArrowDown', { delay: 60 })
  await page.keyboard.press('Escape', { delay: 60 })
  await expect(editor).toBeVisible()
  await expect(editor.locator('.preset-drag-preview')).toHaveCount(0)
  await expect(texts.first()).toHaveValue(original[0])
  await editor.getByRole('button', { name: '문구 1 드래그하여 이동', exact: true }).focus()
  await page.keyboard.press('Space', { delay: 60 })
  await expect(editor.locator('.preset-drag-preview')).toBeVisible()
  await page.keyboard.press('ArrowDown', { delay: 60 })
  await page.keyboard.press('Space', { delay: 60 })
  await expect(texts.nth(1)).toHaveValue(original[0])
  await editor.locator('.editor-viewport').hover()
  await page.mouse.wheel(0, 350)
  await expect(editor.locator('.editor-scrollbar')).toBeVisible()
  expect((await editor.getByRole('button', { name: '저장', exact: true }).boundingBox())!.y).toBe(
    footerY,
  )
  await page.screenshot({ path: `artifacts/preview/${info.project.name}-preset-editor.png` })
  await expect(editor.locator('.editor-scrollbar')).not.toBeVisible({ timeout: 3000 })
  await expect(page.locator('.message-bubble')).toHaveCount(0)
  await editor.getByRole('button', { name: '저장', exact: true }).click()
  await page.reload()
  await expect(page.locator('.preset-button').nth(1)).toContainText(original[0])
})

test('installation guidance keeps Korean menu names together on a narrow phone', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')
  await ensureSignedIn(page)
  await expect(page.locator('.brand-name')).toHaveText('은혜장로교회 예배소통 시스템')
  await page.getByRole('button', { name: '앱 설치 안내' }).click()
  const dialog = page.getByRole('dialog', { name: '홈 화면에 설치하기' })
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  const menuLines = await dialog.locator('.keep-together').evaluateAll((nodes) =>
    nodes.map((node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      return [...new Set([...range.getClientRects()].map((rect) => rect.y))].length
    }),
  )
  expect(menuLines.every((count) => count === 1)).toBe(true)
  await page.screenshot({ path: `artifacts/preview/${info.project.name}-install-narrow.png` })
  await dialog.getByRole('button', { name: '홈 화면에 설치하기 닫기', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: '앱 설치 안내' })).toBeFocused()
  await page.getByRole('button', { name: '앱 설치 안내' }).click()
  await page.mouse.click(2, 2)
  await expect(dialog).not.toBeVisible()
})

test('fullscreen button enters and exits without leaving the room', async ({ page }) => {
  await createRoom(page)
  await page.getByRole('button', { name: '전체 화면', exact: true }).click()
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
  await page.getByRole('button', { name: '전체 화면 종료', exact: true }).click()
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false)
  await expect(page.getByRole('heading', { name: /^대화 - / })).toBeVisible()
})

test('two screens: password, exact preset repeat, preserved draft, readable sizing and live reentry', async ({
  browser,
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 950 })
  await page.emulateMedia({ colorScheme: 'light' })
  const code = await createRoom(page)
  const leaderContext = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    baseURL: 'http://127.0.0.1:5173',
  })
  const leader = await leaderContext.newPage()
  try {
    await leader.goto('/')
    await ensureSignedIn(leader, '예배인도자')
    await leader.locator(`.room-option[data-room-code="${code}"]`).click()
    await leader.getByLabel('방 비밀번호', { exact: true }).fill(PASSWORD.trim())
    await leader.getByRole('button', { name: '입장하기' }).click()
    await expect(leader.getByRole('alert')).toContainText('비밀번호가 맞지 않습니다')
    await leader.getByLabel('방 비밀번호', { exact: true }).fill(PASSWORD)
    await leader.getByRole('button', { name: '입장하기' }).click()
    await expect(leader.getByRole('heading', { name: /^대화 - / })).toBeVisible()
    expect(await leader.evaluate(() => document.activeElement?.tagName)).not.toBe('TEXTAREA')
    const preset = leader.getByRole('button', { name: '인도자 모니터 소리가 작아요' })
    await preset.click()
    await preset.click()
    await expect(
      page.locator('.message-bubble', { hasText: '인도자 모니터 소리가 작아요' }),
    ).toHaveCount(2)
    const draft = page.getByRole('textbox', { name: '메시지 입력' })
    await draft.fill('작성 중인 문장')
    await page.getByRole('button', { name: '조정했어요' }).click()
    await expect(draft).toHaveValue('작성 중인 문장')
    await expect(leader.locator('.message-bubble', { hasText: '조정했어요' })).toHaveCount(1)
    await leader.getByRole('button', { name: '글자 크게' }).click({ clickCount: 3, delay: 50 })
    await expect(leader.getByRole('button', { name: '글자 크게' })).toBeDisabled()
    expect(
      await leader.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const boxes = await leader.locator('.preset-button').evaluateAll((nodes) =>
      nodes.map((node) => ({
        height: node.getBoundingClientRect().height,
        clipped: node.scrollWidth > node.clientWidth,
      })),
    )
    expect(boxes.every((box) => !box.clipped)).toBe(true)
    expect(
      Math.max(...boxes.map((box) => box.height)) - Math.min(...boxes.map((box) => box.height)),
    ).toBeLessThan(2)
    await page.screenshot({
      path: `artifacts/preview/${info.project.name}-broadcast-light.png`,
      fullPage: true,
    })
    await leader.screenshot({ path: `artifacts/preview/${info.project.name}-leader-dark.png` })
    await leader.getByRole('button', { name: '나가기', exact: true }).click()
    await leader.getByRole('dialog').getByRole('button', { name: '나가기', exact: true }).click()
    await expect(leader.locator('.account-summary')).toBeVisible()
    await joinRoom(leader, code)
    await expect(leader.locator('.message-bubble')).toHaveCount(3)
    await page.getByRole('button', { name: '방 닫기', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '방 닫기', exact: true }).click()
    await expect(leader.getByText('방이 종료되었습니다. 대화가 삭제되었습니다.')).toBeVisible()
    await expect(leader.locator('.message-bubble')).toHaveCount(0)
  } finally {
    await leaderContext.close()
  }
})

test('duplicate broadcast is blocked, room events survive reentry, and another broadcast may take a released seat', async ({
  browser,
  page,
}) => {
  const code = await createRoom(page)
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' })
  const other = await context.newPage()
  try {
    await other.goto('/')
    await ensureSignedIn(other)
    await other.locator(`.room-option[data-room-code="${code}"]`).click()
    await other.getByLabel('방 비밀번호', { exact: true }).fill(PASSWORD)
    await other.getByRole('button', { name: '입장하기' }).click()
    await expect(other.getByRole('alert')).toContainText(
      '다른 사용자가 방송실 역할로 이 방에 참여 중',
    )
    await expect(other.locator('.room-header')).toHaveCount(0)
    await page.getByRole('button', { name: '나가기', exact: true }).click()
    await page.getByRole('button', { name: '방을 유지하고 나가기' }).click()
    await other.getByRole('button', { name: '입장하기' }).click()
    await expect(other.locator('.room-event', { hasText: '방송실이 들어왔습니다.' })).toHaveCount(2)
    await expect(other.locator('.room-event', { hasText: '방송실이 나갔습니다.' })).toHaveCount(1)
    await page.getByRole('button', { name: '로그아웃' }).click()
    await signUp(page, undefined, undefined, '예배인도자')
    await joinRoom(page, code)
    await expect(
      other.locator('.room-event', { hasText: '예배인도자가 들어왔습니다.' }),
    ).toHaveCount(1)
    await page.getByRole('button', { name: '나가기', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '나가기', exact: true }).click()
    await expect(other.locator('.room-event', { hasText: '예배인도자가 나갔습니다.' })).toHaveCount(
      1,
    )
    await joinRoom(page, code)
    await expect(page.locator('.room-event', { hasText: '예배인도자가 나갔습니다.' })).toHaveCount(
      1,
    )
  } finally {
    await context.close()
  }
})

test('presets can be edited in the room, reordered, canceled, and kept separate from other accounts', async ({
  browser,
  page,
}) => {
  const code = await createRoom(page)
  await page.getByRole('button', { name: '빠른 문구 편집' }).click()
  let editor = page.getByRole('dialog', { name: '빠른 문구 편집' })
  await editor.getByLabel('문구 1 내용', { exact: true }).fill('음향 조절을 마쳤습니다')
  await editor.getByRole('button', { name: '문구 추가' }).click()
  await editor.getByLabel('문구 5 내용', { exact: true }).fill('새로 추가한 문구')
  await editor.getByRole('button', { name: '문구 5 위로', exact: true }).click()
  await editor.getByRole('button', { name: '문구 5 삭제', exact: true }).click()
  await expect(page.locator('.message-bubble')).toHaveCount(0)
  await editor.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.locator('.preset-button')).toHaveCount(4)
  await page.getByRole('button', { name: '음향 조절을 마쳤습니다' }).click()
  await expect(page.locator('.message-bubble')).toHaveText('음향 조절을 마쳤습니다')
  await page.getByRole('button', { name: '빠른 문구 편집' }).click()
  editor = page.getByRole('dialog', { name: '빠른 문구 편집' })
  await editor.getByLabel('문구 1 내용', { exact: true }).fill('취소할 수정')
  await editor.getByRole('button', { name: '취소', exact: true }).click()
  await page
    .getByRole('dialog', { name: '변경내용을 취소할까요?' })
    .getByRole('button', { name: '취소하기' })
    .click()
  await expect(page.getByRole('button', { name: '음향 조절을 마쳤습니다' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '음향 조절을 마쳤습니다' })).toBeEnabled()
  await page.getByRole('button', { name: '나가기', exact: true }).click()
  await page.getByRole('button', { name: '방을 유지하고 나가기' }).click()
  await expect(page.getByText('방을 유지하고 나왔습니다.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '로그아웃' }).click()
  await signUp(page, undefined, undefined, '예배인도자')
  await joinRoom(page, code)
  await expect(page.getByRole('button', { name: '인도자 모니터 소리가 작아요' })).toBeVisible()
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' })
  try {
    const other = await context.newPage()
    await joinRoom(other, code, '방송실')
    await expect(other.getByRole('button', { name: '조정했어요' })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('small phone broadcast has compact controls, an always visible composer and an accessible editor at maximum font size', async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    viewport: { width: 740, height: 300 },
    isMobile: true,
    hasTouch: true,
    baseURL: 'http://127.0.0.1:5173',
  })
  const page = await context.newPage()
  try {
    await createRoom(page)
    await expect(page.getByRole('textbox', { name: '메시지 입력' })).toBeVisible()
    await page.getByRole('button', { name: '글자 크게' }).click({ clickCount: 3, delay: 50 })
    expect(
      await page
        .locator('.room-header')
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(65)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const height = await page.locator('.chat-scroll').evaluate((element) => element.clientHeight)
    expect(height).toBeGreaterThan(75)
    await page.screenshot({
      path: `artifacts/preview/${info.project.name}-phone-broadcast-updated.png`,
    })
    await page.getByRole('button', { name: '빠른 문구 편집' }).click()
    const editor = page.getByRole('dialog', { name: '빠른 문구 편집' })
    await page.screenshot({ path: `artifacts/preview/${info.project.name}-preset-phone.png` })
    await editor.getByRole('button', { name: '저장', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '메시지 입력' })).toBeVisible()
    await page.getByRole('button', { name: '나가기', exact: true }).click()
    await page.getByRole('button', { name: '방을 완전히 닫기' }).click()
  } finally {
    await context.close()
  }
})

test('portrait guidance, scrolling and focus changes do not leave the room or send a dragged preset', async ({
  browser,
  page,
}) => {
  const code = await createRoom(page)
  const leaderContext = await browser.newContext({
    viewport: { width: 667, height: 320 },
    isMobile: true,
    hasTouch: true,
    baseURL: 'http://127.0.0.1:5173',
  })
  const leader = await leaderContext.newPage()
  try {
    await joinRoom(leader, code)
    await leader.setViewportSize({ width: 390, height: 844 })
    await expect(leader.getByText('휴대폰을 가로로 돌려주세요.')).toBeVisible()
    await leader.setViewportSize({ width: 667, height: 320 })
    await expect(leader.getByRole('heading', { name: /^대화 - / })).toBeVisible()
    const preset = leader.getByRole('button', { name: '인도자 모니터 소리가 작아요' })
    await preset.dispatchEvent('pointerdown', { clientX: 500, clientY: 120 })
    await preset.dispatchEvent('pointermove', { clientX: 500, clientY: 160 })
    await preset.dispatchEvent('click', { detail: 1 })
    await expect(page.locator('.message-bubble')).toHaveCount(0)
    for (let index = 0; index < 18; index++) await preset.click()
    await expect(page.locator('.message-bubble')).toHaveCount(18)
    await page.locator('.chat-scroll').evaluate((element) => {
      element.scrollTop = 0
      element.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    const input = page.getByRole('textbox', { name: '메시지 입력' })
    await input.fill('아직 작성 중')
    await preset.click()
    await expect(page.getByRole('button', { name: '새 메시지' })).toBeVisible()
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('아직 작성 중')
    expect(await page.locator('.chat-scroll').evaluate((element) => element.scrollTop)).toBe(0)
    expect(await leader.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    )
  } finally {
    await leaderContext.close()
  }
})

test('an unexpected last disconnect preserves the room and its history', async ({
  browser,
  page,
}) => {
  const code = await createRoom(page)
  await page.getByRole('button', { name: '조정했어요' }).click()
  await expect(page.locator('.message-bubble')).toHaveCount(1)
  const observer = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' })
  const lobby = await observer.newPage()
  try {
    await lobby.goto('/')
    await ensureSignedIn(lobby, '예배인도자')
    await expect(lobby.locator(`.room-option[data-room-code="${code}"]`)).toBeVisible()
    await page.close()
    await expect(lobby.locator(`.room-option[data-room-code="${code}"]`)).toBeVisible()
    await joinRoom(lobby, code)
    await expect(lobby.locator('.message-bubble', { hasText: '조정했어요' })).toHaveCount(1)
    await expect(
      lobby.locator('.room-event', { hasText: '방송실의 연결이 끊어졌습니다.' }),
    ).toHaveCount(1)
  } finally {
    await observer.close()
  }
})

test('broadcast can choose to keep a room or close it and theme survives reload', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  const code = await createRoom(page)
  await page.getByRole('button', { name: '다크모드로 전환' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: '조정했어요' }).click()
  await expect(page.locator('.message-bubble')).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('heading', { name: /^대화 - / })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.message-bubble')).toHaveCount(1)
  await page.getByRole('button', { name: '나가기', exact: true }).click()
  await page.getByRole('button', { name: '방을 유지하고 나가기' }).click()
  await expect(page.getByText('방을 유지하고 나왔습니다.', { exact: false })).toBeVisible()
  await joinRoom(page, code, '방송실')
  await expect(page.locator('.message-bubble')).toHaveCount(1)
  await page.getByRole('button', { name: '화이트모드로 전환' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: '나가기', exact: true }).click()
  await page.getByRole('button', { name: '방을 완전히 닫기' }).click()
  await expect(page.getByText('방이 종료되었습니다. 대화가 삭제되었습니다.')).toBeVisible()
})

test('Korean composition and held Enter do not accidentally submit; storage denial is harmless', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('storage blocked')
      },
    })
  })
  await createRoom(page)
  const input = page.getByRole('textbox', { name: '메시지 입력' })
  await input.fill('한글 입력 중')
  await input.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    isComposing: true,
    keyCode: 229,
  })
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', repeat: true })
  await expect(page.locator('.message-bubble')).toHaveCount(0)
  await expect(input).toHaveValue('한글 입력 중')
  await input.press('Enter')
  await expect(page.locator('.message-bubble')).toHaveCount(1)
  await page.getByRole('button', { name: '글자 크게' }).click()
  await expect(page.getByLabel('글자 크기', { exact: true })).toHaveText('20')
})

test('a narrow desktop remains usable without the phone rotation overlay', async ({
  browser,
  page,
}) => {
  const code = await createRoom(page)
  const desktopContext = await browser.newContext({
    viewport: { width: 560, height: 850 },
    baseURL: 'http://127.0.0.1:5173',
  })
  const leader = await desktopContext.newPage()
  try {
    await joinRoom(leader, code)
    await expect(leader.getByText('휴대폰을 가로로 돌려주세요.')).not.toBeVisible()
    await expect(leader.getByRole('heading', { name: /^대화 - / })).toBeVisible()
  } finally {
    await desktopContext.close()
  }
})

test('room dialogs keep two actions aligned and dismiss without leaving or losing the draft', async ({
  page,
}, info) => {
  await createRoom(page)
  const input = page.getByRole('textbox', { name: '메시지 입력' })
  await input.fill('아직 전송하지 않은 대화')
  const leave = page.getByRole('button', { name: '나가기', exact: true })
  const dialog = page.getByRole('dialog', { name: '방을 어떻게 나갈까요?' })
  for (const size of [
    { width: 1440, height: 900 },
    { width: 740, height: 300 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(size)
    await leave.click()
    await expect(dialog.getByRole('button', { name: '계속 대화하기' })).toHaveCount(0)
    const actions = dialog.locator('.dialog-actions button')
    await expect(actions).toHaveCount(2)
    const first = (await actions.nth(0).boundingBox())!
    const second = (await actions.nth(1).boundingBox())!
    expect(first.y).toBe(second.y)
    expect(first.width).toBeCloseTo(second.width, 0)
    expect(first.height).toBe(second.height)
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({
      path: `artifacts/preview/${info.project.name}-leave-modal-${size.width}.png`,
    })
    const box = (await dialog.boundingBox())!
    await page.mouse.click(box.x + 4, box.y + 4)
    await expect(dialog).toBeVisible()
    await page.mouse.move(box.x + 4, box.y + 4)
    await page.mouse.down()
    await page.mouse.move(2, 2)
    await page.mouse.up()
    await expect(dialog).toBeVisible()
    await page.mouse.click(2, 2)
    await expect(dialog).not.toBeVisible()
    await expect(leave).toBeFocused()
    await expect(input).toHaveValue('아직 전송하지 않은 대화')
    await leave.click()
    await dialog.getByRole('button', { name: '방을 어떻게 나갈까요? 닫기', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await leave.click()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  }
  await expect(page.locator('.message-bubble')).toHaveCount(0)
  await page.getByRole('button', { name: '방 닫기', exact: true }).click()
  const close = page.getByRole('dialog', { name: '대화방을 닫을까요?' })
  await close.getByRole('button', { name: '대화방을 닫을까요? 닫기', exact: true }).click()
  await expect(close).not.toBeVisible()
  await expect(page.locator('.room-header')).toBeVisible()
})

test('closing preset edits requires discard confirmation and preserves text when dismissed', async ({
  page,
}) => {
  await createRoom(page)
  const edit = page.getByRole('button', { name: '빠른 문구 편집', exact: true })
  await edit.click()
  const editor = page.getByRole('dialog', { name: '빠른 문구 편집', exact: true })
  const close = editor.getByRole('button', { name: '빠른 문구 편집 닫기', exact: true })
  const discard = page.getByRole('dialog', { name: '변경내용을 취소할까요?' })
  await close.click()
  await expect(editor).not.toBeVisible()
  await expect(discard).not.toBeVisible()
  await expect(edit).toBeFocused()
  await edit.click()
  await editor.getByLabel('문구 1 내용', { exact: true }).fill('저장 전에도 유지할 문구')
  await close.click()
  await expect(discard).toBeVisible()
  await expect(discard.getByRole('button', { name: '계속 편집하기' })).toBeFocused()
  await discard.getByRole('button', { name: '계속 편집하기' }).click()
  await expect(editor.getByLabel('문구 1 내용', { exact: true })).toHaveValue(
    '저장 전에도 유지할 문구',
  )
  await page.keyboard.press('Escape')
  await expect(discard).toBeVisible()
  await page.mouse.click(2, 2)
  await expect(discard).not.toBeVisible()
  await expect(editor).toBeVisible()
  await page.mouse.click(2, 2)
  await expect(discard).toBeVisible()
  await discard.getByRole('button', { name: '변경내용을 취소할까요? 닫기', exact: true }).click()
  await expect(discard).not.toBeVisible()
  await editor.getByRole('button', { name: '저장', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '저장 전에도 유지할 문구', exact: true }),
  ).toBeVisible()
  await edit.click()
  await editor.getByRole('button', { name: '문구 1 아래로', exact: true }).click()
  await close.click()
  await expect(discard).toBeVisible()
  await discard.getByRole('button', { name: '취소하기' }).click()
  await expect(editor).not.toBeVisible()
  await expect(edit).toBeFocused()
  await expect(page.locator('.preset-button').first()).toContainText('저장 전에도 유지할 문구')
})
