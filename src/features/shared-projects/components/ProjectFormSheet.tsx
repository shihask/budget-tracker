import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { round2 } from '@/lib/utils'
import { evaluateAmountExpression } from '@/lib/amountExpression'
import { BottomSheet } from '@/components/BottomSheet'
import { AmountOperatorRow } from '@/components/AmountOperatorRow'
import type { Project, ProjectStatus } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onSave: (form: { name: string; description?: string; notes?: string; target_amount: number; status?: ProjectStatus }) => Promise<void>
  project?: Project | null
}

export function ProjectFormSheet({ open, onClose, onSave, project }: Props) {
  const c = useTheme()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [target, setTarget] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('active')
  const [saving, setSaving] = useState(false)
  const targetRef = useRef<HTMLInputElement | null>(null)
  const [targetFocused, setTargetFocused] = useState(false)

  useEffect(() => {
    if (open && project) {
      setName(project.name)
      setDescription(project.description || '')
      setNotes(project.notes || '')
      setTarget(String(project.target_amount || ''))
      setStatus(project.status)
    } else if (open) {
      setName('')
      setDescription('')
      setNotes('')
      setTarget('')
      setStatus('active')
    }
  }, [open, project])

  const handleSave = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        target_amount: round2(evaluateAmountExpression(target) ?? 0),
        status: project ? status : undefined,
      })
      onClose()
    } catch (e) {
      console.error('Failed to save project', e)
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

  const statusOptions: ProjectStatus[] = ['active', 'completed', 'archived']

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 20 }}>
          {project ? 'Edit Project' : 'New Project'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={labelStyle}>Project Name</div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Home Renovation"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div>
            <div style={labelStyle}>Description</div>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Short description (optional)"
              style={inputStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Target Amount</div>
            <input
              ref={targetRef}
              type="text"
              value={target}
              onChange={e => setTarget(e.target.value)}
              onFocus={() => setTargetFocused(true)}
              onBlur={e => {
                setTargetFocused(false)
                const r = evaluateAmountExpression(e.target.value)
                if (r !== null) setTarget(String(round2(r)))
              }}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                const r = evaluateAmountExpression(e.currentTarget.value)
                if (r !== null) setTarget(String(round2(r)))
              }}
              placeholder="0"
              style={inputStyle}
              inputMode="decimal"
            />
            {targetFocused && <AmountOperatorRow inputRef={targetRef} onChange={setTarget} />}
          </div>

          <div>
            <div style={labelStyle}>Notes</div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes (optional)"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
            />
          </div>

          {project && (
            <div>
              <div style={labelStyle}>Status</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {statusOptions.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 12,
                      border: `1.5px solid ${status === s ? c.accent : c.faint}`,
                      background: status === s ? c.accentSoft : c.surface2,
                      color: status === s ? c.accent : c.muted,
                      font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          style={{
            width: '100%', padding: '14px 0', marginTop: 24, borderRadius: 16,
            border: 'none', background: name.trim() ? c.accent : c.faint,
            color: '#fff', font: '700 16px Plus Jakarta Sans', cursor: name.trim() ? 'pointer' : 'default',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : project ? 'Update Project' : 'Create Project'}
        </button>
      </div>
    </BottomSheet>
  )
}
