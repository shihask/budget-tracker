import { useState } from 'react'
import { CalendarHeart } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt, iso, TODAY, round2 } from '@/lib/utils'
import { evaluateAmountExpression } from '@/lib/amountExpression'
import { Card } from '@/components/Card'
import { QuickAmountSheet } from '@/components/QuickAmountSheet'
import { eventSpent } from '@/lib/events'
import { EventIcon } from '../lib/eventIcons'
import { guessCategory } from '@/lib/categorize'
import { CategorySelect } from '@/components/CategorySelect'
import { INCOME_GROUP, TRANSFER_GROUP } from '@/lib/constants'
import type { AppState, LifeEvent, Transaction } from '@/types'

const EVENT_COLOR = '#E0568A'

interface Props {
  state: AppState
  onAdd: () => void
  onOpenEvent: (e: LifeEvent) => void
  onSave: (form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>) => Promise<unknown>
  onAddCategory: (name: string, group_name: string) => Promise<string>
}

export function EventsCard({ state, onAdd, onOpenEvent, onSave, onAddCategory }: Props) {
  const c = useTheme()
  const [quickFor, setQuickFor] = useState<LifeEvent | null>(null)
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [saving, setSaving] = useState(false)

  const active = state.events.filter(e => e.status === 'active')

  // Matches the amount/account inputs inside QuickAmountBody.
  const selectStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '9px 10px',
    font: '600 13px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }

  const openQuick = (e: LifeEvent) => {
    const fallback = state.accounts.find(a => a.is_active)
    setAccountId(e.default_account_id || fallback?.id || '')
    // Prefilled from the event, but editable — a wedding spans Food, Clothing
    // and Decoration, so one fixed category would be wrong more often than right.
    setCategoryId(e.default_category_id || guessCategory(e.name, state.categories) || '')
    setAmount('')
    setQuickFor(e)
  }

  const handleSave = async () => {
    const amt = evaluateAmountExpression(amount)
    if (!quickFor || amt === null || amt <= 0 || saving) return
    setSaving(true)
    try {
      await onSave({
        transaction_date: iso(TODAY),
        description: quickFor.name,
        amount: round2(amt),
        transaction_type: 'expense',
        category_id: categoryId || null,
        from_account_id: accountId,
        event_id: quickFor.id,
      })
      setQuickFor(null)
    } catch (err) {
      console.error('Failed to save event expense', err)
    } finally {
      setSaving(false)
    }
  }

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

      {active.length === 0 ? (
        <div style={{ padding: '20px 0 8px', textAlign: 'center' }}>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><CalendarHeart size={28} color="#A09890" /></div>
          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Track a one-off event</div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 14, lineHeight: 1.5 }}>
            A wedding, trip or house build — grouped together and kept out of your weekly budget.
          </div>
          <button onClick={onAdd} style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>
            Create an event
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {active.map(e => (
            <EventTile
              key={e.id}
              event={e}
              spent={eventSpent(state.transactions, e.id)}
              onOpen={() => onOpenEvent(e)}
              onQuickAdd={() => openQuick(e)}
            />
          ))}
        </div>
      )}

      <QuickAmountSheet
        open={!!quickFor}
        title={quickFor?.name ?? ''}
        subtitle="Saved as today's expense against this event."
        accounts={state.accounts}
        creditCards={state.credit_cards || []}
        accountId={accountId}
        onAccountChange={setAccountId}
        amount={amount}
        onAmountChange={setAmount}
        onSave={handleSave}
        onCancel={() => setQuickFor(null)}
        saving={saving}
        categoryNode={
          <CategorySelect
            value={categoryId}
            onChange={setCategoryId}
            state={state}
            onAddCategory={onAddCategory}
            includeEmpty
            emptyLabel="No category"
            excludeGroups={[INCOME_GROUP, TRANSFER_GROUP]}
            style={selectStyle}
          />
        }
      />
    </Card>
  )
}

function EventTile({ event, spent, onOpen, onQuickAdd }: {
  event: LifeEvent; spent: number; onOpen: () => void; onQuickAdd: () => void
}) {
  const c = useTheme()
  const target = event.target_amount ?? 0
  const pct = target > 0 ? Math.min(100, Math.round((spent / target) * 100)) : 0
  const over = target > 0 && spent > target

  return (
    <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
      <div onClick={onOpen} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{ display: 'flex', color: EVENT_COLOR, flexShrink: 0 }}><EventIcon name={event.icon} size={15} color="currentColor" /></span>
            <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.name}</div>
          </div>
          {target > 0 && (
            <div style={{ font: '700 11px Plus Jakarta Sans', color: over ? '#EF4444' : c.muted, flexShrink: 0 }}>{pct}%</div>
          )}
        </div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>
          <span style={{ color: c.ink, fontWeight: 800 }}>{fmt(spent)}</span>
          {target > 0 ? ` of ${fmt(target)}` : ' spent'}
        </div>
        {target > 0 && (
          <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: c.faint, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, width: `${pct}%`,
              background: over ? '#EF4444' : EVENT_COLOR, transition: 'width 0.3s ease',
            }} />
          </div>
        )}
      </div>
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
    </div>
  )
}
