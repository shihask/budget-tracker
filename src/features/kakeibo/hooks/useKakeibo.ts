import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { localIso } from '@/lib/utils'
import type { FinancialCycle } from '@/lib/financial-cycle'
import type { AppState, KakeiboReflection } from '@/types'
import {
  planCycleSync, dashboardActions, reviewableRecords, previousRecord, currentRecord, nextReviewState,
  kakeiboStrategy, kakeiboCycle, kindOf, monthBounds,
  type DashboardActions, type ReviewAction, type KakeiboCycle, type KakeiboStrategy,
} from '../lib/kakeibo'

/** Enough history for the Analytics list and the previous-cycle comparison. */
const HISTORY_LIMIT = 13
/** One retry after a 'stale' answer or an error, then give up for the session. */
const MAX_SYNC_ATTEMPTS = 2

export type KakeiboStatus = 'off' | 'loading' | 'ready' | 'unavailable'

export interface Kakeibo {
  status: KakeiboStatus
  /** The Analytics tab exists — every income pattern (it explains itself while
   *  a Monthly user has no recorded salary yet). */
  available: boolean
  strategy: KakeiboStrategy
  cycle: KakeiboCycle | null
  /** Rows of the ACTIVE strategy — the only ones that drive sync and reminders. */
  records: KakeiboReflection[]
  /** Closed rows of the OTHER strategy that hold a goal, note or review — kept
   *  visible as history after an income-pattern change, never re-dated. */
  history: KakeiboReflection[]
  current: KakeiboReflection | null
  previous: KakeiboReflection | null
  reviewable: KakeiboReflection[]
  actions: DashboardActions
  setGoal: (r: KakeiboReflection, amount: number | null) => Promise<void>
  review: (r: KakeiboReflection, action: ReviewAction) => Promise<void>
  /** Dashboard "Not now": hides the reminder only — the review stays pending. */
  dismissReviewReminder: (r: KakeiboReflection) => Promise<void>
  /** Stores a completed cycle that has no row yet, so a note can be saved on it.
   *  Salary: engine-derived dates through mp_kakeibo_record_past_cycle (null on
   *  conflict). Month: mp_kakeibo_ensure_month (dates computed server-side). */
  recordPastCycle: (kind: KakeiboStrategy, start: string, end: string) => Promise<KakeiboReflection | null>
}

const NO_ACTIONS: DashboardActions = { review: null, goal: null, lesson: null }

const hasContent = (r: KakeiboReflection) =>
  r.savings_goal != null || !!r.reflection_note?.trim() || r.review_status != null

/** Kakeibo's whole client state, isolated from useSupabaseData: its own table,
 *  its own queries, its own failure mode. Any error → 'unavailable' and every
 *  Kakeibo surface renders nothing; nothing else in the app depends on this. */
export function useKakeibo(args: {
  userId: string
  state: AppState
  /** The financial-cycle engine's cycle (d.financialCycle) — read only. */
  cycle: FinancialCycle | undefined
  loading: boolean
  usingSupabase: boolean
}): Kakeibo {
  const { userId, state, cycle: engine, loading, usingSupabase } = args
  const todayIso = localIso(new Date())
  const strategy = kakeiboStrategy(state.settings)
  // Stable per calendar day (a fresh month cycle object every render would
  // re-run the sync effect on every render).
  const settings = state.settings
  const cycle = useMemo(
    () => (usingSupabase ? kakeiboCycle(settings, engine, loading, new Date(`${todayIso}T12:00:00`)) : null),
    [usingSupabase, settings, engine, loading, todayIso],
  )
  const eligible = cycle != null
  const available = usingSupabase && !loading

  const [allRecords, setAllRecords] = useState<KakeiboReflection[] | null>(null)
  const [failed, setFailed] = useState(false)
  const loadedFor = useRef<string | null>(null)

  const fetchRecords = useCallback(async (): Promise<KakeiboReflection[]> => {
    const { data, error } = await supabase
      .from('kakeibo_reflections')
      .select('*')
      .eq('user_id', userId)
      .order('cycle_start', { ascending: false })
      .limit(HISTORY_LIMIT)
    if (error) throw error
    return (data as KakeiboReflection[]) ?? []
  }, [userId])

  // Load once per user, and only once Kakeibo can run — no request otherwise.
  useEffect(() => {
    if (!eligible || loadedFor.current === userId) return
    loadedFor.current = userId
    setAllRecords(null)
    setFailed(false)
    fetchRecords()
      .then(setAllRecords)
      .catch(err => { console.error('Kakeibo: failed to load reflections', err); setFailed(true) })
  }, [eligible, userId, fetchRecords])

  const records = useMemo(() => (allRecords ?? []).filter(r => kindOf(r) === strategy), [allRecords, strategy])

  // ── Cycle sync ──────────────────────────────────────────────────────────────
  // salary: plan (pure) → mp_kakeibo_apply_sync (atomic) → re-read.
  // month:  make sure this month's row exists (mp_kakeibo_ensure_month, idempotent) → re-read.
  const syncing = useRef(false)
  const attempts = useRef<{ key: string; n: number }>({ key: '', n: 0 })
  useEffect(() => {
    if (!cycle || allRecords == null || failed || syncing.current) return
    const key = `${cycle.kind}:${localIso(cycle.cycleStart)}`
    let call: (() => PromiseLike<{ data: unknown; error: unknown }>) | null = null
    if (cycle.kind === 'salary') {
      const plan = planCycleSync(records, cycle)
      if (plan) call = () => supabase.rpc('mp_kakeibo_apply_sync', { p_plan: plan })
    } else if (!currentRecord(records, cycle)) {
      call = () => supabase.rpc('mp_kakeibo_ensure_month', { p_month_start: localIso(cycle.cycleStart) })
    }
    if (!call) return
    if (attempts.current.key !== key) attempts.current = { key, n: 0 }
    if (attempts.current.n >= MAX_SYNC_ATTEMPTS) { setFailed(true); return }
    attempts.current.n++

    syncing.current = true
    const run = call
    void (async () => {
      try {
        const { data, error } = await run()
        if (error) throw error
        if (data === 'stale') console.warn('Kakeibo: sync plan was stale, re-reading')
      } catch (err) {
        console.error('Kakeibo: cycle sync failed', err)
      }
      // Always re-read: the effect re-plans from the truth (once more at most).
      let fresh: KakeiboReflection[] | null = null
      try { fresh = await fetchRecords() } catch { /* handled below */ }
      syncing.current = false
      if (fresh) setAllRecords(fresh)
      else setFailed(true)
    })()
  }, [cycle, allRecords, records, failed, fetchRecords])

  // ── Mutations: column-scoped updates, RLS-guarded ────────────────────────────
  const patch = useCallback(async (r: KakeiboReflection, cols: Partial<KakeiboReflection>) => {
    if (Object.keys(cols).length === 0) return
    const { data, error } = await supabase
      .from('kakeibo_reflections')
      .update(cols)
      .eq('id', r.id)
      .eq('user_id', userId)
      .select()
      .single()
    if (error) throw error
    const row = data as KakeiboReflection
    setAllRecords(prev => (prev ?? []).map(x => (x.id === row.id ? row : x)))
  }, [userId])

  const setGoal = useCallback((r: KakeiboReflection, amount: number | null) =>
    patch(r, { savings_goal: amount, goal_decided_at: new Date().toISOString() }), [patch])

  const review = useCallback((r: KakeiboReflection, action: ReviewAction) =>
    patch(r, nextReviewState(r, action, new Date().toISOString())), [patch])

  const dismissReviewReminder = useCallback((r: KakeiboReflection) =>
    patch(r, r.review_reminder_dismissed_at ? {} : { review_reminder_dismissed_at: new Date().toISOString() }), [patch])

  const recordPastCycle = useCallback(async (kind: KakeiboStrategy, start: string, end: string): Promise<KakeiboReflection | null> => {
    const { data, error } = kind === 'month'
      ? await supabase.rpc('mp_kakeibo_ensure_month', { p_month_start: monthBounds(start).start })
      : await supabase.rpc('mp_kakeibo_record_past_cycle', { p_start: start, p_end: end })
    if (error) throw error
    if (data === 'conflict') return null
    const fresh = await fetchRecords()
    setAllRecords(fresh)
    // HISTORY_LIMIT is newest-first; an old cycle may fall outside it, so read it directly.
    const hit = fresh.find(r => r.cycle_start === start && kindOf(r) === kind)
    if (hit) return hit
    const { data: row, error: e2 } = await supabase.from('kakeibo_reflections').select('*')
      .eq('user_id', userId).eq('cycle_kind', kind).eq('cycle_start', start).single()
    if (e2) throw e2
    setAllRecords(prev => [...(prev ?? []), row as KakeiboReflection])
    return row as KakeiboReflection
  }, [fetchRecords, userId])

  return useMemo<Kakeibo>(() => {
    const base = { available, strategy, setGoal, review, dismissReviewReminder, recordPastCycle }
    const empty = { records: [], history: [], current: null, previous: null, reviewable: [], actions: NO_ACTIONS }
    if (!cycle) return { ...base, ...empty, status: 'off', cycle: null }
    if (failed) return { ...base, ...empty, status: 'unavailable', cycle }
    if (allRecords == null) return { ...base, ...empty, status: 'loading', cycle }
    return {
      ...base,
      status: 'ready',
      cycle,
      records,
      history: allRecords.filter(r => kindOf(r) !== strategy && r.cycle_end != null && hasContent(r)),
      current: currentRecord(records, cycle),
      previous: previousRecord(records, cycle),
      reviewable: reviewableRecords(records, cycle),
      actions: dashboardActions(records, cycle, new Date(), cycle.kind),
    }
  }, [available, strategy, setGoal, review, dismissReviewReminder, recordPastCycle, cycle, failed, allRecords, records])
}
