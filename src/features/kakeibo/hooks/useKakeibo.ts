import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { localIso } from '@/lib/utils'
import { getIncomePattern } from '@/lib/income-pattern'
import type { FinancialCycle } from '@/lib/financial-cycle'
import type { AppState, KakeiboReflection } from '@/types'
import {
  isEligible, planCycleSync, dashboardActions, reviewableRecords, previousRecord, currentRecord,
  nextReviewState, type DashboardActions, type ReviewAction,
} from '../lib/kakeibo'

/** Enough history for the Analytics list and the previous-cycle comparison. */
const HISTORY_LIMIT = 13
/** One retry after a 'stale' answer or an error, then give up for the session. */
const MAX_SYNC_ATTEMPTS = 2

export type KakeiboStatus = 'off' | 'loading' | 'ready' | 'unavailable'

export interface Kakeibo {
  status: KakeiboStatus
  /** Monthly pattern — the Analytics tab exists (it explains itself when the
   *  cycle isn't salary-anchored yet). */
  monthly: boolean
  cycle: FinancialCycle | null
  records: KakeiboReflection[]
  current: KakeiboReflection | null
  previous: KakeiboReflection | null
  reviewable: KakeiboReflection[]
  actions: DashboardActions
  setGoal: (r: KakeiboReflection, amount: number | null) => Promise<void>
  review: (r: KakeiboReflection, action: ReviewAction) => Promise<void>
}

const NO_ACTIONS: DashboardActions = { review: null, goal: null, lesson: null }

/** Kakeibo's whole client state, isolated from useSupabaseData: its own table,
 *  its own queries, its own failure mode. Any error → 'unavailable' and every
 *  Kakeibo surface renders nothing; nothing else in the app depends on this. */
export function useKakeibo(args: {
  userId: string
  state: AppState
  cycle: FinancialCycle | undefined
  loading: boolean
  usingSupabase: boolean
}): Kakeibo {
  const { userId, state, cycle, loading, usingSupabase } = args
  const eligible = usingSupabase && isEligible(state, cycle, loading)
  const monthly = usingSupabase && !loading && getIncomePattern(state.settings) === 'monthly'

  const [records, setRecords] = useState<KakeiboReflection[] | null>(null)
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

  // Load once per user, and only for eligible users — an ineligible user makes
  // no Kakeibo request at all.
  useEffect(() => {
    if (!eligible || loadedFor.current === userId) return
    loadedFor.current = userId
    setRecords(null)
    setFailed(false)
    fetchRecords()
      .then(setRecords)
      .catch(err => { console.error('Kakeibo: failed to load reflections', err); setFailed(true) })
  }, [eligible, userId, fetchRecords])

  // ── Cycle sync: plan (pure) → mp_kakeibo_apply_sync (atomic) → refetch ──────
  const syncing = useRef(false)
  const attempts = useRef<{ key: string; n: number }>({ key: '', n: 0 })
  useEffect(() => {
    if (!eligible || !cycle || records == null || failed || syncing.current) return
    const plan = planCycleSync(records, cycle)
    if (!plan) return
    const key = localIso(cycle.cycleStart)
    if (attempts.current.key !== key) attempts.current = { key, n: 0 }
    if (attempts.current.n >= MAX_SYNC_ATTEMPTS) { setFailed(true); return }
    attempts.current.n++

    syncing.current = true
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('mp_kakeibo_apply_sync', { p_plan: plan })
        if (error) throw error
        if (data !== 'applied') console.warn('Kakeibo: sync plan was stale, re-reading')
      } catch (err) {
        console.error('Kakeibo: cycle sync failed', err)
      }
      // Always re-read: the effect re-plans from the truth (once more at most).
      let fresh: KakeiboReflection[] | null = null
      try { fresh = await fetchRecords() } catch { /* handled below */ }
      syncing.current = false
      if (fresh) setRecords(fresh)
      else setFailed(true)
    })()
  }, [eligible, cycle, records, failed, fetchRecords])

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
    setRecords(prev => (prev ?? []).map(x => (x.id === row.id ? row : x)))
  }, [userId])

  const setGoal = useCallback((r: KakeiboReflection, amount: number | null) =>
    patch(r, { savings_goal: amount, goal_decided_at: new Date().toISOString() }), [patch])

  const review = useCallback((r: KakeiboReflection, action: ReviewAction) =>
    patch(r, nextReviewState(r, action, new Date().toISOString())), [patch])

  return useMemo<Kakeibo>(() => {
    const base = { monthly, setGoal, review }
    if (!eligible || !cycle) {
      return { ...base, status: 'off', cycle: cycle ?? null, records: [], current: null, previous: null, reviewable: [], actions: NO_ACTIONS }
    }
    if (failed) {
      return { ...base, status: 'unavailable', cycle, records: [], current: null, previous: null, reviewable: [], actions: NO_ACTIONS }
    }
    if (records == null) {
      return { ...base, status: 'loading', cycle, records: [], current: null, previous: null, reviewable: [], actions: NO_ACTIONS }
    }
    return {
      ...base,
      status: 'ready',
      cycle,
      records,
      current: currentRecord(records, cycle),
      previous: previousRecord(records, cycle),
      reviewable: reviewableRecords(records, cycle),
      actions: dashboardActions(records, cycle),
    }
  }, [monthly, setGoal, review, eligible, cycle, failed, records])
}
