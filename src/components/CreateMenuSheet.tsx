import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from './BottomSheet'
import { EventIcon } from '@/features/events/lib/eventIcons'

/** The discovery surface. Life Events has no settings toggle any more, so this
 *  is where someone who thinks "I need to track my brother's wedding" finds it.
 *
 *  Deliberately NOT in front of the FAB: the FAB still opens Quick Add directly,
 *  because putting a chooser in front of the most common action in the app would
 *  tax every expense entry forever. */
interface Props {
  open: boolean
  onClose: () => void
  onExpense: () => void
  onIncome: () => void
  onTransfer: () => void
  onLifeEvent: () => void
  onGoal: () => void
  onCommitment: () => void
  onSavings: () => void
  onProject: () => void
  trackSavings: boolean
  trackProjects: boolean
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {children}
    </svg>
  )
}

export function CreateMenuSheet({
  open, onClose, onExpense, onIncome, onTransfer, onLifeEvent,
  onGoal, onCommitment, onSavings, onProject, trackSavings, trackProjects,
}: Props) {
  const c = useTheme()

  const rows: {
    id: string; label: string; subtitle?: string
    icon: React.ReactNode; onClick: () => void; hidden?: boolean; dividerAbove?: boolean
  }[] = [
    {
      id: 'expense', label: 'Expense', onClick: onExpense,
      icon: <Icon><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></Icon>,
    },
    {
      id: 'income', label: 'Income', onClick: onIncome,
      icon: <Icon><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></Icon>,
    },
    {
      id: 'transfer', label: 'Transfer', onClick: onTransfer,
      icon: <Icon><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></Icon>,
    },
    {
      // Never hidden — this row IS the feature's discovery path, and the
      // subtitle is the whole education budget for it. Don't add a gate here.
      id: 'event', label: 'Life Event', subtitle: 'Wedding, trip, house construction…',
      onClick: onLifeEvent, dividerAbove: true,
      icon: <span style={{ display: 'flex' }}><EventIcon name="ring" size={18} color="currentColor" /></span>,
    },
    {
      id: 'goal', label: 'Goal', onClick: onGoal,
      icon: <Icon><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></Icon>,
    },
    {
      id: 'commitment', label: 'Bill / Commitment', onClick: onCommitment,
      icon: <Icon><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></Icon>,
    },
    {
      id: 'savings', label: 'Savings', onClick: onSavings, hidden: !trackSavings,
      icon: <Icon><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12h3"/><path d="M3 9h13a2 2 0 012 2"/></Icon>,
    },
    {
      id: 'project', label: 'Project', onClick: onProject, hidden: !trackProjects,
      icon: <Icon><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></Icon>,
    },
  ]

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 16 }}>Create new</div>
        <div role="menu" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.filter(r => !r.hidden).map(r => (
            <div key={r.id}>
              {r.dividerAbove && <div style={{ height: 1, background: c.faint, margin: '8px 0' }} />}
              <button
                role="menuitem"
                onClick={() => { onClose(); r.onClick() }}
                style={{
                  width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: 'transparent', color: c.ink, textAlign: 'left',
                }}
              >
                <span style={{ display: 'flex', color: c.muted }}>{r.icon}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', font: '700 14.5px Plus Jakarta Sans', color: c.ink }}>{r.label}</span>
                  {r.subtitle && (
                    <span style={{ display: 'block', font: '500 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                      {r.subtitle}
                    </span>
                  )}
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
