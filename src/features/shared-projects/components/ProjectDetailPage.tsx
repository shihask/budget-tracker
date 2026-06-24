import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { calcProjectSummary, calcMemberSummaries, calcSettlement } from '../lib/calculations'
import { ProjectFormSheet } from './ProjectFormSheet'
import { ProjectTransactionSheet } from './ProjectTransactionSheet'
import { ShareSheet } from './ShareSheet'
import type { Project, ProjectTab, ProjectMember, ProjectTransaction, ProjectStatus } from '../types'

interface Props {
  project: Project
  data: ReturnType<typeof import('../hooks/useProjectsData').useProjectsData>
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  onProjectUpdated?: (p: Project) => void
}

export function ProjectDetailPage({ project, data, onClose, onSwipeProgress, onProjectUpdated }: Props) {
  const c = useTheme()
  const [tab, setTab] = useState<ProjectTab>('overview')
  const [editOpen, setEditOpen] = useState(false)
  const [addMode, setAddMode] = useState<'contribution' | 'expense' | null>(null)
  const [editTxn, setEditTxn] = useState<ProjectTransaction | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [memberName, setMemberName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [editMember, setEditMember] = useState<ProjectMember | null>(null)
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'found' | 'not_found'>('idle')
  const [emailUserName, setEmailUserName] = useState<string | null>(null)
  const emailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkEmail = useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) {
      setEmailStatus('idle')
      setEmailUserName(null)
      return
    }
    setEmailStatus('checking')
    try {
      const { data: result } = await supabase.rpc('mp_check_user_email', { p_email: trimmed })
      if (result?.exists) {
        setEmailStatus('found')
        setEmailUserName(result.name || null)
        if (!memberName.trim() && result.name) setMemberName(result.name)
      } else {
        setEmailStatus('not_found')
        setEmailUserName(null)
      }
    } catch {
      setEmailStatus('idle')
    }
  }, [memberName])

  const handleEmailChange = useCallback((val: string) => {
    setMemberEmail(val)
    setEmailStatus('idle')
    setEmailUserName(null)
    if (emailTimerRef.current) clearTimeout(emailTimerRef.current)
    if (val.trim().includes('@')) {
      emailTimerRef.current = setTimeout(() => checkEmail(val), 600)
    }
  }, [checkEmail])

  const members = data.detail?.members ?? []
  const transactions = data.detail?.transactions ?? []
  const attachments = data.detail?.attachments ?? []

  const summary = useMemo(() => calcProjectSummary(project, members, transactions), [project, members, transactions])
  const memberSummaries = useMemo(() => calcMemberSummaries(project, members, transactions), [project, members, transactions])
  const settlement = useMemo(() => calcSettlement(members, transactions), [members, transactions])

  // ── Swipe-back ────────────────────────────────────────────────────────
  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const dragXRef = useRef(0)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400

  useEffect(() => {
    const t = setTimeout(() => setEntryPlayed(true), 360)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  const triggerClose = () => {
    setClosing(true)
    onSwipeProgress?.(1)
    setTimeout(() => { onSwipeProgress?.(0); onClose() }, 290)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (closing) return
    const t = e.touches[0]
    if (t.clientX > 28) return
    gestureRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: Date.now() }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dy = Math.abs(t.clientY - gestureRef.current.startY)
    if (dy > Math.abs(dx) + 5 && Math.abs(dx) < 15) {
      gestureRef.current = null; setDragX(0); onSwipeProgress?.(0); return
    }
    gestureRef.current = { ...gestureRef.current, lastX: t.clientX, lastT: Date.now() }
    const x = Math.max(0, dx)
    dragXRef.current = x
    setDragX(x)
    onSwipeProgress?.(x / W)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dt = Date.now() - gestureRef.current.lastT
    const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
    gestureRef.current = null
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) {
      triggerClose()
    } else {
      setSnapping(true); setDragX(0); dragXRef.current = 0; onSwipeProgress?.(0)
      setTimeout(() => setSnapping(false), 300)
    }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0); dragXRef.current = 0; onSwipeProgress?.(0)
    setTimeout(() => setSnapping(false), 300)
  }

  const handleEditSave = async (form: { name: string; description?: string; notes?: string; target_amount: number; status?: ProjectStatus }) => {
    await data.updateProject(project.id, form)
    const updated = { ...project, ...form, updated_at: new Date().toISOString() }
    onProjectUpdated?.(updated)
  }

  const handleAddMember = async () => {
    if (!memberName.trim()) return
    if (editMember) {
      await data.updateMember(editMember.id, { name: memberName.trim(), email: memberEmail.trim() || undefined })
    } else {
      await data.addMember(project.id, { name: memberName.trim(), email: memberEmail.trim() || undefined })
    }
    setMemberName('')
    setMemberEmail('')
    setAddMemberOpen(false)
    setEditMember(null)
  }

  const handleAddTxn = async (form: Parameters<typeof data.addProjectTransaction>[0]) => {
    if (editTxn) {
      await data.updateProjectTransaction(editTxn.id, {
        member_id: form.member_id,
        amount: form.amount,
        description: form.description || null,
        category: form.category || null,
        notes: form.notes || null,
        transaction_date: form.transaction_date,
      })
      setEditTxn(null)
    } else {
      await data.addProjectTransaction(form)
    }
  }

  const tabs: { id: ProjectTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'expenses', label: 'Transactions' },
    { id: 'members', label: 'Members' },
    ...(members.length >= 2 ? [{ id: 'settlement' as ProjectTab, label: 'Settlement' }] : []),
  ]

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 14,
    border: `1.5px solid ${c.faint}`, background: c.surface2,
    font: '600 14px Plus Jakarta Sans', color: c.ink,
    outline: 'none', boxSizing: 'border-box',
  }

  return createPortal(
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 130,
        background: c.bg,
        transform: closing ? `translateX(${W}px)` : `translateX(${dragX}px)`,
        transition: (closing || snapping) ? 'transform 0.29s cubic-bezier(.4,.9,.3,1)' : entryPlayed ? 'none' : 'transform 0.33s cubic-bezier(.4,.9,.3,1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        ...(!entryPlayed && !closing ? { animation: 'slideInFromRight2 0.33s cubic-bezier(.4,.9,.3,1) forwards' } : {}),
      }}
    >
      {/* Header */}
      <div style={{ padding: '52px 18px 12px', background: c.bg, borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={triggerClose} style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: c.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <div>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink }}>{project.name}</div>
              {project.description && (
                <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{project.description}</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShareOpen(true)} style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: c.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
            <button onClick={() => setEditOpen(true)} style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: c.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        </div>

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

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 120px', WebkitOverflowScrolling: 'touch' }}>
        {tab === 'overview' && (
          <OverviewTab project={project} summary={summary} memberSummaries={memberSummaries} />
        )}
        {tab === 'expenses' && (
          <TransactionsTab
            transactions={transactions}
            attachments={attachments}
            onAdd={mode => setAddMode(mode)}
            onEdit={txn => { setEditTxn(txn); setAddMode(txn.transaction_type) }}
            onDelete={id => data.deleteProjectTransaction(id)}
          />
        )}
        {tab === 'members' && (
          <MembersTab
            members={members}
            memberSummaries={memberSummaries}
            onAdd={() => { setEditMember(null); setMemberName(''); setMemberEmail(''); setEmailStatus('idle'); setEmailUserName(null); setAddMemberOpen(true) }}
            onEdit={m => { setEditMember(m); setMemberName(m.name); setMemberEmail(m.email || ''); setEmailStatus('idle'); setEmailUserName(null); setAddMemberOpen(true) }}
            onRemove={id => data.removeMember(id)}
          />
        )}
        {tab === 'settlement' && (
          <SettlementTab settlement={settlement} />
        )}
      </div>

      {/* FAB for adding transactions */}
      {tab === 'expenses' && (
        <div style={{ position: 'fixed', bottom: 24, right: 20, display: 'flex', gap: 10, zIndex: 140 }}>
          <button
            onClick={() => setAddMode('contribution')}
            style={{
              padding: '12px 18px', borderRadius: 16, border: 'none',
              background: '#10B981', color: '#fff',
              font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
            }}
          >+ Contribution</button>
          <button
            onClick={() => setAddMode('expense')}
            style={{
              padding: '12px 18px', borderRadius: 16, border: 'none',
              background: c.accent, color: '#fff',
              font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
              boxShadow: `0 4px 16px ${c.accent}44`,
            }}
          >+ Expense</button>
        </div>
      )}

      {/* Sheets */}
      <ProjectFormSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={handleEditSave}
        project={project}
      />

      {addMode && (
        <ProjectTransactionSheet
          open={!!addMode}
          onClose={() => { setAddMode(null); setEditTxn(null) }}
          mode={addMode}
          members={members}
          projectId={project.id}
          onSave={handleAddTxn}
          editTxn={editTxn}
        />
      )}

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        project={project}
        onGenerateCode={() => data.generateShareCode(project.id)}
        onRevokeCode={() => data.revokeShareCode(project.id)}
      />

      {/* Add member dialog */}
      {addMemberOpen && createPortal(
        <div
          onClick={() => { setAddMemberOpen(false); setEditMember(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 250,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: c.surface, borderRadius: 22, padding: 20,
            width: '100%', maxWidth: 360, boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
          }}>
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16 }}>
              {editMember ? 'Edit Member' : 'Add Member'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Name</div>
                <input value={memberName} onChange={e => setMemberName(e.target.value)} placeholder="Member name" style={inputStyle} autoFocus />
              </div>
              <div>
                <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email (optional)</div>
                <div style={{ position: 'relative' }}>
                  <input value={memberEmail} onChange={e => handleEmailChange(e.target.value)} placeholder="email@example.com" style={inputStyle} />
                  {emailStatus === 'checking' && (
                    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, borderRadius: 999, border: '2px solid ' + c.accent, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                  )}
                  {emailStatus === 'found' && (
                    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                  )}
                  {emailStatus === 'not_found' && (
                    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                      </svg>
                    </div>
                  )}
                </div>
                {emailStatus === 'found' && emailUserName && (
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: '#10B981', marginTop: 4 }}>
                    Verified MoneyPlant user: {emailUserName}
                  </div>
                )}
                {emailStatus === 'not_found' && memberEmail.trim() && (
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: '#EF4444', marginTop: 4 }}>
                    Not a MoneyPlant user — ask them to create an account
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => { setAddMemberOpen(false); setEditMember(null) }}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 14,
                  border: `1.5px solid ${c.faint}`, background: 'transparent',
                  color: c.muted, font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={handleAddMember}
                disabled={!memberName.trim()}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 14,
                  border: 'none', background: memberName.trim() ? c.accent : c.faint,
                  color: '#fff', font: '700 14px Plus Jakarta Sans', cursor: memberName.trim() ? 'pointer' : 'default',
                }}
              >{editMember ? 'Update' : 'Add'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes slideInFromRight2 {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }
      `}</style>
    </div>,
    document.body
  )
}

// ── Tab components ──────────────────────────────────────────────────────

function OverviewTab({ project, summary, memberSummaries }: {
  project: Project
  summary: ReturnType<typeof calcProjectSummary>
  memberSummaries: ReturnType<typeof calcMemberSummaries>
}) {
  const c = useTheme()
  const target = project.target_amount || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Funding progress */}
      {target > 0 && (
        <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
            Funding Progress
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div style={{ font: '800 24px Plus Jakarta Sans', color: '#10B981' }}>
              {fmt(summary.totalContributions)}
            </div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>
              of {fmt(target)}
            </div>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: c.faint, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 4, background: '#10B981', width: `${summary.fundingProgress}%`, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: '#10B981', marginTop: 6, textAlign: 'right' }}>
            {summary.fundingProgress.toFixed(0)}%
          </div>
        </div>
      )}

      {/* Spending progress */}
      {target > 0 && (
        <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
            Spending Progress
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div style={{ font: '800 24px Plus Jakarta Sans', color: c.accent }}>
              {fmt(summary.totalExpenses)}
            </div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>
              of {fmt(target)}
            </div>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: c.faint, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 4, background: c.accent, width: `${summary.spendingProgress}%`, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.accent, marginTop: 6, textAlign: 'right' }}>
            {summary.spendingProgress.toFixed(0)}%
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: c.surface, borderRadius: 14, padding: '12px 14px', border: `1px solid ${c.faint}` }}>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Collected</div>
          <div style={{ font: '800 18px Plus Jakarta Sans', color: '#10B981', marginTop: 4 }}>{fmt(summary.totalContributions)}</div>
        </div>
        <div style={{ flex: 1, background: c.surface, borderRadius: 14, padding: '12px 14px', border: `1px solid ${c.faint}` }}>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Spent</div>
          <div style={{ font: '800 18px Plus Jakarta Sans', color: c.accent, marginTop: 4 }}>{fmt(summary.totalExpenses)}</div>
        </div>
        <div style={{ flex: 1, background: c.surface, borderRadius: 14, padding: '12px 14px', border: `1px solid ${c.faint}` }}>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Balance</div>
          <div style={{ font: '800 18px Plus Jakarta Sans', color: summary.remainingBudget >= 0 ? '#10B981' : '#EF4444', marginTop: 4 }}>{fmt(summary.remainingBudget)}</div>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: c.surface2, borderRadius: 14, padding: '10px 14px' }}>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Members</div>
          <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{summary.memberCount}</div>
        </div>
        <div style={{ flex: 1, background: c.surface2, borderRadius: 14, padding: '10px 14px' }}>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Expenses</div>
          <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{summary.expenseCount}</div>
        </div>
        <div style={{ flex: 1, background: c.surface2, borderRadius: 14, padding: '10px 14px' }}>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Contributions</div>
          <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{summary.contributionCount}</div>
        </div>
      </div>

      {/* Contribution leaderboard */}
      {memberSummaries.length > 0 && (
        <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
            Contributions
          </div>
          {[...memberSummaries]
            .sort((a, b) => b.actualContribution - a.actualContribution)
            .map(ms => {
              const pct = project.target_amount > 0
                ? Math.min(100, (ms.actualContribution / project.target_amount) * 100)
                : 0
              return (
                <div key={ms.memberId} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{ms.memberName}</div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: '#10B981' }}>{fmt(ms.actualContribution)}</div>
                  </div>
                  {project.target_amount > 0 && (
                    <div style={{ height: 4, borderRadius: 2, background: c.faint, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: '#10B981', width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}

      {/* Notes */}
      {project.notes && (
        <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Notes</div>
          <div style={{ font: '500 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{project.notes}</div>
        </div>
      )}
    </div>
  )
}

function TransactionsTab({ transactions, attachments, onAdd, onEdit, onDelete }: {
  transactions: ProjectTransaction[]
  attachments: { project_transaction_id: string; file_name: string; path: string }[]
  onAdd: (mode: 'contribution' | 'expense') => void
  onEdit: (txn: ProjectTransaction) => void
  onDelete: (id: string) => void
}) {
  const c = useTheme()
  const [filter, setFilter] = useState<'all' | 'contribution' | 'expense'>('all')

  const filtered = filter === 'all' ? transactions : transactions.filter(t => t.transaction_type === filter)

  return (
    <div>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['all', 'contribution', 'expense'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 10,
              border: `1.5px solid ${filter === f ? c.accent : c.faint}`,
              background: filter === f ? c.accentSoft : 'transparent',
              color: filter === f ? c.accent : c.muted,
              font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f === 'all' ? `All (${transactions.length})` : `${f}s (${transactions.filter(t => t.transaction_type === f).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 30 }}>
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>No transactions yet</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
            <button onClick={() => onAdd('contribution')} style={{ padding: '8px 16px', borderRadius: 12, border: 'none', background: '#10B981', color: '#fff', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>+ Contribution</button>
            <button onClick={() => onAdd('expense')} style={{ padding: '8px 16px', borderRadius: 12, border: 'none', background: c.accent, color: '#fff', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>+ Expense</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(txn => {
            const isContrib = txn.transaction_type === 'contribution'
            const txnAttachments = attachments.filter(a => a.project_transaction_id === txn.id)
            return (
              <div
                key={txn.id}
                style={{
                  background: c.surface, borderRadius: 16, padding: '12px 14px',
                  border: `1px solid ${c.faint}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: 4,
                        background: isContrib ? '#10B981' : c.accent,
                        flexShrink: 0,
                      }} />
                      <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>
                        {fmt(txn.amount)}
                      </div>
                      <div style={{
                        font: '700 10px Plus Jakarta Sans',
                        color: isContrib ? '#10B981' : c.accent,
                        textTransform: 'uppercase',
                      }}>
                        {txn.transaction_type}
                      </div>
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
                    {txnAttachments.length > 0 && (
                      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.accent, marginTop: 3, paddingLeft: 16 }}>
                        {txnAttachments.length} attachment{txnAttachments.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>{txn.transaction_date}</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => onEdit(txn)} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: c.muted }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button onClick={() => { if (confirm('Delete this transaction?')) onDelete(txn.id) }} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#EF4444' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MembersTab({ members, memberSummaries, onAdd, onEdit, onRemove }: {
  members: ProjectMember[]
  memberSummaries: ReturnType<typeof calcMemberSummaries>
  onAdd: () => void
  onEdit: (m: ProjectMember) => void
  onRemove: (id: string) => void
}) {
  const c = useTheme()
  const summaryMap = new Map(memberSummaries.map(ms => [ms.memberId, ms]))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{members.length} Member{members.length !== 1 ? 's' : ''}</div>
        <button
          onClick={onAdd}
          style={{
            padding: '8px 16px', borderRadius: 12,
            border: 'none', background: c.accent, color: '#fff',
            font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
          }}
        >+ Add Member</button>
      </div>

      {members.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 30 }}>
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>No members added yet</div>
          <button onClick={onAdd} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 12, border: 'none', background: c.accent, color: '#fff', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>Add first member</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {members.map(m => {
            const ms = summaryMap.get(m.id)
            return (
              <div key={m.id} style={{ background: c.surface, borderRadius: 16, padding: '12px 14px', border: `1px solid ${c.faint}`, opacity: m.is_active ? 1 : 0.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{m.name}</div>
                    {m.email && <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{m.email}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => onEdit(m)} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: c.muted }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button onClick={() => { if (confirm(`Remove ${m.name}?`)) onRemove(m.id) }} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#EF4444' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {ms && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <div>
                      <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Contributed</div>
                      <div style={{ font: '700 13px Plus Jakarta Sans', color: '#10B981' }}>{fmt(ms.actualContribution)}</div>
                    </div>
                    <div>
                      <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Expected</div>
                      <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(ms.expectedContribution)}</div>
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
    </div>
  )
}

function SettlementTab({ settlement }: { settlement: ReturnType<typeof calcSettlement> }) {
  const c = useTheme()

  if (settlement.settlements.length === 0 && settlement.creditors.length === 0 && settlement.debtors.length === 0) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 30 }}>
        <div style={{ font: '600 14px Plus Jakarta Sans', color: c.muted }}>All settled up!</div>
        <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 4 }}>Add expenses to see settlement calculations</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Settlement suggestions */}
      {settlement.settlements.length > 0 && (
        <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
            Suggested Settlements
          </div>
          {settlement.settlements.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < settlement.settlements.length - 1 ? 12 : 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: '#EF4444' }}>{s.fromMemberName}</div>
                <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>owes</div>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>
                {fmt(s.amount)}
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>to</div>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: '#10B981' }}>{s.toMemberName}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Creditors */}
      {settlement.creditors.length > 0 && (
        <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
            Should Receive
          </div>
          {settlement.creditors.map(cr => (
            <div key={cr.memberId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{cr.memberName}</div>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: '#10B981' }}>{fmt(cr.netCredit)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Debtors */}
      {settlement.debtors.length > 0 && (
        <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
            Should Pay
          </div>
          {settlement.debtors.map(db => (
            <div key={db.memberId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{db.memberName}</div>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: '#EF4444' }}>{fmt(db.netDebt)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, textAlign: 'center', padding: '8px 0' }}>
        Settlement calculations are read-only suggestions
      </div>
    </div>
  )
}
