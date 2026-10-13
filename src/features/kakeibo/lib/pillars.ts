import type { AppState, BudgetBucket, Category, Transaction } from '@/types'
import type { AIKakeiboCategory } from '@/lib/gemini'
import { getCategoryBucket } from '@/lib/budget-strategy'
import { eligibleSpendRows, type CycleSummary } from './kakeibo'

/** Kakeibo's four pillars. A Kakeibo-only layer over categories: it never
 *  changes a transaction, a category or its budget bucket. */
export type Pillar = 'survival' | 'optional' | 'culture' | 'unexpected'
export const PILLARS: Pillar[] = ['survival', 'optional', 'culture', 'unexpected']
export const PILLAR_LABEL: Record<Pillar, string> = {
  survival: 'Survival', optional: 'Optional', culture: 'Culture', unexpected: 'Unexpected',
}
export const PILLAR_HINT: Record<Pillar, string> = {
  survival: 'Needs — groceries, rent, bills, transport, medicine',
  optional: 'Wants — eating out, shopping, treats',
  culture: 'Enrichment — books, courses, music, hobbies',
  unexpected: 'Unplanned — repairs, emergencies',
}
export const isPillar = (v: unknown): v is Pillar => typeof v === 'string' && (PILLARS as string[]).includes(v)

export interface CategoryPillarRow { category_id: string; pillar: Pillar; source: 'ai' | 'user' }
export interface TxnPillarRow { transaction_id: string; pillar: Pillar }

/** Where a resolved pillar came from, strongest first. null = Needs review. */
export type PillarSource = 'txn' | 'user' | 'ai' | 'seed'

/** Step 4 of the precedence: Needs → Survival, Wants → Optional. Savings-bucket
 *  spend never reaches the pillars (it is Q2), and anything else has no honest
 *  default, so it stays Needs review rather than being guessed. */
export function seedPillar(bucket: BudgetBucket | null): Pillar | null {
  if (bucket === 'needs') return 'survival'
  if (bucket === 'wants') return 'optional'
  return null
}

/** A category's own pillar (no transaction override): user → AI → seed → none. */
export function categoryPillar(
  cat: Category | undefined,
  groups: AppState['groups'],
  catPillars: Map<string, CategoryPillarRow>,
): { pillar: Pillar | null; source: PillarSource | null } {
  if (!cat) return { pillar: null, source: null }
  const stored = catPillars.get(cat.id)
  if (stored) return { pillar: stored.pillar, source: stored.source }
  const seed = seedPillar(getCategoryBucket(cat, groups))
  return seed ? { pillar: seed, source: 'seed' } : { pillar: null, source: null }
}

/** The precedence, first match wins:
 *  1. user override on this transaction
 *  2. user's category pillar   3. AI's category pillar
 *  4. seed from the row's bucket   5. none → Needs review */
export function resolvePillar(
  row: { t: Transaction; bucket: BudgetBucket | null; cat: Category | undefined },
  catPillars: Map<string, CategoryPillarRow>,
  txnPillars: Map<string, TxnPillarRow>,
): { pillar: Pillar | null; source: PillarSource | null } {
  const o = txnPillars.get(row.t.id)
  if (o) return { pillar: o.pillar, source: 'txn' }
  if (row.cat) {
    const stored = catPillars.get(row.cat.id)
    if (stored) return { pillar: stored.pillar, source: stored.source }
  }
  const seed = seedPillar(row.bucket)
  return seed ? { pillar: seed, source: 'seed' } : { pillar: null, source: null }
}

export interface PillarRowView {
  t: Transaction
  amount: number
  pillar: Pillar | null
  source: PillarSource | null
  lifeEvent: boolean
}
export interface CategoryGroupView {
  /** null = uncategorised spend — no category default can be stored for it. */
  categoryId: string | null
  name: string
  amount: number
  pillar: Pillar | null
  source: PillarSource | null
  /** Rows whose override differs from the category's pillar. */
  exceptions: number
  rows: PillarRowView[]
}
export interface PillarTotals {
  totals: Record<Pillar, number>
  needsReview: number
  /** Equals CycleSummary.spent — same rows (eligibleSpendRows). */
  spent: number
  lifeEvents: number
  groups: CategoryGroupView[]
}

/** Pillar totals for one cycle. Reads exactly `eligibleSpendRows` — the rows that
 *  make up `CycleSummary.spent` — so pillars + Needs review === Spent, always. */
export function computePillarTotals(
  txns: Transaction[], state: AppState, from: string, to: string,
  catPillars: Map<string, CategoryPillarRow>, txnPillars: Map<string, TxnPillarRow>,
): PillarTotals {
  const totals: Record<Pillar, number> = { survival: 0, optional: 0, culture: 0, unexpected: 0 }
  let needsReview = 0, spent = 0, lifeEvents = 0
  const groups = new Map<string, CategoryGroupView>()

  for (const r of eligibleSpendRows(txns, state, from, to)) {
    const { pillar, source } = resolvePillar(r, catPillars, txnPillars)
    spent += r.amount
    if (r.ringFenced) lifeEvents += r.amount
    if (pillar) totals[pillar] += r.amount
    else needsReview += r.amount

    const key = r.cat?.id ?? '__none__'
    let g = groups.get(key)
    if (!g) {
      const own = categoryPillar(r.cat, state.groups, catPillars)
      g = { categoryId: r.cat?.id ?? null, name: r.cat?.name ?? 'Uncategorised', amount: 0, pillar: own.pillar, source: own.source, exceptions: 0, rows: [] }
      groups.set(key, g)
    }
    g.amount += r.amount
    g.rows.push({ t: r.t, amount: r.amount, pillar, source, lifeEvent: r.ringFenced })
    if (source === 'txn' && pillar !== g.pillar) g.exceptions++
  }

  const list = [...groups.values()]
  for (const g of list) g.rows.sort((a, b) => b.t.transaction_date.localeCompare(a.t.transaction_date))
  // Anything needing review first, then by size.
  list.sort((a, b) => Number(b.rows.some(x => !x.pillar)) - Number(a.rows.some(x => !x.pillar)) || b.amount - a.amount)
  return { totals, needsReview, spent, lifeEvents, groups: list }
}

// ── AI classification ────────────────────────────────────────────────────────

/** Below this an AI suggestion is dropped and the category stays at its seed or
 *  Needs review — no false confidence. */
export const MIN_PILLAR_CONFIDENCE = 60
/** Same cap the Edge Function enforces. */
export const MAX_AI_CATEGORIES = 40

/** Categories in this cycle's spend that have no stored pillar yet — the only
 *  ones sent to AI, so a category is classified about once, ever. Seeded ones
 *  are included: AI can move "Courses" (a want) to Culture. */
export function categoriesNeedingAi(
  totals: PillarTotals, state: AppState, catPillars: Map<string, CategoryPillarRow>,
): { request: AIKakeiboCategory[]; ids: string[] } {
  const catMap = new Map(state.categories.map(c => [c.id, c]))
  const request: AIKakeiboCategory[] = []
  const ids: string[] = []
  for (const g of totals.groups) {
    if (!g.categoryId || catPillars.has(g.categoryId)) continue
    const cat = catMap.get(g.categoryId)
    if (!cat) continue
    const bucket = getCategoryBucket(cat, state.groups)
    request.push({
      i: request.length,
      name: cat.name.slice(0, 40),
      group: cat.group_name ? cat.group_name.slice(0, 30) : null,
      bucket: bucket ?? 'none',
      samples: [...new Set(g.rows.map(r => (r.t.description ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 3).map(s => s.slice(0, 60)),
    })
    ids.push(g.categoryId)
    if (request.length >= MAX_AI_CATEGORIES) break
  }
  return { request, ids }
}

/** AI confidence arrives as 85, "85" or 0.85 — small models write all three. */
export function normaliseConfidence(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN
  if (!Number.isFinite(n)) return 0
  return n > 0 && n <= 1 ? n * 100 : n
}

/** Maps raw AI items back to the category ids that were sent. Drops bad indices,
 *  unknown pillars, low confidence and duplicates (first wins). */
export function validatePillarSuggestions(raw: unknown, sentIds: string[]): { category_id: string; pillar: Pillar }[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  const out: { category_id: string; pillar: Pillar }[] = []
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue
    const { i, pillar, confidence } = it as { i?: unknown; pillar?: unknown; confidence?: unknown }
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= sentIds.length || seen.has(i)) continue
    if (!isPillar(pillar)) continue
    if (normaliseConfidence(confidence) < MIN_PILLAR_CONFIDENCE) continue
    seen.add(i)
    out.push({ category_id: sentIds[i], pillar })
  }
  return out
}

/** Client mirror of mp_kakeibo_save_ai_pillars' upsert: AI may replace AI, never
 *  a user row. Used to update local state after a save, and in tests. */
export function mergeAiPillars(current: Map<string, CategoryPillarRow>, items: { category_id: string; pillar: Pillar }[]): Map<string, CategoryPillarRow> {
  const next = new Map(current)
  for (const it of items) {
    const existing = next.get(it.category_id)
    if (existing?.source === 'user') continue
    next.set(it.category_id, { category_id: it.category_id, pillar: it.pillar, source: 'ai' })
  }
  return next
}

// ── AI insight ───────────────────────────────────────────────────────────────

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
const r0 = (n: number) => Math.round(n)

/** Every fact the insight may use — each already computed, so the model never
 *  has to do arithmetic. Keys are snake_case (the Edge Function checks that). */
export function buildInsightFacts(args: {
  summary: CycleSummary
  pillars: PillarTotals
  goal: number | null
  inProgress: boolean
  prevPillars: PillarTotals | null
}): Record<string, number | string> {
  const { summary: s, pillars: p, goal, inProgress, prevPillars } = args
  const f: Record<string, number | string> = {
    cycle_status: inProgress ? 'in progress (provisional)' : 'completed',
    income_received: r0(s.income),
    total_spent: r0(p.spent),
    moved_to_savings: r0(Math.max(0, s.savedNet)),
  }
  for (const k of PILLARS) {
    f[`${k}_spent`] = r0(p.totals[k])
    f[`${k}_share_of_spending_pct`] = pct(p.totals[k], p.spent)
  }
  if (p.needsReview > 0) f.not_yet_classified = r0(p.needsReview)
  if (p.lifeEvents > 0) f.life_event_spend_included = r0(p.lifeEvents)
  if (goal != null && goal > 0) {
    f.savings_goal = r0(goal)
    f.savings_goal_reached_pct = Math.min(100, pct(Math.max(0, s.savedNet), goal))
    if (s.savedNet < goal) f.savings_goal_remaining = r0(goal - Math.max(0, s.savedNet))
  }
  if (prevPillars && prevPillars.spent > 0) {
    f.last_cycle_total_spent = r0(prevPillars.spent)
    for (const k of PILLARS) {
      f[`last_cycle_${k}_spent`] = r0(prevPillars.totals[k])
      const d = r0(p.totals[k] - prevPillars.totals[k])
      if (d !== 0) f[`${k}_change_vs_last_cycle`] = d
    }
  }
  if (s.topCategories.length) f.top_categories = s.topCategories.map(t => `${t.name} ${r0(t.amount)}`).join('; ')
  return f
}

/** Numbers written in the text: "₹12,345", "12,345", "45%", "12k", "1.2 lakh". */
function numbersIn(text: string): { value: number; percent: boolean }[] {
  const out: { value: number; percent: boolean }[] = []
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(%|k\b|lakh|lakhs|l\b)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    let v = Number(m[1].replace(/,/g, ''))
    if (!Number.isFinite(v)) continue
    const unit = (m[2] ?? '').toLowerCase()
    if (unit === 'k') v *= 1000
    else if (unit === 'lakh' || unit === 'lakhs' || unit === 'l') v *= 100000
    out.push({ value: v, percent: unit === '%' })
  }
  return out
}

/** True only if every number in `text` matches a fact (± ₹1 or 1% for amounts,
 *  ± 1 point for percentages). Numbers ≤ 12 ("3 sentences", "2 cycles") are not
 *  money and are allowed. One invented figure → the whole insight is dropped. */
export function insightNumbersAreGrounded(text: string, facts: Record<string, number | string>): boolean {
  const values: number[] = []
  for (const v of Object.values(facts)) {
    if (typeof v === 'number') values.push(Math.abs(v))
    else for (const n of numbersIn(v)) values.push(n.value)
  }
  for (const n of numbersIn(text)) {
    if (!n.percent && n.value <= 12) continue
    const ok = values.some(f => n.percent
      ? Math.abs(n.value - f) <= 1
      : Math.abs(n.value - f) <= Math.max(1, f * 0.01))
    if (!ok) return false
  }
  return true
}

export function factsFingerprint(cycleStart: string, facts: Record<string, number | string>): string {
  return `${cycleStart}|${JSON.stringify(Object.keys(facts).sort().map(k => [k, facts[k]]))}`
}
