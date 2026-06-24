import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import type { Project } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  sharedProjects: Project[]
  onViewProject: (project: Project) => void
}

export function NotificationsSheet({ open, onClose, sharedProjects, onViewProject }: Props) {
  const c = useTheme()

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 16 }}>
          Notifications
        </div>

        {sharedProjects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={c.faint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }}>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <div style={{ font: '600 14px Plus Jakarta Sans', color: c.muted }}>No notifications</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sharedProjects.map(p => (
              <div
                key={p.id}
                style={{
                  background: c.surface2, borderRadius: 16, padding: '14px 16px',
                  border: `1px solid ${c.faint}`,
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
                      Project shared with you
                    </div>
                    <div style={{ font: '600 13px Plus Jakarta Sans', color: c.accent, marginTop: 2 }}>
                      {p.name}
                    </div>
                    {p.description && (
                      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2, lineHeight: 1.4 }}>
                        {p.description}
                      </div>
                    )}
                    <button
                      onClick={() => { onViewProject(p); onClose() }}
                      style={{
                        marginTop: 10, padding: '8px 20px', borderRadius: 10,
                        border: 'none', background: c.accent, color: '#fff',
                        font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
                      }}
                    >
                      View Project
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
