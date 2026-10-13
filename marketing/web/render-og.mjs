// Renders the 1200×630 link-preview image to public/og-image.png.
// Run from the repo root: node marketing/web/render-og.mjs
// index.html points og:image / twitter:image at https://moneyplant.online/og-image.png.

import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto(pathToFileURL(join(here, 'og-image.html')).href, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: join(here, '..', '..', 'public', 'og-image.png') })
await browser.close()
console.log('public/og-image.png')
