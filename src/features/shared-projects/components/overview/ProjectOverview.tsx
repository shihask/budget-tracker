import { useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import type { Project, ProjectRole, ProjectSummary, MemberSummary, ProjectTransaction, BudgetSummary, ProjectTab } from '../../types'
import { kittyBreakdown } from '../../lib/overview'
import { BudgetBreakdownSection } from '../BudgetBreakdownSection'
import { KittySummaryCard } from './KittySummaryCard'
import { TargetProgressCard } from './TargetProgressCard'
import { ContributionsCard } from './ContributionsCard'
import { RecentTransactionsCard } from './RecentTransactionsCard'
import { FONT, cardStyle } from './styles'
import { SectionHeader } from './ui'

interface Props {
  project: Project
  summary: ProjectSummary
  memberSummaries: MemberSummary[]
  transactions: ProjectTransaction[]
  budgetSummary: BudgetSummary
  role: ProjectRole
  /** The Settlement tab only exists with ≥ 2 members. */
  canSettle: boolean
  onManageBudgets: () => void
  onEditProject: () => void
  onGoToTab: (tab: ProjectTab) => void
}

// Two stacks side by side when there is room, one column otherwise — auto-fit
// wraps by itself, and min(100%, …) keeps a 320px phone from overflowing.
const columns: React.CSSProperties = {
  display: 'grid', gap: 12, alignItems: 'start',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
}
const stack: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }

export function ProjectOverview({
  project, summary, memberSummaries, transactions, budgetSummary, role,
  canSettle, onManageBudgets, onEditProject, onGoToTab,
}: Props) {
  const c = useTheme()
  const canEdit = role === 'owner' || role === 'editor'
  const target = project.target_amount || 0
  const kitty = useMemo(() => kittyBreakdown(summary, transactions), [summary, transactions])

  // Same visibility rules the cards apply themselves, so an empty column is
  // never rendered as a blank half of the screen.
  const showTarget = target > 0 || canEdit
  const showBudgets = budgetSummary.breakdowns.length > 0 || canEdit
  const showContribs = memberSummaries.length > 0
  const showRecent = transactions.length > 0

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <KittySummaryCard summary={summary} kitty={kitty} onSettle={canSettle ? () => onGoToTab('settlement') : undefined} />

      <div style={columns}>
        {(showTarget || showBudgets) && (
          <div style={stack}>
            {showTarget && <TargetProgressCard summary={summary} target={target} onSetTarget={canEdit ? onEditProject : undefined} />}
            {showBudgets && (
              <BudgetBreakdownSection budgetSummary={budgetSummary} targetAmount={target} role={role} onManage={onManageBudgets} />
            )}
          </div>
        )}
        {(showContribs || showRecent) && (
          <div style={stack}>
            {showContribs && (
              <ContributionsCard
                memberSummaries={memberSummaries}
                contributionCount={summary.contributionCount}
                hasTarget={target > 0}
                onViewAll={() => onGoToTab('members')}
              />
            )}
            {showRecent && <RecentTransactionsCard transactions={transactions} onViewAll={() => onGoToTab('expenses')} />}
          </div>
        )}
      </div>

      {project.notes && (
        <div style={cardStyle(c)}>
          <SectionHeader c={c} title="Notes" />
          <div style={{ font: `500 13px ${FONT}`, color: c.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{project.notes}</div>
        </div>
      )}
    </div>
  )
}
