import { useCallback, useEffect, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { useAppDialog } from '@/components/AppDialog'
import { summarize } from '../lib/budget'
import { readPendingInvite } from '../lib/invite'
import { householdErrorMessage } from '../lib/errors'
import { useHousehold } from '../hooks/useHousehold'
import type { HouseholdEntryType, HouseholdTransaction } from '../types'
import { Button, SharedBadge, Skeleton } from './ui'
import { useSwipeBack } from '../hooks/usePageShell'
import { CreateHouseholdSheet, HouseholdIntro } from './HouseholdIntro'
import { HouseholdOverview } from './HouseholdOverview'
import { HouseholdTransactionList } from './HouseholdTransactionList'
import { HouseholdTransactionSheet, type EntryMode } from './HouseholdTransactionSheet'
import { BudgetEditSheet, HouseholdBudgets, type BudgetTarget } from './HouseholdBudgets'
import { HouseholdMembers } from './HouseholdMembers'
import { InvitePartnerSheet } from './InvitePartnerSheet'
import { JoinHouseholdSheet } from './JoinHouseholdSheet'

type Tab = 'overview' | 'transactions' | 'budgets' | 'members'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'members', label: 'Members' },
]
const NOTICE_MS = 3000

/** Household — one full-screen page (same shell as Life Events / Savings) with its
 *  own data hook. Opened from NavMenu, or by App when an invite link is pending. */
export function HouseholdPage({ userName, guest, onClose, onSwipeProgress, onSaveGuest }: {
  userName: string
  guest: boolean
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  /** Guests can't have a household; this opens GuestSaveSheet. */
  onSaveGuest: () => void
}) {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()
  const api = useHousehold({ enabled: !guest })
  const { load, month, setMonth } = api
  const [tab, setTab] = useState<Tab>('overview')
  const [createOpen, setCreateOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [entry, setEntry] = useState<{ open: boolean; mode: EntryMode; key: number }>({ open: false, mode: { kind: 'add', type: 'expense' }, key: 0 })
  const [budgetTarget, setBudgetTarget] = useState<BudgetTarget | null>(null)
  const [budgetKey, setBudgetKey] = useState(0)
  const [joinToken, setJoinToken] = useState<string | null>(() => readPendingInvite())
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(t)
  }, [notice])

  const sheetOpen = createOpen || inviteOpen || entry.open || !!budgetTarget || !!joinToken
  const { handlers, style, dragging, triggerClose } = useSwipeBack({ onClose, onSwipeProgress, disabled: sheetOpen })

  const ready = load.status === 'ready' ? load : null
  const summary = useMemo(
    () => ready ? summarize(ready.data.transactions, ready.data.budgets, month) : null,
    [ready, month],
  )
  const activeMembers = ready ? ready.data.members.filter(m => m.status === 'active') : []
  // Newest invite that is still pending (it may have expired — Members says so).
  const pendingInvite = ready?.data.invites.find(i => i.status === 'pending') ?? null

  const openEntry = (mode: EntryMode) => setEntry(e => ({ open: true, mode, key: e.key + 1 }))
  const openAdd = (type: HouseholdEntryType) => openEntry({ kind: 'add', type })
  const openEdit = (txn: HouseholdTransaction) => openEntry({ kind: 'edit', txn })

  const onJoinDone = useCallback((joined: boolean) => {
    setJoinToken(null)
    if (joined) { setTab('overview'); setNotice('You joined the household') }
  }, [])

  const firstName = (userName.split(' ')[0] || userName).slice(0, 40)

  // ── Body ────────────────────────────────────────────────────────────────────
  let body: React.ReactNode
  if (guest) {
    body = <HouseholdIntro guest onCreate={() => {}} onSaveGuest={onSaveGuest} />
  } else if (load.status === 'loading') {
    body = <div aria-busy="true" aria-label="Loading household"><Skeleton height={44} /><Skeleton height={150} /><Skeleton height={80} /><Skeleton height={220} /></div>
  } else if (load.status === 'error') {
    body = (
      <div role="alert" style={{ textAlign: 'center', padding: '48px 12px' }}>
        <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>Couldn't load your household</div>
        <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginBottom: 18 }}>{householdErrorMessage(load.error, 'Check your connection and try again.')}</div>
        <Button onClick={() => void api.reload()}>Try again</Button>
      </div>
    )
  } else if (load.status === 'none') {
    body = <HouseholdIntro guest={false} onCreate={() => setCreateOpen(true)} onSaveGuest={onSaveGuest} />
  } else {
    const { me, data } = load
    body = (
      <>
        <div role="tablist" aria-label="Household sections" style={{ display: 'flex', gap: 4, background: c.surface2, borderRadius: 14, padding: 4, marginBottom: 16 }}>
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, border: 'none', borderRadius: 11, padding: '9px 2px', minHeight: 40, cursor: 'pointer',
                background: tab === t.id ? c.surface : 'transparent', color: tab === t.id ? c.ink : c.muted,
                boxShadow: tab === t.id ? c.cardShadow : 'none', font: '700 12px Plus Jakarta Sans' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {tab === 'overview' && summary && (
            <HouseholdOverview summary={summary} month={month} onMonth={setMonth} transactions={data.transactions}
              categories={data.categories} members={data.members} meMemberId={me.member_id}
              onAdd={openAdd} onOpenEntry={openEdit} onSeeAll={() => setTab('transactions')} onBudgets={() => setTab('budgets')} />
          )}
          {tab === 'transactions' && (
            <HouseholdTransactionList month={month} onMonth={setMonth} transactions={data.transactions}
              categories={data.categories} members={data.members} meMemberId={me.member_id}
              onOpen={openEdit} onAdd={() => openAdd('expense')} />
          )}
          {tab === 'budgets' && summary && (
            <HouseholdBudgets summary={summary} month={month} onMonth={setMonth} budgets={data.budgets} categories={data.categories}
              onEdit={t => { setBudgetKey(k => k + 1); setBudgetTarget(t) }} />
          )}
          {tab === 'members' && (
            <HouseholdMembers household={data.household} me={me} members={data.members} pendingInvite={pendingInvite} now={data.loadedAt}
              onInvite={() => setInviteOpen(true)} onRevokeInvite={api.revokeInvite} onRename={api.renameHousehold}
              onLeave={async () => { await api.leaveHousehold(); setTab('overview'); setNotice('You left the household') }}
              onRemove={async m => { await api.removeMember(m.id); setNotice(`${m.display_name} was removed`) }}
              confirm={confirm} />
          )}
        </div>
      </>
    )
  }

  const title = ready ? ready.data.household.name : 'Household'

  return (
    <>
      <div
        {...handlers}
        style={{
          position: 'fixed', inset: 0, zIndex: 200, background: c.bg,
          display: 'flex', flexDirection: 'column',
          overflowY: dragging ? 'hidden' : 'auto', overscrollBehavior: 'contain',
          fontFamily: '"Plus Jakarta Sans", sans-serif', willChange: 'transform',
          ...style,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(16px + env(safe-area-inset-top,0px)) 16px 12px', borderBottom: `1px solid ${c.faint}`, background: c.bg, position: 'sticky', top: 0, zIndex: 10 }}>
          <button onClick={triggerClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.muted, padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center', gap: 5, font: '600 14px Plus Jakarta Sans', minHeight: 40 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
            <div style={{ minWidth: 0, textAlign: 'right' }}>
              <h1 style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
              {ready && (
                <div style={{ marginTop: 3, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                  <SharedBadge />
                  <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>{activeMembers.length} {activeMembers.length === 1 ? 'member' : 'members'}</span>
                </div>
              )}
            </div>
            <div aria-hidden style={{ width: 32, height: 32, borderRadius: 10, background: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Users size={16} color="#fff" />
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 16px calc(32px + env(safe-area-inset-bottom,0px))', maxWidth: 720, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {body}
        </div>
      </div>

      {notice && (
        <div role="status" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(28px + env(safe-area-inset-bottom,0px))', zIndex: 240,
          background: c.ink, color: c.surface, borderRadius: 14, padding: '11px 16px', font: '700 13px Plus Jakarta Sans', boxShadow: '0 6px 24px rgba(0,0,0,0.28)', maxWidth: 'calc(100% - 32px)' }}>
          {notice}
        </div>
      )}

      <CreateHouseholdSheet open={createOpen} defaultName={firstName} onClose={() => setCreateOpen(false)}
        onCreate={async (name, displayName) => { await api.createHousehold(name, displayName); setNotice('Household created — invite your partner from Members') }} />

      {ready && (
        <>
          <HouseholdTransactionSheet
            key={entry.key}
            open={entry.open}
            mode={entry.mode}
            categories={ready.data.categories}
            members={ready.data.members}
            meMemberId={ready.me.member_id}
            onClose={() => setEntry(e => ({ ...e, open: false }))}
            onSave={async (input, editing) => {
              if (editing) { await api.updateEntry(editing.id, input, editing.updatedAt); setNotice('Entry updated') }
              else { await api.addEntry(input); setNotice(input.type === 'expense' ? 'Shared expense added' : 'Shared income added') }
            }}
            onDelete={async id => { await api.deleteEntry(id); setNotice('Entry deleted') }}
            onAddCategory={api.addCategory}
            confirm={confirm}
          />
          <BudgetEditSheet key={budgetKey} target={budgetTarget} onClose={() => setBudgetTarget(null)}
            onSave={async (target, limit) => {
              await api.setBudget(target.categoryId, limit, target.existing?.id ?? null)
              setNotice(limit == null ? 'Budget removed' : 'Budget saved')
            }} />
          <InvitePartnerSheet open={inviteOpen} pendingInvite={pendingInvite} now={ready.data.loadedAt} onClose={() => setInviteOpen(false)}
            onCreateInvite={api.createInvite} onRevoke={api.revokeInvite} />
        </>
      )}

      {joinToken && (guest || load.status === 'none' || load.status === 'ready') && (
        <JoinHouseholdSheet token={joinToken} guest={guest} defaultName={firstName}
          onPreview={api.previewInvite} onAccept={api.acceptInvite} onSaveGuest={onSaveGuest} onDone={onJoinDone} />
      )}

      {dialogNode}
    </>
  )
}
