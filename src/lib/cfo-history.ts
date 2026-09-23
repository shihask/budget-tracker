import type { AppState } from '@/types'
import type { CfoSnapshot } from '@/lib/cfo-snapshot'
import { forSpendAnalytics, spendAmount } from '@/lib/reimbursements'
import { catById, makeScopeFilter } from '@/lib/data'

/* ============================================================================
   "What changed since your last check" — per-device history of CFO snapshots.

   v1 lives in localStorage (same convention as mp_event_suggest_*), so a phone
   and a laptop each keep their own baseline. The UI always says "on this
   device" so a fresh device's "first check" never reads as lost data.
   ============================================================================ */

export interface CfoCheck {
  at: string               // ISO timestamp
  liquidCash: number
  freeMoney: number
  cardDebt: number
  mandatoryTotal: number
}

export interface CfoDeltas {
  since: string            // baseline.at
  liquidCash: number
  freeMoney: number
  cardDebt: number
  lifestyleSince: number   // budget-scope spend logged since the baseline
}

type KV = Pick<Storage, 'getItem' | 'setItem'>

const HOUR_MS = 3_600_000
// A baseline must be at least this old — asking twice in a row would otherwise
// compare a snapshot with itself and show a row of zeros.
export const BASELINE_MIN_AGE_MS = 6 * HOUR_MS
export const HISTORY_MAX_AGE_MS = 30 * 24 * HOUR_MS
export const HISTORY_MAX_ENTRIES = 5

export const cfoHistoryKey = (uid: string) => `mp_cfo_snapshots_${uid}`

function defaultStore(): KV | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

export function loadChecks(uid: string, store: KV | null = defaultStore()): CfoCheck[] {
  if (!store) return []
  try {
    const raw = store.getItem(cfoHistoryKey(uid))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(c => c && typeof c.at === 'string') : []
  } catch { return [] }
}

export function toCheck(s: CfoSnapshot, now: number = Date.now()): CfoCheck {
  return {
    at: new Date(now).toISOString(),
    liquidCash: s.liquidCash,
    freeMoney: s.freeMoney,
    cardDebt: s.cardDebt,
    mandatoryTotal: s.mandatoryTotal,
  }
}

// Appends a check. A burst of checks inside BASELINE_MIN_AGE_MS collapses into
// the newest one, so five quick questions can never push yesterday's baseline
// out of the ring — entries stay spaced at least that far apart.
export function appendCheck(checks: CfoCheck[], check: CfoCheck, now: number = Date.now()): CfoCheck[] {
  const fresh = checks.filter(c => now - Date.parse(c.at) <= HISTORY_MAX_AGE_MS)
  const last = fresh[fresh.length - 1]
  const base = last && now - Date.parse(last.at) < BASELINE_MIN_AGE_MS ? fresh.slice(0, -1) : fresh
  return [...base, check].slice(-HISTORY_MAX_ENTRIES)
}

export function saveCheck(uid: string, s: CfoSnapshot, store: KV | null = defaultStore(), now: number = Date.now()): void {
  if (!store) return
  try {
    store.setItem(cfoHistoryKey(uid), JSON.stringify(appendCheck(loadChecks(uid, store), toCheck(s, now), now)))
  } catch { /* storage full / blocked — the feature just has no baseline */ }
}

export function pickBaseline(checks: CfoCheck[], now: number = Date.now()): CfoCheck | null {
  for (let i = checks.length - 1; i >= 0; i--) {
    const age = now - Date.parse(checks[i].at)
    if (age >= BASELINE_MIN_AGE_MS && age <= HISTORY_MAX_AGE_MS) return checks[i]
  }
  return null
}

// Spend "logged since you last looked" — keyed on created_at, so an expense
// backdated to last week but entered today still counts as new since the check.
export function lifestyleSpendSince(state: AppState, sinceIso: string): number {
  const since = Date.parse(sinceIso)
  const catMap = catById(state.categories)
  const matches = makeScopeFilter(state)
  return Math.round(forSpendAnalytics(state.transactions)
    .filter(t => matches(t, catMap) && Date.parse(t.created_at ?? t.transaction_date) >= since)
    .reduce((s, t) => s + spendAmount(t), 0))
}

export function computeDeltas(baseline: CfoCheck, s: CfoSnapshot, state: AppState): CfoDeltas {
  return {
    since: baseline.at,
    liquidCash: s.liquidCash - baseline.liquidCash,
    freeMoney: s.freeMoney - baseline.freeMoney,
    cardDebt: s.cardDebt - baseline.cardDebt,
    lifestyleSince: lifestyleSpendSince(state, baseline.at),
  }
}
