import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt, fmtDate, iso, TODAY, addDays } from '@/lib/utils'
import { BottomSheet } from '@/components/BottomSheet'
import { isSystemTx, catById } from '@/lib/data'
import { EventIcon } from '../lib/eventIcons'
import type { AppState, LifeEvent } from '@/types'

/** How far back to offer when the event has no start date. Long enough to cover
 *  the run-up to a wedding, short enough that the list stays scannable. */
const LOOKBACK_DAYS = 30

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  event: LifeEvent | null
  onLink: (ids: string[], eventId: string) => Promise<void>
}

export function LinkExpensesSheet({ open, onClose, state, event, onLink }: Props) {
  const c = useTheme()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setSelected(new Set()) }, [open, event?.id])

  const catMap = useMemo(() => catById(state.categories), [state.categories])
  const acctById = useMemo(() => Object.fromEntries([
    ...state.accounts.map(a => [a.id, a.name] as const),
    ...(state.credit_cards ?? []).map(cc => [cc.id, cc.name] as const),
  ]), [state.accounts, state.credit_cards])
  const eventById = useMemo(
    () => Object.fromEntries(state.events.map(e => [e.id, e] as const)),
    [state.events])

  const candidates = useMemo(() => {
    if (!event) return []
    const from = event.start_date || iso(addDays(TODAY, -LOOKBACK_DAYS))
    const to = event.end_date || iso(TODAY)
    return state.transactions
      .filter(t =>
        t.transaction_type === 'expense' &&
        t.transaction_date >= from && t.transaction_date <= to &&
        !isSystemTx(t, catMap) &&
        // Legs of one split payment must not be individually taggable — same
        // reasoning as the daily-challenge exclusion toast.
        !t.split_group_id)
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
  }, [state.transactions, event, catMap])

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const selectedTotal = candidates
    .filter(t => selected.has(t.id))
    .reduce((s, t) => s + t.amount, 0)

  const handleLink = async () => {
    if (!event || selected.size === 0 || saving) return
    setSaving(true)
    try {
      await onLink([...selected], event.id)
      onClose()
    } catch (e) {
      console.error('Failed to link expenses to event', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
          Link recent expenses
        </div>
        <div style={{ font: '600 12.5px Plus Jakarta Sans', color: c.muted, marginBottom: 18, lineHeight: 1.5 }}>
          {event ? <>Money you already spent on <strong style={{ color: c.ink }}>{event.name}</strong>. Tick what belongs — you can do this again later.</> : null}
        </div>

        {candidates.length === 0 ? (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '20px 0', textAlign: 'center' }}>
            No expenses in this date range yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '48svh', overflowY: 'auto', margin: '0 -4px' }}>
            {candidates.map(t => {
              const otherEvent = t.event_id && t.event_id !== event?.id ? eventById[t.event_id] : null
              const isSelected = selected.has(t.id)
              const alreadyMine = t.event_id === event?.id
              const disabled = !!otherEvent || alreadyMine
              return (
                <div
                  key={t.id}
                  onClick={() => !disabled && toggle(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px',
                    borderRadius: 12, cursor: disabled ? 'default' : 'pointer',
                    background: isSelected ? c.accentSoft : 'transparent',
                    opacity: disabled ? 0.45 : 1,
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: `2px solid ${isSelected ? c.accent : c.faint}`,
                    background: isSelected ? c.accent : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '700 13.5px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.description}
                    </div>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[fmtDate(t.transaction_date), catMap[t.category_id ?? '']?.name, acctById[t.from_account_id ?? ''] ?? (t.credit_card_id ? acctById[t.credit_card_id] : undefined)]
                        .filter(Boolean).join(' · ')}
                      {alreadyMine && ' · already linked'}
                      {otherEvent && <> · <span style={{ display: 'inline-flex', verticalAlign: '-2px' }}><EventIcon name={otherEvent.icon} size={11} color="currentColor" /></span> {otherEvent.name}</>}
                    </div>
                  </div>
                  <div style={{ font: '700 13.5px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>{fmt(t.amount)}</div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.faint}`,
        }}>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted }}>
            {selected.size} selected
          </div>
          <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>{fmt(selectedTotal)}</div>
        </div>

        <button
          onClick={handleLink}
          disabled={selected.size === 0 || saving}
          style={{
            width: '100%', padding: '14px 0', marginTop: 14, borderRadius: 16, border: 'none',
            background: selected.size > 0 ? c.accent : c.faint, color: '#fff',
            font: '700 16px Plus Jakarta Sans',
            cursor: selected.size > 0 ? 'pointer' : 'default', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Linking…' : 'Link selected expenses'}
        </button>
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '12px 0', marginTop: 8, borderRadius: 16, border: 'none',
            background: 'transparent', color: c.muted, font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
          }}
        >
          Skip for now
        </button>
      </div>
    </BottomSheet>
  )
}
