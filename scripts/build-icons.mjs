import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

// Package the approved artwork without generating a different design.
const root = new URL('../', import.meta.url)
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('.cache/ms-playwright', root))
const { chromium } = await import('@playwright/test')
const source = await readFile(new URL('artifacts/icon-concepts/worship-communication-v1.png', root))
const sourceURL = `data:image/png;base64,${source.toString('base64')}`
await mkdir(new URL('public/icons/', root), { recursive: true })
const browser = await chromium.launch({ headless: true })
const buffers = new Map()
try {
  const page = await browser.newPage()
  for (const size of [16, 32, 48, 180, 192, 512]) {
    const png = await page.evaluate(
      async ({ sourceURL, size }) => {
        const image = new Image()
        image.src = sourceURL
        await image.decode()
        if (image.naturalWidth !== image.naturalHeight) throw new Error('Expected square artwork')
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        const context = canvas.getContext('2d')
        context.imageSmoothingEnabled = true
        context.imageSmoothingQuality = 'high'
        context.drawImage(image, 0, 0, size, size)
        return canvas.toDataURL('image/png').split(',')[1]
      },
      { sourceURL, size },
    )
    const bytes = Buffer.from(png, 'base64')
    buffers.set(size, bytes)
    const name =
      size === 180
        ? 'apple-touch-icon.png'
        : size < 100
          ? `favicon-${size}.png`
          : `icon-${size}.png`
    if (size !== 48) await writeFile(new URL(`public/icons/${name}`, root), bytes)
  }
} finally {
  await browser.close()
}

// ICO directory with standard 16, 32 and 48 px PNG entries.
const sizes = [16, 32, 48]
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16
  const bytes = buffers.get(size)
  header[entry] = header[entry + 1] = size
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(bytes.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += bytes.length
}
await writeFile(
  new URL('public/favicon.ico', root),
  Buffer.concat([header, ...sizes.map((size) => buffers.get(size))]),
)
console.log(`Packaged approved artwork: ${createHash('sha256').update(source).digest('hex')}`)
console.log(
  'Created 16/32 px favicons, a 16/32/48 px ICO, a 180 px Apple icon, and 192/512 px app icons.',
)
