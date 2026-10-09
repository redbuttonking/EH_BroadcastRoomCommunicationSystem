import { expect, test, type Page } from '@playwright/test'
import { signUp } from './auth-helpers'

test('offline notice updates its own cache and keeps the shared visual palette', async ({
  page,
  context,
}, info) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  await page.evaluate(async () => {
    await (await caches.open('eh-offline-v1')).put('/offline.html', new Response('old notice'))
    await (await caches.open('unrelated-cache')).put('/kept', new Response('kept'))
    await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
  })
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  const keys = await page.evaluate(() => caches.keys())
  expect(keys).not.toContain('eh-offline-v1')
  expect(keys).toContain('unrelated-cache')
  expect(keys).toContain('eh-offline-v2')
  await context.setOffline(true)
  try {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '인터넷 연결을 확인해 주세요.' })).toBeVisible()
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(23, 27, 28)')
    await page.setViewportSize({ width: 320, height: 700 })
    await page.screenshot({ path: `artifacts/preview/${info.project.name}-offline-dark.png` })
  } finally {
    await context.setOffline(false)
  }
})

async function createRoom(page: Page) {
  await page.goto('/')
  await signUp(page)
  await page.getByRole('button', { name: '새 방 만들기' }).click()
  await page.getByLabel('방 이름', { exact: true }).fill('주일 오전 예배')
  await page.getByLabel('방 비밀번호', { exact: true }).fill('design-local-only')
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(page.locator('.preset-button').first()).toBeVisible()
}

test('a long preset grows independently and temporary send blocking preserves readable text', async ({
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
    await page.getByRole('button', { name: '빠른 문구 편집', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '빠른 문구 편집', exact: true })
    await editor
      .getByLabel('문구 1 내용', { exact: true })
      .fill('인도자 모니터 소리를 조금 더 높여 주세요. '.repeat(6).slice(0, 120))
    await editor.getByRole('button', { name: '저장', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: '문구를 저장했습니다.' })).toBeVisible()
    await page.getByRole('button', { name: '글자 크게' }).click({ clickCount: 3, delay: 50 })
    const cards = page.locator('.preset-button')
    const sizes = await cards.evaluateAll((nodes) =>
      nodes.map((node) => ({
        height: node.getBoundingClientRect().height,
        clipped: node.scrollWidth > node.clientWidth,
      })),
    )
    expect(sizes[0].height).toBeGreaterThan(sizes[1].height * 2)
    expect(
      sizes.slice(1).every((size) => size.height >= 87 && size.height < 100 && !size.clipped),
    ).toBe(true)
    expect(sizes.every((size) => !size.clipped)).toBe(true)
    const controls = await page
      .locator('.room-toolbar button, .panel-heading button')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))
    expect(controls.every((height) => height >= 44)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.getByRole('button', { name: /모드로 전환/ }).click()
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished),
        ),
      )
      await page.screenshot({
        path: `artifacts/preview/${info.project.name}-long-presets-${theme}.png`,
      })
    }
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(
      (url) => url.pathname === '/.json',
      async (route) => {
        if (
          route.request().method() === 'PATCH' &&
          Object.keys(route.request().postDataJSON() ?? {}).some((key) =>
            key.includes('/messages/'),
          )
        )
          await gate
        await route.continue()
      },
    )
    try {
      await cards.nth(1).click()
      await expect(cards.first()).toBeDisabled()
      await expect(cards.first()).toHaveCSS('opacity', '1')
      await expect(page.locator('.pending-message')).toHaveCSS('opacity', '1')
    } finally {
      release()
    }
    await expect(page.locator('.pending-message')).toHaveCount(0)
    await expect(cards.first()).toBeEnabled()
    await cards.first().click()
    await expect(cards.first()).toBeEnabled()
    await page
      .getByRole('textbox', { name: '메시지 입력' })
      .fill('여러 줄로 작성 중입니다.\n둘째 줄\n셋째 줄\n넷째 줄')
    await page.locator('.chat-scroll').evaluate((element) => {
      element.scrollTop = 0
      element.dispatchEvent(new Event('scroll'))
    })
    await cards.nth(1).click()
    const newMessage = page.getByRole('button', { name: '새 메시지', exact: true })
    await expect(newMessage).toBeVisible()
    const alertBox = (await newMessage.boundingBox())!
    const composerBox = (await page.locator('.composer-area').boundingBox())!
    expect(alertBox.y + alertBox.height).toBeLessThanOrEqual(composerBox.y)
    await expect(page.getByRole('textbox', { name: '메시지 입력' })).toHaveValue(/넷째 줄/)
    await page.getByRole('button', { name: '빠른 문구 편집', exact: true }).click()
    await expect(page.locator('.presets-saved')).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('a failed room close keeps the error and retry action in the open dialog', async ({
  page,
}, info) => {
  await createRoom(page)
  let fail = true
  await page.route(
    (url) => url.pathname === '/.json',
    async (route) => {
      const payload = route.request().postDataJSON() ?? {}
      if (
        fail &&
        route.request().method() === 'PATCH' &&
        Object.entries(payload).some(([key, value]) => key.startsWith('rooms/') && value === null)
      ) {
        fail = false
        await route.abort()
      } else await route.continue()
    },
  )
  await page.getByRole('button', { name: '나가기', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '방을 어떻게 나갈까요?' })
  await dialog.getByRole('button', { name: '방을 완전히 닫기' }).click()
  await expect(dialog.getByRole('alert')).toContainText('연결이 불안정')
  await expect(dialog.getByRole('button', { name: '방을 완전히 닫기' })).toBeEnabled()
  await page.screenshot({ path: `artifacts/preview/${info.project.name}-close-failure.png` })
  await dialog.getByRole('button', { name: '방을 완전히 닫기' }).click()
  await expect(page.getByRole('heading', { name: '열려 있는 방' })).toBeVisible()
})

test('narrow home keeps the brand and theme control together and updates the browser theme', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  const brand = (await page.locator('.brand').boundingBox())!
  const control = (await page.getByRole('button', { name: /모드로 전환/ }).boundingBox())!
  expect((await page.getByLabel('이메일', { exact: true }).boundingBox())!.height).toBe(46)
  expect(
    (await page.getByRole('button', { name: '로그인', exact: true }).boundingBox())!.height,
  ).toBe(46)
  expect(control.y).toBeLessThan(brand.y + brand.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page.getByRole('button', { name: /모드로 전환/ }).click()
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      theme === 'light' ? '#f5f4f0' : '#171b1c',
    )
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      ),
    )
    await page.screenshot({
      path: `artifacts/preview/${info.project.name}-home-320-${theme}.png`,
      fullPage: true,
    })
  }
})
