// Screen-records the real MoneyPlant app, signed in as the reels demo account, as
// full-frame 1080×1920 clips for reels (scene "MoneyPlant is born" etc.).
//
//   npm run seed:reels                       (fresh demo data — wipes the demo account only)
//   npx vite --port 5199                     (in another terminal)
//   FFMPEG=… node marketing/instagram/record-app.mjs [clip…]
//     → out/app-<clip>.mp4   clips: dashboard quickadd savings strategy commitments emergency annual cycle review mint savefirst (default: all)
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
  // Budget Strategy (S2 EP01): the real picker. Balanced (50/30/20) is the demo's seeded
  // choice; Custom shows the split is editable; it ends back on Balanced, as seeded.
  async strategy(page) {
    await wait(600)
    await scrollTo(page, 'Budget Health', 1500, 70)
    await wait(800)
    // the card's gear has no label: it's the button on the Budget Health title row
    const gear = await page.evaluate(() => {
      const title = [...document.querySelectorAll('div')].find(e => e.children.length === 0 && e.textContent.trim() === 'Budget Health')
      let row = title; while (row && !row.querySelector('button')) row = row.parentElement
      const r = row.querySelector('button').getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    await page.touchscreen.tap(gear.x, gear.y)
    await wait(1600)
    await tap(page, page.getByRole('button', { name: 'Custom', exact: true }))
    await wait(1800)
    await tap(page, page.getByRole('button', { name: 'Balanced (50/30/20)' }))
    await wait(2600)   // long enough to see Balanced re-selected (and saved)
  },
  // Bills & Obligations (S2 EP02): the story's example bills (see CLIP_DATA), all unpaid this cycle.
  async commitments(page) {
    await wait(6500)
  },
  // Emergency Fund (S2 EP03): two separate things. The Goals card with a savings goal named
  // "Emergency Fund" (contributions tracked), then the Emergency Fund reserve setting (an amount
  // kept out of spendable balance). Stills for the 3D phone go to s2/assets.
  async emergency(page) {
    await wait(500)
    await scrollTo(page, 'Goals', 1500, 120)
    await wait(1200)
    // the story contribution unlocks achievements on load; their toast must clear before the still
    await page.waitForFunction(() => !document.body.innerText.includes('ACHIEVEMENT UNLOCKED') && !document.body.innerText.includes('Achievement unlocked'), null, { timeout: 15000 }).catch(() => {})
    await wait(400)
    await page.screenshot({ path: join(here, 's2', 'assets', 'app-emergency-goal.png') })
    await scrollTo(page, 'Emergency Fund', 1300, 260)
    await wait(900)
    const edit = await page.evaluate(() => {
      const label = [...document.querySelectorAll('div,span')].find(e => e.children.length === 0 && e.textContent.trim() === 'Emergency Fund')
      let card = label; while (card && !card.querySelector('button')) card = card.parentElement
      const r = card.querySelector('button').getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    await page.touchscreen.tap(edit.x, edit.y)
    await wait(1400)
    await page.screenshot({ path: join(here, 's2', 'assets', 'app-emergency-reserve.png') })
    await wait(1200)
  },
  // Once-a-year bills (S2 EP04): two separate app actions. (1) Bike insurance as a yearly
  // commitment — its reminder on the dashboard, the Bills list ("every year") and the form
  // (Frequency: Yearly + Due date). (2) A monthly savings contribution towards it. Stills → s2/assets.
  async annual(page) {
    const shot = name => page.screenshot({ path: join(here, 's2', 'assets', `app-annual-${name}.png`) })
    const tapText = async text => {
      const el = page.getByText(text, { exact: true }).first()
      await el.scrollIntoViewIfNeeded(); await el.tap()
    }
    // the daily challenge's "Great job today!" sheet can open over the dashboard: close it first
    const notNow = page.getByRole('button', { name: 'Not Now', exact: true })
    if (await notNow.isVisible().catch(() => false)) { await notNow.tap(); await wait(900) }
    await wait(800)
    await scrollTo(page, 'Bike insurance due soon', 1300, 220)
    await wait(1000)
    await shot('reminder')
    await page.goto(BASE + '/?open=commitments', { waitUntil: 'networkidle' })
    await wait(2500)
    await shot('bills')
    await tapText('Bike insurance')
    await wait(1400)
    await scrollTo(page, 'Frequency', 900, 220)
    await wait(900)
    await shot('form')
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    await wait(2500)
    if (await notNow.isVisible().catch(() => false)) { await notNow.tap(); await wait(900) }
    // the Savings page, through the header menu
    await tap(page, page.getByRole('button', { name: 'Menu', exact: true }))
    await wait(900)
    if (process.argv.includes('--debug')) await page.screenshot({ path: join(outDir, 'debug-menu.png') })
    await tap(page, page.getByText('Savings & Investments', { exact: true }).last())   // the menu item (rendered last), not the dashboard card's title
    await wait(1600)
    await scrollTo(page, 'Bike insurance fund', 1000, 160)
    await wait(900)
    await shot('savings')
    await wait(800)
  },
  // Save first (Money Experiments EP02): the Savings page, opened before recording starts (CLIP_PREP);
  // tap the story saving's Record Contribution → the confirm sheet with "Paying for". Never confirmed,
  // so no contribution is saved and no balance moves.
  async savefirst(page) {
    await wait(500)
    const btn = await page.evaluate(() => {
      const label = [...document.querySelectorAll('div,span')].find(e => e.children.length === 0 && e.textContent.trim() === 'Payday savings')
      let card = label; while (card && ![...card.querySelectorAll('button')].some(b => b.textContent.includes('Record Contribution'))) card = card.parentElement
      const r = [...card.querySelectorAll('button')].find(b => b.textContent.includes('Record Contribution')).getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    await page.touchscreen.tap(btn.x, btn.y)
    await wait(3500)
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
  // Salary cycle (S2 EP05): the cycle starts on the RECORDED salary (28th) and runs to the 27th —
  // the dashboard's cycle dates, Budget Health (this cycle), and Kakeibo's cycle. Stills → s2/assets.
  async cycle(page) {
    const shot = name => page.screenshot({ path: join(here, 's2', 'assets', `app-cycle-${name}.png`) })
    const notNow = page.getByRole('button', { name: 'Not Now', exact: true })
    if (await notNow.isVisible().catch(() => false)) { await notNow.tap(); await wait(900) }
    // the top insight banner (a bill reminder) isn't this episode's story: dismiss it (this browser only)
    const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true }).first()
    if (await dismiss.isVisible().catch(() => false)) { await dismiss.tap(); await wait(700) }
    await wait(1200)
    await shot('hero')
    await scrollTo(page, 'Budget Health', 1400, 90)
    await wait(1200)
    await shot('strategy')
    await page.goto(BASE + '/?open=analytics-trend', { waitUntil: 'networkidle' })
    await wait(2200)
    if (process.argv.includes('--debug')) await page.screenshot({ path: join(outDir, 'debug-analytics.png') })
    await tap(page, page.getByRole('button', { name: 'Kakeibo', exact: true }))
    await wait(2200)
    // first visit on this browser opens Kakeibo's intro: skip it
    const skip = page.getByText('Skip', { exact: true }).first()
    if (await skip.isVisible().catch(() => false)) { await skip.tap(); await wait(1600) }
    await shot('kakeibo')
    await wait(800)
  },
  // The cycle review (S2 EP06): Kakeibo's real flow on the finished 28 Sep – 27 Oct cycle — the
  // four questions (goal ₹9,000 vs ₹5,000 saved; shopping the big spend), "What will you do
  // differently?", then the next cycle's goal. The note and the goal are typed, NOT saved, so the
  // demo's review never becomes permanently completed. Stills → s2/assets.
  async review(page) {
    const shot = name => page.screenshot({ path: join(here, 's2', 'assets', `app-review-${name}.png`) })
    const panelTo = async (text, block = 'start') => {   // Analytics scrolls inside its own panel
      await page.evaluate(([text, block]) => {
        const el = [...document.querySelectorAll('div,span,label')].find(e => e.children.length === 0 && e.textContent.trim() === text)
        el?.scrollIntoView({ block, behavior: 'smooth' })
      }, [text, block])
      await wait(1100)
    }
    await page.goto(BASE + '/?open=analytics-trend', { waitUntil: 'networkidle' })
    await wait(2200)
    await tap(page, page.getByRole('button', { name: 'Kakeibo', exact: true }))
    await wait(2000)
    const skip = page.getByText('Skip', { exact: true }).first()
    if (await skip.isVisible().catch(() => false)) { await skip.tap(); await wait(1600) }
    if (process.argv.includes('--debug')) await page.screenshot({ path: join(outDir, 'debug-review.png') })
    await tap(page, page.getByRole('button', { name: 'Review my cycle', exact: true }).last())   // Analytics' (the dashboard card has one too)
    await wait(1500)
    const gen = page.getByRole('button', { name: /Generate Analysis/ })
    if (await gen.isVisible().catch(() => false)) { await gen.tap() }
    await page.getByText('1 · How much money do I have?', { exact: true }).waitFor({ timeout: 30000 })
    await wait(2500)   // pillars + Mint's insight settle
    await panelTo('Your Kakeibo report')
    await shot('top')
    await panelTo('3 · How much did I spend?')
    await shot('spend')
    await panelTo('What will you do differently next cycle?', 'center')
    const note = page.locator('#kakeibo-note')
    await note.tap()
    await page.keyboard.type('Set a shopping limit on payday', { delay: 70 })
    await page.keyboard.press('Escape')
    await wait(700)
    await shot('note')
    // the next cycle's goal: back to the current cycle, "Set one now"
    await page.evaluate(() => window.scrollTo(0, 0))
    await panelTo('Day 1', 'start').catch(() => {})
    const setNow = page.getByRole('button', { name: 'Set one now', exact: true })
    await setNow.scrollIntoViewIfNeeded(); await setNow.tap()
    await wait(1200)
    await page.locator('[placeholder="e.g. 10000"]').tap()
    await page.keyboard.press('Control+A')   // it opens pre-filled with the strategy's suggestion
    await page.keyboard.type('6000', { delay: 120 })
    await wait(900)
    await shot('goal')
    await wait(600)
  },
}

// Steps before the recording starts (the clip opens on the screen it's about).
const CLIP_PREP = {
  async savefirst(page) {
    await tap(page, page.getByRole('button', { name: 'Menu', exact: true }))
    await wait(900)
    await tap(page, page.getByText('Savings & Investments', { exact: true }).last())
    await wait(1600)
    await scrollTo(page, 'Payday savings', 600, 200)
    await wait(1200)
  },
}

// Where a clip starts, when not the dashboard (`?open=` is the push-notification deep link).
const CLIP_PATH = { commitments: '/?open=commitments' }

// Story data a clip needs on the demo account: swapped in for the recording, then the demo's own
// rows are put back. Returns the restore function. Demo account only (signed in above).
const CLIP_DATA = {
  // Money Experiments EP02: a ₹6,000-a-month saving due today ("Payday savings", two months saved so
  // far), so its Record Contribution shows. Added for the recording and removed after.
  async savefirst(uid) {
    const must = ({ data, error }) => { if (error) throw error; return data }
    const [acct] = must(await supabase.from('accounts').select('id').eq('user_id', uid).eq('is_active', true).order('created_at').limit(1))
    const d = new Date(), last = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
    const lastDue = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
    const fund = must(await supabase.from('savings').insert({
      user_id: uid, name: 'Payday savings', type: 'custom', amount: 6000, is_recurring: true, frequency: 'monthly',
      due_day: new Date().getDate(), total_installments: null, current_installment: 2, total_target: null, current_value: 12000,
      from_account_id: acct?.id ?? null, is_active: true, is_prized: false, last_contribution_date: lastDue, paid_through: lastDue,   // October paid, so the picker opens on this month
    }).select('id').single())
    return async () => {
      must(await supabase.from('savings').delete().eq('id', fund.id))
      console.log('removed the story saving')
    }
  },
  // S2 EP06: one finished salary cycle to review, 28 Sep – 27 Oct, matching the series (₹45,000 on the
  // 28th): a salary, rent, ₹5,000 of SIP + gold contributions, two big shopping trips (₹6,500 +
  // ₹3,200), and a ₹9,000 payday goal. The demo's salary moves to 28 Oct at ₹45,000 (EP05) so the
  // current cycle starts there. Kakeibo's stored cycle rows are re-dated to match. Story rows are
  // inserted without balance moves (a recording); everything inserted is deleted and everything
  // changed is put back.
  async review(uid) {
    const must = ({ data, error }) => { if (error) throw error; return data }
    const cats = must(await supabase.from('categories').select('id,name').eq('user_id', uid))
    const cat = (...names) => cats.find(c => names.includes(c.name))?.id ?? null
    const [acct] = must(await supabase.from('accounts').select('id').eq('user_id', uid).eq('is_active', true).order('created_at').limit(1))
    const sav = must(await supabase.from('savings').select('id,name').eq('user_id', uid))
    const savId = word => sav.find(s => s.name.includes(word))?.id ?? null
    const [sal] = must(await supabase.from('transactions').select('id,transaction_date,amount')
      .eq('user_id', uid).eq('transaction_type', 'income').eq('description', 'Salary').order('transaction_date', { ascending: false }).limit(1))
    if (!sal) throw new Error('no seeded Salary on the demo account: npm run seed:reels')
    const kk = must(await supabase.from('kakeibo_reflections').select('id,cycle_start,cycle_end,savings_goal,goal_decided_at')
      .eq('user_id', uid).eq('cycle_kind', 'salary').order('cycle_start'))
    const cur = kk.find(r => r.cycle_end == null), prev = kk.filter(r => r.cycle_end != null).at(-1), older = kk.filter(r => r !== cur && r !== prev)
    if (!cur || !prev) throw new Error('the demo needs a current and a previous Kakeibo cycle')
    const now = new Date(), y = now.getFullYear(), m = now.getMonth() - (now.getDate() >= 28 ? 0 : 1)
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const D = (mo, d) => iso(new Date(y, mo, d))
    const curStart = D(m, 28), prevStart = D(m - 1, 28), prevEnd = D(m, 27), olderEnd = D(m - 1, 27)
    const row = (date, description, amount, transaction_type, o = {}) => ({
      user_id: uid, transaction_date: date, description, amount, transaction_type, from_account_id: acct?.id ?? null, notes: 'S2 EP06 story', ...o,
    })
    const inserted = must(await supabase.from('transactions').insert([
      row(prevStart, 'Salary', 45000, 'income', { category_id: cat('Salary') }),
      row(D(m - 1, 30), 'Rent', 9000, 'expense', { category_id: cat('Rent') }),
      row(D(m, 5), 'Nifty 50 Index Fund', 3000, 'savings_contribution', { savings_id: savId('Nifty'), category_id: cat('SIP', 'Mutual Fund') }),
      row(D(m, 5), 'Gold Savings Scheme', 2000, 'savings_contribution', { savings_id: savId('Gold'), category_id: cat('Gold Scheme') }),
      row(D(m, 11), 'Lulu Mall · clothes', 6500, 'expense', { category_id: cat('Shopping') }),
      row(D(m, 18), 'Shoes', 3200, 'expense', { category_id: cat('Shopping') }),
    ]).select('id'))
    must(await supabase.from('transactions').update({ transaction_date: curStart, amount: 45000 }).eq('id', sal.id))
    const [set] = must(await supabase.from('settings').select('salary_date,monthly_salary').eq('user_id', uid))
    must(await supabase.from('settings').update({ salary_date: 28, monthly_salary: 45000 }).eq('user_id', uid))   // else the 28th isn't payday
    for (const r of older) must(await supabase.from('kakeibo_reflections').update({ cycle_end: olderEnd }).eq('id', r.id))
    must(await supabase.from('kakeibo_reflections').update({ cycle_start: prevStart, cycle_end: prevEnd, savings_goal: 9000, goal_decided_at: prev.goal_decided_at ?? new Date().toISOString() }).eq('id', prev.id))
    must(await supabase.from('kakeibo_reflections').update({ cycle_start: curStart, savings_goal: null, goal_decided_at: null }).eq('id', cur.id))
    return async () => {
      must(await supabase.from('transactions').delete().in('id', inserted.map(r => r.id)))
      must(await supabase.from('transactions').update({ transaction_date: sal.transaction_date, amount: sal.amount }).eq('id', sal.id))
      must(await supabase.from('settings').update({ salary_date: set.salary_date, monthly_salary: set.monthly_salary }).eq('user_id', uid))
      for (const r of [cur, prev, ...older]) {
        must(await supabase.from('kakeibo_reflections').update({ cycle_start: r.cycle_start, cycle_end: r.cycle_end, savings_goal: r.savings_goal, goal_decided_at: r.goal_decided_at }).eq('id', r.id))
      }
      console.log(`removed ${inserted.length} story rows; salary back to ${sal.transaction_date} ₹${sal.amount}; Kakeibo rows restored`)
    }
  },
  // S2 EP05: the demo's one recorded salary moved to the 28th of last month at the story's ₹45,000
  // (salary day 28 in settings), so the app's real cycle reads 28th → 27th. Only the date and the
  // amount label move (the balance is not re-derived for a recording); everything is put back.
  async cycle(uid) {
    const must = ({ data, error }) => { if (error) throw error; return data }
    const [sal] = must(await supabase.from('transactions').select('id,transaction_date,amount')
      .eq('user_id', uid).eq('transaction_type', 'income').eq('description', 'Salary').order('transaction_date', { ascending: false }).limit(1))
    if (!sal) throw new Error('no seeded Salary on the demo account: npm run seed:reels')
    const [set] = must(await supabase.from('settings').select('salary_date,monthly_salary').eq('user_id', uid))
    const d = new Date(); const on28 = new Date(d.getFullYear(), d.getMonth() - (d.getDate() >= 28 ? 0 : 1), 28)
    const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    must(await supabase.from('transactions').update({ transaction_date: iso(on28), amount: 45000 }).eq('id', sal.id))
    must(await supabase.from('settings').update({ salary_date: 28, monthly_salary: 45000 }).eq('user_id', uid))
    return async () => {
      must(await supabase.from('transactions').update({ transaction_date: sal.transaction_date, amount: sal.amount }).eq('id', sal.id))
      must(await supabase.from('settings').update({ salary_date: set.salary_date, monthly_salary: set.monthly_salary }).eq('user_id', uid))
      console.log(`salary back to ${sal.transaction_date}, ₹${sal.amount}`)
    }
  },
  // S2 EP04: bike insurance ₹12,000 as a YEARLY commitment, renewal 2 days from today (so the
  // real reminder shows), never paid; and a ₹1,000-a-month saving towards it ("Bike insurance
  // fund", 2 contributions so far). The demo's commitments are swapped out and put back; the
  // saving is added and removed.
  async annual(uid) {
    const must = ({ data, error }) => { if (error) throw error; return data }
    const before = must(await supabase.from('commitments').select('*').eq('user_id', uid))
    writeFileSync(join(here, 'out', 'demo-commitments-backup.json'), JSON.stringify(before, null, 2))  // in case the run dies mid-clip
    const cats = must(await supabase.from('categories').select('id,name').eq('user_id', uid))
    const [acct] = must(await supabase.from('accounts').select('id').eq('user_id', uid).eq('is_active', true).order('created_at').limit(1))
    const cat = (...names) => cats.find(c => names.includes(c.name))?.id ?? null
    const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d }
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    must(await supabase.from('commitments').delete().eq('user_id', uid))
    must(await supabase.from('commitments').insert({
      user_id: uid, name: 'Bike insurance', amount: 12000, remaining: 12000, category_id: cat('Insurance', 'Vehicle', 'Bike'),
      is_recurring: true, frequency: 'yearly', due_day: null, due_date: iso(day(2)), from_account_id: acct?.id ?? null,
      is_active: true, last_paid_date: null, total_installments: null, current_installment: 0,
    }))
    const fund = must(await supabase.from('savings').insert({
      user_id: uid, name: 'Bike insurance fund', type: 'custom', amount: 1000, is_recurring: true, frequency: 'monthly',
      due_day: day(5).getDate(), total_installments: 12, current_installment: 2, total_target: 12000, current_value: 2000,
      from_account_id: acct?.id ?? null, is_active: true, is_prized: false, last_contribution_date: null,
    }).select('id').single())
    return async () => {
      must(await supabase.from('savings').delete().eq('id', fund.id))
      must(await supabase.from('commitments').delete().eq('user_id', uid))
      if (before.length) must(await supabase.from('commitments').insert(before))
      console.log(`removed the story bill and saving; restored the demo's ${before.length} commitments`)
    }
  },
  // S2 EP03: a savings goal named "Emergency Fund" started small (₹2,000 of ₹30,000, one ₹2,000
  // contribution), and the Emergency Fund reserve set to the same ₹2,000. Only the added goal is
  // removed afterwards; the demo's own goals are never touched.
  async emergency(uid) {
    const must = ({ data, error }) => { if (error) throw error; return data }
    const [{ emergency_fund: reserveBefore }] = must(await supabase.from('settings').select('emergency_fund').eq('user_id', uid))
    // the contribution unlocks achievements (first_contribution, saved_1000); the demo's own ones stay
    const had = new Set(must(await supabase.from('user_achievements').select('achievement_id').eq('user_id', uid)).map(a => a.achievement_id))
    const target = new Date(); target.setMonth(target.getMonth() + 14)
    const goal = must(await supabase.from('goals').insert({
      user_id: uid, name: 'Emergency Fund', goal_type: 'savings', goal_amount: 30000, current_saved: 2000, monthly_target: 2000,
      target_date: target.toISOString().slice(0, 10), is_active: true,
    }).select('id').single())
    must(await supabase.from('goal_contributions').insert({ user_id: uid, goal_id: goal.id, amount: 2000, source: 'manual' }))
    must(await supabase.from('settings').update({ emergency_fund: 2000 }).eq('user_id', uid))
    return async () => {
      must(await supabase.from('goal_contributions').delete().eq('goal_id', goal.id))
      must(await supabase.from('goals').delete().eq('id', goal.id))
      must(await supabase.from('settings').update({ emergency_fund: reserveBefore }).eq('user_id', uid))
      const added = must(await supabase.from('user_achievements').select('id,achievement_id').eq('user_id', uid)).filter(a => !had.has(a.achievement_id))
      if (added.length) must(await supabase.from('user_achievements').delete().in('id', added.map(a => a.id)))
      console.log(`removed the story goal and ${added.length} achievements it unlocked; reserve back to ${reserveBefore}`)
    }
  },
  // S2 EP02's example bills: 9,000 + 4,500 + 500 + 1,000 = ₹15,000 a month. Last paid well before
  // this cycle, so all four read as unpaid; due a few days apart so the list sorts by due date.
  async commitments(uid) {
    const must = ({ data, error }) => { if (error) throw error; return data }
    const before = must(await supabase.from('commitments').select('*').eq('user_id', uid))
    writeFileSync(join(here, 'out', 'demo-commitments-backup.json'), JSON.stringify(before, null, 2))  // in case the run dies mid-clip
    const cats = must(await supabase.from('categories').select('id,name').eq('user_id', uid))
    const [acct] = must(await supabase.from('accounts').select('id').eq('user_id', uid).eq('is_active', true).order('created_at').limit(1))
    const cat = (...names) => cats.find(c => names.includes(c.name))?.id ?? null
    const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d }
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const bill = (name, amount, dueIn, ...catNames) => ({
      user_id: uid, name, amount, remaining: amount, category_id: cat(...catNames), is_recurring: true, frequency: 'monthly',
      due_day: day(dueIn).getDate(), due_date: iso(day(dueIn)), from_account_id: acct?.id ?? null, is_active: true,
      last_paid_date: iso(day(dueIn - 31)), total_installments: null, current_installment: 0,
    })
    must(await supabase.from('commitments').delete().eq('user_id', uid))
    must(await supabase.from('commitments').insert([
      bill('Rent', 9000, 2, 'Rent'),
      bill('Bike EMI', 4500, 5, 'Loan EMI'),
      bill('Phone & internet', 500, 9, 'Mobile & Internet', 'Phone', 'Internet', 'Utilities', 'Bills'),
      bill('Health insurance', 1000, 12, 'Insurance', 'Health'),
    ]))
    return async () => {
      must(await supabase.from('commitments').delete().eq('user_id', uid))
      if (before.length) must(await supabase.from('commitments').insert(before))
      console.log(`restored the demo's ${before.length} commitments`)
    }
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

  const restore = CLIP_DATA[name] ? await CLIP_DATA[name](session.user.id) : null
  // the demo account always gets its own rows back, even when the clip fails partway
  try {
    const page = await ctx.newPage()
    await page.goto(BASE + (CLIP_PATH[name] ?? ''), { waitUntil: 'networkidle' })
    // Dev server drops index.css's late font @import (production doesn't) — load it directly.
    await page.addStyleTag({ url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap' })
    await page.evaluate(() => document.fonts.ready)
    await wait(2500)
    const notNow = page.getByRole('button', { name: 'Not Now', exact: true })
    if (CLIP_PREP[name] && await notNow.isVisible().catch(() => false)) { await notNow.tap(); await wait(900) }
    if (CLIP_PREP[name]) await CLIP_PREP[name](page)

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
    if (r.status !== 0) throw new Error(`ffmpeg failed for ${name}`)
    const span = frames.at(-1).ts - frames[0].ts
    console.log(`out/app-${name}.mp4  (${frames.length} frames over ${span.toFixed(1)}s ≈ ${(frames.length / span).toFixed(0)} fps captured)`)
    rmSync(frameDir, { recursive: true, force: true })
  } finally {
    await ctx.close()
    if (restore) await restore()
  }
}
await browser.close()
