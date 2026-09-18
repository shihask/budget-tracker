import { useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt, fmtDate } from '@/lib/utils'
import { catById } from '@/lib/data'
import { BottomSheet } from '@/components/BottomSheet'
import { EventIcon } from '../lib/eventIcons'
import { EVENT_COLOR } from './EventTile'
import type { EventSuggestion } from '@/lib/event-suggestions'
import type { AppState } from '@/types'

/** Mint's thinking loop — a breathing leaf. Shown only while AI is actually
 *  running (a cache miss), never as decoration. */
const MINT_THINKING_SVG = '/mint-thinking-loop.svg'

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  /** Current suggestion; null once AI has judged a nameless burst to be everyday spending. */
  suggestion: EventSuggestion | null
  /** AI is running for this review — show Mint thinking instead of the result. */
  analyzing: boolean
  onCreate: (s: EventSuggestion) => void
  onDismiss: () => void
}

const shortDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** "12 Sep", "12–14 Sep", "28 Aug – 3 Sep". */
function formatDateRange(start: string, end: string): string {
  if (start === end) return shortDate(start)
  const [, sm, sd] = start.split('-')
  const [, em, ed] = end.split('-')
  if (sm === em) return `${Number(sd)}–${Number(ed)} ${shortDate(end).split(' ')[1]}`
  return `${shortDate(start)} – ${shortDate(end)}`
}

/** Review step between the toast/bell and the event form: what Mint found,
 *  which expenses, and the choice. Linking still happens only in
 *  LinkExpensesSheet, after the user confirms each row. */
export function EventSuggestionSheet({ open, onClose, state, suggestion: s, analyzing, onCreate, onDismiss }: Props) {
  const c = useTheme()
  const catMap = useMemo(() => catById(state.categories), [state.categories])
  const rows = useMemo(() => {
    if (!s) return []
    const ids = new Set(s.txIds)
    return state.transactions
      .filter(t => ids.has(t.id))
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
  }, [s, state.transactions])

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        {analyzing ? (
          <div style={{ textAlign: 'center', padding: '12px 8px 20px' }} role="status" aria-live="polite">
            <img src={MINT_THINKING_SVG} alt="" width={96} height={96} style={{ display: 'block', margin: '0 auto 14px' }} />
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>
              Mint is analyzing your recent expenses
            </div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
              Looking for trips, weddings, hospital visits and other life events…
            </div>
          </div>
        ) : !s ? (
          <div style={{ textAlign: 'center', padding: '12px 8px 8px' }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>
              Looks like everyday spending
            </div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5, marginBottom: 18 }}>
              Mint looked closer and didn't find a trip, wedding or other life event here.
            </div>
            <button
              onClick={onClose}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 16, border: 'none',
                background: c.accent, color: '#fff', font: '700 15px Plus Jakarta Sans', cursor: 'pointer',
              }}
            >
              Got it
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <img src={MINT_THINKING_SVG} alt="" width={20} height={20} />
              <span style={{ font: '700 12.5px Plus Jakarta Sans', color: c.muted }}>
                {s.generic ? 'Mint noticed unusual spending' : 'Mint noticed a life event'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 13, background: EVENT_COLOR,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <EventIcon name={s.icon} size={22} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '800 19px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.name}
                </div>
                <div style={{ font: '600 12.5px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                  {s.txIds.length} expenses · {formatDateRange(s.startDate, s.endDate)} · {fmt(s.total)}
                </div>
              </div>
            </div>

            <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Detected expenses
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '36svh', overflowY: 'auto', margin: '0 -4px', borderRadius: 12, background: c.surface2 }}>
              {rows.map((t, i) => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderTop: i === 0 ? 'none' : `1px solid ${c.faint}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '700 13.5px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.description}
                    </div>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>
                      {[fmtDate(t.transaction_date), catMap[t.category_id ?? '']?.name].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ font: '700 13.5px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>{fmt(t.amount)}</div>
                </div>
              ))}
            </div>

            <button
              onClick={() => onCreate(s)}
              style={{
                width: '100%', padding: '14px 0', marginTop: 16, borderRadius: 16, border: 'none',
                background: c.accent, color: '#fff', font: '700 15px Plus Jakarta Sans', cursor: 'pointer',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {s.existingEventId ? `Link to ${s.name}` : 'Create Event'}
            </button>
            <button
              onClick={onDismiss}
              style={{
                width: '100%', padding: '12px 0', marginTop: 6, borderRadius: 16, border: 'none',
                background: 'transparent', color: c.muted, font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
              }}
            >
              Not an Event
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
