import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { iso, TODAY } from '@/lib/utils'
import { BottomSheet } from '@/components/BottomSheet'
import type { ProjectMember, ProjectTransaction } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  mode: 'contribution' | 'expense'
  members: ProjectMember[]
  projectId: string
  onSave: (form: {
    project_id: string
    member_id: string | null
    transaction_type: 'contribution' | 'expense'
    amount: number
    description?: string
    category?: string
    notes?: string
    transaction_date: string
  }) => Promise<void>
  onUploadAttachment?: (file: File, projectId: string, transactionId: string) => Promise<void>
  editTxn?: ProjectTransaction | null
}

export function ProjectTransactionSheet({ open, onClose, mode, members, projectId, onSave, editTxn }: Props) {
  const c = useTheme()
  const [memberId, setMemberId] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(iso(TODAY))
  const [saving, setSaving] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && editTxn) {
      setMemberId(editTxn.member_id || '')
      setAmount(String(editTxn.amount))
      setDescription(editTxn.description || '')
      setCategory(editTxn.category || '')
      setNotes(editTxn.notes || '')
      setDate(editTxn.transaction_date)
    } else if (open) {
      setMemberId(members.length === 1 ? members[0].id : '')
      setAmount('')
      setDescription('')
      setCategory('')
      setNotes('')
      setDate(iso(TODAY))
    }
  }, [open, editTxn, members])

  const handleSave = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || saving) return
    setSaving(true)
    try {
      await onSave({
        project_id: projectId,
        member_id: memberId || null,
        transaction_type: mode,
        amount: amt,
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        notes: notes.trim() || undefined,
        transaction_date: date,
      })
      onClose()
    } catch (e) {
      console.error('Failed to save project transaction', e)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 14,
    border: `1.5px solid ${c.faint}`, background: c.surface2,
    font: '600 15px Plus Jakarta Sans', color: c.ink,
    outline: 'none', boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    font: '700 12px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
  }

  const isContribution = mode === 'contribution'
  const valid = parseFloat(amount) > 0

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 20 }}>
          {editTxn ? 'Edit' : 'Add'} {isContribution ? 'Contribution' : 'Expense'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {members.length > 0 && (
            <div>
              <div style={labelStyle}>{isContribution ? 'Member' : 'Paid By'}</div>
              <select
                value={memberId}
                onChange={e => setMemberId(e.target.value)}
                style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
              >
                <option value="">Select member</option>
                {members.filter(m => m.is_active).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div style={labelStyle}>Amount</div>
            <input
              ref={amountRef}
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              style={inputStyle}
              inputMode="decimal"
              autoFocus
            />
          </div>

          {!isContribution && (
            <div>
              <div style={labelStyle}>Category</div>
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="e.g. Materials, Labour, Food"
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <div style={labelStyle}>{isContribution ? 'Note' : 'Description'}</div>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={isContribution ? 'Optional note' : 'What was this for?'}
              style={inputStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Date</div>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Notes</div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes (optional)"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!valid || saving}
          style={{
            width: '100%', padding: '14px 0', marginTop: 24, borderRadius: 16,
            border: 'none',
            background: valid ? (isContribution ? '#10B981' : c.accent) : c.faint,
            color: '#fff', font: '700 16px Plus Jakarta Sans',
            cursor: valid ? 'pointer' : 'default',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : editTxn ? 'Update' : `Add ${isContribution ? 'Contribution' : 'Expense'}`}
        </button>
      </div>
    </BottomSheet>
  )
}
