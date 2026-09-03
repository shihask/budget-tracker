import { useTheme } from '@/lib/theme-context'
import { fmt, fmtDate } from '@/lib/utils'
import { EventIcon } from '../lib/eventIcons'
import type { LifeEvent } from '@/types'

export const EVENT_COLOR = '#E0568A'

interface Props {
  event: LifeEvent
  spent: number
  /** Linked expense count — shown on the list page, omitted on the dashboard
   *  where vertical space is scarcer. */
  txnCount?: number
  onOpen: () => void
  /** Renders the dashed one-tap capture button. Past events don't get one. */
  onQuickAdd?: () => void
}

/** The one tile both the dashboard card and the Life Events page render, so the
 *  two can never drift. A past event (completed/archived) drops the progress bar
 *  and shows its end date instead — a variant, not a second component. */
export function EventTile({ event, spent, txnCount, onOpen, onQuickAdd }: Props) {
  const c = useTheme()
  const isPast = event.status !== 'active'
  const target = event.target_amount ?? 0
  const showProgress = !isPast && target > 0
  const pct = target > 0 ? Math.min(100, Math.round((spent / target) * 100)) : 0
  const over = target > 0 && spent > target

  const meta = [
    txnCount != null ? `${txnCount} expense${txnCount === 1 ? '' : 's'}` : null,
    isPast && event.end_date ? `ended ${fmtDate(event.end_date)}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
      <div onClick={onOpen} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{ display: 'flex', color: isPast ? c.muted : EVENT_COLOR, flexShrink: 0 }}>
              <EventIcon name={event.icon} size={15} color="currentColor" />
            </span>
            <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {event.name}
            </div>
          </div>
          {showProgress && (
            <div style={{ font: '700 11px Plus Jakarta Sans', color: over ? '#EF4444' : c.muted, flexShrink: 0 }}>{pct}%</div>
          )}
        </div>

        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>
          <span style={{ color: c.ink, fontWeight: 800 }}>{fmt(spent)}</span>
          {!isPast && target > 0 ? ` of ${fmt(target)}` : ' spent'}
        </div>

        {showProgress && (
          <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: c.faint, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, width: `${pct}%`,
              background: over ? '#EF4444' : EVENT_COLOR, transition: 'width 0.3s ease',
            }} />
          </div>
        )}

        {meta && (
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: showProgress ? 6 : 3 }}>{meta}</div>
        )}
      </div>

      {onQuickAdd && (
        <button
          onClick={onQuickAdd}
          style={{
            width: '100%', marginTop: 10, padding: '8px 0', borderRadius: 10,
            border: `1.5px dashed ${c.faint}`, background: 'transparent',
            font: '700 12px Plus Jakarta Sans', color: c.accent, cursor: 'pointer',
          }}
        >
          + Add Expense
        </button>
      )}
    </div>
  )
}
