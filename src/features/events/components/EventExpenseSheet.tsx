import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { localIso, round2 } from '@/lib/utils'
import { evaluateAmountExpression } from '@/lib/amountExpression'
import { QuickAmountSheet } from '@/components/QuickAmountSheet'
import { guessCategory } from '@/lib/categorize'
import { CategorySelect } from '@/components/CategorySelect'
import { INCOME_GROUP, TRANSFER_GROUP } from '@/lib/constants'
import type { AppState, LifeEvent, Transaction } from '@/types'

interface Props {
  /** The event to capture against; null keeps the sheet closed. */
  event: LifeEvent | null
  onClose: () => void
  state: AppState
  onSave: (form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>) => Promise<unknown>
  onAddCategory: (name: string, group_name: string) => Promise<string>
  zIndex?: number
}

/** One-tap "add an expense to this event" — shared by the dashboard card, the
 *  Life Events list and the event detail page so all three save identically. */
export function EventExpenseSheet({ event, onClose, state, onSave, onAddCategory, zIndex }: Props) {
  const c = useTheme()
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset on every open, during render rather than in an effect. Keyed on the
  // id so a re-render with fresh state (another save landing) doesn't wipe
  // what the user is typing.
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  const eventId = event?.id ?? null
  if (eventId !== openedFor) {
    setOpenedFor(eventId)
    if (event) {
      const fallback = state.accounts.find(a => a.is_active)
      setAccountId(event.default_account_id || fallback?.id || '')
      // Prefilled from the event, but editable — a wedding spans Food, Clothing
      // and Decoration, so one fixed category would be wrong more often than right.
      setCategoryId(event.default_category_id || guessCategory(event.name, state.categories) || '')
      setAmount('')
      setDescription('')
    }
  }

  // Matches the amount/account inputs inside QuickAmountBody.
  const selectStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '9px 10px',
    font: '600 13px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }

  const handleSave = async () => {
    const amt = evaluateAmountExpression(amount)
    if (!event || amt === null || amt <= 0 || saving) return
    setSaving(true)
    try {
      await onSave({
        // The event name always leads so the row is self-describing in the main
        // transaction list, where there's no event column to give it context.
        description: description.trim() ? `${event.name} - ${description.trim()}` : event.name,
        transaction_date: localIso(new Date()),
        amount: round2(amt),
        transaction_type: 'expense',
        category_id: categoryId || null,
        from_account_id: accountId,
        event_id: event.id,
      })
      onClose()
    } catch (err) {
      console.error('Failed to save event expense', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <QuickAmountSheet
      open={!!event}
      zIndex={zIndex}
      title={event?.name ?? ''}
      subtitle="Saved as today's expense against this event."
      accounts={state.accounts}
      creditCards={state.credit_cards || []}
      accountId={accountId}
      onAccountChange={setAccountId}
      amount={amount}
      onAmountChange={setAmount}
      onSave={handleSave}
      onCancel={onClose}
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
  )
}
