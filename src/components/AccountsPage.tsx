import { useState, useEffect, useMemo, useRef } from 'react'
import { ArrowDownLeft, ArrowRightLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { accountColor, accountShare, shareLabel } from '@/lib/accounts'
import { Card } from './Card'
import { AccountRow } from './AccountRow'
import { BottomSheet } from './BottomSheet'
import { AddAccountSheet, EditAccountSheet, AdjustBalanceSheet } from './AccountSheets'
import { useAccountDelete } from './useAccountDelete'
import type { Account, AppState } from '@/types'

interface Props {
  state: AppState
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  onAddAccount: (form: { name: string; type: string; current_balance: number }) => Promise<void>
  onUpdateAccount: (id: string, form: { name: string; type: string; current_balance: number }) => Promise<void>
  onDeleteAccount: (id: string) => Promise<void>
  onAdjustBalance: (accountId: string, actualBalance: number) => Promise<void>
  onAddTransaction?: () => void
  /** accountId null = a transfer with no preset From (the bottom Transfer action). */
  onQuickAdd: (type: 'income' | 'transfer', accountId: string | null) => void
  onOpenAccount: (accountId: string) => void
  linkedAccountIds?: Set<string>
  onOpenBankSync?: () => void
}

/** Ring of each account's share, same colours as the dashboard bar. */
function Donut({ accs }: { accs: Account[] }) {
  const c = useTheme()
  const size = 92, stroke = 13, r = (size - stroke) / 2, circ = 2 * Math.PI * r
  const parts = accs.map(a => ({ id: a.id, pct: accountShare(accs, a.current_balance), color: accountColor(accs, a.id) })).filter(p => p.pct > 0)
  const gap = parts.length > 1 ? 2 : 0
  // Each arc starts where the previous ones end.
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((sum, q) => sum + q.pct / 100 * circ, 0))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c.faint} strokeWidth={stroke} />
      {parts.map((p, i) => {
        const len = Math.max(0, p.pct / 100 * circ - gap)
        return <circle key={p.id} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-starts[i]} />
      })}
    </svg>
  )
}

/** Every bank / cash / wallet account: total, distribution, and per-account options.
 *  Rows open AccountPage; same full-screen shell and swipe-back as CreditCardsPage. */
export function AccountsPage({
  state, onClose, onSwipeProgress,
  onAddAccount, onUpdateAccount, onDeleteAccount, onAdjustBalance, onAddTransaction, onQuickAdd, onOpenAccount,
  linkedAccountIds, onOpenBankSync,
}: Props) {
  const c = useTheme()
  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  // The account the menu / Edit / Adjust sheets act on. Kept after a sheet closes so
  // its content doesn't blank out mid-animation.
  const [target, setTarget] = useState<Account | null>(null)
  const [sheet, setSheet] = useState<'menu' | 'edit' | 'adjust' | null>(null)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400
  const { requestDelete, deletingId, deleteNode } = useAccountDelete(state, onDeleteAccount)

  const accs = useMemo(() => state.accounts.filter(a => a.is_active), [state.accounts])
  const total = accs.reduce((s, a) => s + a.current_balance, 0)
  const anySheet = addOpen || sheet !== null

  useEffect(() => {
    const t = setTimeout(() => setEntryPlayed(true), 360)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev; document.documentElement.style.overflow = prevHtml }
  }, [])

  const triggerClose = () => {
    setClosing(true); onSwipeProgress?.(1)
    setTimeout(() => { onSwipeProgress?.(0); onClose() }, 290)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (closing || anySheet) return
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
    const x = Math.max(0, dx); setDragX(x); onSwipeProgress?.(x / W)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dt = Date.now() - gestureRef.current.lastT
    const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
    gestureRef.current = null
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) triggerClose()
    else { setSnapping(true); setDragX(0); onSwipeProgress?.(0); setTimeout(() => setSnapping(false), 300) }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0); onSwipeProgress?.(0)
    setTimeout(() => setSnapping(false), 300)
  }

  const menuRows = target ? [
    { id: 'income', label: 'Add income', icon: <ArrowDownLeft size={18} color={c.good} />, onClick: () => onQuickAdd('income', target.id) },
    ...(accs.length > 1 ? [{ id: 'transfer', label: 'Transfer', icon: <ArrowRightLeft size={18} color={c.accent} />, onClick: () => onQuickAdd('transfer', target.id) }] : []),
    {
      id: 'adjust', label: 'Adjust balance', onClick: () => setSheet('adjust'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
        </svg>
      ),
    },
    { id: 'edit', label: 'Edit', icon: <Pencil size={18} color={c.muted} />, onClick: () => setSheet('edit') },
    { id: 'remove', label: 'Remove', icon: <Trash2 size={18} color={c.bad} />, onClick: () => { void requestDelete(target) }, danger: true },
  ] : []

  const bottomAction = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button onClick={onClick} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', font: '700 12.5px Plus Jakarta Sans', color: c.ink, padding: '4px 0' }}>
      <span style={{ width: 46, height: 46, borderRadius: 14, background: c.accentSoft, color: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      {label}
    </button>
  )

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}
      style={{
        position: 'fixed', inset: 0, background: c.bg, zIndex: 100,
        overflowY: dragX > 0 ? 'hidden' : 'auto',
        overscrollBehavior: 'contain',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        willChange: 'transform',
        ...(closing
          ? { transform: 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
          : dragX > 0
          ? { transform: `translateX(${dragX}px)`, animation: 'none', boxShadow: '-8px 0 24px rgba(0,0,0,0.18)' }
          : snapping
          ? { transform: 'translateX(0)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
          : entryPlayed ? {}
          : { animation: 'slideInFromRight 0.32s cubic-bezier(0.32,0.72,0,1)' }),
      }}
    >
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
          <button onClick={triggerClose} aria-label="Back" style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div style={{ flex: 1, minWidth: 0, font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Accounts</div>
          <button
            onClick={() => setAddOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, border: 'none', borderRadius: 999, padding: '8px 14px', background: c.accent, color: '#fff', font: '700 12.5px Plus Jakarta Sans', cursor: 'pointer' }}
          >
            <Plus size={15} strokeWidth={2.6} aria-hidden /> Add
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 16px calc(32px + env(safe-area-inset-bottom, 0px))', maxWidth: 540, margin: '0 auto' }}>
        {accs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>No accounts yet</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 6, lineHeight: 1.6 }}>
              Add a bank account or cash wallet to track where your money lives.
            </div>
          </div>
        ) : (
          <>
            {/* Total + distribution */}
            <Card pad={18} style={{ marginBottom: 18 }}>
              <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total Balance</div>
              <div style={{ font: '800 30px Plus Jakarta Sans', color: total < 0 ? c.bad : c.ink, letterSpacing: '-0.03em', marginTop: 2 }}>
                {fmt(total, { decimals: total % 1 ? 2 : 0 })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 14 }}>
                <Donut accs={accs} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {accs.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: accountColor(accs, a.id), flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, font: '600 12.5px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      <span style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, flexShrink: 0 }}>{shareLabel(accountShare(accs, a.current_balance))}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>Your Accounts ({accs.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {accs.map(a => (
                <div key={a.id} style={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 16, padding: '10px 12px' }}>
                  <AccountRow
                    account={a}
                    color={accountColor(accs, a.id)}
                    share={accountShare(accs, a.current_balance)}
                    variant="page"
                    onOpen={() => onOpenAccount(a.id)}
                    onMenu={() => { setTarget(a); setSheet('menu') }}
                    linked={linkedAccountIds?.has(a.id)}
                    onOpenBankSync={onOpenBankSync}
                    dimmed={deletingId === a.id}
                  />
                </div>
              ))}
            </div>

            <Card pad={14}>
              <div style={{ display: 'flex' }}>
                {bottomAction('Add Account', <Plus size={20} strokeWidth={2.4} />, () => setAddOpen(true))}
                {accs.length > 1 && bottomAction('Transfer', <ArrowRightLeft size={20} strokeWidth={2.4} />, () => onQuickAdd('transfer', null))}
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Per-account options */}
      <BottomSheet open={sheet === 'menu'} onClose={() => setSheet(null)} showHelpButton={false}>
        <div style={{ padding: '0 4px 16px' }}>
          <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{target?.name}</div>
          <div role="menu" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {menuRows.map(r => (
              <button
                key={r.id}
                role="menuitem"
                onClick={() => { setSheet(null); r.onClick() }}
                style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left', font: '700 14.5px Plus Jakarta Sans', color: r.danger ? c.bad : c.ink }}
              >
                <span style={{ display: 'flex' }}>{r.icon}</span>{r.label}
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>

      <AddAccountSheet open={addOpen} onClose={() => setAddOpen(false)} onAdd={onAddAccount} />
      <EditAccountSheet account={target} open={sheet === 'edit'} onClose={() => setSheet(null)} onSave={onUpdateAccount} />
      <AdjustBalanceSheet account={target} open={sheet === 'adjust'} onClose={() => setSheet(null)} onAdjust={onAdjustBalance} onAddTransaction={onAddTransaction} />
      {deleteNode}
    </div>
  )
}
