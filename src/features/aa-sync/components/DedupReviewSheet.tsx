import { useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import { delta } from '@/hooks/useSupabaseData'
import { BottomSheet } from '@/components/BottomSheet'
import { INCOME_GROUP, TRANSFER_GROUP } from '@/lib/constants'
import type { SyncEvent } from '../types'
import type { Category } from '@/types'

interface ReviewContext {
  confidence: number
  explanation: string[]
  candidate_transaction_id: string | null
  suggested_category_id: string | null
  amount: number
  date: string
  description: string | null
  direction: 'income' | 'expense'
  account_id: string
}

interface CandidateTransaction {
  id: string
  description: string
  amount: number
  transaction_date: string
  category: { name: string } | null
}

interface Props {
  open: boolean
  onClose: () => void
  userId: string
  categories: Category[]
  onResolved: () => void // refetch accounts/transactions after a merge or insert
}

// Every transaction-type sync_event lands here now, not just medium-
// confidence dedup matches (see the "review-everything" plan) — this is the
// one place an incoming bank transaction actually becomes a real
// transaction, an ignored no-op, or a merge into something already logged.
// mp_finalize_sync_event's insert/merge_into/skip outcomes only ever fire
// from this sheet's explicit button presses now, never automatically.
export function DedupReviewSheet({ open, onClose, userId, categories, onResolved }: Props) {
  const c = useTheme()
  const [rows, setRows] = useState<SyncEvent[]>([])
  const [candidates, setCandidates] = useState<Map<string, CandidateTransaction>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({})
  const [editingCategoryFor, setEditingCategoryFor] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  async function fetchRows() {
    setLoading(true)
    const { data, error } = await supabase
      .from('sync_events')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'needs_review')
      .order('fetched_at', { ascending: true })

    const events = (data as SyncEvent[]) ?? []
    setRows(error ? [] : events)

    const candidateIds = events
      .map(e => (e.review_context as unknown as ReviewContext | null)?.candidate_transaction_id)
      .filter((id): id is string => !!id)

    if (candidateIds.length > 0) {
      const { data: txns } = await supabase
        .from('transactions')
        .select('id, description, amount, transaction_date, category:categories(name)')
        .in('id', candidateIds)
      setCandidates(new Map((txns as unknown as CandidateTransaction[] ?? []).map(t => [t.id, t])))
    } else {
      setCandidates(new Map())
    }
    setLoading(false)
  }

  useEffect(() => {
    if (open) fetchRows()
  }, [open, userId])

  function categoryPool(direction: 'income' | 'expense') {
    return direction === 'income'
      ? categories.filter(cat => cat.group_name === INCOME_GROUP)
      : categories.filter(cat => cat.group_name !== INCOME_GROUP && cat.group_name !== TRANSFER_GROUP)
  }

  async function confirmMerge(event: SyncEvent, ctx: ReviewContext) {
    if (!ctx.candidate_transaction_id) return
    setBusyId(event.id)
    setError(null)
    try {
      const { error } = await supabase.rpc('mp_finalize_sync_event', {
        p_sync_event_id: event.id,
        p_outcome: 'merge_into',
        p_processor: 'client',
        p_merge_transaction_id: ctx.candidate_transaction_id,
        p_review_reason: 'user_confirmed_merge',
        p_review_context: ctx,
      })
      if (error) throw error
      setRows(prev => prev.filter(r => r.id !== event.id))
      onResolved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm match')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmInsert(event: SyncEvent, ctx: ReviewContext) {
    setBusyId(event.id)
    setError(null)
    try {
      const categoryId = categoryOverrides[event.id] ?? ctx.suggested_category_id ?? null
      const { error } = await supabase.rpc('mp_finalize_sync_event', {
        p_sync_event_id: event.id,
        p_outcome: 'insert',
        p_processor: 'client',
        p_transaction: {
          account_id: ctx.account_id,
          transaction_date: ctx.date,
          description: ctx.description ?? '',
          amount: ctx.amount,
          transaction_type: ctx.direction,
          category_id: categoryId,
          account_delta: delta(ctx.direction, ctx.amount),
        },
        p_review_reason: 'user_confirmed_separate',
        p_review_context: ctx,
      })
      if (error) throw error
      setRows(prev => prev.filter(r => r.id !== event.id))
      onResolved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add transaction')
    } finally {
      setBusyId(null)
    }
  }

  // Reuses mp_finalize_sync_event's 'skip' outcome — already the right
  // shape (claim the event, touch nothing in transactions/accounts), until
  // now only ever reached automatically for balance/profile events. A user
  // tapping "Ignore" is a distinct decision from "it's a duplicate": they
  // simply don't want this bank transaction in MoneyPlant at all.
  async function confirmIgnore(event: SyncEvent, ctx: ReviewContext) {
    setBusyId(event.id)
    setError(null)
    try {
      const { error } = await supabase.rpc('mp_finalize_sync_event', {
        p_sync_event_id: event.id,
        p_outcome: 'skip',
        p_processor: 'client',
        p_review_reason: 'user_ignored',
        p_review_context: ctx,
      })
      if (error) throw error
      setRows(prev => prev.filter(r => r.id !== event.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not ignore transaction')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Review Bank Transactions</div>
        <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginBottom: 20 }}>
          Add each one, merge it with something you already logged, or ignore it.
        </div>

        {loading && rows.length === 0 && (
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, textAlign: 'center', padding: '16px 0' }}>Loading…</div>
        )}

        {!loading && rows.length === 0 && (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, textAlign: 'center', padding: '16px 0' }}>
            Nothing waiting on review.
          </div>
        )}

        {error && (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: '#ef4444', marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(event => {
            const ctx = event.review_context as unknown as ReviewContext | null
            if (!ctx) return null
            const candidate = ctx.candidate_transaction_id ? candidates.get(ctx.candidate_transaction_id) : null
            const isBusy = busyId === event.id
            const pool = categoryPool(ctx.direction)
            const selectedCategoryId = categoryOverrides[event.id] ?? ctx.suggested_category_id ?? ''
            const suggestedCategory = pool.find(cat => cat.id === (ctx.suggested_category_id ?? undefined))
            const isEditingCategory = editingCategoryFor.has(event.id) || !suggestedCategory

            return (
              <div key={event.id} style={{ padding: '12px 14px', borderRadius: 14, border: `1.5px solid ${c.faint}`, background: c.surface2 }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Synced</div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ctx.description || '(no description)'}
                    </div>
                    <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>₹{ctx.amount} · {ctx.date}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Already logged</div>
                    {candidate ? (
                      <>
                        <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {candidate.description || '(no description)'}
                        </div>
                        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>
                          ₹{candidate.amount} · {candidate.transaction_date}{candidate.category ? ` · ${candidate.category.name}` : ''}
                        </div>
                      </>
                    ) : (
                      <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>No similar transaction found</div>
                    )}
                  </div>
                </div>

                {ctx.explanation?.length > 0 && (
                  <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginBottom: 10, lineHeight: 1.5 }}>
                    {ctx.explanation.join(' · ')}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button
                    onClick={() => confirmMerge(event, ctx)}
                    disabled={isBusy || !candidate}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 10,
                      border: candidate ? 'none' : `1.5px solid ${c.faint}`,
                      background: candidate ? c.accent : 'transparent',
                      color: candidate ? '#fff' : c.muted,
                      font: '700 13px Plus Jakarta Sans',
                      cursor: isBusy || !candidate ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.7 : 1,
                    }}
                  >
                    Merge with existing
                  </button>
                  <button
                    onClick={() => confirmInsert(event, ctx)}
                    disabled={isBusy}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 10,
                      border: candidate ? `1.5px solid ${c.faint}` : 'none',
                      background: candidate ? 'transparent' : c.accent,
                      color: candidate ? c.muted : '#fff',
                      font: '700 13px Plus Jakarta Sans',
                      cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.7 : 1,
                    }}
                  >
                    Add transaction
                  </button>
                </div>

                {isEditingCategory ? (
                  <select
                    value={selectedCategoryId}
                    onChange={e => setCategoryOverrides(prev => ({ ...prev, [event.id]: e.target.value }))}
                    disabled={isBusy}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 10,
                      border: `1.5px solid ${c.faint}`, background: c.surface,
                      font: '600 12px Plus Jakarta Sans', color: c.ink,
                    }}
                  >
                    <option value="">Uncategorized</option>
                    {pool.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>
                      Suggested: <span style={{ color: c.ink }}>{suggestedCategory!.name}</span>
                    </span>
                    <button
                      onClick={() => setEditingCategoryFor(prev => new Set(prev).add(event.id))}
                      disabled={isBusy}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        font: '700 12px Plus Jakarta Sans', color: c.accent,
                        cursor: isBusy ? 'not-allowed' : 'pointer', textDecoration: 'underline',
                      }}
                    >
                      Change
                    </button>
                  </div>
                )}

                <button
                  onClick={() => confirmIgnore(event, ctx)}
                  disabled={isBusy}
                  style={{
                    width: '100%', marginTop: 8, padding: '8px', borderRadius: 10, border: 'none',
                    background: 'transparent', color: c.muted, font: '600 12px Plus Jakarta Sans',
                    cursor: isBusy ? 'not-allowed' : 'pointer', textDecoration: 'underline',
                  }}
                >
                  Ignore
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}
