import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Coins } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { calcProjectSummary, calcMemberSummaries, calcSettlement, calcBudgetSummary } from '../lib/calculations'
import { ProjectFormSheet } from './ProjectFormSheet'
import { ProjectTransactionSheet } from './ProjectTransactionSheet'
import { ShareSheet } from './ShareSheet'
import { BudgetBreakdownSection } from './BudgetBreakdownSection'
import { BudgetManageSheet } from './BudgetManageSheet'
import { CollaboratorInviteSheet } from './CollaboratorInviteSheet'
import { ActivityLogTab } from './ActivityLogTab'
import type { Project, ProjectTab, ProjectMember, ProjectTransaction, ProjectAttachment, ProjectStatus, ProjectRole } from '../types'

interface Props {
  project: Project
  data: ReturnType<typeof import('../hooks/useProjectsData').useProjectsData>
  role: ProjectRole
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  onProjectUpdated?: (p: Project) => void
}

export function ProjectDetailPage({ project, data, role, onClose, onSwipeProgress, onProjectUpdated }: Props) {
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
  const [budgetManageOpen, setBudgetManageOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')

  const canEdit = role === 'owner' || role === 'editor'
  const isOwner = role === 'owner'

  const members = data.detail?.members ?? []
  const transactions = data.detail?.transactions ?? []
  const attachments = data.detail?.attachments ?? []
  const collaborators = data.detail?.collaborators ?? []

  const collaboratorEmails = new Set(
    collaborators.map(c => c.invited_email).filter(Boolean) as string[]
  )
  const budgets = data.detail?.budgets ?? []

  const summary = useMemo(() => calcProjectSummary(project, members, transactions), [project, members, transactions])
  const budgetSummary = useMemo(() => calcBudgetSummary(project, budgets, transactions), [project, budgets, transactions])
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

  const handleAddTxn = async (form: Parameters<typeof data.addProjectTransaction>[0] & { files?: File[] }) => {
    const { files, ...txnForm } = form
    let txnId: string
    if (editTxn) {
      await data.updateProjectTransaction(editTxn.id, {
        member_id: txnForm.member_id,
        amount: txnForm.amount,
        description: txnForm.description || null,
        category: txnForm.category || null,
        notes: txnForm.notes || null,
        transaction_date: txnForm.transaction_date,
      })
      txnId = editTxn.id
      setEditTxn(null)
    } else {
      const txn = await data.addProjectTransaction(txnForm)
      txnId = txn.id
    }
    if (files?.length) {
      for (const file of files) {
        await data.uploadAttachment(file, project.id, txnId)
      }
      data.logActivity(project.id, 'attachment_added', `Added ${files.length} attachment${files.length > 1 ? 's' : ''}`)
    }
  }

  const activityLog = data.detail?.activityLog ?? []

  const tabs: { id: ProjectTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'expenses', label: 'Transactions' },
    { id: 'members', label: 'Members' },
    ...(members.length >= 2 ? [{ id: 'settlement' as ProjectTab, label: 'Settlement' }] : []),
    { id: 'activity', label: 'Activity' },
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
            {isOwner && (
              <button onClick={() => setShareOpen(true)} style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: c.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
              </button>
            )}
            {canEdit && (
              <button onClick={() => setEditOpen(true)} style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: c.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            )}
            {isOwner && (
              <button onClick={() => {
                if (confirm(`Delete "${project.name}"? This will remove all members, transactions, and attachments.`)) {
                  data.deleteProject(project.id)
                  triggerClose()
                }
              }} style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: '#EF444418', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            )}
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 120px', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        {tab === 'overview' && (
          <OverviewTab project={project} summary={summary} memberSummaries={memberSummaries} transactions={transactions} budgetSummary={budgetSummary} role={role} onManageBudgets={() => setBudgetManageOpen(true)} />
        )}
        {tab === 'expenses' && (
          <TransactionsTab
            transactions={transactions}
            attachments={attachments}
            canEdit={canEdit}
            onAdd={mode => setAddMode(mode)}
            onEdit={txn => { setEditTxn(txn); setAddMode(txn.transaction_type) }}
            onDelete={id => data.deleteProjectTransaction(id)}
            onViewAttachment={path => data.getAttachmentUrl(path).then(url => { if (url) window.open(url, '_blank') })}
            onDeleteAttachment={att => data.deleteAttachment(att)}
          />
        )}
        {tab === 'members' && (
          <>
          <MembersTab
            members={members}
            memberSummaries={memberSummaries}
            transactions={transactions}
            canEdit={canEdit}
            collaboratorEmails={collaboratorEmails}
            onAdd={() => { setEditMember(null); setMemberName(''); setMemberEmail(''); setAddMemberOpen(true) }}
            onEdit={m => { setEditMember(m); setMemberName(m.name); setMemberEmail(m.email || ''); setAddMemberOpen(true) }}
            onRemove={id => data.removeMember(id)}
            onInvite={isOwner ? (email) => { setInviteEmail(email); setInviteOpen(true) } : undefined}
          />
          {/* Collaborators section */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Collaborators</div>
              {isOwner && (
                <button onClick={() => setInviteOpen(true)} style={{ padding: '6px 14px', borderRadius: 10, border: 'none', background: c.accent, color: '#fff', font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}>+ Invite</button>
              )}
            </div>
            {collaborators.length === 0 ? (
              <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted }}>
                {isOwner ? 'No collaborators yet. Invite someone to share this project.' : 'No other collaborators.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {collaborators.map(collab => (
                  <div key={collab.id} style={{ background: c.surface, borderRadius: 14, padding: '10px 14px', border: `1px solid ${c.faint}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink }}>{collab.invited_email || 'Unknown'}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                        <span style={{ font: '700 10px Plus Jakarta Sans', color: collab.role === 'editor' ? '#6366F1' : c.muted, background: collab.role === 'editor' ? '#6366F118' : c.surface2, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>{collab.role}</span>
                        {collab.status === 'pending' && (
                          <span style={{ font: '700 10px Plus Jakarta Sans', color: '#F59E0B', background: '#F59E0B18', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>Pending</span>
                        )}
                      </div>
                    </div>
                    {isOwner && (
                      <button onClick={() => { if (confirm(`Remove ${collab.invited_email}?`)) data.removeCollaborator(project.id, collab.id) }} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#EF4444' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          </>
        )}
        {tab === 'settlement' && (
          <SettlementTab settlement={settlement} />
        )}
        {tab === 'activity' && (
          <ActivityLogTab activityLog={activityLog} />
        )}
      </div>

      {/* FAB for adding transactions */}
      {tab === 'expenses' && canEdit && (
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
          budgets={budgets}
          existingAttachmentCount={editTxn ? attachments.filter(a => a.project_transaction_id === editTxn.id).length : 0}
        />
      )}

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        project={project}
        onGenerateCode={() => data.generateShareCode(project.id)}
        onRevokeCode={() => data.revokeShareCode(project.id)}
      />

      <BudgetManageSheet
        open={budgetManageOpen}
        onClose={() => setBudgetManageOpen(false)}
        budgets={budgets}
        targetAmount={project.target_amount}
        onAdd={form => data.addBudget(project.id, form)}
        onUpdate={data.updateBudget}
        onRemove={data.removeBudget}
      />

      <CollaboratorInviteSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={(email, role) => data.addCollaborator(project.id, email, role)}
        projectName={project.name}
        initialEmail={inviteEmail}
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
                <input value={memberEmail} onChange={e => setMemberEmail(e.target.value)} placeholder="email@example.com" style={inputStyle} />
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
      `}</style>
    </div>,
    document.body
  )
}

// ── Tab components ──────────────────────────────────────────────────────

function OverviewTab({ project, summary, memberSummaries, transactions, budgetSummary, role, onManageBudgets }: {
  project: Project
  summary: ReturnType<typeof calcProjectSummary>
  memberSummaries: ReturnType<typeof calcMemberSummaries>
  transactions: ProjectTransaction[]
  budgetSummary: ReturnType<typeof calcBudgetSummary>
  role: ProjectRole
  onManageBudgets: () => void
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

      {/* Project Fund */}
      {summary.totalContributions > 0 && (() => {
        const fundExpenses = transactions
          .filter(t => t.transaction_type === 'expense' && t.member_id == null)
          .reduce((s, t) => s + t.amount, 0)
        const fundBalance = summary.totalContributions - fundExpenses
        const usedPct = summary.totalContributions > 0 ? Math.min(100, (fundExpenses / summary.totalContributions) * 100) : 0
        return (
          <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
            <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              Project Fund
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Contributed</div>
                <div style={{ font: '800 18px Plus Jakarta Sans', color: '#10B981', marginTop: 2 }}>{fmt(summary.totalContributions)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Used</div>
                <div style={{ font: '800 18px Plus Jakarta Sans', color: c.accent, marginTop: 2 }}>{fmt(fundExpenses)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Remaining</div>
                <div style={{ font: '800 18px Plus Jakarta Sans', color: fundBalance >= 0 ? '#10B981' : '#EF4444', marginTop: 2 }}>{fmt(fundBalance)}</div>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: c.faint, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: c.accent, width: `${usedPct}%`, transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 4, textAlign: 'right' }}>{usedPct.toFixed(0)}% used</div>
          </div>
        )
      })()}

      {/* Budget breakdown */}
      <BudgetBreakdownSection
        budgetSummary={budgetSummary}
        targetAmount={project.target_amount || 0}
        role={role}
        onManage={onManageBudgets}
      />

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

      {/* Recent Activity */}
      {transactions.length > 0 && (
        <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
            Recent Activity
          </div>
          {(() => {
            const recent = transactions.slice(0, 8)
            let lastDate = ''
            return recent.map(txn => {
              const isContrib = txn.transaction_type === 'contribution'
              const showDate = txn.transaction_date !== lastDate
              lastDate = txn.transaction_date
              return (
                <div key={txn.id}>
                  {showDate && (
                    <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, marginTop: 8, marginBottom: 6 }}>
                      {new Date(txn.transaction_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, paddingLeft: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                      background: isContrib ? '#10B981' : txn.member_id ? c.accent : '#6366F1',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isContrib
                          ? `${txn.member?.name || 'Unknown'} Contribution`
                          : txn.description || txn.category || 'Expense'
                        }
                      </div>
                      {!isContrib && txn.member_id == null && (
                        <div style={{ font: '500 10px Plus Jakarta Sans', color: '#6366F1' }}>From Project Fund</div>
                      )}
                      {!isContrib && txn.member && (
                        <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>Paid by {txn.member.name}</div>
                      )}
                    </div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: isContrib ? '#10B981' : c.ink, flexShrink: 0 }}>
                      {isContrib ? '+' : '−'}{fmt(txn.amount)}
                    </div>
                  </div>
                </div>
              )
            })
          })()}
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

function TransactionsTab({ transactions, attachments, canEdit, onAdd, onEdit, onDelete, onViewAttachment, onDeleteAttachment }: {
  transactions: ProjectTransaction[]
  attachments: ProjectAttachment[]
  canEdit: boolean
  onAdd: (mode: 'contribution' | 'expense') => void
  onEdit: (txn: ProjectTransaction) => void
  onDelete: (id: string) => void
  onViewAttachment: (path: string) => void
  onDeleteAttachment: (att: ProjectAttachment) => void
}) {
  const c = useTheme()
  const [filter, setFilter] = useState<'all' | 'contribution' | 'expense'>('all')

  const filtered = (filter === 'all' ? transactions : transactions.filter(t => t.transaction_type === filter))
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at))

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
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><Coins size={28} color="#A09890" /></div>
          <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Track contributions and expenses</div>
          <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5, marginBottom: 16 }}>Record contributions from members or log project expenses to start tracking progress.</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => onAdd('contribution')} style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: '#10B981', color: '#fff', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>+ Contribution</button>
            <button onClick={() => onAdd('expense')} style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: c.accent, color: '#fff', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>+ Expense</button>
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
                    <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 3, paddingLeft: 16 }}>
                      {txn.member
                        ? `${isContrib ? 'From' : 'Paid by'} ${txn.member.name}`
                        : (!isContrib ? 'Paid from Project Fund' : null)
                      }
                    </div>
                    {(txn.description || txn.category) && (
                      <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 2, paddingLeft: 16 }}>
                        {[txn.category, txn.description].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    {txnAttachments.length > 0 && (
                      <div style={{ paddingLeft: 16, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {txnAttachments.map(att => {
                          const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(att.file_name)
                          return (
                            <div key={att.id} style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '4px 8px', borderRadius: 8, background: c.surface2,
                            }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isImage ? '#6366F1' : c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {isImage ? (
                                  <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>
                                ) : (
                                  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>
                                )}
                              </svg>
                              <span
                                onClick={() => onViewAttachment(att.path)}
                                style={{ font: '500 11px Plus Jakarta Sans', color: c.accent, cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                {att.file_name}
                              </span>
                              {canEdit && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${att.file_name}?`)) onDeleteAttachment(att) }}
                                  style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#EF4444', flexShrink: 0 }}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          )
                        })}
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
                      <button onClick={() => { if (confirm(`Delete "${txn.description}" (${txn.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })})?`)) onDelete(txn.id) }} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#EF4444' }}>
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

function MembersTab({ members, memberSummaries, transactions, canEdit, collaboratorEmails, onAdd, onEdit, onRemove, onInvite }: {
  members: ProjectMember[]
  memberSummaries: ReturnType<typeof calcMemberSummaries>
  transactions: ProjectTransaction[]
  canEdit: boolean
  collaboratorEmails?: Set<string>
  onAdd: () => void
  onEdit: (m: ProjectMember) => void
  onRemove: (id: string) => void
  onInvite?: (email: string) => void
}) {
  const c = useTheme()
  const summaryMap = new Map(memberSummaries.map(ms => [ms.memberId, ms]))

  const totalContributions = transactions
    .filter(t => t.transaction_type === 'contribution')
    .reduce((s, t) => s + t.amount, 0)
  const fundExpenses = transactions
    .filter(t => t.transaction_type === 'expense' && t.member_id == null)
    .reduce((s, t) => s + t.amount, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{members.length} Member{members.length !== 1 ? 's' : ''}</div>
        {canEdit && (
          <button
            onClick={onAdd}
            style={{
              padding: '8px 16px', borderRadius: 12,
              border: 'none', background: c.accent, color: '#fff',
              font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
            }}
          >+ Add Member</button>
        )}
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
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {onInvite && m.email && !collaboratorEmails?.has(m.email) && (
                      <button
                        onClick={() => onInvite(m.email!)}
                        title="Invite to collaborate"
                        style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: c.accent }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                      </button>
                    )}
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
                {ms && (() => {
                  const fundUsed = totalContributions > 0
                    ? (ms.actualContribution / totalContributions) * fundExpenses
                    : 0
                  const fundRemaining = ms.actualContribution - fundUsed
                  return (
                    <>
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
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Paid Direct</div>
                          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.accent }}>{fmt(ms.totalExpensesPaid)}</div>
                        </div>
                      </div>
                      {ms.actualContribution > 0 && (
                        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                          <div>
                            <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Fund Used</div>
                            <div style={{ font: '700 13px Plus Jakarta Sans', color: c.accent }}>{fmt(Math.round(fundUsed))}</div>
                          </div>
                          <div>
                            <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Fund Remaining</div>
                            <div style={{ font: '700 13px Plus Jakarta Sans', color: fundRemaining >= 0 ? '#10B981' : '#EF4444' }}>{fmt(Math.round(fundRemaining))}</div>
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
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
