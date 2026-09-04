import { useState, useEffect, useMemo } from 'react'
import { ContactRound } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useTheme } from '@/lib/theme-context'
import {
  isValidMasterName, findDuplicateMaster, duplicateMasterMessage,
  MASTER_ACCENTS, MASTER_TYPE_LABEL,
} from '@/lib/masters'
import { isContactPickerSupported, pickContact } from '@/lib/contactPicker'
import { MASTER_TYPES } from '@/types'
import type { AppState, Master, MasterType } from '@/types'

export interface MasterFormValues {
  name: string
  type: MasterType
  phone: string | null
  notes: string | null
  category_id: string | null
  photo_url: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  onSave: (form: MasterFormValues) => Promise<void>
  /** null = create, a master = edit. */
  editMaster?: Master | null
}

const TYPE_ORDER: MasterType[] = [MASTER_TYPES.PERSON, MASTER_TYPES.MERCHANT]

export function MasterFormSheet({ open, onClose, state, onSave, editMaster }: Props) {
  const c = useTheme()
  const [type, setType] = useState<MasterType>(MASTER_TYPES.PERSON)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [canPickContact] = useState(isContactPickerSupported)

  // Reset every field in BOTH branches — a sheet reopened in create mode after
  // an edit must not inherit the edited master's values.
  useEffect(() => {
    if (!open) return
    setType(editMaster?.type ?? MASTER_TYPES.PERSON)
    setName(editMaster?.name ?? '')
    setPhone(editMaster?.phone ?? '')
    setNotes(editMaster?.notes ?? '')
    setSaving(false)
    setError('')
  }, [open, editMaster])

  // Inline, live, and re-run when the type changes — uniqueness is per-type, so
  // flipping Person→Merchant can clear a duplicate or introduce one.
  const duplicate = useMemo(
    () => findDuplicateMaster(state.masters, name, type, editMaster?.id),
    [state.masters, name, type, editMaster],
  )
  const nameValid = isValidMasterName(name)
  const canSave = nameValid && !duplicate && !saving

  /** Fills the phone, and the name only when it is still blank — someone who
   *  typed "Dad" should not have it overwritten by "Noushad Kunhi" from the
   *  address book. A cancelled pick returns null and changes nothing. */
  const importFromContacts = async () => {
    const picked = await pickContact()
    if (!picked) return
    if (picked.phone) setPhone(picked.phone)
    if (picked.name && !name.trim()) setName(picked.name)
  }

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      await onSave({
        name,
        type,
        // A merchant never keeps a phone number: the field is hidden for
        // merchants, so a value left over from Person would be invisible
        // and unremovable.
        phone: type === MASTER_TYPES.PERSON ? (phone.trim() || null) : null,
        notes: notes.trim() || null,
        // Reserved columns — no UI writes these in v1.60. Preserved on edit so
        // saving a master never wipes a value a later release set.
        category_id: editMaster?.category_id ?? null,
        photo_url: editMaster?.photo_url ?? null,
      })
      onClose()
    } catch (e) {
      // The DB's unique index is the backstop the client check can't be: another
      // device may have taken the name since this sheet opened.
      setError(e instanceof Error ? e.message : 'Could not save this master.')
      setSaving(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    font: '700 12px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 14,
    padding: '12px 14px', font: '600 15px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ paddingTop: 4 }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginBottom: 18 }}>
          {editMaster ? 'Edit master' : 'New master'}
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 12, padding: '10px 12px', font: '600 13px Plus Jakarta Sans', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Type — first, because it decides whether Phone exists */}
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Type</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {TYPE_ORDER.map(t => {
              const on = type === t
              const accent = MASTER_ACCENTS[t]
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  style={{
                    flex: 1, cursor: 'pointer', borderRadius: 14, padding: '12px 0',
                    font: '700 14px Plus Jakarta Sans',
                    background: on ? accent.soft : c.surface2,
                    color: on ? accent.solid : c.sub,
                    border: `1.5px solid ${on ? accent.solid : c.faint}`,
                  }}
                >
                  {MASTER_TYPE_LABEL[t]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Name</div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter name"
            autoFocus={!editMaster}
            style={{ ...inputStyle, borderColor: duplicate ? c.bad : c.faint }}
          />
          {duplicate && (
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, marginTop: 6 }}>
              {duplicateMasterMessage(name, type)}
            </div>
          )}
        </div>

        {/* Phone — people only */}
        {type === MASTER_TYPES.PERSON && (
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Phone (optional)</div>
            <div style={{ position: 'relative' }}>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="9876543210"
                inputMode="tel"
                style={{ ...inputStyle, paddingRight: canPickContact ? 46 : 14 }}
              />
              {/* Only rendered where the API exists (Chromium on Android). A
                  button that silently does nothing on iOS is worse than none. */}
              {canPickContact && (
                <button
                  type="button"
                  onClick={importFromContacts}
                  aria-label="Choose from contacts"
                  title="Choose from contacts"
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: 'transparent', color: c.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <ContactRound size={19} color={c.accent} />
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 22 }}>
          <div style={labelStyle}>Notes (optional)</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add a note…"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', font: '600 14px Plus Jakarta Sans' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, background: c.surface2, color: c.sub, border: 'none', borderRadius: 16, padding: '14px 0', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSave}
            style={{
              flex: 2, border: 'none', borderRadius: 16, padding: '14px 0',
              font: '700 14px Plus Jakarta Sans',
              background: canSave ? c.accent : c.faint,
              color: canSave ? '#fff' : c.muted,
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : editMaster ? 'Save changes' : 'Save Master'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
