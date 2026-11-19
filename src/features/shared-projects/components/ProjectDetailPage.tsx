import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { calcProjectSummary, calcMemberSummaries, calcSettlement, calcBudgetSummary } from '../lib/calculations'
import { ProjectFormSheet } from './ProjectFormSheet'
import { ProjectTransactionSheet } from './ProjectTransactionSheet'
import { ShareSheet } from './ShareSheet'
import { ProjectOverview } from './overview/ProjectOverview'
import { TransactionsTab } from './transactions/TransactionsTab'
import { MembersTab } from './members/MembersTab'
import { BudgetManageSheet } from './BudgetManageSheet'
import { CollaboratorInviteSheet } from './CollaboratorInviteSheet'
import { ActivityLogTab } from './ActivityLogTab'
import type { Project, ProjectTab, ProjectTransaction, ProjectStatus, ProjectRole } from '../types'

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
  const [budgetManageOpen, setBudgetManageOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')

  const canEdit = role === 'owner' || role === 'editor'
  const isOwner = role === 'owner'

  const members = data.detail?.members ?? []
  const transactions = data.detail?.transactions ?? []
  const attachments = data.detail?.attachments ?? []
  const collaborators = data.detail?.collaborators ?? []

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
          <ProjectOverview
            project={project}
            summary={summary}
            memberSummaries={memberSummaries}
            transactions={transactions}
            budgetSummary={budgetSummary}
            role={role}
            canSettle={tabs.some(t => t.id === 'settlement')}
            onManageBudgets={() => setBudgetManageOpen(true)}
            onEditProject={() => setEditOpen(true)}
            onGoToTab={setTab}
          />
        )}
        {tab === 'expenses' && (
          <TransactionsTab
            transactions={transactions}
            attachments={attachments}
            members={members}
            canEdit={canEdit}
            onAdd={mode => setAddMode(mode)}
            onEdit={txn => { setEditTxn(txn); setAddMode(txn.transaction_type) }}
            onDelete={id => data.deleteProjectTransaction(id)}
            onViewAttachment={path => data.getAttachmentUrl(path).then(url => { if (url) window.open(url, '_blank') })}
            onDeleteAttachment={att => data.deleteAttachment(att)}
          />
        )}
        {tab === 'members' && (
          <MembersTab
            members={members}
            memberSummaries={memberSummaries}
            settlement={settlement}
            transactions={transactions}
            collaborators={collaborators}
            target={project.target_amount || 0}
            canEdit={canEdit}
            isOwner={isOwner}
            canSettle={tabs.some(t => t.id === 'settlement')}
            onAddMember={async ({ name, email }) => { await data.addMember(project.id, { name, email: email ?? undefined }) }}
            onUpdateMember={(id, { name, email }) => data.updateMember(id, { name, email })}
            onRemoveMember={id => data.removeMember(id)}
            onInvite={email => { setInviteEmail(email ?? ''); setInviteOpen(true) }}
            onRemoveCollaborator={id => data.removeCollaborator(project.id, id)}
            onGoToSettlement={() => setTab('settlement')}
          />
        )}
        {tab === 'settlement' && (
          <SettlementTab settlement={settlement} />
        )}
        {tab === 'activity' && (
          <ActivityLogTab activityLog={activityLog} />
        )}
      </div>

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
