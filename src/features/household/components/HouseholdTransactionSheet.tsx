import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import { localIso } from '@/lib/utils'
import { CATEGORY_NAME_MAX, checkDescription, checkName, DESCRIPTION_MAX, isIsoDate, parseAmount } from '../lib/validation'
import { householdErrorMessage, HouseholdConflictError } from '../lib/errors'
import { HouseholdIcon } from '../lib/icons'
import type { HouseholdCategory, HouseholdEntryInput, HouseholdEntryType, HouseholdMember, HouseholdTransaction } from '../types'
import { Button, ErrorText, FieldLabel } from './ui'
import { useFieldStyle } from '../hooks/usePageShell'

export type EntryMode = { kind: 'add'; type: HouseholdEntryType } | { kind: 'edit'; txn: HouseholdTransaction }

/** Screen 6 — add / edit a shared entry. Never touches a personal account: there
 *  is no account picker on purpose, and "Paid by" is a household member name. */
export function HouseholdTransactionSheet({
  open, mode, categories, members, meMemberId, onClose, onSave, onDelete, onAddCategory, confirm,
}: {
  open: boolean
  mode: EntryMode
  categories: HouseholdCategory[]
  members: HouseholdMember[]
  meMemberId: string
  onClose: () => void
  onSave: (input: HouseholdEntryInput, editing: { id: string; updatedAt: string } | null) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddCategory: (name: string, kind: HouseholdEntryType) => Promise<string>
  confirm: (message: string, opts?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>
}) {
  const c = useTheme()
  const field = useFieldStyle()
  const editing = mode.kind === 'edit' ? mode.txn : null
  const [type, setType] = useState<HouseholdEntryType>(editing?.type ?? (mode.kind === 'add' ? mode.type : 'expense'))
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null)
  const [date, setDate] = useState(editing?.txn_date ?? localIso(new Date()))
  const [description, setDescription] = useState(editing?.description ?? '')
  const [paidBy, setPaidBy] = useState(editing?.paid_by_member_id ?? meMemberId)
  const [newCategory, setNewCategory] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [busy, setBusy] = useState(false)

  const memberName = (id: string) => members.find(m => m.id === id)?.display_name ?? 'Former member'
  const choosableCategories = categories.filter(cat => cat.kind === type && (!cat.is_archived || cat.id === categoryId))
  // Active members, plus a payer who has since left when editing their old entry.
  const payers = members.filter(m => m.status === 'active' || m.id === paidBy)

  const switchType = (t: HouseholdEntryType) => {
    if (t === type) return
    setType(t)
    setCategoryId(null)   // categories are per kind; the FK would reject a mismatch
  }

  const addCategory = async () => {
    const n = checkName(newCategory ?? '', CATEGORY_NAME_MAX, 'a category name')
    if (!n.ok) { setErrors(e => ({ ...e, category: n.error })); return }
    setBusy(true)
    try {
      const id = await onAddCategory(n.value, type)
      setCategoryId(id); setNewCategory(null); setErrors(e => ({ ...e, category: undefined }))
    } catch (err) {
      setErrors(e => ({ ...e, category: householdErrorMessage(err, "Couldn't add the category.") }))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const a = parseAmount(amount)
    const d = checkDescription(description)
    const next: Record<string, string | undefined> = {
      amount: a.ok ? undefined : a.error,
      description: d.ok ? undefined : d.error,
      date: isIsoDate(date) ? undefined : 'Pick a valid date.',
    }
    setErrors(next)
    if (!a.ok || !d.ok || next.date) return
    setBusy(true)
    try {
      await onSave(
        { type, amount: a.value, category_id: categoryId, description: d.value, txn_date: date, paid_by_member_id: paidBy },
        editing ? { id: editing.id, updatedAt: editing.updated_at } : null,
      )
      onClose()
    } catch (err) {
      setErrors({ form: err instanceof HouseholdConflictError ? err.message : householdErrorMessage(err, "Couldn't save. Try again.") })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!editing) return
    const ok = await confirm('Delete this shared entry? Your partner will no longer see it, and household totals will update.', { confirmLabel: 'Delete', danger: true })
    if (!ok) return
    setBusy(true)
    try { await onDelete(editing.id); onClose() }
    catch (err) { setErrors({ form: householdErrorMessage(err, "Couldn't delete. Try again.") }) }
    finally { setBusy(false) }
  }

  const chip = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', minHeight: 36, borderRadius: 999,
    border: `1.5px solid ${active ? c.accent : c.faint}`, background: active ? c.accentSoft : c.surface2,
    color: active ? c.accent : c.ink, font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
  })

  return (
    <BottomSheet open={open} onClose={busy ? () => {} : onClose} zIndex={220} showHelpButton={false} dismissible={!busy}>
      <form onSubmit={e => { e.preventDefault(); void save() }} style={{ padding: '0 4px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, margin: 0 }}>
            {editing ? 'Edit shared entry' : type === 'expense' ? 'Add shared expense' : 'Add shared income'}
          </h2>
          <span style={{ font: '700 11px Plus Jakarta Sans', color: c.accent }}>Household</span>
        </div>

        <div role="radiogroup" aria-label="Entry type" style={{ display: 'flex', gap: 6, background: c.surface2, borderRadius: 13, padding: 4, marginBottom: 16 }}>
          {(['expense', 'income'] as const).map(t => (
            <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => switchType(t)}
              style={{ flex: 1, border: 'none', borderRadius: 10, padding: '10px 0', minHeight: 40, cursor: 'pointer',
                background: type === t ? c.surface : 'transparent', color: type === t ? c.ink : c.muted,
                font: '700 13px Plus Jakarta Sans', boxShadow: type === t ? c.cardShadow : 'none' }}>
              {t === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>

        <FieldLabel htmlFor="hh-amount">Amount (₹)</FieldLabel>
        <input id="hh-amount" inputMode="decimal" autoFocus={!editing} value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="0" aria-invalid={!!errors.amount} style={{ ...field, font: '800 22px Plus Jakarta Sans' }} />
        <ErrorText>{errors.amount}</ErrorText>

        <div style={{ height: 16 }} />
        <FieldLabel htmlFor="hh-cats">Category</FieldLabel>
        <div id="hh-cats" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {choosableCategories.map(cat => (
            <button key={cat.id} type="button" aria-pressed={categoryId === cat.id} onClick={() => setCategoryId(categoryId === cat.id ? null : cat.id)} style={chip(categoryId === cat.id)}>
              <HouseholdIcon name={cat.icon} size={14} /> {cat.name}
            </button>
          ))}
          {newCategory == null && (
            <button type="button" onClick={() => setNewCategory('')} style={{ ...chip(false), color: c.accent }}><Plus size={14} /> New</button>
          )}
        </div>
        {newCategory != null && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input aria-label="New category name" value={newCategory} onChange={e => setNewCategory(e.target.value)} maxLength={CATEGORY_NAME_MAX}
              placeholder="e.g. Maid salary" style={{ ...field, flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addCategory() } }} />
            <Button kind="secondary" onClick={() => void addCategory()} disabled={busy}>Add</Button>
          </div>
        )}
        <ErrorText>{errors.category}</ErrorText>

        <div style={{ height: 16 }} />
        <FieldLabel htmlFor="hh-paid">{type === 'expense' ? 'Paid by' : 'Received by'}</FieldLabel>
        <div id="hh-paid" role="radiogroup" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {payers.map(m => (
            <button key={m.id} type="button" role="radio" aria-checked={paidBy === m.id} onClick={() => setPaidBy(m.id)} style={chip(paidBy === m.id)}>
              {m.id === meMemberId ? `${m.display_name} (you)` : m.display_name}{m.status !== 'active' ? ' · left' : ''}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <div style={{ flex: '0 0 46%' }}>
            <FieldLabel htmlFor="hh-date">Date</FieldLabel>
            <input id="hh-date" type="date" value={date} max={localIso(new Date())} onChange={e => setDate(e.target.value)} aria-invalid={!!errors.date} style={field} />
            <ErrorText>{errors.date}</ErrorText>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FieldLabel htmlFor="hh-desc">Note (optional)</FieldLabel>
            <input id="hh-desc" value={description} onChange={e => setDescription(e.target.value)} maxLength={DESCRIPTION_MAX}
              placeholder={type === 'expense' ? 'e.g. Big Basket' : 'e.g. October share'} aria-invalid={!!errors.description} style={field} />
            <ErrorText>{errors.description}</ErrorText>
          </div>
        </div>

        {editing && (
          <p style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, margin: '14px 0 0', lineHeight: 1.5 }}>
            Added by {memberName(editing.created_by_member_id)}
            {editing.updated_at !== editing.created_at && ` · last edited by ${memberName(editing.updated_by_member_id)}`}
          </p>
        )}

        <ErrorText>{errors.form}</ErrorText>
        <div style={{ height: 18 }} />
        <Button type="submit" full busy={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add to household'}</Button>
        {editing && (
          <>
            <div style={{ height: 8 }} />
            <Button full kind="danger" onClick={() => void remove()} disabled={busy}>Delete entry</Button>
          </>
        )}
      </form>
    </BottomSheet>
  )
}
