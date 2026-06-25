import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { loadPublicProject } from '../lib/publicApi'
import { calcProjectSummary, calcMemberSummaries, calcSettlement, calcBudgetSummary } from '../lib/calculations'
import { BudgetBreakdownSection } from './BudgetBreakdownSection'
import { ActivityLogTab } from './ActivityLogTab'
import type { Project, ProjectMember, ProjectTransaction, ProjectAttachment, ProjectBudget, ProjectActivityLog } from '../types'

interface Props {
  shareCode: string
}

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
  const [tab, setTab] = useState<'overview' | 'expenses' | 'members' | 'settlement' | 'activity'>('overview')

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
  const budgetSummaryData = useMemo(
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

  if (notFound || !project || !summary) {
    return (
      <div style={{ minHeight: '100dvh', background: c.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ font: '800 24px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Project Not Found</div>
        <div style={{ font: '500 14px Plus Jakarta Sans', color: c.muted, textAlign: 'center' }}>
          This project link may have expired or been revoked.
        </div>
      </div>
    )
  }

  const target = project.target_amount || 0

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'expenses' as const, label: 'Transactions' },
    { id: 'members' as const, label: 'Members' },
    ...(members.length >= 2 ? [{ id: 'settlement' as const, label: 'Settlement' }] : []),
    { id: 'activity' as const, label: 'Activity' },
  ]

  return (
    <div style={{ minHeight: '100dvh', background: c.bg }}>
      {/* Header */}
      <div style={{ padding: '20px 18px 14px', borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.accent, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          MoneyPlant · Shared Project
        </div>
        <div style={{ font: '800 24px Plus Jakarta Sans', color: c.ink }}>{project.name}</div>
        {project.description && (
          <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginTop: 4, lineHeight: 1.4 }}>{project.description}</div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 10,
                border: 'none',
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

      {/* Content */}
      <div style={{ padding: '16px 18px 40px', maxWidth: 720, margin: '0 auto' }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Funding progress */}
            {target > 0 && (
              <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Funding Progress</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{ font: '800 24px Plus Jakarta Sans', color: '#10B981' }}>{fmt(summary.totalContributions)}</div>
                  <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>of {fmt(target)}</div>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: c.faint, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: '#10B981', width: `${summary.fundingProgress}%` }} />
                </div>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: '#10B981', marginTop: 6, textAlign: 'right' }}>{summary.fundingProgress.toFixed(0)}%</div>
              </div>
            )}

            {/* Spending progress */}
            {target > 0 && (
              <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Spending Progress</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{ font: '800 24px Plus Jakarta Sans', color: c.accent }}>{fmt(summary.totalExpenses)}</div>
                  <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>of {fmt(target)}</div>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: c.faint, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: c.accent, width: `${summary.spendingProgress}%` }} />
                </div>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.accent, marginTop: 6, textAlign: 'right' }}>{summary.spendingProgress.toFixed(0)}%</div>
              </div>
            )}

            {/* Budget breakdown */}
            {budgetSummaryData && budgetSummaryData.breakdowns.length > 0 && (
              <BudgetBreakdownSection budgetSummary={budgetSummaryData} targetAmount={target} role="viewer" />
            )}

            {/* Stats */}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, background: c.surface, borderRadius: 14, padding: '12px 14px', border: `1px solid ${c.faint}` }}>
                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Collected</div>
                <div style={{ font: '800 18px Plus Jakarta Sans', color: '#10B981', marginTop: 4 }}>{fmt(summary.totalContributions)}</div>
              </div>
              <div style={{ flex: 1, background: c.surface, borderRadius: 14, padding: '12px 14px', border: `1px solid ${c.faint}` }}>
                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Spent</div>
                <div style={{ font: '800 18px Plus Jakarta Sans', color: c.accent, marginTop: 4 }}>{fmt(summary.totalExpenses)}</div>
              </div>
              <div style={{ flex: 1, background: c.surface, borderRadius: 14, padding: '12px 14px', border: `1px solid ${c.faint}` }}>
                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Balance</div>
                <div style={{ font: '800 18px Plus Jakarta Sans', color: summary.remainingBudget >= 0 ? '#10B981' : '#EF4444', marginTop: 4 }}>{fmt(summary.remainingBudget)}</div>
              </div>
            </div>

            {/* Leaderboard */}
            {memberSummaries.length > 0 && (
              <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Contributions</div>
                {[...memberSummaries].sort((a, b) => b.actualContribution - a.actualContribution).map(ms => (
                  <div key={ms.memberId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{ms.memberName}</div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: '#10B981' }}>{fmt(ms.actualContribution)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'expenses' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>📭</div>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Project hasn't started yet</div>
                <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>The owner hasn't recorded any contributions or expenses.</div>
              </div>
            ) : transactions.map(txn => {
              const isContrib = txn.transaction_type === 'contribution'
              const txnAttach = attachments.filter(a => a.project_transaction_id === txn.id)
              return (
                <div key={txn.id} style={{ background: c.surface, borderRadius: 16, padding: '12px 14px', border: `1px solid ${c.faint}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 4, background: isContrib ? '#10B981' : c.accent }} />
                        <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{fmt(txn.amount)}</div>
                        <div style={{ font: '700 10px Plus Jakarta Sans', color: isContrib ? '#10B981' : c.accent, textTransform: 'uppercase' }}>{txn.transaction_type}</div>
                      </div>
                      {txn.member && (
                        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 3, paddingLeft: 16 }}>
                          {isContrib ? 'From' : 'Paid by'} {txn.member.name}
                        </div>
                      )}
                      {(txn.description || txn.category) && (
                        <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 2, paddingLeft: 16 }}>
                          {[txn.category, txn.description].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {txnAttach.length > 0 && (
                        <div style={{ font: '500 11px Plus Jakarta Sans', color: c.accent, marginTop: 3, paddingLeft: 16 }}>
                          {txnAttach.length} attachment{txnAttach.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>{txn.transaction_date}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'members' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map(m => {
              const ms = memberSummaries.find(s => s.memberId === m.id)
              return (
                <div key={m.id} style={{ background: c.surface, borderRadius: 16, padding: '12px 14px', border: `1px solid ${c.faint}` }}>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{m.name}</div>
                  {ms && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      <div>
                        <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Contributed</div>
                        <div style={{ font: '700 13px Plus Jakarta Sans', color: '#10B981' }}>{fmt(ms.actualContribution)}</div>
                      </div>
                      <div>
                        <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Expenses Paid</div>
                        <div style={{ font: '700 13px Plus Jakarta Sans', color: c.accent }}>{fmt(ms.totalExpensesPaid)}</div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'settlement' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {settlement.settlements.length === 0 ? (
              <div style={{ font: '600 14px Plus Jakarta Sans', color: c.muted, textAlign: 'center', paddingTop: 30 }}>All settled up!</div>
            ) : (
              <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Suggested Settlements</div>
                {settlement.settlements.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < settlement.settlements.length - 1 ? 12 : 0 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: '700 14px Plus Jakarta Sans', color: '#EF4444' }}>{s.fromMemberName}</div>
                      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>owes</div>
                    </div>
                    <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>{fmt(s.amount)}</div>
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>to</div>
                      <div style={{ font: '700 14px Plus Jakarta Sans', color: '#10B981' }}>{s.toMemberName}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'activity' && (
          <ActivityLogTab activityLog={activityLog} />
        )}
      </div>
    </div>
  )
}
