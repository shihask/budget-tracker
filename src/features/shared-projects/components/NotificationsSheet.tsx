import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import type { Project, CollaboratorRole } from '../types'

export interface ProjectInvite {
  collaboratorId: string
  projectId: string
  projectName: string
  projectDescription: string | null
  role: CollaboratorRole
  invitedAt: string
}

interface Props {
  open: boolean
  onClose: () => void
  invites: ProjectInvite[]
  sharedProjects: Project[]
  onOpenProject: (project: Project) => void
}

export function NotificationsSheet({ open, onClose, invites, sharedProjects, onOpenProject }: Props) {
  const c = useTheme()
  const hasContent = invites.length > 0 || sharedProjects.length > 0

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
            {/* Shared project invitations */}
            {sharedProjects.map(p => (
              <div
                key={p.id}
                onClick={() => { onOpenProject(p); onClose() }}
                style={{
                  background: c.surface2, borderRadius: 16, padding: '14px 16px',
                  cursor: 'pointer', border: `1px solid ${c.faint}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: '#6366F118', color: '#6366F1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>
                      Project shared with you
                    </div>
                    <div style={{ font: '600 13px Plus Jakarta Sans', color: c.accent, marginTop: 2 }}>
                      {p.name}
                    </div>
                    {p.description && (
                      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                        {p.description}
                      </div>
                    )}
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
