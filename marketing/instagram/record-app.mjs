// Screen-records the real MoneyPlant app, signed in as the reels demo account, as
// full-frame 1080×1920 clips for reels (scene "MoneyPlant is born" etc.).
//
//   npm run seed:reels                       (fresh demo data — wipes the demo account only)
//   npx vite --port 5199                     (in another terminal)
//   FFMPEG=… node marketing/instagram/record-app.mjs [clip…]
//     → out/app-<clip>.mp4   clips: dashboard quickadd savings mint (default: all)
//
// Chrome's screencast streams frames as the page actually paints (real animations,
// real timing); ffmpeg turns their timestamps into a constant 30 fps video.
// Local dev server, not moneyplant.online: the funnel records only in PROD.

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const env = Object.fromEntries(['.env', '.env.reels'].flatMap(f =>
  readFileSync(join(root, f), 'utf8').split(/\r?\n/)
    .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean).map(m => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')])))
const BASE = process.env.BASE || 'http://localhost:5199'
const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const W = 390, H = 693, DPR = 1080 / W     // 9:16 phone viewport → exactly 1080×1920

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data, error } = await supabase.auth.signInWithPassword({ email: env.REEL_EMAIL, password: env.REEL_PASSWORD })
if (error) { console.error('Sign-in failed:', error.message); process.exit(1) }
const { session } = data
const storageKey = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`

const wait = ms => new Promise(r => setTimeout(r, ms))

/** Smooth in-page scroll (eased, rAF) — to a y, or to put an element `offset` px below the top. */
async function scrollTo(page, target, ms = 1400, offset = 90) {
  await page.evaluate(([target, ms, offset]) => new Promise(done => {
    const el = typeof target === 'string'
      ? [...document.querySelectorAll('h1,h2,h3,h4,div,span,button')].find(e => e.children.length === 0 && e.textContent.trim() === target)
      : null
    const y0 = window.scrollY
    const y1 = el ? el.getBoundingClientRect().top + y0 - offset : target
    const ease = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
    const t0 = performance.now()
    const step = now => {
      const p = Math.min(1, (now - t0) / ms)
      window.scrollTo(0, y0 + (y1 - y0) * ease(p))
      p < 1 ? requestAnimationFrame(step) : done()
    }
    requestAnimationFrame(step)
  }), [target, ms, offset])
}

async function tap(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  await locator.tap()
}

// Each clip: what to do while recording. The page is already on a settled dashboard.
const CLIPS = {
  async dashboard(page) {
    await wait(900)
    await scrollTo(page, 'Budget Health', 1700, 70)
    await wait(900)
    await scrollTo(page, 'Your money', 1500, 70)
    await wait(900)
  },
  async quickadd(page) {
    await wait(600)
    await tap(page, page.getByLabel('Quick add'))
    await wait(900)
    const smart = page.locator('[placeholder^="e.g. \\""]').first()   // the one-line smart input
    await smart.tap()
    await page.keyboard.type('Evening chai 40', { delay: 110 })
    await wait(300)
    await page.keyboard.press('Enter')
    await wait(1300)
    await tap(page, page.getByRole('button', { name: /Save Expense/ }))
    await wait(1800)
  },
  async savings(page) {
    await wait(500)
    await scrollTo(page, 'Wealth Summary', 1500, 80)
    await wait(1100)
    await scrollTo(page, 'Your money', 1300, 80)
    await wait(1000)
  },
  async mint(page) {
    await wait(600)
    // Mint's button is a drag gesture docked half off the edge: tap a point that's on screen.
    const fab = await page.locator('[data-tour="ai-fab"]').boundingBox()
    // A pointer press (not a synthesized touch): its pointer-capture gesture ignores the latter.
    await page.mouse.move(Math.min(fab.x + fab.width / 2, W - 14), fab.y + fab.height / 2)
    await page.mouse.down(); await wait(80); await page.mouse.up()
    await wait(1200)
    if (process.argv.includes('--debug')) await page.screenshot({ path: join(outDir, 'debug-mint.png') })
    await tap(page, page.getByRole('button', { name: 'Financial status', exact: true }))   // fills the question
    await wait(500)
    await page.keyboard.press('Enter')
    await wait(7000)   // the card is local; the short AI insight streams in under it
  },
}

const wanted = process.argv.slice(2).filter(a => !a.startsWith('--'))
const clips = wanted.length ? wanted : Object.keys(CLIPS)
const outDir = join(here, 'out')
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch()

for (const name of clips) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true,
    colorScheme: 'light', locale: 'en-IN', timezoneId: 'Asia/Kolkata',
  })
  await ctx.addInitScript(([key, value, uid]) => {
    localStorage.setItem(key, value)
    for (const k of ['mp_onboarded_', 'mp_tour_completed_', 'mp_smart_input_tip_seen_', 'mp_reimbursement_tip_seen_', 'mp_chat_receipt_tip_seen_'])
      localStorage.setItem(k + uid, '1')
    localStorage.setItem('mp_pwa_banner_v2', String(Date.now()))
    // A soft touch ripple where the finger lands, like a phone's "show taps".
    addEventListener('pointerdown', e => {
      const d = document.createElement('div')
      d.style.cssText = `position:fixed;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;border-radius:50%;background:rgba(10,122,86,.28);border:2px solid rgba(10,122,86,.55);pointer-events:none;z-index:2147483647;transition:transform .45s ease-out,opacity .45s ease-out`
      document.documentElement.appendChild(d)
      requestAnimationFrame(() => { d.style.transform = 'scale(1.6)'; d.style.opacity = '0' })
      setTimeout(() => d.remove(), 600)
    }, true)
  }, [storageKey, JSON.stringify(session), session.user.id])

  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  // Dev server drops index.css's late font @import (production doesn't) — load it directly.
  await page.addStyleTag({ url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap' })
  await page.evaluate(() => document.fonts.ready)
  await wait(2500)

  const frameDir = join(tmpdir(), `mp-rec-${name}`)
  rmSync(frameDir, { recursive: true, force: true })
  mkdirSync(frameDir, { recursive: true })
  const cdp = await ctx.newCDPSession(page)
  const frames = []
  cdp.on('Page.screencastFrame', async f => {
    const file = join(frameDir, `${String(frames.length).padStart(5, '0')}.jpg`)
    writeFileSync(file, Buffer.from(f.data, 'base64'))
    frames.push({ file, ts: f.metadata.timestamp })
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 })
  const tStart = Date.now() / 1000
  await CLIPS[name](page)
  const tEnd = Date.now() / 1000
  await cdp.send('Page.stopScreencast')
  await wait(200)

  // Screencast only sends a frame when something repaints: hold each until the next.
  const lines = []
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].ts : f.ts + Math.max(1 / 30, tEnd - tStart - (f.ts - frames[0].ts))
    lines.push(`file '${f.file.replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`)
  })
  lines.push(`file '${frames.at(-1).file.replace(/\\/g, '/')}'`)
  const list = join(frameDir, 'list.txt')
  writeFileSync(list, lines.join('\n'))
  const mp4 = join(outDir, `app-${name}.mp4`)
  const r = spawnSync(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'scale=1080:1920:flags=lanczos,setsar=1,fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' })
  if (r.status !== 0) { console.error(`ffmpeg failed for ${name}`); process.exit(1) }
  const span = frames.at(-1).ts - frames[0].ts
  console.log(`out/app-${name}.mp4  (${frames.length} frames over ${span.toFixed(1)}s ≈ ${(frames.length / span).toFixed(0)} fps captured)`)
  rmSync(frameDir, { recursive: true, force: true })
  await ctx.close()
}
await browser.close()
