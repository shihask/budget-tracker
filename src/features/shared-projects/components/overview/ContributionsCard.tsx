import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { MemberSummary } from '../../types'
import { initials } from '../../lib/overview'
import { FONT, cardStyle } from './styles'
import { SectionHeader } from './ui'

const MAX_SHOWN = 5
const MAX_ZERO_NAMES = 3

interface Props {
  memberSummaries: MemberSummary[]
  contributionCount: number
  hasTarget: boolean
  onViewAll: () => void
}

// Member-attributed money only — never a kitty total, which may one day include
// non-member inflows.
export function ContributionsCard({ memberSummaries, contributionCount, hasTarget, onViewAll }: Props) {
  const c = useTheme()
  if (memberSummaries.length === 0) return null

  const contributors = memberSummaries
    .filter(m => m.actualContribution > 0.01)
    .sort((a, b) => b.actualContribution - a.actualContribution)
  const shown = contributors.slice(0, MAX_SHOWN)
  const hiddenCount = contributors.length - shown.length
  const zero = memberSummaries.filter(m => m.actualContribution <= 0.01)

  const zeroText = zero.length === 0 ? null
    : zero.length <= MAX_ZERO_NAMES
      ? zero.map(m => m.memberName).join(', ')
      : `${zero.slice(0, MAX_ZERO_NAMES).map(m => m.memberName).join(', ')} and ${zero.length - MAX_ZERO_NAMES} more`

  return (
    <div style={cardStyle(c)}>
      <SectionHeader c={c} title="Contributions" count={contributionCount} action={{ label: 'View all', onClick: onViewAll }} />

      {shown.length === 0 && (
        <div style={{ font: `500 13px ${FONT}`, color: c.muted, padding: '2px 0 6px' }}>No contributions yet</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map(m => (
          <div key={m.memberId} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div aria-hidden style={{
              width: 30, height: 30, borderRadius: 15, background: c.accentSoft, color: c.accent, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', font: `800 11px ${FONT}`,
            }}>
              {initials(m.memberName)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `600 13px ${FONT}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.memberName}
              </div>
              {/* expectedContribution is a proportional slice of the target estimate, not an
                  obligation — what anyone owes comes from Settlement. Neutral wording only. */}
              {hasTarget && m.expectedContribution > 0 && (
                <div style={{ font: `500 11px ${FONT}`, color: c.muted }}>of {fmt(m.expectedContribution)} est. share</div>
              )}
            </div>
            <div style={{ font: `700 13px ${FONT}`, color: c.ink, flexShrink: 0, whiteSpace: 'nowrap' }}>{fmt(m.actualContribution)}</div>
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 8 }}>
          +{hiddenCount} more contributor{hiddenCount === 1 ? '' : 's'}
        </div>
      )}
      {zeroText && shown.length > 0 && (
        <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.faint}` }}>
          Not contributed yet: {zeroText}
        </div>
      )}
    </div>
  )
}
