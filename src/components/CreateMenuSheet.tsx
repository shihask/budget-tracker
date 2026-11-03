import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from './BottomSheet'
import { ArrowDown, ArrowUp, Repeat, type LucideIcon } from 'lucide-react'
import { FEATURE_ICONS } from '@/lib/feature-icons'

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

/** A row's icon. Feature rows use the feature's own icon, so "Savings" here looks
 *  like Savings on the dashboard and in the Navigation menu. */
function RowIcon({ Icon }: { Icon: LucideIcon }) {
  return <Icon size={18} strokeWidth={2} style={{ flexShrink: 0 }} aria-hidden />
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
      icon: <RowIcon Icon={ArrowDown} />,
    },
    {
      id: 'income', label: 'Income', onClick: onIncome,
      icon: <RowIcon Icon={ArrowUp} />,
    },
    {
      id: 'transfer', label: 'Transfer', onClick: onTransfer,
      icon: <RowIcon Icon={Repeat} />,
    },
    {
      // Never hidden — this row IS the feature's discovery path, and the
      // subtitle is the whole education budget for it. Don't add a gate here.
      id: 'event', label: 'Life Event', subtitle: 'Wedding, trip, house construction…',
      onClick: onLifeEvent, dividerAbove: true,
      icon: <RowIcon Icon={FEATURE_ICONS.events} />,
    },
    {
      id: 'goal', label: 'Goal', onClick: onGoal,
      icon: <RowIcon Icon={FEATURE_ICONS.goals} />,
    },
    {
      id: 'commitment', label: 'Bill / Commitment', onClick: onCommitment,
      icon: <RowIcon Icon={FEATURE_ICONS.commitments} />,
    },
    {
      id: 'savings', label: 'Savings', onClick: onSavings, hidden: !trackSavings,
      icon: <RowIcon Icon={FEATURE_ICONS.savings} />,
    },
    {
      id: 'project', label: 'Project', onClick: onProject, hidden: !trackProjects,
      icon: <RowIcon Icon={FEATURE_ICONS.projects} />,
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
