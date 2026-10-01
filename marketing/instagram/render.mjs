// Renders every .slide in pinned-posts.html to a 1080×1350 PNG in ./out/,
// and profile-picture.svg to profile-picture.png.
// Run from the repo root: node marketing/instagram/render.mjs

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, 'out')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } })

await page.goto(pathToFileURL(join(here, 'profile-picture.svg')).href)
await page.setViewportSize({ width: 1080, height: 1080 })
await page.screenshot({ path: join(here, 'profile-picture.png') })

await page.setViewportSize({ width: 1080, height: 1350 })
await page.goto(pathToFileURL(join(here, 'pinned-posts.html')).href, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
for (const slide of await page.$$('.slide')) {
  const name = await slide.getAttribute('data-name')
  await slide.screenshot({ path: join(outDir, `${name}.png`) })
  console.log(`out/${name}.png`)
}
await browser.close()
