import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import { fmt } from '@/lib/utils'
import { buildReminders, type Reminder } from '@/components/RemindersBar'
import type { Insight } from '@/components/InsightCard'
import type { Project } from '../types'
import type { PendingInvite } from '../hooks/useProjectsSummary'
import type { AppState, Commitment } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  pendingInvites: PendingInvite[]
  sharedProjects: Project[]
  onAccept: (collaboratorId: string) => Promise<void>
  onDecline: (collaboratorId: string) => Promise<void>
  onViewProject: () => void
  // Extra alert data
  state?: AppState
  budgetPct?: number
  budgetSpent?: number
  budgetTotal?: number
  budgetPeriod?: string
  showReflection?: boolean
  onReflection?: () => void
  showYesterdayRecap?: boolean
  onYesterdayRecap?: () => void
  onMarkPaid?: (cm: Commitment, recordExpense: boolean, accountId: string | null) => Promise<void>
  // Shared dismissal
  insight?: Insight | null
  dismissedAlerts?: Set<string>
  onDismiss?: (id: string) => void
  onClearAll?: () => void
  budgetAlertId?: string
  reflectionAlertId?: string
  yesterdayRecapAlertId?: string
}

export function NotificationsSheet({
  open, onClose, pendingInvites, sharedProjects,
  onAccept, onDecline, onViewProject,
  state, budgetPct = 0, budgetSpent = 0, budgetTotal = 0,
  budgetPeriod = 'weekly', showReflection, onReflection, showYesterdayRecap, onYesterdayRecap, onMarkPaid,
  insight, dismissedAlerts, onDismiss, onClearAll, budgetAlertId, reflectionAlertId, yesterdayRecapAlertId,
}: Props) {
  const c = useTheme()
  const [processing, setProcessing] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())

  const reminders: Reminder[] = state ? buildReminders(state).filter(r => !dismissedAlerts?.has(r.id)) : []
  const showBudgetAlert = budgetPct >= 90 && !(budgetAlertId && dismissedAlerts?.has(budgetAlertId))
  const showReflectionAlert = !!showReflection && !(reflectionAlertId && dismissedAlerts?.has(reflectionAlertId))
  const showYesterdayRecapAlert = !!showYesterdayRecap && !(yesterdayRecapAlertId && dismissedAlerts?.has(yesterdayRecapAlertId))
  const showInsight = insight && !dismissedAlerts?.has(insight.id)

  const hasContent =
    pendingInvites.length > 0 ||
    sharedProjects.length > 0 ||
    showBudgetAlert ||
    reminders.length > 0 ||
    showReflectionAlert ||
    showYesterdayRecapAlert ||
    showInsight

  const hasDismissableContent =
    showBudgetAlert || reminders.length > 0 || showReflectionAlert || showYesterdayRecapAlert || showInsight

  const handleAccept = async (id: string) => {
    setProcessing(id)
    try {
      await onAccept(id)
      setAccepted(prev => new Set([...prev, id]))
    } catch (e) { console.error(e) }
    setProcessing(null)
  }

  const handleDecline = async (id: string) => {
    setProcessing(id)
    try { await onDecline(id) } catch (e) { console.error(e) }
    setProcessing(null)
  }

  const periodLabel = budgetPeriod === 'daily' ? 'daily' : budgetPeriod === 'monthly' ? 'monthly' : 'weekly'

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink }}>
            Notifications
          </div>
          {hasDismissableContent && onClearAll && (
            <button
              onClick={onClearAll}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                font: '700 12px Plus Jakarta Sans', color: c.accent,
                padding: '4px 8px', borderRadius: 8,
              }}
            >
              Clear All
            </button>
          )}
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

            {/* Insight alert (spending spike, budget pace, etc.) */}
            {showInsight && insight && (
              <NotifCard
                c={c}
                bg={insight.type === 'warning' ? '#FFFBEB' : insight.type === 'positive' || insight.type === 'celebrate' ? '#F0FDF4' : '#EFF6FF'}
                border={insight.type === 'warning' ? '#FDE68A' : insight.type === 'positive' || insight.type === 'celebrate' ? '#BBF7D0' : '#BFDBFE'}
                iconColor={insight.type === 'warning' ? '#F59E0B' : insight.type === 'positive' || insight.type === 'celebrate' ? '#22C55E' : c.accent}
                textColor={insight.type === 'warning' ? '#92400E' : insight.type === 'positive' || insight.type === 'celebrate' ? '#166534' : '#1E40AF'}
                icon={insight.type === 'warning' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                ) : insight.type === 'positive' || insight.type === 'celebrate' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                )}
                title={insight.type === 'warning' ? 'Spending Alert' : insight.type === 'positive' ? 'Good Progress' : insight.type === 'celebrate' ? 'Great Work!' : 'Insight'}
                subtitle={insight.text}
                onDismiss={() => onDismiss?.(insight.id)}
              />
            )}

            {/* Budget alert */}
            {showBudgetAlert && (
              <div style={{
                background: budgetPct >= 100 ? '#FEF2F2' : '#FFFBEB',
                borderRadius: 16, padding: '14px 16px',
                border: `1.5px solid ${budgetPct >= 100 ? '#FECACA' : '#FDE68A'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: budgetPct >= 100 ? '#EF444420' : '#F59E0B20',
                    color: budgetPct >= 100 ? '#EF4444' : '#F59E0B',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '700 14px Plus Jakarta Sans', color: budgetPct >= 100 ? '#991B1B' : '#92400E' }}>
                      {budgetPct >= 100 ? 'Budget exceeded!' : 'Budget almost spent'}
                    </div>
                    <div style={{ font: '500 12px Plus Jakarta Sans', color: budgetPct >= 100 ? '#991B1BAA' : '#92400EAA', marginTop: 2 }}>
                      {fmt(budgetSpent)} of {fmt(budgetTotal)} {periodLabel} budget ({Math.round(budgetPct)}%)
                    </div>
                  </div>
                  <button onClick={() => budgetAlertId && onDismiss?.(budgetAlertId)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: budgetPct >= 100 ? '#991B1B80' : '#92400E80', flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Commitment & credit card reminders */}
            {reminders.map(r => {
              const bgColor = r.urgent ? '#FEF2F2' : '#FFFBEB'
              const borderColor = r.urgent ? '#FECACA' : '#FDE68A'
              const iconColor = r.urgent ? '#EF4444' : '#F59E0B'
              const textColor = r.urgent ? '#991B1B' : '#92400E'

              return (
                <div key={r.id} style={{
                  background: bgColor, borderRadius: 16, padding: '14px 16px',
                  border: `1.5px solid ${borderColor}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: iconColor + '20', color: iconColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {r.type === 'credit_card_due' || r.type === 'credit_card_bill' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '700 13px Plus Jakarta Sans', color: textColor }}>{r.title}</div>
                      <div style={{ font: '500 11px Plus Jakarta Sans', color: textColor + 'AA', marginTop: 2 }}>{r.subtitle}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <div style={{ background: iconColor, borderRadius: 8, padding: '4px 8px', textAlign: 'center' }}>
                        <div style={{ font: '800 13px Plus Jakarta Sans', color: '#fff', lineHeight: 1 }}>{r.daysLeft}</div>
                        <div style={{ font: '600 8px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)', lineHeight: 1, marginTop: 1 }}>days</div>
                      </div>
                      <button onClick={() => onDismiss?.(r.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: textColor + '80' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Yesterday recap — morning */}
            {showYesterdayRecapAlert && (
              <div
                onClick={() => { onYesterdayRecap?.(); onClose() }}
                style={{
                  background: '#16C98A08', borderRadius: 16, padding: '14px 16px',
                  border: `1.5px solid #16C98A30`, cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: '#16C98A18', color: '#16C98A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Yesterday's Reflection</div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>See how yesterday went and grow today</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    <button
                      onClick={e => { e.stopPropagation(); if (yesterdayRecapAlertId) onDismiss?.(yesterdayRecapAlertId) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: c.muted + '80' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Today's reflection — evening/night */}
            {showReflectionAlert && (
              <div
                onClick={() => { onReflection?.(); onClose() }}
                style={{
                  background: '#16C98A08', borderRadius: 16, padding: '14px 16px',
                  border: `1.5px solid #16C98A30`, cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: '#16C98A18', color: '#16C98A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Today's Reflection</div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>See how today went and grow tomorrow</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    <button
                      onClick={e => { e.stopPropagation(); reflectionAlertId && onDismiss?.(reflectionAlertId) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: c.muted + '80' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Pending invitations — need accept/decline */}
            {pendingInvites.map(invite => (
              <div
                key={invite.id}
                style={{
                  background: '#6366F108', borderRadius: 16, padding: '14px 16px',
                  border: `1.5px solid #6366F130`,
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
                      Project invitation
                    </div>
                    <div style={{ font: '600 13px Plus Jakarta Sans', color: '#6366F1', marginTop: 2 }}>
                      {invite.project.name}
                    </div>
                    {invite.project.description && (
                      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2, lineHeight: 1.4 }}>
                        {invite.project.description}
                      </div>
                    )}
                    <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 4, textTransform: 'uppercase' }}>
                      Role: {invite.role}
                    </div>
                    {accepted.has(invite.id) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span style={{ font: '700 13px Plus Jakarta Sans', color: '#10B981' }}>Accepted</span>
                        <button
                          onClick={() => { onViewProject(); onClose() }}
                          style={{ marginLeft: 8, padding: '6px 14px', borderRadius: 8, border: 'none', background: c.accent, color: '#fff', font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}
                        >View Project</button>
                      </div>
                    ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => handleAccept(invite.id)}
                        disabled={processing === invite.id}
                        style={{
                          padding: '8px 20px', borderRadius: 10,
                          border: 'none', background: '#10B981', color: '#fff',
                          font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
                          opacity: processing === invite.id ? 0.6 : 1,
                        }}
                      >
                        {processing === invite.id ? '...' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleDecline(invite.id)}
                        disabled={processing === invite.id}
                        style={{
                          padding: '8px 20px', borderRadius: 10,
                          border: `1.5px solid ${c.faint}`, background: 'transparent',
                          color: c.muted, font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
                        }}
                      >
                        Decline
                      </button>
                    </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Already accepted shared projects */}
            {sharedProjects.map(p => (
              <div
                key={p.id}
                onClick={() => { onViewProject(); onClose() }}
                style={{
                  background: c.surface2, borderRadius: 16, padding: '14px 16px',
                  cursor: 'pointer', border: `1px solid ${c.faint}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: '#10B98118', color: '#10B981',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink }}>{p.name}</div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>Shared with you</div>
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

function NotifCard({ c, bg, border, iconColor, textColor, icon, title, subtitle, onDismiss }: {
  c: any; bg: string; border: string; iconColor: string; textColor: string
  icon: React.ReactNode; title: string; subtitle: string; onDismiss: () => void
}) {
  return (
    <div style={{
      background: bg, borderRadius: 16, padding: '14px 16px',
      border: `1.5px solid ${border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: iconColor + '20', color: iconColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 13px Plus Jakarta Sans', color: textColor }}>{title}</div>
          <div style={{ font: '500 11px Plus Jakarta Sans', color: textColor + 'AA', marginTop: 2 }}>{subtitle}</div>
        </div>
        <button onClick={onDismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: textColor + '80', flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
