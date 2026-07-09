import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { toneColor, toneSoft, type ToneKey } from '@/lib/tokens'
import { BottomSheet } from '@/components/BottomSheet'
import type { Project } from '../types'
import type { PendingInvite } from '../hooks/useProjectsSummary'
import type { AppNotification, NotificationTone, NotificationTarget } from '@/types'
import type { SnoozeDuration } from '@/lib/notification-engine'

interface Props {
  open: boolean
  onClose: () => void
  pendingInvites: PendingInvite[]
  sharedProjects: Project[]
  onAccept: (collaboratorId: string) => Promise<void>
  onDecline: (collaboratorId: string) => Promise<void>
  onViewProject: () => void
  showReflection?: boolean
  onReflection?: () => void
  showYesterdayRecap?: boolean
  onYesterdayRecap?: () => void
  onDismissBanner?: (id: string) => void
  yesterdayRecapAlertId?: string
  reflectionAlertId?: string
  // Financial notifications — single source of truth, already generated/sorted/
  // snooze-filtered/limited by getAppNotifications() in App.tsx.
  notifications: AppNotification[]
  onSnoozeNotification: (id: string, duration: SnoozeDuration) => void
  onNavigate?: (target: NotificationTarget) => void
  onClearAll?: () => void
}

const TONE_KEY: Record<NotificationTone, ToneKey> = {
  critical: 'bad', warning: 'warn', info: 'accent', positive: 'good',
}

// Notifications arrive already sorted by priority (most important first). Group
// same-domain items together (wherever they fall in that order) so e.g. two Bills
// notifications collapse into one expandable card, without breaking the overall
// priority ordering — a group's position is wherever its first (highest-priority) member was.
function groupByDomain(notifications: AppNotification[]): AppNotification[][] {
  const groups: AppNotification[][] = []
  const indexByDomain = new Map<string, number>()
  for (const n of notifications) {
    const idx = indexByDomain.get(n.domain)
    if (idx != null) {
      groups[idx].push(n)
    } else {
      indexByDomain.set(n.domain, groups.length)
      groups.push([n])
    }
  }
  return groups
}

export function NotificationsSheet({
  open, onClose, pendingInvites, sharedProjects,
  onAccept, onDecline, onViewProject,
  showReflection, onReflection, showYesterdayRecap, onYesterdayRecap, onDismissBanner,
  yesterdayRecapAlertId, reflectionAlertId,
  notifications, onSnoozeNotification, onNavigate, onClearAll,
}: Props) {
  const c = useTheme()
  const [processing, setProcessing] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const hasContent =
    pendingInvites.length > 0 ||
    sharedProjects.length > 0 ||
    notifications.length > 0 ||
    !!showReflection ||
    !!showYesterdayRecap

  const hasDismissableContent = notifications.some(n => n.dismissible) || !!showReflection || !!showYesterdayRecap

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

  const toggleDomain = (key: string) => {
    setExpandedDomains(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Financial notifications — flat, already sorted by priority (most
                important first). No tier labels/dots: the card order alone
                communicates priority. Adjacent same-domain items collapse into
                one expandable group regardless of their individual tier. */}
            {groupByDomain(notifications).map(group => {
              if (group.length === 1) {
                const n = group[0]
                return (
                  <NotifCard
                    key={n.id}
                    n={n}
                    c={c}
                    menuOpen={menuOpenId === n.id}
                    onToggleMenu={() => setMenuOpenId(prev => prev === n.id ? null : n.id)}
                    onSnooze={d => { onSnoozeNotification(n.id, d); setMenuOpenId(null) }}
                    onNavigate={onNavigate}
                  />
                )
              }
              const groupKey = group[0].domain
              const expanded = expandedDomains.has(groupKey)
              const border = toneColor(c, TONE_KEY[group[0].tone])
              const bg = toneSoft(c, TONE_KEY[group[0].tone])
              return (
                <div key={groupKey} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div
                    onClick={() => toggleDomain(groupKey)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: bg, border: `1.5px solid ${border}44`, borderRadius: 14,
                      padding: '12px 14px', cursor: 'pointer',
                    }}
                  >
                    <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, textTransform: 'capitalize' }}>
                      {group[0].domain.replace('_', ' ')} ({group.length})
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                  {expanded && group.map(n => (
                    <NotifCard
                      key={n.id}
                      n={n}
                      c={c}
                      menuOpen={menuOpenId === n.id}
                      onToggleMenu={() => setMenuOpenId(prev => prev === n.id ? null : n.id)}
                      onSnooze={d => { onSnoozeNotification(n.id, d); setMenuOpenId(null) }}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              )
            })}

            {/* Yesterday recap — morning */}
            {showYesterdayRecap && (
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
                      onClick={e => { e.stopPropagation(); if (yesterdayRecapAlertId) onDismissBanner?.(yesterdayRecapAlertId) }}
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
            {showReflection && (
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
                      onClick={e => { e.stopPropagation(); reflectionAlertId && onDismissBanner?.(reflectionAlertId) }}
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

function NotifCard({ n, c, menuOpen, onToggleMenu, onSnooze, onNavigate }: {
  n: AppNotification
  c: any
  menuOpen: boolean
  onToggleMenu: () => void
  onSnooze: (d: SnoozeDuration) => void
  onNavigate?: (target: NotificationTarget) => void
}) {
  const border = toneColor(c, TONE_KEY[n.tone])
  const bg = toneSoft(c, TONE_KEY[n.tone])

  return (
    <div style={{ position: 'relative', background: bg, borderRadius: 16, padding: '14px 16px', border: `1.5px solid ${border}44` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: border + '20', color: border,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {n.tone === 'positive' ? <polyline points="20 6 9 17 4 12"/> : n.tone === 'info' ? (
              <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
            ) : (
              <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>
            )}
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{n.title}</div>
          <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2, lineHeight: 1.45 }}>{n.message}</div>

          {n.progress && n.progress.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {n.progress.map(p => (
                <div key={p.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', font: '600 10px Plus Jakarta Sans', color: c.muted, marginBottom: 3 }}>
                    <span>{p.label}</span><span>{p.pct}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: c.faint, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 999, background: border, width: `${Math.min(100, p.pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {n.reasons && n.reasons.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ font: '700 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Main contributors</div>
              {n.reasons.map(r => (
                <div key={r.label} style={{ font: '600 11px Plus Jakarta Sans', color: c.ink }}>
                  • {r.label} +₹{r.amount.toLocaleString('en-IN')}
                </div>
              ))}
            </div>
          )}

          {n.recommendation && (
            <div style={{ font: '600 11px Plus Jakarta Sans', color: border, marginTop: 8, lineHeight: 1.4 }}>
              {n.recommendation}
            </div>
          )}

          {n.actions && n.actions.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {n.actions.map(a => (
                <button
                  key={a.label}
                  onClick={() => onNavigate?.(a.target)}
                  style={{ padding: '6px 12px', borderRadius: 9, border: `1px solid ${border}55`, background: 'none', color: border, font: '700 11px Plus Jakarta Sans', cursor: 'pointer' }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {n.dismissible && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={onToggleMenu}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: c.muted }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 24, zIndex: 10,
                background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 150, overflow: 'hidden',
              }}>
                {[
                  { d: 'permanent' as SnoozeDuration, label: 'Dismiss' },
                  { d: 'tomorrow' as SnoozeDuration, label: 'Remind Tomorrow' },
                  { d: 'next_week' as SnoozeDuration, label: 'Hide Until Next Week' },
                ].map(opt => (
                  <button key={opt.d} onClick={() => onSnooze(opt.d)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', font: '600 12px Plus Jakarta Sans', color: c.ink }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
