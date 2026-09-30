import { useState } from 'react'
import { CalendarHeart } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { Card } from '@/components/Card'
import { eventSpent } from '@/lib/events'
import { EventTile, EVENT_COLOR } from './EventTile'
import { EventExpenseSheet } from './EventExpenseSheet'
import type { AppState, LifeEvent, Transaction } from '@/types'


interface Props {
  state: AppState
  onAdd: () => void
  onSeeAll: () => void
  onOpenEvent: (e: LifeEvent) => void
  onSave: (form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>) => Promise<unknown>
  onAddCategory: (name: string, group_name: string) => Promise<string>
  /** Loaded window + every event-tagged row from the DB — see useEventLedger. */
  eventLedger: Transaction[]
}

export function EventsCard({ state, eventLedger, onAdd, onSeeAll, onOpenEvent, onSave, onAddCategory }: Props) {
  const c = useTheme()
  const [quickFor, setQuickFor] = useState<LifeEvent | null>(null)

  const active = state.events.filter(e => e.status === 'active')

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: active.length ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, background: EVENT_COLOR,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <CalendarHeart size={17} color="#fff" />
          </div>
          <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Life Events</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={onSeeAll} style={{ font: '600 13px Plus Jakarta Sans', color: c.accent, cursor: 'pointer' }}>See all</span>
          <button
            onClick={onAdd}
            aria-label="Add life event"
            style={{
              width: 28, height: 28, borderRadius: 9, border: 'none',
              background: c.accentSoft, color: c.accent, cursor: 'pointer',
              font: '700 18px Plus Jakarta Sans', lineHeight: 1, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >+</button>
        </div>
      </div>

      {/* No empty state here — App only renders this card when an active event
          exists. A card whose whole body is a call to action is the onboarding
          nag this redesign removed; the empty state lives on the list page. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {active.map(e => (
          <EventTile
            key={e.id}
            event={e}
            spent={eventSpent(eventLedger, e.id)}
            onOpen={() => onOpenEvent(e)}
            onQuickAdd={() => setQuickFor(e)}
          />
        ))}
      </div>

      <EventExpenseSheet
        event={quickFor}
        onClose={() => setQuickFor(null)}
        state={state}
        onSave={onSave}
        onAddCategory={onAddCategory}
      />
    </Card>
  )
}
