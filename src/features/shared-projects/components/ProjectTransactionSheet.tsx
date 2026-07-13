import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { iso, TODAY, round2 } from '@/lib/utils'
import { evaluateAmountExpression } from '@/lib/amountExpression'
import { BottomSheet } from '@/components/BottomSheet'
import { AmountOperatorRow } from '@/components/AmountOperatorRow'
import type { ProjectMember, ProjectTransaction, ProjectBudget } from '../types'

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
    files?: File[]
  }) => Promise<void>
  editTxn?: ProjectTransaction | null
  budgets?: ProjectBudget[]
  existingAttachmentCount?: number
}

export function ProjectTransactionSheet({ open, onClose, mode, members, projectId, onSave, editTxn, budgets = [], existingAttachmentCount = 0 }: Props) {
  const c = useTheme()
  const [memberId, setMemberId] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(iso(TODAY))
  const [saving, setSaving] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const amountRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [amountFocused, setAmountFocused] = useState(false)

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
      setFiles([])
    }
  }, [open, editTxn, members])

  const handleSave = async () => {
    const rawAmt = evaluateAmountExpression(amount)
    if (!rawAmt || rawAmt <= 0 || saving || !valid) return
    const amt = round2(rawAmt)
    setSaving(true)
    try {
      await onSave({
        project_id: projectId,
        member_id: (memberId && memberId !== '__fund__') ? memberId : null,
        transaction_type: mode,
        amount: amt,
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        notes: notes.trim() || undefined,
        transaction_date: date,
        files: files.length > 0 ? files : undefined,
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
  const hasAmount = (evaluateAmountExpression(amount) ?? 0) > 0
  const hasSelection = members.length === 0 || !!memberId
  const valid = hasAmount && hasSelection

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
                {isContribution ? (
                  <option value="">Select member</option>
                ) : (
                  <>
                    <option value="">Select who paid</option>
                    <option value="__fund__">Project Fund (from contributions)</option>
                  </>
                )}
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
              type="text"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                const r = evaluateAmountExpression(e.currentTarget.value)
                if (r !== null) setAmount(String(round2(r)))
              }}
              placeholder="0"
              style={inputStyle}
              inputMode="decimal"
              autoFocus
            />
            {amountFocused && <AmountOperatorRow inputRef={amountRef} onChange={setAmount} />}
          </div>

          {!isContribution && (
            <div>
              <div style={labelStyle}>Category</div>
              {budgets.length > 0 ? (
                <>
                  <select
                    value={budgets.some(b => b.category.toLowerCase() === category.toLowerCase()) ? category : (category ? '__other__' : '')}
                    onChange={e => {
                      if (e.target.value === '__other__') setCategory('')
                      else setCategory(e.target.value)
                    }}
                    style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                  >
                    <option value="">Select category</option>
                    {budgets.map(b => (
                      <option key={b.id} value={b.category}>{b.category}</option>
                    ))}
                    <option value="__other__">Other</option>
                  </select>
                  {(!budgets.some(b => b.category.toLowerCase() === category.toLowerCase()) && category !== '') && (
                    <input
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      placeholder="Custom category"
                      style={{ ...inputStyle, marginTop: 8 }}
                    />
                  )}
                </>
              ) : (
                <input
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="e.g. Materials, Labour, Food"
                  style={inputStyle}
                />
              )}
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

          {/* Attachments */}
          <div>
            <div style={labelStyle}>Attachments</div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              onChange={e => {
                if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)])
              }}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 14,
                border: `1.5px dashed ${c.faint}`, background: 'transparent',
                font: '600 13px Plus Jakarta Sans', color: c.muted,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              Attach files
            </button>
            {editTxn && existingAttachmentCount > 0 && (
              <div style={{ font: '500 11px Plus Jakarta Sans', color: c.accent, marginTop: 4 }}>
                {existingAttachmentCount} existing attachment{existingAttachmentCount > 1 ? 's' : ''}
              </div>
            )}
            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {files.map((f, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 10px', borderRadius: 10, background: c.surface2,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span style={{ font: '500 12px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#EF4444', flexShrink: 0 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
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
