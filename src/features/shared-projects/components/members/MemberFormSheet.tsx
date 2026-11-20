import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import type { ProjectMember } from '../../types'
import { FONT } from '../overview/styles'
import { errorText } from './memberUi'

interface Props {
  open: boolean
  /** null = add. The parent remounts this sheet (key) on every opening, so fields start fresh. */
  member: ProjectMember | null
  onClose: () => void
  /** email is null when left empty — on edit that clears a saved email. */
  onSave: (form: { name: string; email: string | null }) => Promise<void>
}

export function MemberFormSheet({ open, member, onClose, onSave }: Props) {
  const c = useTheme()
  const [name, setName] = useState(member?.name ?? '')
  const [email, setEmail] = useState(member?.email ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = name.trim() !== ''

  const save = async () => {
    if (!valid || saving) return
    setSaving(true); setError(null)
    try {
      await onSave({ name: name.trim(), email: email.trim() || null })
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 14, border: `1.5px solid ${c.faint}`,
    background: c.surface2, font: `600 15px ${FONT}`, color: c.ink, outline: 'none', boxSizing: 'border-box',
  }
  const label: React.CSSProperties = {
    font: `700 12px ${FONT}`, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 12px' }}>
        <div style={{ font: `800 20px ${FONT}`, color: c.ink, marginBottom: 18 }}>{member ? 'Edit member' : 'Add member'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={label}>Name</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Member name" style={input} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') save() }} />
          </div>
          <div>
            <div style={label}>Email (optional)</div>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" type="email" inputMode="email" style={input}
              onKeyDown={e => { if (e.key === 'Enter') save() }} />
            <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 6 }}>
              Only needed if you want to invite them to open this group.
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 14, padding: '10px 12px', borderRadius: 12, background: c.badSoft, color: c.bad, font: `600 12px ${FONT}` }}>
            {error}
          </div>
        )}

        <button
          onClick={save}
          disabled={!valid || saving}
          style={{
            width: '100%', padding: '14px 0', marginTop: 20, borderRadius: 16, border: 'none',
            background: valid ? c.accent : c.faint, color: '#fff', font: `700 16px ${FONT}`,
            cursor: valid ? 'pointer' : 'default', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : member ? 'Save changes' : 'Add member'}
        </button>
      </div>
    </BottomSheet>
  )
}
