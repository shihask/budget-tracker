import type { AppState, BudgetBucket, Category, KakeiboReflection, Transaction } from '@/types'
import { SYSTEM_TX_TYPES } from '@/types'
import type { FinancialCycle } from '@/lib/financial-cycle'
import { isPrimaryIncomeTransaction } from '@/lib/financial-cycle'
import { getIncomePattern } from '@/lib/income-pattern'
import { getCategoryBucket } from '@/lib/budget-strategy'
import { ringFencedEventIds, countsTowardBudget } from '@/lib/events'
import { forSpendAnalytics, spendAmount, type AnalyticsTransaction } from '@/lib/reimbursements'
import { localIso, parseIso, addDays, fmt } from '@/lib/utils'

// ── Constants ────────────────────────────────────────────────────────────────

/** The goal row stays on the dashboard for the first week of a cycle only — a
 *  savings intention set on day 20 isn't an intention, and an all-month card is a nag. */
export const GOAL_PROMPT_DAYS = 7
/** The review row stays on the dashboard this long into the next cycle; after
 *  that it waits quietly in Analytics → Kakeibo. */
export const REVIEW_DASHBOARD_DAYS = 10
export const NOTE_MAX = 500

/** How far a cycle start can move and still be "the same cycle, re-anchored"
 *  (a salary backdated or post-dated by a few days). Mirrors the monthly cluster
 *  window in financial-cycle.ts (`getClusterWindow('monthly')` = 15): any two
 *  salaries closer than that are one cycle to the engine, so they are one cycle
 *  here. A real rollover is always further apart. */
export const REANCHOR_WINDOW_DAYS = 15
/** Longest cycle Kakeibo will offer for review — the longest month plus the
 *  re-anchor window. Longer means the app wasn't opened for one or more paydays,
 *  so the true boundaries in between are unknown and a review would mislead. */
export const MAX_REVIEW_CYCLE_DAYS = 31 + REANCHOR_WINDOW_DAYS

const MS_DAY = 86400000
const daysBetween = (a: string, b: string): number =>
  Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / MS_DAY)
const dayBefore = (isoDate: string): string => localIso(addDays(parseIso(isoDate), -1))

// ── Eligibility ──────────────────────────────────────────────────────────────

/** Salary-strategy eligibility: a Monthly income pattern with the cycle
 *  anchored on a real, recorded salary. The calendar fallback and "no salary
 *  yet" write nothing and show nothing. (Other patterns use the calendar-month
 *  strategy — see kakeiboCycle.) */
export function isEligible(state: AppState, cycle: FinancialCycle | undefined, loading: boolean): cycle is FinancialCycle {
  if (loading || !cycle) return false
  if (getIncomePattern(state.settings) !== 'monthly') return false
  return cycle.source === 'transaction'
}

// ── Cycle strategies ─────────────────────────────────────────────────────────

/** 'salary' = the financial-cycle engine's recorded-salary cycle (Monthly
 *  income). 'month' = the local calendar month, 1st to last day (Weekly,
 *  Variable/Daily, Business) — those patterns have no salary to anchor on, and
 *  the engine's guesses for them would make review dates misleading. Stored on
 *  every row as `cycle_kind`, so changing the income pattern never re-dates or
 *  re-labels a saved review. */
export type KakeiboStrategy = 'salary' | 'month'

export function kakeiboStrategy(settings: AppState['settings']): KakeiboStrategy {
  return getIncomePattern(settings) === 'monthly' ? 'salary' : 'month'
}

/** The cycle Kakeibo is in. For 'salary' it is the engine's cycle (read-only);
 *  for 'month' it is built from the calendar alone — never from income rows. */
export interface KakeiboCycle {
  kind: KakeiboStrategy
  cycleStart: Date
  /** Salary: the engine's estimate. Month: the real last day. */
  cycleEnd: Date
  currentDay: number
  totalDays: number
  daysRemaining: number
  /** The engine's cycle, for walking salary history (salary only). */
  engine: FinancialCycle | null
}

export function monthCycle(today: Date): KakeiboCycle {
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const totalDays = end.getDate()
  const currentDay = today.getDate()
  return { kind: 'month', cycleStart: start, cycleEnd: end, currentDay, totalDays, daysRemaining: totalDays - currentDay + 1, engine: null }
}

/** First and last day (YYYY-MM-DD) of the calendar month starting at `start`. */
export function monthBounds(start: string): { start: string; end: string } {
  const d = parseIso(start)
  return { start: localIso(new Date(d.getFullYear(), d.getMonth(), 1)), end: localIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
}

/** The active Kakeibo cycle, or null when Kakeibo can't run yet (loading;
 *  Monthly income with no recorded salary). */
export function kakeiboCycle(settings: AppState['settings'], engine: FinancialCycle | undefined, loading: boolean, today: Date): KakeiboCycle | null {
  if (loading) return null
  if (kakeiboStrategy(settings) === 'month') return monthCycle(today)
  if (!engine || engine.source !== 'transaction') return null
  return {
    kind: 'salary', cycleStart: engine.cycleStart, cycleEnd: engine.cycleEnd, currentDay: engine.currentDay,
    totalDays: engine.totalDays, daysRemaining: engine.daysRemaining, engine,
  }
}

/** Rows written before cycle_kind existed are salary rows. */
export const kindOf = (r: Pick<KakeiboReflection, 'cycle_kind'>): KakeiboStrategy => r.cycle_kind ?? 'salary'

// ── Cycle sync ───────────────────────────────────────────────────────────────

/** A declarative set of writes. Every step carries the state it expects to find,
 *  so `mp_kakeibo_apply_sync` can refuse a plan made from a stale read ('stale')
 *  instead of half-applying it. */
export interface SyncPlan {
  insert?: { cycle_start: string }
  rekey?: { from: string; to: string }
  setEnd?: { cycle_start: string; expected_end: string | null; cycle_end: string }
  reopen?: { cycle_start: string; expected_end: string }
}

/** The one definition of how Kakeibo's stored cycles follow the cycle engine.
 *  Returns null when the records already match.
 *
 *  1. The current cycle's record — found, re-keyed or created:
 *     - a record at `key` exists → keep it; reopen it if closed (the newer salary
 *       was deleted, so this cycle is current again);
 *     - else the latest record is open and within REANCHOR_WINDOW_DAYS of `key`
 *       → it is this cycle with its salary re-dated: move it to `key`;
 *     - else, if no record starts after `key`, a rollover: insert `key`.
 *       If one does (the cycle went back past a known record), do nothing —
 *       ambiguous, so no write and no review.
 *  2. Its predecessor (latest record before `key`) ends the day before `key`.
 *
 *  Records starting after `key` are hidden, never deleted: re-adding a deleted
 *  salary makes them current again with their goal and note intact. */
export function planCycleSync(records: KakeiboReflection[], cycle: Pick<FinancialCycle, 'cycleStart'>): SyncPlan | null {
  const key = localIso(cycle.cycleStart)
  const plan: SyncPlan = {}
  const sorted = [...records].sort((a, b) => a.cycle_start.localeCompare(b.cycle_start))

  const exact = sorted.find(r => r.cycle_start === key)
  let movedFrom: string | null = null
  if (exact) {
    if (exact.cycle_end != null) plan.reopen = { cycle_start: key, expected_end: exact.cycle_end }
  } else {
    const latest = sorted[sorted.length - 1]
    if (latest && latest.cycle_end == null && Math.abs(daysBetween(latest.cycle_start, key)) <= REANCHOR_WINDOW_DAYS) {
      plan.rekey = { from: latest.cycle_start, to: key }
      movedFrom = latest.cycle_start
    } else if (latest && latest.cycle_start > key) {
      return null
    } else {
      plan.insert = { cycle_start: key }
    }
  }

  const before = sorted.filter(r => r.cycle_start < key && r.cycle_start !== movedFrom)
  const pred = before[before.length - 1]
  const predEnd = dayBefore(key)
  // Re-close the predecessor only when it is genuinely this cycle's neighbour:
  // still open, ending inside this cycle, or adjacent to the record just re-keyed.
  // A closed past cycle ending earlier (one recorded later from history, with
  // unrecorded cycles between) is left alone — stretching it would swallow them.
  const adjacent = pred != null && (
    pred.cycle_end == null
    || pred.cycle_end >= key
    || (movedFrom != null && pred.cycle_end === dayBefore(movedFrom))
  )
  if (pred && adjacent && pred.cycle_end !== predEnd) {
    plan.setEnd = { cycle_start: pred.cycle_start, expected_end: pred.cycle_end, cycle_end: predEnd }
  }

  return Object.keys(plan).length ? plan : null
}

/** What applying `plan` does to `records` — the client mirror of the RPC, used
 *  for the idempotency tests and nothing else (the app refetches after a sync). */
export function applyPlan(records: KakeiboReflection[], plan: SyncPlan): KakeiboReflection[] {
  let out = records.map(r => ({ ...r }))
  if (plan.rekey) out = out.map(r => r.cycle_start === plan.rekey!.from ? { ...r, cycle_start: plan.rekey!.to } : r)
  if (plan.setEnd) out = out.map(r => r.cycle_start === plan.setEnd!.cycle_start ? { ...r, cycle_end: plan.setEnd!.cycle_end } : r)
  if (plan.reopen) out = out.map(r => r.cycle_start === plan.reopen!.cycle_start ? { ...r, cycle_end: null } : r)
  if (plan.insert && !out.some(r => r.cycle_start === plan.insert!.cycle_start)) {
    out.push(emptyReflection(plan.insert.cycle_start))
  }
  return out
}

export function emptyReflection(cycleStart: string, id = `local-${cycleStart}`): KakeiboReflection {
  return {
    id, cycle_start: cycleStart, cycle_end: null, savings_goal: null, goal_decided_at: null,
    reflection_note: null, review_status: null, reviewed_at: null, lesson_acknowledged_at: null,
  }
}

// ── Derived view ─────────────────────────────────────────────────────────────

export const cycleLength = (r: KakeiboReflection): number | null =>
  r.cycle_end ? daysBetween(r.cycle_start, r.cycle_end) + 1 : null

/** Closed cycles before the current one, newest first. A cycle longer than
 *  MAX_REVIEW_CYCLE_DAYS spans unobserved paydays and is never offered. */
export function reviewableRecords(records: KakeiboReflection[], cycle: Pick<FinancialCycle, 'cycleStart'>): KakeiboReflection[] {
  const key = localIso(cycle.cycleStart)
  return records
    .filter(r => r.cycle_end != null && r.cycle_start < key)
    .filter(r => (cycleLength(r) ?? Infinity) <= MAX_REVIEW_CYCLE_DAYS)
    .sort((a, b) => b.cycle_start.localeCompare(a.cycle_start))
}

/** The cycle that ended the day before the current one began — the one this
 *  payday's review and "last lesson" are about. */
export function previousRecord(records: KakeiboReflection[], cycle: Pick<FinancialCycle, 'cycleStart'>): KakeiboReflection | null {
  const prevEnd = dayBefore(localIso(cycle.cycleStart))
  return reviewableRecords(records, cycle).find(r => r.cycle_end === prevEnd) ?? null
}

/** The record that ended the day before `r` began, if Kakeibo observed it — the
 *  only cycle a review may compare against. */
export function predecessorOf(records: KakeiboReflection[], r: KakeiboReflection): KakeiboReflection | null {
  const end = dayBefore(r.cycle_start)
  const p = records.find(x => x.cycle_end === end)
  return p && (cycleLength(p) ?? Infinity) <= MAX_REVIEW_CYCLE_DAYS ? p : null
}

export function currentRecord(records: KakeiboReflection[], cycle: Pick<FinancialCycle, 'cycleStart'>): KakeiboReflection | null {
  const key = localIso(cycle.cycleStart)
  return records.find(r => r.cycle_start === key) ?? null
}

export interface DashboardActions {
  /** Previous cycle's review, still pending. */
  review: KakeiboReflection | null
  /** This cycle's goal, still undecided. */
  goal: KakeiboReflection | null
  /** Previous cycle's note, not yet acknowledged — only when nothing else is asked. */
  lesson: KakeiboReflection | null
}

/** The in-app reminder. Review and goal are independent — on payday both show
 *  and either can be done first. Pure derivation: the review row shows only
 *  while `review_status` is null, and nothing ever sets it back to null.
 *
 *  Reminder day 1 is payday — or, when the salary was recorded late, the day
 *  the app first saw the new cycle (the current row's `created_at`), so a
 *  salary entered on day 9 still gets the full 7- and 10-day windows. A first-
 *  ever row (no previous cycle) always counts from the cycle start: Kakeibo
 *  arriving mid-cycle must not open a goal prompt on day 15.
 *
 *  Dismissing the reminder ("Not now") only hides the row here; the review
 *  stays pending in Analytics. Skipping the review itself is a separate,
 *  explicit action there (`review_status = 'skipped'`). */
export function dashboardActions(
  records: KakeiboReflection[], cycle: Pick<FinancialCycle, 'cycleStart'>, today: Date, kind: KakeiboStrategy = 'salary',
): DashboardActions {
  const prev = previousRecord(records, cycle)
  const cur = currentRecord(records, cycle)
  const day = reminderDay(cur, prev, cycle, today, kind)
  const review = prev && prev.review_status == null && !prev.review_reminder_dismissed_at && day <= REVIEW_DASHBOARD_DAYS ? prev : null
  const goal = cur && cur.goal_decided_at == null && day <= GOAL_PROMPT_DAYS ? cur : null
  const lesson = !review && !goal && prev && prev.reflection_note?.trim() && !prev.lesson_acknowledged_at ? prev : null
  return { review, goal, lesson }
}

/** Day of the reminder window, 1-based — see dashboardActions. */
export function reminderDay(
  cur: KakeiboReflection | null, prev: KakeiboReflection | null,
  cycle: Pick<FinancialCycle, 'cycleStart'>, today: Date, kind: KakeiboStrategy = 'salary',
): number {
  const start = localIso(cycle.cycleStart)
  // Calendar months always start on the 1st — nothing can be "recorded late".
  const seen = kind === 'salary' && cur?.created_at && prev ? localIso(new Date(cur.created_at)) : null
  const anchor = seen && seen > start ? seen : start
  return daysBetween(anchor, localIso(today)) + 1
}

// ── Review lifecycle ─────────────────────────────────────────────────────────

export type ReviewAction =
  | { kind: 'save'; note: string }
  | { kind: 'skip' }
  | { kind: 'acknowledge' }

export type ReviewPatch = Partial<Pick<KakeiboReflection, 'review_status' | 'reflection_note' | 'reviewed_at' | 'lesson_acknowledged_at'>>

/** The only place a review's status changes. Status never goes back to null, so
 *  editing an old reflection can't re-arm its reminder; `reviewed_at` keeps the
 *  first completion; skip never downgrades a completed review. Returns only the
 *  columns to write, so a concurrent sync's `cycle_end` is never overwritten. */
export function nextReviewState(r: KakeiboReflection, action: ReviewAction, nowIso: string): ReviewPatch {
  switch (action.kind) {
    case 'save': {
      const note = action.note.trim().slice(0, NOTE_MAX) || null
      if (r.review_status === 'completed') return note === r.reflection_note ? {} : { reflection_note: note }
      if (r.review_status === 'skipped' && note == null) return {}
      return { review_status: 'completed', reflection_note: note, reviewed_at: nowIso }
    }
    case 'skip':
      return r.review_status == null ? { review_status: 'skipped', reviewed_at: nowIso } : {}
    case 'acknowledge':
      return r.lesson_acknowledged_at ? {} : { lesson_acknowledged_at: nowIso }
  }
}

// ── Cycle summary ────────────────────────────────────────────────────────────

export interface CycleSummary {
  from: string
  to: string
  incomePrimary: number
  incomeOther: number
  income: number
  /** needs + wants + events + unclassified */
  spent: number
  needs: number
  wants: number
  /** Ring-fenced life-event spend — kept out of Needs/Wants, same as Budget Strategy. */
  events: number
  /** Spending with no Needs/Wants bucket (no category, or an Other category not yet mapped). */
  unclassified: number
  /** savings_contribution + savings-bucket expenses − savings_withdrawal. The figure the goal is measured against. */
  savedNet: number
  topCategories: { name: string; amount: number }[]
  rowCount: number
}

const isSystem = (t: Transaction) => SYSTEM_TX_TYPES.has(t.transaction_type)

/** One row of the cycle, read the way the review reads it. The only place the
 *  spending-type rule lives — `computeCycleSummary` folds these, the four
 *  pillars (pillars.ts) read the `spend` ones through `eligibleSpendRows`, so the
 *  two can't drift apart. */
export type CycleRow =
  | { kind: 'income'; t: AnalyticsTransaction; primary: boolean }
  | { kind: 'saved'; t: AnalyticsTransaction; delta: number }
  | { kind: 'spend'; t: AnalyticsTransaction; amount: number; bucket: BudgetBucket | null; ringFenced: boolean; cat: Category | undefined }
  | { kind: 'other'; t: AnalyticsTransaction }

/** Non-system rows in [from, to], each classified. Pure.
 *
 *  The spending-type rule mirrors `computeStrategyData` (budget-strategy.ts) —
 *  expense, commitment and own (non-credit) borrowing repayments; system rows,
 *  including credit-card bill payments, are never spending, so a card purchase
 *  counts once. A parity test pins Needs/Wants to that function. It is not called
 *  directly because it only knows the current cycle (no end bound). */
export function classifyCycleRows(txns: Transaction[], state: AppState, from: string, to: string): CycleRow[] {
  const catMap = new Map(state.categories.map(c => [c.id, c]))
  const ringFenced = ringFencedEventIds(state.events)
  const out: CycleRow[] = []

  for (const t of forSpendAnalytics(txns)) {
    if (t.transaction_date < from || t.transaction_date > to) continue
    if (isSystem(t)) continue
    const cat = t.category_id ? catMap.get(t.category_id) : undefined

    if (t.transaction_type === 'income') {
      // forSpendAnalytics already dropped reimbursements — they net expenses, they aren't income.
      out.push({ kind: 'income', t, primary: isPrimaryIncomeTransaction(t, state) })
      continue
    }
    if (t.transaction_type === 'savings_contribution') { out.push({ kind: 'saved', t, delta: t.amount }); continue }
    if (t.transaction_type === 'savings_withdrawal') { out.push({ kind: 'saved', t, delta: -t.amount }); continue }

    let bucket: BudgetBucket | null
    if (t.transaction_type === 'expense' || t.transaction_type === 'commitment') {
      bucket = cat ? getCategoryBucket(cat, state.groups) : null
    } else if (t.transaction_type === 'borrowing_repayment' && !t.is_credit) {
      bucket = cat ? (cat.budget_bucket ?? 'needs') : null
    } else {
      out.push({ kind: 'other', t })
      continue
    }
    out.push({ kind: 'spend', t, amount: spendAmount(t), bucket, ringFenced: !countsTowardBudget(t, ringFenced), cat })
  }
  return out
}

type SpendRow = Extract<CycleRow, { kind: 'spend' }>

/** Does this spend row count as spending (vs. savings)? Ring-fenced life-event
 *  spend always does; an un-ring-fenced savings-bucket expense is savings. */
export const countsAsSpent = (r: SpendRow): boolean => r.ringFenced || r.bucket !== 'savings'

/** Exactly the rows that make up `CycleSummary.spent` — read-only, for the pillars. */
export function eligibleSpendRows(txns: Transaction[], state: AppState, from: string, to: string): SpendRow[] {
  return classifyCycleRows(txns, state, from, to).filter((r): r is SpendRow => r.kind === 'spend' && countsAsSpent(r))
}

/** Every number the review shows. Pure; reads raw rows in [from, to]. Output is
 *  pinned byte-for-byte by summary-snapshot.test.ts. */
export function computeCycleSummary(txns: Transaction[], state: AppState, from: string, to: string): CycleSummary {
  const s: CycleSummary = {
    from, to, incomePrimary: 0, incomeOther: 0, income: 0, spent: 0, needs: 0, wants: 0,
    events: 0, unclassified: 0, savedNet: 0, topCategories: [], rowCount: 0,
  }
  const byCat = new Map<string, number>()

  for (const r of classifyCycleRows(txns, state, from, to)) {
    s.rowCount++
    if (r.kind === 'income') {
      if (r.primary) s.incomePrimary += r.t.amount
      else s.incomeOther += r.t.amount
      continue
    }
    if (r.kind === 'saved') { s.savedNet += r.delta; continue }
    if (r.kind === 'other') continue

    const amt = r.amount
    if (r.ringFenced) { s.events += amt; s.spent += amt; continue }
    if (r.bucket === 'savings') { s.savedNet += amt; continue }
    s.spent += amt
    if (r.bucket === 'needs') s.needs += amt
    else if (r.bucket === 'wants') s.wants += amt
    else s.unclassified += amt
    if (r.cat) byCat.set(r.cat.name, (byCat.get(r.cat.name) ?? 0) + amt)
  }

  s.income = s.incomePrimary + s.incomeOther
  s.topCategories = [...byCat.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
  return s
}

// ── Insight ──────────────────────────────────────────────────────────────────

/** Share of last cycle's Wants a change must reach before it is worth a sentence. */
export const WANTS_CHANGE_SHARE = 0.10

/** One factual line, first rule that applies. Code-only — never AI, never a
 *  cause, never a judgement. `prev` must be the contiguous previous cycle (the
 *  caller checks); null means no comparison is made. */
export function kakeiboInsight(s: CycleSummary, goal: number | null, prev: CycleSummary | null): string | null {
  if (s.rowCount === 0) return null
  const saved = Math.max(0, s.savedNet)
  if (goal != null && goal > 0) {
    if (saved >= goal) return `You moved ${fmt(Math.round(saved))} to savings — your full goal.`
    const pct = Math.floor((saved / goal) * 100)
    return `${fmt(Math.round(goal - saved))} short of your ${fmt(Math.round(goal))} savings goal (${pct}% reached).`
  }
  if (prev && prev.rowCount > 0) {
    const dWants = s.wants - prev.wants
    if (prev.wants > 0 && Math.abs(dWants) / prev.wants >= WANTS_CHANGE_SHARE) {
      return `Wants spending was ${fmt(Math.round(Math.abs(dWants)))} ${dWants < 0 ? 'lower' : 'higher'} than last cycle.`
    }
    const dSpent = Math.round(s.spent - prev.spent)
    if (dSpent === 0) return 'Total spending matched last cycle.'
    return `Total spending was ${fmt(Math.abs(dSpent))} ${dSpent < 0 ? 'lower' : 'higher'} than last cycle.`
  }
  return 'Not enough earlier data to compare yet.'
}

/** The month a cycle is "about" — the month of its midpoint, so a salary cycle
 *  of 28 Sep – 27 Oct reads as October and 1 Oct – 31 Oct as October too. */
export function cycleMonthName(r: Pick<KakeiboReflection, 'cycle_start' | 'cycle_end'>): string {
  const start = parseIso(r.cycle_start)
  const end = r.cycle_end ? parseIso(r.cycle_end) : start
  const mid = new Date((start.getTime() + end.getTime()) / 2)
  return mid.toLocaleDateString('en-IN', { month: 'long' })
}

/** True until the user has completed or skipped any review — the first-time
 *  prompt explains what Kakeibo is; returning users get the compact one. */
export const isFirstReview = (records: KakeiboReflection[]): boolean =>
  !records.some(r => r.review_status != null)

/** "12 Sep – 11 Oct" */
export function cycleLabel(r: Pick<KakeiboReflection, 'cycle_start' | 'cycle_end'>): string {
  const f = (s: string) => parseIso(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return r.cycle_end ? `${f(r.cycle_start)} – ${f(r.cycle_end)}` : `Since ${f(r.cycle_start)}`
}
