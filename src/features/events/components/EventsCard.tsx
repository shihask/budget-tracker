import { useState } from 'react'
import { CalendarHeart } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { iso, TODAY, round2 } from '@/lib/utils'
import { evaluateAmountExpression } from '@/lib/amountExpression'
import { Card } from '@/components/Card'
import { QuickAmountSheet } from '@/components/QuickAmountSheet'
import { eventSpent } from '@/lib/events'
import { EventTile, EVENT_COLOR } from './EventTile'
import { guessCategory } from '@/lib/categorize'
import { CategorySelect } from '@/components/CategorySelect'
import { INCOME_GROUP, TRANSFER_GROUP } from '@/lib/constants'
import type { AppState, LifeEvent, Transaction } from '@/types'


interface Props {
  state: AppState
  onAdd: () => void
  onSeeAll: () => void
  onOpenEvent: (e: LifeEvent) => void
  onSave: (form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>) => Promise<unknown>
  onAddCategory: (name: string, group_name: string) => Promise<string>
}

export function EventsCard({ state, onAdd, onSeeAll, onOpenEvent, onSave, onAddCategory }: Props) {
  const c = useTheme()
  const [quickFor, setQuickFor] = useState<LifeEvent | null>(null)
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
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
    setDescription('')
    setQuickFor(e)
  }

  const handleSave = async () => {
    const amt = evaluateAmountExpression(amount)
    if (!quickFor || amt === null || amt <= 0 || saving) return
    setSaving(true)
    try {
      await onSave({
        // The event name always leads so the row is self-describing in the main
        // transaction list, where there's no event column to give it context.
        description: description.trim() ? `${quickFor.name} - ${description.trim()}` : quickFor.name,
        transaction_date: iso(TODAY),
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
            spent={eventSpent(state.transactions, e.id)}
            onOpen={() => onOpenEvent(e)}
            onQuickAdd={() => openQuick(e)}
          />
        ))}
      </div>

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
        description={description}
        onDescriptionChange={setDescription}
        descriptionPlaceholder="e.g. Stage decoration"
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