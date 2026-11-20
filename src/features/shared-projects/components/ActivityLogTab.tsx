import { ArrowDownLeft, ArrowLeftRight, Circle, History, Link, Mail, Paperclip, ReceiptIndianRupee, Sprout, Trash2, Undo2, Unlink, UserMinus, UserPlus } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import type { ColorTokens } from '@/lib/tokens'
import { localIso } from '@/lib/utils'
import type { ProjectActivityLog } from '../types'
import { formatDayHeader } from '../lib/transactions'
import { FONT, cardStyle } from './overview/styles'

interface Props {
  activityLog: ProjectActivityLog[]
}

type Icon = React.ComponentType<{ size?: number; color?: string }>

/** One icon per kind of action; colour only where it carries meaning. */
function iconFor(c: ColorTokens, e: ProjectActivityLog): { Icon: Icon; fg: string; bg: string } {
  const type = typeof e.metadata?.type === 'string' ? e.metadata.type : null
  switch (e.action_type) {
    case 'project_created': return { Icon: Sprout, fg: c.good, bg: c.goodSoft }
    case 'member_added': return { Icon: UserPlus, fg: c.accent, bg: c.accentSoft }
    case 'member_removed': return { Icon: UserMinus, fg: c.sub, bg: c.surface2 }
    case 'transaction_added':
      if (type === 'settlement') return { Icon: ArrowLeftRight, fg: c.sub, bg: c.surface2 }
      if (type === 'contribution') return { Icon: ArrowDownLeft, fg: c.good, bg: c.goodSoft }
      return { Icon: ReceiptIndianRupee, fg: c.sub, bg: c.surface2 }
    case 'transaction_deleted':
      return type === 'settlement' ? { Icon: Undo2, fg: c.sub, bg: c.surface2 } : { Icon: Trash2, fg: c.bad, bg: c.badSoft }
    case 'collaborator_invited': return { Icon: Mail, fg: c.accent, bg: c.accentSoft }
    case 'collaborator_removed': return { Icon: Mail, fg: c.sub, bg: c.surface2 }
    case 'share_enabled': return { Icon: Link, fg: c.accent, bg: c.accentSoft }
    case 'share_revoked': return { Icon: Unlink, fg: c.sub, bg: c.surface2 }
    case 'attachment_added': return { Icon: Paperclip, fg: c.sub, bg: c.surface2 }
    default: return { Icon: Circle, fg: c.muted, bg: c.surface2 }
  }
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

/** Newest day first, newest entry first within a day (local dates). */
function groupByDay(log: ProjectActivityLog[]): { day: string; entries: ProjectActivityLog[] }[] {
  const sorted = [...log].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const groups: { day: string; entries: ProjectActivityLog[] }[] = []
  for (const e of sorted) {
    const day = localIso(new Date(e.created_at))
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.entries.push(e)
    else groups.push({ day, entries: [e] })
  }
  return groups
}

export function ActivityLogTab({ activityLog }: Props) {
  const c = useTheme()

  if (activityLog.length === 0) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ ...cardStyle(c), padding: '20px 16px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><History size={22} color={c.muted} /></div>
          <div style={{ font: `700 14px ${FONT}`, color: c.ink }}>No activity yet</div>
          <div style={{ font: `500 13px ${FONT}`, color: c.muted, marginTop: 4 }}>Changes to this group will show up here.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {groupByDay(activityLog).map(g => (
        <section key={g.day}>
          <div style={{ font: `700 11px ${FONT}`, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 4px 6px' }}>
            {formatDayHeader(g.day)}
          </div>
          <div style={{ ...cardStyle(c), padding: 0, overflow: 'hidden' }}>
            {g.entries.map((e, i) => {
              const { Icon, fg, bg } = iconFor(c, e)
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderTop: i === 0 ? 'none' : `1px solid ${c.faint}` }}>
                  <div aria-hidden style={{ width: 30, height: 30, borderRadius: 10, background: bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={14} color={fg} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, font: `600 13px ${FONT}`, color: c.ink, lineHeight: 1.45, overflowWrap: 'anywhere', paddingTop: 5 }}>
                    {e.description}
                  </div>
                  <div style={{ font: `500 11px ${FONT}`, color: c.muted, flexShrink: 0, whiteSpace: 'nowrap', paddingTop: 7 }}>
                    {timeOf(e.created_at)}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
