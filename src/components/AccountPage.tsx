import { useState, useEffect, useMemo, useRef } from 'react'
import { ArrowDownLeft, ArrowRightLeft, Pencil } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt, fmtDate } from '@/lib/utils'
import { catById as buildCatById } from '@/lib/data'
import { accountEffect } from '@/lib/transaction-deltas'
import { Card } from './Card'
import { Glyph } from './Glyph'
import { EditAccountSheet, AdjustBalanceSheet } from './AccountSheets'
import { ACCOUNT_TYPE_ICON, ACCOUNT_TYPE_LABEL, accountColor } from '@/lib/accounts'
import type { AppState, Transaction } from '@/types'

/** Rows shown here; "View all" opens Transactions filtered to this account, which
 *  searches beyond the loaded 200-row window. */
const RECENT_LIMIT = 10

const TYPE_TEXT: Partial<Record<Transaction['transaction_type'], string>> = {
  opening_balance: 'Opening Balance', balance_adjustment: 'Balance Adjustment', transfer: 'Transfer',
  credit_card_payment: 'Card bill', savings_contribution: 'Savings', savings_withdrawal: 'Savings withdrawal',
  borrowing: 'Borrowing', borrowing_repayment: 'Repayment',
}

interface Props {
  state: AppState
  accountId: string
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  onUpdateAccount: (id: string, form: { name: string; type: string; current_balance: number }) => Promise<void>
  onAdjustBalance: (accountId: string, actualBalance: number) => Promise<void>
  onQuickAdd: (type: 'income' | 'transfer', accountId: string) => void
  onAddTransaction?: () => void
  onViewTransactions: (accountId: string) => void
  onEditTransaction: (t: Transaction) => void
}

/** One bank / cash / wallet account: balance, Income / Transfer / Adjust, recent activity.
 *  Same full-screen shell and swipe-back as CreditCardsPage. Edit lives here, not on the dashboard row. */
export function AccountPage({
  state, accountId, onClose, onSwipeProgress,
  onUpdateAccount, onAdjustBalance, onQuickAdd, onAddTransaction, onViewTransactions, onEditTransaction,
}: Props) {
  const c = useTheme()
  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400

  const accs = useMemo(() => state.accounts.filter(a => a.is_active), [state.accounts])
  const account = accs.find(a => a.id === accountId) ?? null
  const color = accountColor(accs, accountId)

  // Deleted or deactivated elsewhere — nothing to show.
  useEffect(() => { if (!account) onClose() }, [account, onClose])

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

  const recent = useMemo(() => state.transactions
    .map(t => ({ t, effect: accountEffect(t, accountId) }))
    .filter(r => r.t.from_account_id === accountId || r.t.to_account_id === accountId)
    .slice(0, RECENT_LIMIT), [state.transactions, accountId])

  const catMap = useMemo(() => buildCatById(state.categories), [state.categories])
  const accName = (id?: string | null) => state.accounts.find(a => a.id === id)?.name ?? '?'

  const triggerClose = () => {
    setClosing(true); onSwipeProgress?.(1)
    setTimeout(() => { onSwipeProgress?.(0); onClose() }, 290)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    // An open sheet owns the gesture — otherwise the page slides out from under it.
    if (closing || editOpen || adjustOpen) return
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

  if (!account) return null

  const action = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button onClick={onClick} style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 14, padding: '12px 4px',
      font: '700 12px Plus Jakarta Sans', color: c.ink, cursor: 'pointer',
    }}>
      {icon}{label}
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{ACCOUNT_TYPE_LABEL[account.type]}</div>
          </div>
          <button
            onClick={() => setEditOpen(true)}
            aria-label="Edit account"
            style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: c.accentSoft, color: c.accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Pencil size={15} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 16px calc(32px + env(safe-area-inset-bottom, 0px))', maxWidth: 540, margin: '0 auto' }}>
        {/* Hero */}
        <Card pad={18} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Glyph name={ACCOUNT_TYPE_ICON[account.type] || 'wallet'} color={color} size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Balance</div>
              <div style={{ font: '800 30px Plus Jakarta Sans', color: account.current_balance < 0 ? c.bad : c.ink, letterSpacing: '-0.03em', marginTop: 2 }}>
                {fmt(account.current_balance, { decimals: account.current_balance % 1 ? 2 : 0 })}
              </div>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {action('Income', <ArrowDownLeft size={18} strokeWidth={2.4} color={c.good} />, () => onQuickAdd('income', account.id))}
          {accs.length > 1 && action('Transfer', <ArrowRightLeft size={18} strokeWidth={2.4} color={c.accent} />, () => onQuickAdd('transfer', account.id))}
          {action('Adjust', (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
          ), () => setAdjustOpen(true))}
        </div>

        {/* Recent activity */}
        <Card pad={6}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px 8px' }}>
            <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>Recent activity</div>
            <span onClick={() => onViewTransactions(account.id)} style={{ font: '600 13px Plus Jakarta Sans', color: c.accent, cursor: 'pointer' }}>View all</span>
          </div>
          {recent.length === 0 ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
              No recent transactions on this account.
            </div>
          ) : recent.map(({ t, effect }) => {
            const cat = t.category_id ? catMap[t.category_id] : undefined
            const label = t.transaction_type === 'transfer'
              ? (t.from_account_id === account.id ? `To ${accName(t.to_account_id)}` : `From ${accName(t.from_account_id)}`)
              : cat?.name ?? TYPE_TEXT[t.transaction_type] ?? 'Other'
            return (
              <div key={t.id} onClick={() => onEditTransaction(t)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderTop: `1px solid ${c.faint}`, cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
                  <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted }}>{fmtDate(t.transaction_date)} · {label}</div>
                </div>
                <div style={{ font: '800 14px Plus Jakarta Sans', color: effect > 0 ? c.good : c.ink, flexShrink: 0 }}>
                  {effect > 0 ? '+' : effect < 0 ? '−' : ''}{fmt(Math.abs(effect), { decimals: effect % 1 ? 2 : 0 })}
                </div>
              </div>
            )
          })}
        </Card>
      </div>

      <EditAccountSheet account={account} open={editOpen} onClose={() => setEditOpen(false)} onSave={onUpdateAccount} />
      <AdjustBalanceSheet account={account} open={adjustOpen} onClose={() => setAdjustOpen(false)} onAdjust={onAdjustBalance} onAddTransaction={onAddTransaction} />
    </div>
  )
}
