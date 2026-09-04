import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt, fmtDate } from '@/lib/utils'
import { BottomSheet } from '@/components/BottomSheet'
import { isSystemTx, catById } from '@/lib/data'
import { groupSplitTransactions } from '@/lib/splitGroups'
import { reimbursedTotals, remainingReimbursable, resolveReimbursementTarget } from '@/lib/reimbursements'
import type { AppState, Transaction } from '@/types'

/** Pick the expense a payment repays.
 *
 *  Single-select sibling of LinkExpensesSheet. Two deliberate differences:
 *
 *  1. No date window. A deposit refunded a year later is a real case, so the list
 *     is unbounded and searchable instead of bounded and silent.
 *  2. Split payments appear ONCE, at their group total. A ₹300-Axis + ₹108-Cash
 *     gift is one ₹408 expense as far as the user is concerned; offering two
 *     unreimbursable legs would make the common case impossible.
 */

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  /** The reimbursement being linked, when editing an existing one — excluded from
   *  the remaining calculation so a row never fails against its own value. */
  editingId?: string | null
  /** Receives the anchor row id, already resolved. Callers never see the anchor rule. */
  onPick: (targetId: string, remaining: number) => void
}

export function LinkReimbursementSheet({ open, onClose, state, editingId, onPick }: Props) {
  const c = useTheme()
  const [query, setQuery] = useState('')

  useEffect(() => { if (open) setQuery('') }, [open])

  const catMap = useMemo(() => catById(state.categories), [state.categories])
  const acctById = useMemo(() => Object.fromEntries([
    ...state.accounts.map(a => [a.id, a.name] as const),
    ...(state.credit_cards ?? []).map(cc => [cc.id, cc.name] as const),
  ]), [state.accounts, state.credit_cards])

  const candidates = useMemo(() => {
    // The row being edited must not count against its own target's remaining,
    // mirroring the `id <> NEW.id` self-exclusion in mp_validate_reimbursement.
    const ledger = editingId ? state.transactions.filter(t => t.id !== editingId) : state.transactions
    const totals = reimbursedTotals(ledger)

    const eligible = ledger.filter(t =>
      (t.transaction_type === 'expense' || t.transaction_type === 'commitment') &&
      !isSystemTx(t, catMap) &&
      // No chains: a reimbursement cannot itself be reimbursed.
      !t.reimbursement_for)

    return groupSplitTransactions(eligible, ledger, { collapse: true })
      .map(g => ({
        group: g,
        remaining: remainingReimbursable(g.primary, ledger, totals),
      }))
      .filter(x => x.remaining > 0)
      .sort((a, b) => b.group.primary.transaction_date.localeCompare(a.group.primary.transaction_date))
  }, [state.transactions, catMap, editingId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter(({ group }) => {
      const cat = catMap[group.primary.category_id ?? '']?.name ?? ''
      return group.primary.description.toLowerCase().includes(q) || cat.toLowerCase().includes(q)
    })
  }, [candidates, query, catMap])

  const pick = (primary: Transaction, remaining: number) => {
    onPick(resolveReimbursementTarget(primary, state.transactions), remaining)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false} zIndex={340}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
          Which expense is this for?
        </div>
        <div style={{ font: '600 12.5px Plus Jakarta Sans', color: c.muted, marginBottom: 14, lineHeight: 1.5 }}>
          The money still lands in your account — it just stops counting as income and
          reduces what this expense really cost you.
        </div>

        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search expenses"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '11px 13px', marginBottom: 12,
            borderRadius: 12, border: `1.5px solid ${c.faint}`, background: c.surface2,
            color: c.ink, font: '600 14px Plus Jakarta Sans', outline: 'none',
          }}
        />

        {filtered.length === 0 ? (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '20px 0', textAlign: 'center' }}>
            {candidates.length === 0
              ? 'No expenses left to reimburse.'
              : 'Nothing matches that search.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '48svh', overflowY: 'auto', margin: '0 -4px' }}>
            {filtered.map(({ group, remaining }) => {
              const t = group.primary
              const gross = group.groupTotal
              const recovered = Math.max(0, gross - remaining)
              const acct = acctById[t.from_account_id ?? '']
                ?? (t.credit_card_id ? acctById[t.credit_card_id] : undefined)
              // With nothing recovered, `remaining` already IS the original —
              // printing both would be three ways of saying one number.
              const meta = recovered > 0
                ? [`Original ${fmt(gross)}`, `Reimbursed ${fmt(recovered)}`, fmtDate(t.transaction_date)]
                : [fmtDate(t.transaction_date), catMap[t.category_id ?? '']?.name, acct]
              return (
                <div
                  key={group.key}
                  onClick={() => pick(t, remaining)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px',
                    borderRadius: 12, cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '700 13.5px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.description}
                      {group.isSplit && (
                        <span style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, background: c.accentSoft, borderRadius: 999, padding: '2px 7px', marginLeft: 7 }}>
                          Split · {group.groupSize}
                        </span>
                      )}
                    </div>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {meta.filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {/* Remaining is the headline: you are here because you want to
                      know what is left, not what it originally cost. */}
                  <div style={{ font: '700 13.5px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>
                    {fmt(remaining)} left
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '12px 0', marginTop: 14, borderRadius: 16, border: 'none',
            background: 'transparent', color: c.muted, font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  )
}
