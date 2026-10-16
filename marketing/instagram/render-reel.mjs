// Renders a reel HTML (driven by window.render(t)) to an MP4 for Instagram.
//
//   node marketing/instagram/render-reel.mjs reel-afford               → out/reel-afford.mp4
//   node marketing/instagram/render-reel.mjs reel-afford reel-trip     → several in one run
//   node marketing/instagram/render-reel.mjs reel-afford --stills       → out/reel-afford-<t>.png only
//     (the times come from the reel's own boot(..., stills) list)
//
// Needs ffmpeg with libx264: on PATH, or point FFMPEG at the binary
// (e.g. FFMPEG=$(node -p "require('ffmpeg-static')") from a folder where it's installed).
// Steps time frame by frame instead of screen-recording, so frames never drop.
// Silent unless the reel sets window.REEL_SFX (see below).

import { chromium } from 'playwright'
import { mkdirSync, rmSync, existsSync, renameSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const FPS = 30
const here = dirname(fileURLToPath(import.meta.url))
const names = process.argv.slice(2).filter(a => !a.startsWith('--'))
const stillsOnly = process.argv.includes('--stills')
if (!names.length) { console.error('usage: render-reel.mjs <reel-name>... [--stills]'); process.exit(1) }
const outDir = join(here, 'out')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
for (const name of names) {
  await page.goto(pathToFileURL(join(here, `${name}.html`)).href + '?render', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  const duration = await page.evaluate(() => window.REEL_DURATION)

  if (stillsOnly) {
    const stills = await page.evaluate(() => window.REEL_STILLS) ?? [1, duration / 2, duration - .5]
    for (const t of stills) {
      await page.evaluate(t => window.render(t), t)
      await page.screenshot({ path: join(outDir, `${name}-${t}.png`) })
      console.log(`out/${name}-${t}.png`)
    }
    continue
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
  if (r.status !== 0 || !existsSync(mp4)) { console.error('ffmpeg failed'); await browser.close(); process.exit(1) }
  rmSync(frameDir, { recursive: true, force: true })

  // Optional sound effects: a reel may set window.REEL_SFX = [{ t, kind: 'whoosh' | 'chime' }].
  // Synthesized here (no audio files to license); music is still added in Instagram.
  const sfx = await page.evaluate(() => window.REEL_SFX)
  if (sfx?.length) {
    const SRC = {
      whoosh: 'anoisesrc=d=0.6:c=pink:a=0.5:r=44100',
      chime: "aevalsrc='0.22*(sin(2*PI*1318.5*t)+0.6*sin(2*PI*1975.5*t)+0.3*sin(2*PI*2637*t))*exp(-3.2*t)':d=1.6:s=44100",
    }
    const SHAPE = {
      whoosh: 'highpass=f=350,lowpass=f=4000,afade=t=in:d=0.28:curve=exp,afade=t=out:st=0.28:d=0.32,volume=0.55',
      chime: 'afade=t=in:d=0.01',
    }
    const inputs = sfx.flatMap(s => ['-f', 'lavfi', '-i', SRC[s.kind]])
    const chains = sfx.map((s, i) => `[${i + 1}:a]${SHAPE[s.kind]},adelay=${Math.round(s.t * 1000)}:all=1[a${i}]`)
    const mix = `${sfx.map((_, i) => `[a${i}]`).join('')}amix=inputs=${sfx.length}:normalize=0,apad[aout]`
    const withAudio = join(outDir, `${name}.audio.mp4`)
    const a = spawnSync(ffmpeg, [
      '-y', '-i', mp4, ...inputs, '-filter_complex', [...chains, mix].join(';'),
      '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
      '-movflags', '+faststart', withAudio,
    ], { stdio: 'inherit' })
    if (a.status !== 0 || !existsSync(withAudio)) { console.error('ffmpeg audio mix failed'); await browser.close(); process.exit(1) }
    renameSync(withAudio, mp4)
  }
  console.log(`out/${name}.mp4`)
}
await browser.close()
