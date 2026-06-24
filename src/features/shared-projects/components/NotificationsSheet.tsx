import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import type { Project } from '../types'
import type { PendingInvite } from '../hooks/useProjectsSummary'

interface Props {
  open: boolean
  onClose: () => void
  pendingInvites: PendingInvite[]
  sharedProjects: Project[]
  onAccept: (collaboratorId: string) => Promise<void>
  onDecline: (collaboratorId: string) => Promise<void>
  onViewProject: () => void
}

export function NotificationsSheet({ open, onClose, pendingInvites, sharedProjects, onAccept, onDecline, onViewProject }: Props) {
  const c = useTheme()
  const [processing, setProcessing] = useState<string | null>(null)
  const hasContent = pendingInvites.length > 0 || sharedProjects.length > 0

  const handleAccept = async (id: string) => {
    setProcessing(id)
    try { await onAccept(id) } catch (e) { console.error(e) }
    setProcessing(null)
  }

  const handleDecline = async (id: string) => {
    setProcessing(id)
    try { await onDecline(id) } catch (e) { console.error(e) }
    setProcessing(null)
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 16 }}>
          Notifications
        </div>

        {!hasContent ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={c.faint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }}>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <div style={{ font: '600 14px Plus Jakarta Sans', color: c.muted }}>No notifications</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Pending invitations — need accept/decline */}
            {pendingInvites.map(invite => (
              <div
                key={invite.id}
                style={{
                  background: '#6366F108', borderRadius: 16, padding: '14px 16px',
                  border: `1.5px solid #6366F130`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: '#6366F118', color: '#6366F1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>
                      Project invitation
                    </div>
                    <div style={{ font: '600 13px Plus Jakarta Sans', color: '#6366F1', marginTop: 2 }}>
                      {invite.project.name}
                    </div>
                    {invite.project.description && (
                      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2, lineHeight: 1.4 }}>
                        {invite.project.description}
                      </div>
                    )}
                    <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 4, textTransform: 'uppercase' }}>
                      Role: {invite.role}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => handleAccept(invite.id)}
                        disabled={processing === invite.id}
                        style={{
                          padding: '8px 20px', borderRadius: 10,
                          border: 'none', background: '#10B981', color: '#fff',
                          font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
                          opacity: processing === invite.id ? 0.6 : 1,
                        }}
                      >
                        {processing === invite.id ? '...' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleDecline(invite.id)}
                        disabled={processing === invite.id}
                        style={{
                          padding: '8px 20px', borderRadius: 10,
                          border: `1.5px solid ${c.faint}`, background: 'transparent',
                          color: c.muted, font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Already accepted shared projects */}
            {sharedProjects.map(p => (
              <div
                key={p.id}
                onClick={() => { onViewProject(); onClose() }}
                style={{
                  background: c.surface2, borderRadius: 16, padding: '14px 16px',
                  cursor: 'pointer', border: `1px solid ${c.faint}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: '#10B98118', color: '#10B981',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink }}>{p.name}</div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>Shared with you</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
