import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { loadPublicProject } from '../lib/publicApi'
import { calcProjectSummary, calcMemberSummaries, calcSettlement, calcBudgetSummary } from '../lib/calculations'
import { ProjectOverview } from './overview/ProjectOverview'
import { TransactionsTab } from './transactions/TransactionsTab'
import { MembersTab } from './members/MembersTab'
import { SettlementTab } from './settlement/SettlementTab'
import { ActivityLogTab } from './ActivityLogTab'
import type { Project, ProjectMember, ProjectTransaction, ProjectAttachment, ProjectBudget, ProjectActivityLog, ProjectTab } from '../types'

interface Props {
  shareCode: string
}

// The public share link. Same screens as inside the app, read-only:
// role 'viewer' / canEdit false everywhere, no emails, no collaborators, and no
// receipt opening (receipt files are private to project members).
const noop = () => {}
const noopAsync = async () => {}

export function PublicProjectPage({ shareCode }: Props) {
  const c = useTheme()
  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<Project | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [transactions, setTransactions] = useState<ProjectTransaction[]>([])
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([])
  const [budgets, setBudgets] = useState<ProjectBudget[]>([])
  const [activityLog, setActivityLog] = useState<ProjectActivityLog[]>([])
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<ProjectTab>('overview')

  useEffect(() => {
    loadPublicProject(shareCode).then(result => {
      if (result) {
        setProject(result.project)
        setMembers(result.members)
        setTransactions(result.transactions)
        setAttachments(result.attachments)
        setBudgets(result.budgets)
        setActivityLog(result.activityLog)
      } else {
        setNotFound(true)
      }
      setLoading(false)
    })
  }, [shareCode])

  const summary = useMemo(
    () => project ? calcProjectSummary(project, members, transactions) : null,
    [project, members, transactions]
  )
  const memberSummaries = useMemo(
    () => project ? calcMemberSummaries(project, members, transactions) : [],
    [project, members, transactions]
  )
  const settlement = useMemo(
    () => calcSettlement(members, transactions),
    [members, transactions]
  )
  const budgetSummary = useMemo(
    () => project ? calcBudgetSummary(project, budgets, transactions) : null,
    [project, budgets, transactions]
  )

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ font: '600 16px Plus Jakarta Sans', color: c.muted }}>Loading project…</div>
      </div>
    )
  }

  if (notFound || !project || !summary || !budgetSummary) {
    return (
      <div style={{ minHeight: '100dvh', background: c.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ font: '800 24px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Project Not Found</div>
        <div style={{ font: '500 14px Plus Jakarta Sans', color: c.muted, textAlign: 'center' }}>
          This project link may have expired or been revoked.
        </div>
      </div>
    )
  }

  const canSettle = members.length >= 2
  const tabs: { id: ProjectTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'expenses', label: 'Transactions' },
    { id: 'members', label: 'Members' },
    ...(canSettle ? [{ id: 'settlement' as ProjectTab, label: 'Settlement' }] : []),
    { id: 'activity', label: 'Activity' },
  ]

  return (
    <div style={{ minHeight: '100dvh', background: c.bg }}>
      {/* Header */}
      <div style={{ padding: '20px 18px 12px', borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.accent, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            MoneyPlant · Shared Project
          </div>
          <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, overflowWrap: 'anywhere' }}>{project.name}</div>
          {project.description && (
            <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginTop: 4, lineHeight: 1.4 }}>{project.description}</div>
          )}

          {/* Tabs — scroll inside their own row on narrow phones, never the page */}
          <div role="tablist" style={{ display: 'flex', gap: 4, marginTop: 14, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {tabs.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: '1 0 auto', padding: '8px 12px', borderRadius: 10, border: 'none', whiteSpace: 'nowrap',
                  background: tab === t.id ? c.accent : 'transparent',
                  color: tab === t.id ? '#fff' : c.muted,
                  font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px 18px 40px' }}>
        {tab === 'overview' && (
          <ProjectOverview
            project={project}
            summary={summary}
            memberSummaries={memberSummaries}
            transactions={transactions}
            budgetSummary={budgetSummary}
            role="viewer"
            canSettle={canSettle}
            onManageBudgets={noop}
            onEditProject={noop}
            onGoToTab={setTab}
          />
        )}
        {tab === 'expenses' && (
          <TransactionsTab
            transactions={transactions}
            attachments={attachments}
            members={members}
            canEdit={false}
            receiptsViewable={false}
            onAdd={noop}
            onEdit={noop}
            onDelete={noopAsync}
            onViewAttachment={noop}
            onDeleteAttachment={noopAsync}
          />
        )}
        {tab === 'members' && (
          <MembersTab
            members={members}
            memberSummaries={memberSummaries}
            settlement={settlement}
            transactions={transactions}
            collaborators={[]}
            target={project.target_amount || 0}
            canEdit={false}
            isOwner={false}
            canSettle={canSettle}
            publicView
            onAddMember={noopAsync}
            onUpdateMember={noopAsync}
            onRemoveMember={noopAsync}
            onInvite={noop}
            onRemoveCollaborator={noopAsync}
            onGoToSettlement={() => setTab('settlement')}
          />
        )}
        {tab === 'settlement' && (
          <SettlementTab settlement={settlement} projectName={project.name} />
        )}
        {tab === 'activity' && (
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <ActivityLogTab activityLog={activityLog} />
          </div>
        )}
      </div>
    </div>
  )
}
