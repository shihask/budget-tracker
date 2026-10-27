import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { monthBounds, monthKey } from '../lib/budget'
import { HouseholdConflictError } from '../lib/errors'
import type {
  Household, HouseholdBudget, HouseholdCategory, HouseholdEntryInput, HouseholdEntryType,
  HouseholdInvite, HouseholdMe, HouseholdMember, HouseholdTransaction, InvitePreview,
} from '../types'

// Household's own queries — never through useSupabaseData, and never touching a
// personal table. Every select lists its columns: household_members.user_id and
// household_invites.token_hash are not granted to clients, so `*` would fail.
const HOUSEHOLD_COLS = 'id, name, status, created_at'
const MEMBER_COLS = 'id, household_id, role, display_name, status, joined_at, left_at'
const INVITE_COLS = 'id, household_id, status, created_by_member_id, accepted_by_member_id, created_at, expires_at, accepted_at, revoked_at'
const CATEGORY_COLS = 'id, household_id, name, kind, icon, is_archived'
const TXN_COLS = 'id, household_id, type, amount, category_id, description, txn_date, paid_by_member_id, created_by_member_id, updated_by_member_id, created_at, updated_at'
const BUDGET_COLS = 'id, household_id, category_id, monthly_limit, updated_at'

export interface HouseholdData {
  household: Household
  members: HouseholdMember[]
  invites: HouseholdInvite[]
  categories: HouseholdCategory[]
  budgets: HouseholdBudget[]
  transactions: HouseholdTransaction[]
  /** When this snapshot was read: the "now" for invite-expiry checks, so rendering stays pure. */
  loadedAt: number
}

export type HouseholdLoad =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'none' }                                  // signed in, not in a household
  | { status: 'ready'; me: HouseholdMe; data: HouseholdData }

const num = (v: unknown) => Number(v)

export function useHousehold({ enabled }: { enabled: boolean }) {
  const [load, setLoad] = useState<HouseholdLoad>({ status: 'loading' })
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const requestId = useRef(0)

  const fetchAll = useCallback(async (forMonth: string): Promise<HouseholdLoad> => {
    const { data: me, error: meError } = await supabase.rpc('mp_household_current')
    if (meError) throw meError
    if (!me) return { status: 'none' }
    const current = me as HouseholdMe
    const hid = current.household_id
    const { start, end } = monthBounds(forMonth)
    const [h, m, i, c, b, t] = await Promise.all([
      supabase.from('households').select(HOUSEHOLD_COLS).eq('id', hid).single(),
      supabase.from('household_members').select(MEMBER_COLS).eq('household_id', hid).order('joined_at'),
      supabase.from('household_invites').select(INVITE_COLS).eq('household_id', hid).order('created_at', { ascending: false }).limit(10),
      supabase.from('household_categories').select(CATEGORY_COLS).eq('household_id', hid).order('name'),
      supabase.from('household_budgets').select(BUDGET_COLS).eq('household_id', hid),
      supabase.from('household_transactions').select(TXN_COLS).eq('household_id', hid)
        .gte('txn_date', start).lt('txn_date', end)
        .order('txn_date', { ascending: false }).order('created_at', { ascending: false }),
    ])
    for (const r of [h, m, i, c, b, t]) if (r.error) throw r.error
    return {
      status: 'ready',
      me: current,
      data: {
        household: h.data as Household,
        members: (m.data ?? []) as HouseholdMember[],
        invites: (i.data ?? []) as HouseholdInvite[],
        categories: (c.data ?? []) as HouseholdCategory[],
        budgets: ((b.data ?? []) as HouseholdBudget[]).map(x => ({ ...x, monthly_limit: num(x.monthly_limit) })),
        transactions: ((t.data ?? []) as HouseholdTransaction[]).map(x => ({ ...x, amount: num(x.amount) })),
        loadedAt: Date.now(),
      },
    }
  }, [])

  /** Re-reads everything. Only the newest request's answer is applied. */
  const reload = useCallback(async (opts: { quiet?: boolean } = {}) => {
    const id = ++requestId.current
    if (!opts.quiet) setLoad(prev => prev.status === 'ready' ? prev : { status: 'loading' })
    try {
      const next = await fetchAll(month)
      if (id === requestId.current) setLoad(next)
    } catch (error) {
      if (id !== requestId.current) return
      // Log the code only: a request may carry an invite token.
      console.warn('Household: load failed', (error as { code?: string })?.code ?? 'unknown')
      setLoad(prev => opts.quiet && prev.status === 'ready' ? prev : { status: 'error', error })
    }
  }, [fetchAll, month])

  // Runs on open and whenever the month changes (reload is rebuilt per month).
  useEffect(() => {
    if (!enabled) return
    void reload()
  }, [enabled, reload])

  // A partner's changes show up when you come back to the app.
  useEffect(() => {
    if (!enabled) return
    const onFocus = () => { if (document.visibilityState === 'visible') void reload({ quiet: true }) }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, reload])

  const call = useCallback(async <T,>(fn: () => PromiseLike<{ data: T; error: unknown }>): Promise<T> => {
    const { data, error } = await fn()
    if (error) throw error
    return data
  }, [])

  const householdId = load.status === 'ready' ? load.me.household_id : null

  // ── Membership ──────────────────────────────────────────────────────────────
  const createHousehold = useCallback(async (name: string, displayName: string) => {
    await call(() => supabase.rpc('mp_household_create', { p_name: name, p_display_name: displayName }))
    await reload()
  }, [call, reload])

  const renameHousehold = useCallback(async (name: string) => {
    if (!householdId) return
    await call(() => supabase.rpc('mp_household_rename', { p_household_id: householdId, p_name: name }))
    await reload({ quiet: true })
  }, [call, householdId, reload])

  /** The raw token comes back once; it is never readable again. */
  const createInvite = useCallback(async (): Promise<{ token: string; expiresAt: string }> => {
    if (!householdId) throw new Error('No household')
    const r = await call(() => supabase.rpc('mp_household_create_invite', { p_household_id: householdId })) as
      { token: string; expires_at: string }
    await reload({ quiet: true })
    return { token: r.token, expiresAt: r.expires_at }
  }, [call, householdId, reload])

  const revokeInvite = useCallback(async (inviteId: string) => {
    await call(() => supabase.rpc('mp_household_revoke_invite', { p_invite_id: inviteId }))
    await reload({ quiet: true })
  }, [call, reload])

  const previewInvite = useCallback(async (token: string): Promise<InvitePreview> =>
    await call(() => supabase.rpc('mp_household_preview_invite', { p_token: token })) as InvitePreview, [call])

  const acceptInvite = useCallback(async (token: string, displayName: string) => {
    await call(() => supabase.rpc('mp_household_accept_invite', { p_token: token, p_display_name: displayName }))
    // Tell the partner (push + email). Fire-and-forget: joining never waits on it,
    // and the function sends at most once per membership however often it's called.
    supabase.functions.invoke('household-member-joined', { body: {} })
      .then(({ error }) => { if (error) console.warn('Household: join notice not sent') })
      .catch(() => { /* offline: the bell still shows it to the partner */ })
    await reload()
  }, [call, reload])

  const leaveHousehold = useCallback(async () => {
    if (!householdId) return
    await call(() => supabase.rpc('mp_household_leave', { p_household_id: householdId }))
    await reload()
  }, [call, householdId, reload])

  const removeMember = useCallback(async (memberId: string) => {
    await call(() => supabase.rpc('mp_household_remove_member', { p_member_id: memberId }))
    await reload({ quiet: true })
  }, [call, reload])

  // ── Shared entries ─────────────────────────────────────────────────────────
  // created_by / updated_by are stamped by the server trigger, so they're never sent.
  const addEntry = useCallback(async (input: HouseholdEntryInput) => {
    if (!householdId) return
    await call(() => supabase.from('household_transactions').insert({ household_id: householdId, ...input }))
    await reload({ quiet: true })
  }, [call, householdId, reload])

  /** Optimistic check on updated_at: a partner's edit or delete in between is a conflict, not an overwrite. */
  const updateEntry = useCallback(async (id: string, input: HouseholdEntryInput, expectedUpdatedAt: string) => {
    const rows = await call(() => supabase.from('household_transactions').update(input)
      .eq('id', id).eq('updated_at', expectedUpdatedAt).select('id')) as { id: string }[] | null
    await reload({ quiet: true })
    if (!rows || rows.length === 0) throw new HouseholdConflictError()
  }, [call, reload])

  const deleteEntry = useCallback(async (id: string) => {
    await call(() => supabase.from('household_transactions').delete().eq('id', id))
    await reload({ quiet: true })
  }, [call, reload])

  // ── Categories & budgets ───────────────────────────────────────────────────
  const addCategory = useCallback(async (name: string, kind: HouseholdEntryType): Promise<string> => {
    if (!householdId) throw new Error('No household')
    const row = await call(() => supabase.from('household_categories')
      .insert({ household_id: householdId, name, kind }).select('id').single()) as { id: string }
    await reload({ quiet: true })
    return row.id
  }, [call, householdId, reload])

  /** limit null removes the budget. categoryId null is the overall monthly budget. */
  const setBudget = useCallback(async (categoryId: string | null, limit: number | null, existingId: string | null) => {
    if (!householdId) return
    if (limit == null) {
      if (existingId) await call(() => supabase.from('household_budgets').delete().eq('id', existingId))
    } else if (existingId) {
      await call(() => supabase.from('household_budgets').update({ monthly_limit: limit }).eq('id', existingId))
    } else {
      await call(() => supabase.from('household_budgets').insert({ household_id: householdId, category_id: categoryId, monthly_limit: limit }))
    }
    await reload({ quiet: true })
  }, [call, householdId, reload])

  return {
    load, month, setMonth, reload,
    createHousehold, renameHousehold, createInvite, revokeInvite, previewInvite, acceptInvite,
    leaveHousehold, removeMember, addEntry, updateEntry, deleteEntry, addCategory, setBudget,
  }
}

export type HouseholdApi = ReturnType<typeof useHousehold>
