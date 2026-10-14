import type { AppState, KakeiboReflection, Transaction } from '@/types'
import type { FinancialCycle } from '@/lib/financial-cycle'
import { getPreviousFinancialCycle, isPrimaryIncomeTransaction } from '@/lib/financial-cycle'
import { getIncomePattern } from '@/lib/income-pattern'
import { localIso, parseIso, addDays } from '@/lib/utils'
import { reviewableRecords, kindOf, REANCHOR_WINDOW_DAYS, MAX_REVIEW_CYCLE_DAYS, type KakeiboStrategy } from './kakeibo'

/** One choice in the workspace's cycle selector. */
export interface CycleOption {
  /** Unique across kinds — a salary cycle and a calendar month can both start on the 1st. */
  key: string
  kind: KakeiboStrategy
  start: string
  /** Completed: the cycle's last day. Current: today (figures so far). */
  end: string
  status: 'current' | 'completed'
  /** Stored row, when there is one (goal, note, status). */
  record: KakeiboReflection | null
  /** 'record' = stored salary boundaries; 'engine' = derived from salary history
   *  now; 'calendar' = a calendar month; 'history' = a saved review from the
   *  other strategy, kept after an income-pattern change. */
  origin: 'current' | 'record' | 'engine' | 'calendar' | 'history'
}

const keyOf = (kind: KakeiboStrategy, start: string) => `${kind}:${start}`

export const MAX_COMPLETED_OPTIONS = 6
/** How far back the engine is walked; also the income-history fetch window. */
export const HISTORY_MONTHS = 8
const MAX_ENGINE_STEPS = 12

const MS_DAY = 86400000
const days = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / MS_DAY)
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start <= b.end && b.start <= a.end

export function historyFrom(today: Date): string {
  return localIso(new Date(today.getFullYear(), today.getMonth() - HISTORY_MONTHS, today.getDate()))
}

/** The selector's options: the current cycle (provisional) plus up to six
 *  completed ones, newest first.
 *
 *  Recorded cycles are truth — Kakeibo saw them live. Older history comes from
 *  the same cycle engine (`getPreviousFinancialCycle`, read-only) walked over
 *  `incomeTxns` (loaded window ∪ fetched income rows). An engine cycle is offered
 *  only when its dates are certain; otherwise it is left out, never guessed:
 *    - anchored on a real primary-income row (the engine's `source: 'transaction'`);
 *    - REANCHOR_WINDOW_DAYS < length ≤ MAX_REVIEW_CYCLE_DAYS;
 *    - no other qualifying income within REANCHOR_WINDOW_DAYS before the anchor —
 *      a split or late salary is exactly where the backward walk (which doesn't
 *      cluster) and the live engine (which does) can disagree;
 *    - no overlap with a record or with another offered cycle;
 *    - starts at least REANCHOR_WINDOW_DAYS after the history window opens, so
 *      the split check above can see everything it needs. */
export function buildCycleOptions(args: {
  state: AppState
  incomeTxns: Transaction[]
  current: FinancialCycle
  records: KakeiboReflection[]
  today: Date
  historyComplete: boolean
}): CycleOption[] {
  const { state, incomeTxns, current, records, today, historyComplete } = args
  const key = localIso(current.cycleStart)
  const currentRecord = records.find(r => r.cycle_start === key) ?? null
  const out: CycleOption[] = [{ key: keyOf('salary', key), kind: 'salary', start: key, end: localIso(today), status: 'current', record: currentRecord, origin: 'current' }]

  const fromRecords: CycleOption[] = reviewableRecords(records, current).map(r => ({
    key: keyOf('salary', r.cycle_start), kind: 'salary', start: r.cycle_start, end: r.cycle_end!, status: 'completed', record: r, origin: 'record',
  }))
  // Every stored row blocks engine candidates — open ones to infinity.
  const blocked = records.map(r => ({ start: r.cycle_start, end: r.cycle_end ?? '9999-12-31' }))

  const engine: CycleOption[] = []
  if (historyComplete) {
    const s: AppState = { ...state, transactions: incomeTxns }
    const pattern = getIncomePattern(state.settings)
    const primaryDates = incomeTxns.filter(t => isPrimaryIncomeTransaction(t, s)).map(t => t.transaction_date)
    const earliestSafe = localIso(addDays(parseIso(historyFrom(today)), REANCHOR_WINDOW_DAYS))

    let cycle = current
    for (let step = 0; step < MAX_ENGINE_STEPS; step++) {
      cycle = getPreviousFinancialCycle(s, cycle, pattern)
      const cand = { start: localIso(cycle.cycleStart), end: localIso(cycle.cycleEnd) }
      if (cand.start < earliestSafe) break
      if (cycle.source !== 'transaction' || !cycle.latestIncomeTransaction) continue
      const len = days(cand.start, cand.end) + 1
      if (len <= REANCHOR_WINDOW_DAYS || len > MAX_REVIEW_CYCLE_DAYS) continue
      const ambiguous = primaryDates.some(d => d < cand.start && days(d, cand.start) <= REANCHOR_WINDOW_DAYS)
      if (ambiguous) continue
      if (blocked.some(b => overlaps(b, cand))) continue
      if (engine.some(e => overlaps(e, cand))) continue
      engine.push({ ...cand, key: keyOf('salary', cand.start), kind: 'salary', status: 'completed', record: null, origin: 'engine' })
    }
  }

  const completed = [...fromRecords, ...engine]
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, MAX_COMPLETED_OPTIONS)
  return [...out, ...completed]
}

/** Calendar-month options (Weekly, Variable/Daily, Business income): the current
 *  month (provisional, to today) plus the previous MAX_COMPLETED_OPTIONS months,
 *  newest first. Built from the calendar alone; dates are certain, so every
 *  month is offered whether or not a row exists yet (saving a note creates it). */
export function buildMonthOptions(args: { records: KakeiboReflection[]; today: Date }): CycleOption[] {
  const { records, today } = args
  const byStart = new Map(records.filter(r => kindOf(r) === 'month').map(r => [r.cycle_start, r]))
  const out: CycleOption[] = []
  for (let k = 0; k <= MAX_COMPLETED_OPTIONS; k++) {
    const start = localIso(new Date(today.getFullYear(), today.getMonth() - k, 1))
    const end = k === 0 ? localIso(today) : localIso(new Date(today.getFullYear(), today.getMonth() - k + 1, 0))
    out.push({
      key: keyOf('month', start), kind: 'month', start, end,
      status: k === 0 ? 'current' : 'completed',
      record: byStart.get(start) ?? null,
      origin: k === 0 ? 'current' : 'calendar',
    })
  }
  return out
}

/** Appends saved reviews from the OTHER strategy (rows that hold a goal, note or
 *  review), as stored — an income-pattern change never re-dates or re-labels them.
 *  They may overlap the active strategy's dates; the label says which is which. */
export function withHistory(options: CycleOption[], history: KakeiboReflection[]): CycleOption[] {
  const extra: CycleOption[] = history
    .filter(r => r.cycle_end != null)
    .map(r => ({
      key: keyOf(kindOf(r), r.cycle_start), kind: kindOf(r), start: r.cycle_start, end: r.cycle_end!,
      status: 'completed' as const, record: r, origin: 'history' as const,
    }))
    .filter(o => !options.some(x => x.key === o.key))
    .sort((a, b) => b.start.localeCompare(a.start))
  return [...options, ...extra]
}
