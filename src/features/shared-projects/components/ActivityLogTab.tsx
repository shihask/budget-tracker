import { Sprout, User, Coins, Trash2, Mail, Link, Paperclip, Circle } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import type { ProjectActivityLog } from '../types'

const ACTION_ICONS: Record<string, { icon: React.ComponentType<{ size?: number }>; color: string }> = {
  project_created: { icon: Sprout, color: '#10B981' },
  member_added: { icon: User, color: '#6366F1' },
  member_removed: { icon: User, color: '#EF4444' },
  transaction_added: { icon: Coins, color: '#10B981' },
  transaction_deleted: { icon: Trash2, color: '#EF4444' },
  collaborator_invited: { icon: Mail, color: '#6366F1' },
  collaborator_removed: { icon: Mail, color: '#EF4444' },
  share_enabled: { icon: Link, color: '#10B981' },
  share_revoked: { icon: Link, color: '#EF4444' },
  attachment_added: { icon: Paperclip, color: '#6366F1' },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

interface Props {
  activityLog: ProjectActivityLog[]
}

export function ActivityLogTab({ activityLog }: Props) {
  const c = useTheme()

  if (activityLog.length === 0) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 40 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={c.faint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 12px' }}>
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <div style={{ font: '600 14px Plus Jakarta Sans', color: c.muted }}>No activity yet</div>
        <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 4 }}>
          Actions will be logged here automatically
        </div>
      </div>
    )
  }

  let lastDate = ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {activityLog.map(entry => {
        const entryDate = new Date(entry.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
        const showDate = entryDate !== lastDate
        lastDate = entryDate
        const meta = ACTION_ICONS[entry.action_type] || { icon: Circle, color: c.muted }

        return (
          <div key={entry.id}>
            {showDate && (
              <div style={{
                font: '700 11px Plus Jakarta Sans', color: c.muted,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                padding: '12px 0 6px',
              }}>
                {entryDate}
              </div>
            )}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '10px 0',
              borderBottom: `1px solid ${c.faint}08`,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: `${meta.color}14`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <meta.icon size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  font: '600 13px Plus Jakarta Sans', color: c.ink,
                  lineHeight: 1.4,
                }}>
                  {entry.description}
                </div>
                <div style={{
                  font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2,
                }}>
                  {timeAgo(entry.created_at)}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
