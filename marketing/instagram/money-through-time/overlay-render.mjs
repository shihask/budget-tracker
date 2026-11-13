// Renders <ep>/overlay.html (subtitles, place card, reconstruction tag) as a TRANSPARENT layer:
// PNG frames with alpha → out/money-through-time/<ep>/overlay.mov (PNG codec, lossless alpha).
// The Flow footage is never screenshotted through Chromium — that would re-encode it and can
// shift colours; ffmpeg lays this layer over the untouched clips in assemble.mjs.
//
//   node marketing/instagram/money-through-time/overlay-render.mjs ep01 T01
//   node marketing/instagram/money-through-time/overlay-render.mjs ep01 T01 --stills   (on a grey ground)
//   node marketing/instagram/money-through-time/overlay-render.mjs ep01 T01 --test     (shots.json → tests.T01)
//
// Duration = the selected shots' durations; lines/cards come from shots.json (one source of truth).

import { chromium } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cli, here, loadEpisode, selection, cutLength, paths, run, shown } from './lib.mjs'

const { ep, ids, flags } = cli('overlay-render.mjs <ep> [shot...] [--stills] [--test]')
const data = loadEpisode(ep), p = paths(ep)
const { shots, lines, cards } = selection(data, ids, flags)
const duration = cutLength(shots)
const EP = { ...data, lines, cards, duration }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: data.size[0], height: data.size[1] } })
page.on('pageerror', e => console.error('[page error]', e.message))
await page.addInitScript(ep => { window.EP = ep }, EP)
await page.goto(pathToFileURL(join(here, ep, 'overlay.html')).href + (flags.stills ? '?preview' : ''), { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
mkdirSync(p.out, { recursive: true })

if (flags.stills) {
  const dir = join(p.out, 'stills'); mkdirSync(dir, { recursive: true })
  for (const t of await page.evaluate(() => window.REEL_STILLS)) {
    await page.evaluate(t => window.render(t), t)
    const png = join(dir, `overlay-${t}.png`); await page.screenshot({ path: png }); console.log(shown(png))
  }
} else {
  const frames = Math.round(duration * data.fps), dir = join(tmpdir(), `mp-mtt-overlay-${ep}`)
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.render(t), i / data.fps)
    await page.screenshot({ path: join(dir, `f${String(i).padStart(5, '0')}.png`), omitBackground: true })
    if (i % data.fps === 0) process.stdout.write(`\r${(i / data.fps).toFixed(0)}s / ${duration}s`)
  }
  const mov = join(p.out, 'overlay.mov')
  run(['-framerate', String(data.fps), '-i', join(dir, 'f%05d.png'), '-c:v', 'png', '-pix_fmt', 'rgba', mov], 'overlay encode')
  rmSync(dir, { recursive: true, force: true })
  console.log(`\n${frames} frames → ${shown(mov)}`)
}
await browser.close()
