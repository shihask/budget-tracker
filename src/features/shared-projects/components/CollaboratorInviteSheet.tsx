import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import { BottomSheet } from '@/components/BottomSheet'
import type { CollaboratorRole } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onInvite: (email: string, role: CollaboratorRole) => Promise<unknown>
  projectName?: string
}

export function CollaboratorInviteSheet({ open, onClose, onInvite, projectName }: Props) {
  const c = useTheme()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = email.trim().includes('@')

  const handleInvite = async () => {
    if (!valid || sending) return
    setSending(true)
    setError(null)
    try {
      await onInvite(email.trim(), role)
      supabase.functions.invoke('send-invite-email', {
        body: { to_email: email.trim(), project_name: projectName || 'a project', role },
      }).then(() => {}, () => {})
      setSent(true)
      setTimeout(() => { setSent(false); setEmail(''); setError(null); onClose() }, 1500)
    } catch (e: any) {
      const msg = e?.message || 'Failed to send invitation'
      if (msg.includes('Cannot add yourself')) setError('You cannot invite yourself')
      else setError(msg)
    } finally {
      setSending(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 14,
    border: `1.5px solid ${c.faint}`, background: c.surface2,
    font: '600 15px Plus Jakarta Sans', color: c.ink,
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>
          Invite Collaborator
        </div>
        <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginBottom: 20, lineHeight: 1.5 }}>
          Invite a MoneyPlant user by email. They'll see this project in their Projects list.
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: 999, background: '#10B98118', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Invitation sent</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Email</div>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="collaborator@example.com"
                  style={inputStyle}
                  autoFocus
                />
              </div>

              <div>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Role</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['viewer', 'editor'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 12,
                        border: `1.5px solid ${role === r ? c.accent : c.faint}`,
                        background: role === r ? c.accentSoft : c.surface2,
                        color: role === r ? c.accent : c.muted,
                        font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 6 }}>
                  {role === 'viewer' ? 'Can view all project data but cannot make changes' : 'Can add transactions, members, and manage budgets'}
                </div>
              </div>
            </div>

            {error && (
              <div style={{ font: '600 13px Plus Jakarta Sans', color: '#EF4444', background: '#EF444412', padding: '10px 14px', borderRadius: 12, marginTop: 16 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleInvite}
              disabled={!valid || sending}
              style={{
                width: '100%', padding: '14px 0', marginTop: error ? 12 : 24, borderRadius: 16,
                border: 'none', background: valid ? c.accent : c.faint,
                color: '#fff', font: '700 16px Plus Jakarta Sans',
                cursor: valid ? 'pointer' : 'default',
                opacity: sending ? 0.6 : 1,
              }}
            >
              {sending ? 'Sending…' : 'Send Invitation'}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
