import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { iso, TODAY } from '@/lib/utils'
import { catById, isSystemTx } from '@/lib/data'
import { spendAmount } from '@/lib/reimbursements'
import { ADJUSTMENT_GROUP } from '@/lib/constants'
import { detectLifeEventWithAI } from '@/lib/gemini'
import type { OnAiUsed } from '@/lib/gemini'
import {
  suggestionPool, suggestionFingerprint, detectEventSignals, hasEventSignal, signalRows,
  buildSuggestion, validateAiResult, isSuppressed, shiftIso, NOVELTY_LOOKBACK_DAYS,
} from '@/lib/event-suggestions'
import type { EventSuggestion, HistoryRow } from '@/lib/event-suggestions'
import { EVENT_ICON_KEYS, DEFAULT_EVENT_ICON, isEventIconKey } from '../lib/eventIcons'
import type { AppState } from '@/types'

// Owns everything event-suggestions.ts deliberately doesn't: the novelty fetch,
// the AI call, the cache and dismissals. Same mp_<feature>_<userId> +
// embedded-fingerprint convention as mint-coach-cache.ts.

const CACHE_VERSION = 1
const NOVELTY_PAGE_SIZE = 1000

interface CachedAiResult { name: string; icon: string; txIds: string[] }
interface CachedEventSuggestion {
  version: number
  fingerprint: string
  /** null = AI said "not an event" — cached too, so it isn't asked again. */
  result: CachedAiResult | null
}

const cacheKey = (userId: string) => `mp_event_suggest_${userId}`
const dismissedKey = (userId: string) => `mp_event_suggest_dismissed_${userId}`
/** Suggestions that already had their one toast — after that, the bell and
 *  the dashboard card are where they live. Same tx-id majority rule as dismissal. */
const toastSeenKey = (userId: string) => `mp_event_suggest_toast_seen_${userId}`

function readCache(userId: string): CachedEventSuggestion | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedEventSuggestion
    if (parsed.version !== CACHE_VERSION || typeof parsed.fingerprint !== 'string') return null
    if (parsed.result !== null && !Array.isArray(parsed.result?.txIds)) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(userId: string, entry: CachedEventSuggestion) {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(entry)) } catch { /* storage unavailable — AI is simply asked again next session */ }
}

function readIdSet(key: string): Set<string> {
  try {
    const ids = JSON.parse(localStorage.getItem(key) || '[]')
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...ids])) } catch { /* storage unavailable — remembered for this session only */ }
}

/** Expense descriptions in [from, to] — only when the loaded 200 rows don't reach
 *  far enough back to judge novelty. Checked in memory with the same tokenizer as
 *  detection, never with ILIKE, so "goa" can't match "goal". */
async function fetchNoveltyHistory(userId: string, from: string, to: string): Promise<HistoryRow[]> {
  const rows: HistoryRow[] = []
  for (let offset = 0; ; offset += NOVELTY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, description, transaction_date, amount, category_id, event_id')
      .eq('user_id', userId)
      .eq('transaction_type', 'expense')
      .gte('transaction_date', from)
      .lte('transaction_date', to)
      .order('transaction_date', { ascending: false })
      .order('id')
      .range(offset, offset + NOVELTY_PAGE_SIZE - 1)
    if (error) throw error
    const page = (data as HistoryRow[]) || []
    rows.push(...page)
    if (page.length < NOVELTY_PAGE_SIZE) break
  }
  return rows
}

interface Args {
  state: AppState
  userId: string
  autopilotEnabled: boolean
  allTransactionsLoaded: boolean
  onAiUsed?: OnAiUsed
}

export function useEventSuggestion({ state, userId, autopilotEnabled, allTransactionsLoaded, onAiUsed }: Args) {
  const today = iso(TODAY)
  const { transactions, categories } = state
  const pool = useMemo(() => suggestionPool({ transactions, categories }, today), [transactions, categories, today])

  // ── History for novelty and the burst baseline ────────────────────────────
  const loadedHistory = useMemo<HistoryRow[]>(() => {
    const catMap = catById(state.categories)
    return state.transactions
      .filter(t => t.transaction_type === 'expense' && !isSystemTx(t, catMap))
      .map(t => ({
        id: t.id, description: t.description, transaction_date: t.transaction_date,
        amount: t.amount, category_id: t.category_id, event_id: t.event_id,
      }))
  }, [state.transactions, state.categories])

  // Pool is newest-first, so its last row is the oldest the detector will judge.
  const poolStart = pool.length ? pool[pool.length - 1].transaction_date : today
  const historyFrom = shiftIso(poolStart, -NOVELTY_LOOKBACK_DAYS)
  const oldestLoaded = useMemo(
    () => state.transactions.reduce<string | null>((m, t) => (m === null || t.transaction_date < m ? t.transaction_date : m), null),
    [state.transactions])
  const loadedCovers = allTransactionsLoaded || (oldestLoaded !== null && oldestLoaded <= historyFrom)

  const [fetched, setFetched] = useState<{ from: string; rows: HistoryRow[] } | null>(null)
  const fetchedFor = useRef<string | null>(null)
  const fetchedCovers = fetched !== null && fetched.from <= historyFrom
  const needsFetch = pool.length >= 2 && !loadedCovers && !fetchedCovers

  useEffect(() => {
    if (!needsFetch) return
    // One fetch per range, not per render — and no cancelled flag: under
    // StrictMode the second run returns here, so the first run's result must land.
    if (fetchedFor.current !== null && fetchedFor.current <= historyFrom) return
    fetchedFor.current = historyFrom
    fetchNoveltyHistory(userId, historyFrom, oldestLoaded ?? today)
      .then(rows => setFetched({ from: historyFrom, rows }))
      // A failed fetch degrades to the loaded rows: novelty is judged on less
      // history, and the burst baseline goes unknown, so no burst fires.
      .catch(err => { console.error('[events] novelty history fetch failed', err); setFetched({ from: historyFrom, rows: [] }) })
  }, [needsFetch, historyFrom, userId, oldestLoaded, today])

  const ready = pool.length < 2 || loadedCovers || fetchedCovers

  const history = useMemo<HistoryRow[]>(() => {
    if (!fetched?.rows.length) return loadedHistory
    const catMap = catById(state.categories)
    const byId = new Map(loadedHistory.map(r => [r.id, r]))
    for (const r of fetched.rows) {
      if (byId.has(r.id)) continue
      // Fetched rows are already type 'expense'; the only system rows left are
      // legacy adjustments filed under the Adjustment group.
      if (catMap[r.category_id ?? '']?.group_name === ADJUSTMENT_GROUP) continue
      byId.set(r.id, r)
    }
    return [...byId.values()]
  }, [loadedHistory, fetched, state.categories])

  // ── Detection ─────────────────────────────────────────────────────────────
  const detection = useMemo(() => ready
    ? detectEventSignals({
        pool, history,
        categories: state.categories,
        masters: state.masters ?? [],
        events: state.events,
      })
    : null,
  [ready, pool, history, state.categories, state.masters, state.events])

  const signalKey = detection && hasEventSignal(detection)
    ? suggestionFingerprint(signalRows(detection))
    : null

  // ── AI ────────────────────────────────────────────────────────────────────
  const [aiEntry, setAiEntry] = useState<CachedEventSuggestion | null>(() => readCache(userId))
  const [failedKeys, setFailedKeys] = useState<Set<string>>(() => new Set())
  const attempted = useRef(new Set<string>())
  // Read inside the effect without re-running it: only the signal changing
  // should ever cause an AI call.
  const latest = useRef({ pool, state, onAiUsed })
  // Declared before the AI effect, so it has run by the time that one reads it.
  useEffect(() => { latest.current = { pool, state, onAiUsed } })

  useEffect(() => {
    if (!autopilotEnabled || !signalKey) return
    if (aiEntry?.fingerprint === signalKey) return
    if (attempted.current.has(signalKey)) return
    attempted.current.add(signalKey)

    const { pool: sent, state: s, onAiUsed: report } = latest.current
    const catMap = catById(s.categories)
    const rows = sent.map((t, i) => ({
      i,
      d: (t.description ?? '').slice(0, 60),
      c: catMap[t.category_id ?? '']?.name ?? '',
      a: Math.round(spendAmount(t)),
      dt: t.transaction_date,
    }))
    const eventNames = s.events.filter(e => e.status !== 'archived').map(e => e.name)

    detectLifeEventWithAI(rows, eventNames, EVENT_ICON_KEYS, report).then(raw => {
      // Failure or quota: fall back to the local suggestion, and don't cache —
      // it isn't an answer, and the next signal change may succeed.
      if (!raw) { setFailedKeys(prev => new Set(prev).add(signalKey)); return }
      const v = validateAiResult(raw, sent)
      const entry: CachedEventSuggestion = {
        version: CACHE_VERSION,
        fingerprint: signalKey,
        result: v ? { name: v.name, icon: v.icon, txIds: v.transactions.map(t => t.id) } : null,
      }
      writeCache(userId, entry)
      setAiEntry(entry)
    })
  }, [autopilotEnabled, signalKey, aiEntry, userId])

  // ── Dismissal ─────────────────────────────────────────────────────────────
  const [dismissed, setDismissed] = useState<Set<string>>(() => readIdSet(dismissedKey(userId)))
  const lastDismissed = useRef<string[]>([])

  // ── Result ────────────────────────────────────────────────────────────────
  const suggestion = useMemo<EventSuggestion | null>(() => {
    if (!detection) return null
    let s: EventSuggestion | null
    if (autopilotEnabled && signalKey) {
      if (aiEntry?.fingerprint === signalKey) {
        const r = aiEntry.result
        const byId = new Map(pool.map(t => [t.id, t]))
        // Rebuilt from current rows: a row tagged since the answer drops out.
        const txs = r ? r.txIds.map(id => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t) : []
        s = r && txs.length >= 2
          ? buildSuggestion('ai', r.name, isEventIconKey(r.icon) ? r.icon : DEFAULT_EVENT_ICON, txs, state.categories, state.events)
          : null
      } else if (failedKeys.has(signalKey)) {
        s = detection.local
      } else {
        s = null // AI pending — show nothing rather than flash the local card
      }
    } else {
      s = detection.local
    }
    return s && !isSuppressed(s, dismissed) ? s : null
  }, [detection, autopilotEnabled, signalKey, aiEntry, failedKeys, pool, state.categories, state.events, dismissed])

  const dismiss = useCallback(() => {
    if (!suggestion) return
    lastDismissed.current = suggestion.txIds
    // Pruned to rows still in the pool: a tagged or aged-out row can never be
    // suggested again, so remembering it is only storage growth.
    const poolIds = new Set(pool.map(t => t.id))
    const next = new Set([...dismissed].filter(id => poolIds.has(id)))
    for (const id of suggestion.txIds) next.add(id)
    writeIdSet(dismissedKey(userId), next)
    setDismissed(next)
  }, [suggestion, pool, dismissed, userId])

  const undoDismiss = useCallback(() => {
    const ids = new Set(lastDismissed.current)
    if (ids.size === 0) return
    lastDismissed.current = []
    const next = new Set([...dismissed].filter(id => !ids.has(id)))
    writeIdSet(dismissedKey(userId), next)
    setDismissed(next)
  }, [dismissed, userId])

  // ── Toast: once per suggestion ────────────────────────────────────────────
  const [toastSeen, setToastSeen] = useState<Set<string>>(() => readIdSet(toastSeenKey(userId)))
  const shouldToast = !!suggestion && !isSuppressed(suggestion, toastSeen)

  /** Called when the toast finishes (landed in the bell, closed, or acted on) —
   *  not when it starts, so a reload mid-toast shows it again rather than never. */
  const markToastSeen = useCallback(() => {
    if (!suggestion) return
    const poolIds = new Set(pool.map(t => t.id))
    const next = new Set([...toastSeen].filter(id => poolIds.has(id)))
    for (const id of suggestion.txIds) next.add(id)
    writeIdSet(toastSeenKey(userId), next)
    setToastSeen(next)
  }, [suggestion, pool, toastSeen, userId])

  return { suggestion, dismiss, undoDismiss, shouldToast, markToastSeen }
}
