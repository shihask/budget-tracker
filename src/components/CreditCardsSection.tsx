import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { useAppDialog } from './AppDialog'
import { fmt } from '@/lib/utils'
import { Card } from './Card'
import { BottomSheet, HelpText, HelpToggle } from './BottomSheet'
import { getCreditCardBilling } from '@/lib/credit-card'
import type { AppState, CreditCard } from '@/types'

interface Props {
  state: AppState
  onAdd: (form: Omit<CreditCard, 'id' | 'user_id' | 'is_active'>) => Promise<void>
  onUpdate: (id: string, form: Omit<CreditCard, 'id' | 'user_id' | 'is_active'>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onPayBill: (card: CreditCard, amount: number, accountId: string) => Promise<void>
  onAdjustBalance: (cardId: string, actualBalance: number, billedAmount?: number) => Promise<void>
}

type CardForm = {
  name: string
  last_four: string
  credit_limit: string
  cycle_start_day: string
  bill_day: string
  due_day: string
  current_balance: string
}

const EMPTY_FORM: CardForm = {
  name: '', last_four: '', credit_limit: '', cycle_start_day: '1',
  bill_day: '15', due_day: '30', current_balance: '0',
}

function getDaysUntil(day: number): number {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(now.getFullYear(), now.getMonth(), day)
  if (target < today) target.setMonth(target.getMonth() + 1)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function dayLabel(n: number): string {
  if (n <= 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  return `in ${n} days`
}


export function CreditCardsSection({ state, onAdd, onUpdate, onDelete, onPayBill, onAdjustBalance }: Props) {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CardForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [payTarget, setPayTarget] = useState<CreditCard | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payAccountId, setPayAccountId] = useState('')
  const [paying, setPaying] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<CreditCard | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustBilled, setAdjustBilled] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  const accounts = state.accounts.filter(a => a.is_active)
  const cards = state.credit_cards || []

  const totalBilled = cards.reduce((s, cd) => {
    const b = getCreditCardBilling(cd, state.transactions)
    return s + Math.max(0, b.billedAmount)
  }, 0)

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    font: '600 11px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block',
  }

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setSheetOpen(true) }
  const openEdit = (card: CreditCard) => {
    setEditingId(card.id)
    setForm({
      name: card.name, last_four: card.last_four || '',
      credit_limit: String(card.credit_limit),
      cycle_start_day: String(card.cycle_start_day),
      bill_day: String(card.bill_day),
      due_day: String(card.due_day),
      current_balance: String(card.current_balance),
    })
    setSheetOpen(true)
  }
  const closeSheet = () => { setSheetOpen(false); setEditingId(null); setForm(EMPTY_FORM) }

  const handleSave = async () => {
    if (!form.name.trim() || !form.credit_limit) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      last_four: form.last_four || null,
      credit_limit: parseFloat(form.credit_limit),
      cycle_start_day: parseInt(form.cycle_start_day) || 1,
      bill_day: parseInt(form.bill_day) || 15,
      due_day: parseInt(form.due_day) || 30,
      current_balance: parseFloat(form.current_balance) || 0,
    }
    try {
      if (editingId) await onUpdate(editingId, payload)
      else await onAdd(payload)
      closeSheet()
    } catch (_) {}
    setSaving(false)
  }

  const handlePayBill = async () => {
    if (!payTarget || !payAmount || !payAccountId) return
    setPaying(true)
    try {
      await onPayBill(payTarget, parseFloat(payAmount), payAccountId)
      setPayTarget(null)
    } catch (_) {}
    setPaying(false)
  }

  const handleAdjustBalance = async () => {
    if (!adjustTarget || !adjustAmount) return
    setAdjusting(true)
    try {
      const billing = getCreditCardBilling(adjustTarget, state.transactions)
      const newBilled = adjustBilled ? parseFloat(adjustBilled) : undefined
      const billedChanged = newBilled !== undefined && Math.abs(newBilled - billing.billedAmount) > 0.01
      await onAdjustBalance(adjustTarget.id, parseFloat(adjustAmount), billedChanged ? newBilled : undefined)
      setAdjustTarget(null)
    } catch (_) {}
    setAdjusting(false)
  }

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<string | null>(null)

  const InfoIcon = ({ id, text }: { id: string; text: string }) => (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => setTooltip(tooltip === id ? null : id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 4px', color: c.muted, display: 'flex', alignItems: 'center' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </button>
      {tooltip === id && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: c.ink, color: c.bg, borderRadius: 10, padding: '8px 10px',
          font: '600 11px Plus Jakarta Sans', lineHeight: 1.5, zIndex: 10,
          width: 200, whiteSpace: 'normal', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {text}
        </div>
      )}
    </span>
  )
  const cardColors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
  const colorFor = (name: string) => cardColors[name.charCodeAt(0) % cardColors.length]

  return (
    <>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: cards.length ? 16 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#EC4899', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><line x1="5" y1="15" x2="9" y2="15"/>
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Credit Cards</div>
                <button onClick={() => setInfoOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.muted }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                </button>
              </div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                {cards.length} card{cards.length !== 1 ? 's' : ''} · Billed {fmt(totalBilled)}
              </div>
            </div>
          </div>
          <button onClick={openAdd} style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: c.accentSoft, color: c.accent, cursor: 'pointer', font: '700 20px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>

        {cards.length === 0 ? (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>No cards yet. Tap + to add one.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {cards.map(card => {
              const col = colorFor(card.name)
              const utilPct = card.credit_limit > 0 ? Math.min(100, Math.round((card.current_balance / card.credit_limit) * 100)) : 0
              const available = card.credit_limit - card.current_balance
              const daysUntilBill = getDaysUntil(card.bill_day)
              const daysUntilDue = getDaysUntil(card.due_day)
              const isUrgent = daysUntilDue <= 5
              const billing = getCreditCardBilling(card, state.transactions)

              const isExpanded = expandedId === card.id

              return (
                <div
                  key={card.id}
                  style={{ background: col + '12', borderRadius: 16, border: `1px solid ${col}30`, overflow: 'hidden' }}
                >
                  {/* Compact header — always visible */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', cursor: 'pointer' }}
                    onClick={() => setExpandedId(isExpanded ? null : card.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="5" width="20" height="14" rx="3" fill="rgba(255,255,255,0.2)" stroke="#fff" strokeWidth="1.5"/>
                          <rect x="2" y="9.5" width="20" height="2.5" fill="rgba(255,255,255,0.25)" stroke="none"/>
                          <rect x="4.5" y="13" width="4" height="3" rx="1" fill="rgba(255,255,255,0.7)" stroke="none"/>
                          <path d="M13.5 13.8a1.8 1.8 0 010-3.6" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" fill="none"/>
                          <path d="M15 14.6a3.4 3.4 0 000-5.2" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3" fill="none"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{card.name}</div>
                        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>
                          {billing.billedAmount > 0
                            ? <span style={{ color: c.bad }}>{fmt(billing.billedAmount)} billed</span>
                            : card.last_four ? <>•••• {card.last_four}</> : 'No bill due'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={e => { e.stopPropagation(); setPayTarget(card); setPayAmount(String(billing.billedAmount || card.current_balance)); setPayAccountId(accounts[0]?.id || '') }}
                        style={{ background: col, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px', font: '700 11px Plus Jakarta Sans', cursor: 'pointer' }}
                      >
                        Pay Bill
                      </button>
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div
                      style={{ padding: '0 14px 14px', borderTop: `1px solid ${col}25` }}
                    >
                      {/* Total outstanding */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, marginTop: 12 }}>
                        <div>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Outstanding</div>
                          <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>{fmt(card.current_balance)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available</div>
                          <div style={{ font: '800 20px Plus Jakarta Sans', color: c.good, letterSpacing: '-0.02em' }}>{fmt(available)}</div>
                        </div>
                      </div>

                      {/* Billed / Unbilled split */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }} onClick={e => e.stopPropagation()}>
                        <div style={{ flex: 1, background: c.surface, borderRadius: 10, padding: '8px 10px' }}>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Billed</div>
                          <div style={{ font: '700 15px Plus Jakarta Sans', color: billing.billedAmount > 0 ? c.bad : c.ink, marginTop: 2 }}>{fmt(billing.billedAmount)}</div>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>pay by {card.due_day}th</div>
                        </div>
                        <div style={{ flex: 1, background: c.surface, borderRadius: 10, padding: '8px 10px' }}>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Unbilled</div>
                          <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{fmt(billing.unbilledAmount)}</div>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>since {card.bill_day}th</div>
                        </div>
                      </div>

                      {/* Utilization bar */}
                      <div style={{ height: 6, borderRadius: 999, background: c.surface2, overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ width: utilPct + '%', height: '100%', borderRadius: 999, background: utilPct > 80 ? c.bad : utilPct > 50 ? c.warn : col, transition: 'width 0.4s' }} />
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>{utilPct}% used of {fmt(card.credit_limit)}</span>
                      </div>

                      {/* Dates */}
                      <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                        <div style={{ flex: 1, background: c.surface, borderRadius: 10, padding: '8px 10px' }}>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bill date</div>
                          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{card.bill_day}th</div>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{dayLabel(daysUntilBill)}</div>
                        </div>
                        <div style={{ flex: 1, background: isUrgent ? c.badSoft : c.surface, borderRadius: 10, padding: '8px 10px', border: isUrgent ? `1px solid ${c.bad}40` : 'none' }}>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: isUrgent ? c.bad : c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Due date</div>
                          <div style={{ font: '700 13px Plus Jakarta Sans', color: isUrgent ? c.bad : c.ink, marginTop: 2 }}>{card.due_day}th</div>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: isUrgent ? c.bad : c.muted, marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                            {isUrgent && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.bad} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.3 3.3L2 21h20L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="17" r=".8" fill={c.bad}/>
                              </svg>
                            )}
                            {dayLabel(daysUntilDue)}
                          </div>
                        </div>
                        <div style={{ flex: 1, background: c.surface, borderRadius: 10, padding: '8px 10px' }}>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cycle</div>
                          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{card.cycle_start_day}th</div>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>start day</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setAdjustTarget(card); setAdjustAmount(String(card.current_balance)); setAdjustBilled(String(billing.billedAmount)) }}
                          style={{ flex: 1, background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 10, padding: '8px 0', font: '700 11px Plus Jakarta Sans', color: c.ink, cursor: 'pointer' }}
                        >
                          Adjust Balance
                        </button>
                        <button
                          onClick={() => openEdit(card)}
                          style={{ flex: 1, background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 10, padding: '8px 0', font: '700 11px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}
                        >
                          Edit Card
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Section info popup */}
      {infoOpen && (
        <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="3" fill="none" stroke={c.accent} strokeWidth="2"/>
                  <line x1="2" y1="10" x2="22" y2="10" stroke={c.accent} strokeWidth="2"/>
                  <line x1="6" y1="15" x2="10" y2="15" stroke={c.accent} strokeWidth="2"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Credit Cards</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
                  title: 'Track outstanding balance',
                  desc: 'See how much you currently owe on each card and your available credit at a glance.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
                  title: 'Bill & due date alerts',
                  desc: 'Set your billing cycle, statement date, and due date to get warned when payment is approaching.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
                  title: 'Pay bill',
                  desc: 'Record a payment from any of your accounts — the outstanding balance updates automatically.',
                },
              ] as const).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    {item.svg}
                  </div>
                  <div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{item.title}</div>
                    <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 2, lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: '12px', background: c.surface2, borderRadius: 12 }}>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6 }}>
                Enable credit card tracking in <strong style={{ color: c.ink }}>Settings</strong> to show this section on your dashboard.
              </div>
            </div>
            <button onClick={() => setInfoOpen(false)} style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}

      {/* Add/Edit sheet */}
      <BottomSheet open={sheetOpen} onClose={closeSheet} maxHeight="90svh" zIndex={350} showHelpButton={false}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink }}>{editingId ? 'Edit Card' : 'Add Credit Card'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HelpToggle />
                {editingId && (
                  <button onClick={async () => { if (await confirm(`Delete "${form.name || 'this card'}"? This cannot be undone.`)) { await onDelete(editingId); closeSheet() } }}
                    style={{ background: '#FEE2E2', border: 'none', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Card Name</label>
                <HelpText>A recognizable name. e.g. Axis Visa, HDFC Millenia.</HelpText>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Axis Visa" style={inp} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Last 4 digits</label>
                  <HelpText>Last 4 digits of your card number — helps identify it at a glance. Optional.</HelpText>
                  <input value={form.last_four} onChange={e => setForm(f => ({ ...f, last_four: e.target.value.slice(0, 4) }))} placeholder="4571" maxLength={4} style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>
                    Credit Limit
                    <InfoIcon id="limit" text="The maximum amount you can spend on this card. Check your card statement or bank app." />
                  </label>
                  <HelpText>Your total approved credit limit on this card.</HelpText>
                  <input type="number" inputMode="decimal" onFocus={e => e.target.select()} value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))} placeholder="100000" style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>
                    Cycle Start
                    <InfoIcon id="cycle" text="The day your billing cycle begins each month. E.g. if your cycle is 16th to 15th, enter 16." />
                  </label>
                  <HelpText>Day of the month when your billing cycle starts.</HelpText>
                  <input type="number" inputMode="numeric" onFocus={e => e.target.select()} value={form.cycle_start_day} onChange={e => setForm(f => ({ ...f, cycle_start_day: e.target.value }))} min="1" max="31" style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>
                    Bill Date
                    <InfoIcon id="bill" text="The date your statement is generated each month. Your total spend up to this date becomes the bill amount." />
                  </label>
                  <HelpText>Day when your monthly statement is generated by the bank.</HelpText>
                  <input type="number" inputMode="numeric" onFocus={e => e.target.select()} value={form.bill_day} onChange={e => setForm(f => ({ ...f, bill_day: e.target.value }))} min="1" max="31" style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>
                    Due Date
                    <InfoIcon id="due" text="The last date to pay your bill without penalty. Usually 15-20 days after the bill date." />
                  </label>
                  <HelpText>Last day to pay your bill without incurring interest or late fees.</HelpText>
                  <input type="number" inputMode="numeric" onFocus={e => e.target.select()} value={form.due_day} onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} min="1" max="31" style={inp} />
                </div>
              </div>
              {!editingId ? (
                <div>
                  <label style={lbl}>
                    Current Outstanding
                    <InfoIcon id="balance" text="How much you currently owe on this card right now. Check your bank app or last statement." />
                  </label>
                  <HelpText>How much you currently owe on this card. Check your card app or last statement.</HelpText>
                  <input type="number" inputMode="decimal" onFocus={e => e.target.select()} value={form.current_balance} onChange={e => setForm(f => ({ ...f, current_balance: e.target.value }))} placeholder="0" style={inp} />
                </div>
              ) : (
                <div style={{ background: c.surface2, borderRadius: 11, padding: '10px 12px' }}>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Current Outstanding</div>
                  <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{fmt(cards.find(cd => cd.id === editingId)?.current_balance ?? 0)}</div>
                  <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 4 }}>Use "Adjust Balance" from the card to correct this.</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={closeSheet} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.credit_limit} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Card'}
              </button>
            </div>
      </BottomSheet>

      {/* Pay bill sheet */}
      <BottomSheet open={!!payTarget} onClose={() => setPayTarget(null)} zIndex={350} showHelpButton={false}>
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Pay Bill</div>
            {payTarget && (() => {
              const b = getCreditCardBilling(payTarget, state.transactions)
              return (
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16 }}>
                  {payTarget.name} · Billed {fmt(b.billedAmount)}{b.unbilledAmount > 0 ? ` · Unbilled ${fmt(b.unbilledAmount)}` : ''} · Total {fmt(payTarget.current_balance)}
                </div>
              )
            })()}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Payment Amount</label>
                <input type="number" inputMode="decimal" onFocus={e => e.target.select()} value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>Pay from Account</label>
                <select value={payAccountId} onChange={e => setPayAccountId(e.target.value)} style={inp}>
                  <option value="">Select account</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setPayTarget(null)} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handlePayBill} disabled={paying || !payAmount || !payAccountId} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer', opacity: paying ? 0.7 : 1 }}>
                {paying ? 'Processing...' : `Pay ${fmt(parseFloat(payAmount) || 0)}`}
              </button>
            </div>
      </BottomSheet>

      {/* Adjust balance sheet */}
      <BottomSheet open={!!adjustTarget} onClose={() => setAdjustTarget(null)} zIndex={350} showHelpButton={false}>
            {(() => {
              const billing = adjustTarget ? getCreditCardBilling(adjustTarget, state.transactions) : null
              const totalChanged = adjustTarget && adjustAmount !== '' && Math.abs(parseFloat(adjustAmount) - adjustTarget.current_balance) > 0.01
              const billedChanged = billing && adjustBilled !== '' && Math.abs(parseFloat(adjustBilled) - billing.billedAmount) > 0.01
              const hasChange = totalChanged || billedChanged
              return <>
                <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Adjust Balance</div>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16 }}>
                  {adjustTarget?.name} · Current outstanding {adjustTarget ? fmt(adjustTarget.current_balance) : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={lbl}>Total Outstanding</label>
                    <input type="number" inputMode="decimal" onFocus={e => e.target.select()} value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="0" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Billed Amount</label>
                    <input type="number" inputMode="decimal" onFocus={e => e.target.select()} value={adjustBilled} onChange={e => {
                      const val = e.target.value
                      const total = parseFloat(adjustAmount) || 0
                      if (val !== '' && parseFloat(val) > total) return
                      setAdjustBilled(val)
                    }} placeholder="0" style={inp} />
                    {adjustAmount && adjustBilled !== '' && (
                      <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.muted, marginTop: 4 }}>
                        Unbilled: {fmt(Math.max(0, (parseFloat(adjustAmount) || 0) - (parseFloat(adjustBilled) || 0)))}
                      </div>
                    )}
                  </div>
                </div>
                {hasChange && (
                  <div style={{ marginTop: 10, background: c.surface2, borderRadius: 10, padding: '8px 12px', font: '600 12px Plus Jakarta Sans', color: c.muted, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {totalChanged && (() => {
                      const diff = parseFloat(adjustAmount) - adjustTarget!.current_balance
                      return <div>Outstanding {diff > 0 ? 'increases' : 'decreases'} by {fmt(Math.abs(diff))}</div>
                    })()}
                    {billedChanged && (() => {
                      const diff = parseFloat(adjustBilled) - billing!.billedAmount
                      return <div>Billed {diff > 0 ? 'increases' : 'decreases'} by {fmt(Math.abs(diff))}</div>
                    })()}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button onClick={() => setAdjustTarget(null)} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
                  <button
                    onClick={handleAdjustBalance}
                    disabled={adjusting || !hasChange}
                    style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer', opacity: adjusting ? 0.7 : 1 }}
                  >
                    {adjusting ? 'Adjusting...' : 'Adjust Balance'}
                  </button>
                </div>
              </>
            })()}
      </BottomSheet>
      {dialogNode}
    </>
  )
}
