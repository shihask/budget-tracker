import type { AppState, KakeiboReflection, Transaction } from '@/types'
import type { FinancialCycle } from '@/lib/financial-cycle'
import { getPreviousFinancialCycle, isPrimaryIncomeTransaction } from '@/lib/financial-cycle'
import { getIncomePattern } from '@/lib/income-pattern'
import { localIso, parseIso, addDays } from '@/lib/utils'
import { reviewableRecords, REANCHOR_WINDOW_DAYS, MAX_REVIEW_CYCLE_DAYS } from './kakeibo'

/** One choice in the workspace's cycle selector. */
export interface CycleOption {
  start: string
  /** Completed: the cycle's last day. Current: today (figures so far). */
  end: string
  status: 'current' | 'completed'
  /** Stored v1 row, when Kakeibo observed this cycle (goal, note, status). */
  record: KakeiboReflection | null
  /** 'record' = stored boundaries; 'engine' = derived from salary history now. */
  origin: 'current' | 'record' | 'engine'
}

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
  const out: CycleOption[] = [{ start: key, end: localIso(today), status: 'current', record: currentRecord, origin: 'current' }]

  const fromRecords: CycleOption[] = reviewableRecords(records, current).map(r => ({
    start: r.cycle_start, end: r.cycle_end!, status: 'completed', record: r, origin: 'record',
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
      engine.push({ ...cand, status: 'completed', record: null, origin: 'engine' })
    }
  }

  const completed = [...fromRecords, ...engine]
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, MAX_COMPLETED_OPTIONS)
  return [...out, ...completed]
}
