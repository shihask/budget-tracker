// Renders a Season 2 (3D) page to stills or an MP4. Same contract as ../render-reel.mjs
// (window.render(t), REEL_DURATION, REEL_STILLS, REEL_OUT_DIR, REEL_SFX), plus:
//  - serves marketing/instagram over a local HTTP port (ES modules don't load from file://);
//  - launches Chromium on the real GPU (ANGLE/D3D11) instead of the software renderer;
//  - render(t) may be async (it seeks the real app recording on the phone);
//  - REEL_SIZE = [w, h] for landscape character sheets;
//  - prints per-frame timings, and --verify renders each still twice and compares pixels.
//
//   cd marketing/instagram/s2 && npm install
//   node render-s2.mjs looktest              → ../out/manu-maaman/s2/looktest/looktest.mp4
//   node render-s2.mjs looktest --stills
//   node render-s2.mjs "sheets?sheet=manu" --stills
//   node render-s2.mjs looktest --verify     (determinism check on the stills list)
//
// Silent unless the page sets REEL_SFX; voice-over is mixed afterwards, as in Season 1.

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { mkdirSync, rmSync, existsSync, renameSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, extname, normalize } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const FPS = 30
const here = dirname(fileURLToPath(import.meta.url))
const site = join(here, '..')             // marketing/instagram is the web root
const repo = join(site, '..', '..')       // the badge logo lives in /public
const args = process.argv.slice(2)
const names = args.filter(a => !a.startsWith('--'))
const stillsOnly = args.includes('--stills'), verify = args.includes('--verify')
const limit = Number(args.find(a => a.startsWith('--frames='))?.split('=')[1] ?? 0)
if (!names.length) { console.error('usage: render-s2.mjs <page[?query]>... [--stills | --verify | --frames=N]'); process.exit(1) }
const ffmpeg = process.env.FFMPEG || createRequire(import.meta.url)('ffmpeg-static')

// ── a tiny static server: /x → marketing/instagram/x, /public/x → repo public/x ──
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg' }
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const base = path.startsWith('/public/') ? repo : site
  const file = normalize(join(base, path))
  if (!file.startsWith(base)) { res.writeHead(403).end(); return }
  try {
    const s = await stat(file)
    const type = TYPES[extname(file)] ?? 'application/octet-stream'
    const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/)
    const body = await readFile(file)
    if (range) {  // video seeking needs byte ranges
      const a = Number(range[1]), b = range[2] ? Number(range[2]) : s.size - 1
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${s.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1 })
      res.end(body.subarray(a, b + 1))
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': s.size, 'Accept-Ranges': 'bytes' }); res.end(body)
    }
  } catch { res.writeHead(404).end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()) })
page.on('pageerror', e => console.error('[page error]', e.message))

const outRoot = join(site, 'out')
const shown = p => relative(site, p).replaceAll('\\', '/')
const ms = n => `${n.toFixed(0)} ms`

async function open(name) {
  const [file, query = ''] = name.split('?')
  await page.goto(`${origin}/s2/${file}.html?render${query ? '&' + query : ''}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => window.REEL_READY === true, null, { timeout: 60000 })
  const size = await page.evaluate(() => window.REEL_SIZE) ?? [1080, 1920]
  await page.setViewportSize({ width: size[0], height: size[1] })
  const gpu = await page.evaluate(() => window.REEL_GPU)
  const sub = await page.evaluate(() => window.REEL_OUT_DIR) ?? 'manu-maaman/s2'
  const dir = join(outRoot, sub)
  const base = file + (query ? '-' + query.split('&').map(kv => kv.split('=')[1]).join('-') : '')
  return { file, base, dir, gpu }
}

for (const name of names) {
  const { base, dir, gpu } = await open(name)
  console.log(`${name} · GPU: ${gpu}`)
  const stillsDir = join(dir, 'stills'); mkdirSync(stillsDir, { recursive: true })
  const duration = await page.evaluate(() => window.REEL_DURATION)

  if (stillsOnly || verify) {
    const stills = await page.evaluate(() => window.REEL_STILLS) ?? [0]
    const a = []
    for (const t of stills) {
      const t0 = performance.now()
      await page.evaluate(t => window.render(t), t)
      const png = join(stillsDir, `${base}${stills.length > 1 || t ? '-' + t : ''}.png`)
      await page.screenshot({ path: png })
      a.push(png); console.log(shown(png), ms(performance.now() - t0))
    }
    if (verify) {
      // Fresh page load, same times: the pixels must match (PSNR "inf" = identical).
      await open(name)
      for (const [i, t] of stills.entries()) {
        await page.evaluate(t => window.render(t), t)
        const b = join(tmpdir(), `mp-s2-verify-${i}.png`); await page.screenshot({ path: b })
        const r = spawnSync(ffmpeg, ['-i', a[i], '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' })
        const psnr = r.stderr.match(/average:(\S+)/)?.[1]
        console.log(`verify t=${t}: PSNR ${psnr}${psnr === 'inf' ? ' (identical)' : ' dB'}`)
        rmSync(b, { force: true })
      }
    }
    continue
  }

  const frameDir = join(tmpdir(), `mp-s2-${base}`)
  rmSync(frameDir, { recursive: true, force: true }); mkdirSync(frameDir, { recursive: true })
  const frames = limit || Math.round(duration * FPS)
  let tRender = 0, tShot = 0
  const t0 = performance.now()
  for (let i = 0; i < frames; i++) {
    const a = performance.now()
    await page.evaluate(t => window.render(t), i / FPS)
    const b = performance.now()
    await page.screenshot({ path: join(frameDir, `f${String(i).padStart(5, '0')}.png`) })
    tRender += b - a; tShot += performance.now() - b
    if (i % FPS === 0) process.stdout.write(`\r${(i / FPS).toFixed(0)}s / ${duration}s`)
  }
  const wall = performance.now() - t0
  console.log(`\n${frames} frames in ${(wall / 1000).toFixed(1)} s · ${ms(wall / frames)}/frame (3D render ${ms(tRender / frames)}, capture ${ms(tShot / frames)})`)
  if (limit) { rmSync(frameDir, { recursive: true, force: true }); continue }  // benchmark only

  mkdirSync(dir, { recursive: true })
  const mp4 = join(dir, `${base}.mp4`)
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frameDir, 'f%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' })
  if (r.status !== 0 || !existsSync(mp4)) { console.error('ffmpeg failed'); process.exit(1) }
  rmSync(frameDir, { recursive: true, force: true })

  // Synthesized sound effects, same recipes as ../render-reel.mjs.
  const sfx = await page.evaluate(() => window.REEL_SFX)
  if (sfx?.length) {
    const SRC = {
      whoosh: 'anoisesrc=d=0.6:c=pink:a=0.5:r=44100',
      chime: "aevalsrc='0.22*(sin(2*PI*1318.5*t)+0.6*sin(2*PI*1975.5*t)+0.3*sin(2*PI*2637*t))*exp(-3.2*t)':d=1.6:s=44100",
      register: "aevalsrc='0.2*sin(2*PI*2093*t)*exp(-14*t)+0.2*gt(t,0.07)*(sin(2*PI*2637*t)+0.5*sin(2*PI*3951*t))*exp(-6*(t-0.07))':d=0.8:s=44100",
      boing: "aevalsrc='0.3*sin(2*PI*220*(1-exp(-3*t))+6*sin(2*PI*14*t))*exp(-2.5*t)':d=0.9:s=44100",
      // a motorbike engine that coughs and dies: chugging low pulses, slowing and fading (S2 EP03)
      sputter: "aevalsrc='0.32*(sin(2*PI*46*t)+0.6*sin(2*PI*92*t)+0.3*sin(2*PI*138*t))*gt(sin(2*PI*(8*t-1.6*t*t)),0.2)*exp(-1.1*t)':d=1.6:s=44100",
    }
    const SHAPE = {
      whoosh: 'highpass=f=350,lowpass=f=4000,afade=t=in:d=0.28:curve=exp,afade=t=out:st=0.28:d=0.32,volume=0.55',
      chime: 'afade=t=in:d=0.01', register: 'afade=t=in:d=0.005', boing: 'afade=t=in:d=0.01', sputter: 'lowpass=f=900,afade=t=in:d=0.02,volume=1.4',
    }
    const inputs = sfx.flatMap(s => ['-f', 'lavfi', '-i', SRC[s.kind]])
    const chains = sfx.map((s, i) => `[${i + 1}:a]${SHAPE[s.kind]},adelay=${Math.round(s.t * 1000)}:all=1[a${i}]`)
    const mix = `${sfx.map((_, i) => `[a${i}]`).join('')}amix=inputs=${sfx.length}:normalize=0,apad[aout]`
    const withAudio = join(dir, `${base}.audio.mp4`)
    const a = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', mp4, ...inputs, '-filter_complex', [...chains, mix].join(';'),
      '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', withAudio], { stdio: 'inherit' })
    if (a.status !== 0 || !existsSync(withAudio)) { console.error('ffmpeg audio mix failed'); process.exit(1) }
    renameSync(withAudio, mp4)
  }
  console.log(shown(mp4))

  // Voice-over: window.REEL_VOICE = { files: [path from marketing/instagram], starts: [s] }.
  // Writes <name>-voice.mp4 beside the silent one: each clip at its start, effects under it at 70%.
  const voice = await page.evaluate(() => window.REEL_VOICE)
  if (voice?.files?.length) {
    const clips = voice.files.map(f => join(site, f))
    const missing = clips.filter(f => !existsSync(f))
    if (missing.length) { console.error('voice clips missing:', missing.map(shown).join(', ')); continue }
    const hasFx = !!sfx?.length
    const inputs = clips.flatMap(f => ['-i', f])
    const off = 1  // input 0 is the rendered mp4
    const chains = clips.map((_, i) => `[${i + off}:a]aresample=44100,adelay=${Math.round(voice.starts[i] * 1000)}:all=1[v${i}]`)
    const parts = [...(hasFx ? ['[fx]'] : []), ...clips.map((_, i) => `[v${i}]`)]
    const graph = [...(hasFx ? ['[0:a]volume=0.7[fx]'] : []), ...chains,
      `${parts.join('')}amix=inputs=${parts.length}:normalize=0,alimiter=limit=0.95,apad[aout]`].join(';')
    const out = join(dir, `${base}-voice.mp4`)
    const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', mp4, ...inputs, '-filter_complex', graph,
      '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' })
    if (r.status !== 0 || !existsSync(out)) { console.error('voice mix failed'); process.exit(1) }
    console.log(shown(out))
  }
}
await browser.close()
server.close()
