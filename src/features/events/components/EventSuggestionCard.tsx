import { Sparkles } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { Card } from '@/components/Card'
import { EventIcon } from '../lib/eventIcons'
import { EVENT_COLOR } from './EventTile'
import type { EventSuggestion } from '@/lib/event-suggestions'

interface Props {
  suggestion: EventSuggestion
  onAccept: () => void
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

/** Mint's proposal that some recent spending is one occasion. Says what it
 *  matched, so the suggestion explains itself; linking still happens only
 *  after the user reviews each row in LinkExpensesSheet. */
export function EventSuggestionCard({ suggestion: s, onAccept, onDismiss }: Props) {
  const c = useTheme()
  const count = s.txIds.length

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, color: c.muted }}>
        <Sparkles size={13} color={EVENT_COLOR} />
        <span style={{ font: '700 12px Plus Jakarta Sans', letterSpacing: '0.02em' }}>Mint noticed a life event</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, background: EVENT_COLOR,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <EventIcon name={s.icon} size={20} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {s.name}
          </div>
          <div style={{ font: '600 12.5px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
            {count} expense{count === 1 ? '' : 's'} · {formatDateRange(s.startDate, s.endDate)} · {fmt(s.total)}
          </div>
        </div>
      </div>

      {s.matchedLabels.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: c.surface2 }}>
          <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
            Matched expenses
          </div>
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.45 }}>
            {s.matchedLabels.join(' · ')}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          onClick={onAccept}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 14, border: 'none',
            background: c.accent, color: '#fff', font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {s.existingEventId ? `Link to ${s.name}` : 'Create Event'}
        </button>
        <button
          onClick={onDismiss}
          style={{
            padding: '12px 14px', borderRadius: 14, border: 'none',
            background: 'transparent', color: c.muted, font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Not an Event
        </button>
      </div>
    </Card>
  )
}
