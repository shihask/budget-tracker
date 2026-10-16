// Screenshots the real MoneyPlant dashboard, signed in as the reels demo account,
// for use inside reels (see reel-plan.html).
//
//   npx vite --port 5199          (in another terminal)
//   node marketing/instagram/capture-dashboard.mjs [http://localhost:5199]
//     → out/app-dashboard.png       (one phone screen, 3x)
//     → out/app-dashboard-scroll/NN.jpg  (a real scroll, one frame per step)
//
// Reads REEL_EMAIL / REEL_PASSWORD from .env.reels and the Supabase URL/key from
// .env. Use a local dev server, not moneyplant.online: the funnel only records
// in PROD, so a scripted sign-in there would count as a real one.
// To refresh the demo data first: npm run seed:reels (wipes the demo account only).

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const env = Object.fromEntries(['.env', '.env.reels'].flatMap(f =>
  readFileSync(join(root, f), 'utf8').split(/\r?\n/)
    .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean).map(m => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')])))

const base = process.argv[2] || 'http://localhost:5199'
const SCROLL_PX = 640   // top of the dashboard → past Budget Health's Needs/Wants rows
const url = env.VITE_SUPABASE_URL
const supabase = createClient(url, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data, error } = await supabase.auth.signInWithPassword({ email: env.REEL_EMAIL, password: env.REEL_PASSWORD })
if (error) { console.error('Sign-in failed:', error.message); process.exit(1) }
const { session } = data
const uid = session.user.id
const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  colorScheme: 'light', locale: 'en-IN', timezoneId: 'Asia/Kolkata',
})
// Signed in, past onboarding, tour, tips and the install banner — what a returning user sees.
await ctx.addInitScript(([key, value, uid]) => {
  localStorage.setItem(key, value)
  for (const k of ['mp_onboarded_', 'mp_tour_completed_', 'mp_smart_input_tip_seen_', 'mp_reimbursement_tip_seen_', 'mp_chat_receipt_tip_seen_'])
    localStorage.setItem(k + uid, '1')
  localStorage.setItem('mp_pwa_banner_v2', String(Date.now()))
}, [storageKey, JSON.stringify(session), uid])

const page = await ctx.newPage()
await page.goto(base, { waitUntil: 'networkidle' })
// The dev server drops index.css's late @import of the font (it must precede other rules),
// leaving a serif fallback; the production build doesn't. Load it directly.
await page.addStyleTag({ url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(2500)   // count-up animations settle
const outDir = join(here, 'out')
mkdirSync(outDir, { recursive: true })
await page.screenshot({ path: join(outDir, 'app-dashboard.png') })

// A real scroll, one screenshot per step (not a fullPage shot: that paints the
// off-screen Mint sheet into the middle and loses the fixed + button).
const scrollDir = join(outDir, 'app-dashboard-scroll')
rmSync(scrollDir, { recursive: true, force: true })
mkdirSync(scrollDir, { recursive: true })
const STEPS = 54, DIST = SCROLL_PX
const ease = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
for (let i = 0; i <= STEPS; i++) {
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(DIST * ease(i / STEPS)))
  await page.waitForTimeout(40)
  await page.screenshot({ path: join(scrollDir, `${String(i).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 90 })
}
console.log(`out/app-dashboard.png, out/app-dashboard-scroll/00-${STEPS}.jpg`)
await browser.close()
