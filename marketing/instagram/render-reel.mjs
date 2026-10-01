// Renders a reel HTML (driven by window.render(t)) to an MP4 for Instagram.
//
//   node marketing/instagram/render-reel.mjs reel-afford          → out/reel-afford.mp4
//   node marketing/instagram/render-reel.mjs reel-afford --stills  → out/reel-afford-<t>.png only
//
// Needs ffmpeg with libx264: on PATH, or point FFMPEG at the binary
// (e.g. FFMPEG=$(node -p "require('ffmpeg-static')") from a folder where it's installed).
// Steps time frame by frame instead of screen-recording, so frames never drop.

import { chromium } from 'playwright'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const FPS = 30
const here = dirname(fileURLToPath(import.meta.url))
const name = process.argv[2] ?? 'reel-afford'
const stillsOnly = process.argv.includes('--stills')
const outDir = join(here, 'out')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
await page.goto(pathToFileURL(join(here, `${name}.html`)).href + '?render', { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
const duration = await page.evaluate(() => window.REEL_DURATION)

if (stillsOnly) {
  for (const t of [1.5, 5, 7.8, 10.5, 12.5, 14.8, 17.5].filter(t => t < duration)) {
    await page.evaluate(t => window.render(t), t)
    await page.screenshot({ path: join(outDir, `${name}-${t}.png`) })
    console.log(`out/${name}-${t}.png`)
  }
  await browser.close()
  process.exit(0)
}

const frameDir = join(tmpdir(), `mp-reel-${name}`)
rmSync(frameDir, { recursive: true, force: true })
mkdirSync(frameDir, { recursive: true })
const frames = Math.round(duration * FPS)
for (let i = 0; i < frames; i++) {
  await page.evaluate(t => window.render(t), i / FPS)
  await page.screenshot({ path: join(frameDir, `f${String(i).padStart(5, '0')}.png`) })
  if (i % FPS === 0) process.stdout.write(`\r${i / FPS}s / ${duration}s`)
}
await browser.close()
console.log('\nencoding…')

const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const mp4 = join(outDir, `${name}.mp4`)
// H.264 + yuv420p + faststart is what Instagram expects; no audio track —
// add a trending sound in the Instagram editor instead.
const r = spawnSync(ffmpeg, [
  '-y', '-framerate', String(FPS), '-i', join(frameDir, 'f%05d.png'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', mp4,
], { stdio: 'inherit' })
if (r.status !== 0 || !existsSync(mp4)) { console.error('ffmpeg failed'); process.exit(1) }
rmSync(frameDir, { recursive: true, force: true })
console.log(`out/${name}.mp4`)
