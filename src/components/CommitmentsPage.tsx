import { useState, useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { useAppDialog } from './AppDialog'
import { fmt } from '@/lib/utils'
import { CAT_COLORS } from '@/lib/tokens'
import { catById as buildCatById } from '@/lib/data'
import { CategorySelect } from './CategorySelect'
import { isRecurringCompleted, getRecurringPeriodLabel } from '@/lib/recurring'
import { BottomSheet, HelpText } from './BottomSheet'
import type { AppState, DerivedMetrics, Commitment } from '@/types'

type Freq = 'monthly' | 'weekly' | 'yearly'

type CForm = {
  name: string
  amount: string
  paid_amount: string
  remaining: string
  total_amount: string
  category_id: string
  is_recurring: boolean
  frequency: Freq
  due_day: string
  due_date: string
  from_account_id: string
  total_installments: string
  current_installment: string
}

const EMPTY_FORM: CForm = {
  name: '', amount: '', paid_amount: '0', remaining: '', total_amount: '',
  category_id: '', is_recurring: false,
  frequency: 'monthly', due_day: '', due_date: '', from_account_id: '',
  total_installments: '', current_installment: '0',
}

const ord = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

interface Props {
  state: AppState
  d: DerivedMetrics
  onMarkPaid: (c: Commitment, recordExpense: boolean, accountId: string | null) => Promise<void>
  onAdd: (form: Omit<Commitment, 'id'>) => Promise<void>
  onUpdate: (id: string, form: Omit<Commitment, 'id'>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddCategory: (name: string, group_name: string) => Promise<string>
  onClose: () => void
  initialAddOpen?: boolean
}

export function CommitmentsPage({ state, d, onMarkPaid, onAdd, onUpdate, onDelete, onAddCategory, onClose, initialAddOpen }: Props) {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()
  const catMap = buildCatById(state.categories)
  const accounts = state.accounts.filter(a => a.is_active)

  const [sheetOpen, setSheetOpen] = useState(!!initialAddOpen)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmPay, setConfirmPay] = useState<Commitment | null>(null)
  const [confirmAccountId, setConfirmAccountId] = useState('')

  // Page animation / swipe
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
    setTimeout(() => onClose(), 290)
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
      gestureRef.current = null; setDragX(0); return
    }
    gestureRef.current = { ...gestureRef.current, lastX: t.clientX, lastT: Date.now() }
    const x = Math.max(0, dx)
    dragXRef.current = x
    setDragX(x)
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
      setSnapping(true); setDragX(0); dragXRef.current = 0
      setTimeout(() => setSnapping(false), 300)
    }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0); dragXRef.current = 0
    setTimeout(() => setSnapping(false), 300)
  }

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setSheetOpen(true) }
  const openEdit = (cm: Commitment) => {
    setEditingId(cm.id)
    const paidAmt = !cm.is_recurring ? String(Math.max(0, cm.amount - cm.remaining)) : '0'
    setForm({
      name: cm.name,
      amount: String(cm.amount),
      paid_amount: paidAmt,
      remaining: String(cm.remaining),
      category_id: cm.category_id || '',
      is_recurring: cm.is_recurring,
      frequency: cm.frequency || 'monthly',
      due_day: cm.due_day ? String(cm.due_day) : '',
      due_date: cm.due_date || '',
      from_account_id: cm.from_account_id || '',
      total_installments: cm.total_installments ? String(cm.total_installments) : '',
      current_installment: String(cm.current_installment || 0),
      total_amount: (cm.total_installments && cm.amount) ? String(Math.round(cm.total_installments * cm.amount)) : '',
    })
    setSheetOpen(true)
  }
  const closeSheet = () => { setSheetOpen(false); setForm(EMPTY_FORM); setEditingId(null) }
  const set = (key: keyof CForm, val: string | boolean) => setForm(f => ({ ...f, [key]: val }))

  const handleAmountChange = (val: string) => {
    const emi = parseFloat(val)
    const tenure = parseFloat(form.total_installments)
    setForm(f => ({
      ...f, amount: val,
      total_amount: (!isNaN(emi) && !isNaN(tenure)) ? String(Math.round(emi * tenure)) : f.total_amount,
    }))
  }
  const handleTotalChange = (val: string) => {
    const total = parseFloat(val)
    const tenure = parseFloat(form.total_installments)
    const emi = parseFloat(form.amount)
    setForm(f => ({
      ...f, total_amount: val,
      amount: (!isNaN(total) && !isNaN(tenure) && tenure > 0) ? String(Math.round(total / tenure)) : f.amount,
      remaining: (!isNaN(total) && !isNaN(emi) && emi > 0) ? String(Math.round((total / emi - parseFloat(f.current_installment || '0')) * emi)) : f.remaining,
    }))
  }
  const handleTenureChange = (val: string) => {
    const tenure = parseFloat(val)
    const emi = parseFloat(form.amount)
    const total = parseFloat(form.total_amount)
    setForm(f => ({
      ...f, total_installments: val,
      total_amount: (!isNaN(tenure) && !isNaN(emi)) ? String(Math.round(tenure * emi)) : f.total_amount,
      amount: (!isNaN(tenure) && !isNaN(total) && tenure > 0 && !(!isNaN(emi) && emi > 0)) ? String(Math.round(total / tenure)) : f.amount,
    }))
  }

  const handleSave = async () => {
    const amount = parseFloat(form.amount)
    if (!form.name.trim() || isNaN(amount) || amount <= 0) return
    const remaining = form.is_recurring
      ? amount
      : Math.max(0, amount - (parseFloat(form.paid_amount) || 0))
    const payload: Omit<Commitment, 'id'> = {
      name: form.name.trim(), amount, remaining,
      category_id: form.category_id || null,
      is_recurring: form.is_recurring,
      frequency: form.is_recurring ? form.frequency : null,
      due_day: (form.is_recurring && form.frequency === 'monthly' && form.due_day) ? parseInt(form.due_day) : null,
      due_date: (!form.is_recurring && form.due_date) ? form.due_date : null,
      from_account_id: form.from_account_id || null,
      is_active: true, last_paid_date: null,
      total_installments: form.total_installments ? parseInt(form.total_installments) : null,
      current_installment: parseInt(form.current_installment) || 0,
    }
    setSaving(true)
    try {
      if (editingId) await onUpdate(editingId, payload)
      else await onAdd(payload)
      closeSheet()
    } catch (_) {}
    setSaving(false)
  }

  const handleMarkPaid = (cm: Commitment) => {
    const isCreditCard = (state.credit_cards || []).some(cc => cc.id === cm.from_account_id)
    if (!isCreditCard) setConfirmAccountId(cm.from_account_id || accounts[0]?.id || '')
    setConfirmPay(cm)
  }

  const handleDelete = async (id: string) => {
    if (!await confirm('Delete this bill / obligation?')) return
    setDeleting(id)
    try { await onDelete(id) } catch (_) {}
    setDeleting(null)
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    font: '600 11px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block',
  }

  const active = state.commitments.filter(cm => cm.is_active !== false)
  const monthlyTotal = active.filter(cm => cm.is_recurring && cm.frequency === 'monthly').reduce((s, cm) => s + cm.amount, 0)
  const recurringCount = active.filter(cm => cm.is_recurring).length

  return (
    <>
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}
        style={{
          position: 'fixed', inset: 0, zIndex: 200, background: c.bg,
          display: 'flex', flexDirection: 'column',
          overflowY: dragX > 0 ? 'hidden' : 'auto',
          overscrollBehavior: 'contain',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          willChange: 'transform',
          ...(closing
            ? { transform: 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
            : dragX > 0
            ? { transform: `translateX(${dragX}px)`, animation: 'none', boxShadow: '-8px 0 24px rgba(0,0,0,0.18)' }
            : snapping
            ? { transform: 'translateX(0)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
            : entryPlayed
            ? {}
            : { animation: 'slideInFromRight 0.32s cubic-bezier(0.32,0.72,0,1)' }),
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `calc(16px + env(safe-area-inset-top,0px)) 16px 14px`, borderBottom: `1px solid ${c.faint}`, background: c.bg, position: 'sticky', top: 0, zIndex: 10 }}>
          <button onClick={triggerClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.muted, padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center', gap: 5, font: '600 14px Plus Jakarta Sans' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
              </svg>
            </div>
            <span style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Bills & Obligations</span>
          </div>
          <button onClick={openAdd} style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: c.accentSoft, color: c.accent, cursor: 'pointer', font: '700 20px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>

        <div style={{ padding: '16px 16px calc(32px + env(safe-area-inset-bottom,0px))', maxWidth: 540, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

          {/* Summary strip */}
          {active.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1, background: 'rgba(139,92,246,0.1)', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ font: '600 10px Plus Jakarta Sans', color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Unpaid</div>
                <div style={{ font: '800 20px Plus Jakarta Sans', color: '#8B5CF6', marginTop: 3 }}>{fmt(d.remainingCommitments)}</div>
                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>{active.length} bill{active.length !== 1 ? 's' : ''}</div>
              </div>
              <div style={{ flex: 1, background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Monthly</div>
                <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginTop: 3 }}>{fmt(monthlyTotal)}</div>
                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>{recurringCount} recurring</div>
              </div>
            </div>
          )}

          {active.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px' }}>
              <div style={{ width: 60, height: 60, borderRadius: 18, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a1 1 0 0 0 1 1h4"/></svg>
              </div>
              <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Stay Ahead of Bills</div>
              <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 24 }}>Never miss another payment. Add rent, electricity, loan EMIs, subscriptions and any recurring bills.</div>
              <button onClick={openAdd} style={{ background: '#8B5CF6', color: '#fff', border: 'none', borderRadius: 14, padding: '13px 28px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Add your first bill</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {active.map((cm, i) => {
                const cat = catMap[cm.category_id!]
                const col = (cat && CAT_COLORS[cat.name]) || c.accent
                const completed = !cm.is_recurring && cm.remaining <= 0
                const amount = cm.amount || cm.remaining || 0
                const isPaying = paying === cm.id
                const isDeleting = deleting === cm.id

                const paidThisPeriod = cm.is_recurring
                  ? isRecurringCompleted(cm.last_paid_date, cm.frequency)
                  : false
                const periodLabel = getRecurringPeriodLabel(cm.frequency)

                return (
                  <div
                    key={cm.id}
                    onClick={() => !isPaying && !isDeleting && openEdit(cm)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 11,
                      paddingTop: i === 0 ? 0 : 12, paddingBottom: 12,
                      borderBottom: i < active.length - 1 ? `1px solid ${c.faint}` : 'none',
                      opacity: isDeleting ? 0.4 : 1,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                      background: completed ? c.surface2 : col + '20',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {completed ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{cm.name}</span>
                        {cm.is_recurring && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, background: c.accentSoft, borderRadius: 999, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.5 9A9 9 0 005.6 5.6L1 10M23 14l-4.6 4.4A9 9 0 013.5 15"/>
                            </svg>
                            {cm.frequency}
                          </span>
                        )}
                        {cm.total_installments && (
                          <span style={{ font: '700 10px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 999, padding: '2px 7px' }}>
                            {(cm.current_installment || 0)}/{cm.total_installments}
                          </span>
                        )}
                        {completed && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.good, background: c.goodSoft, borderRadius: 999, padding: '2px 7px' }}>
                            Completed
                          </span>
                        )}
                      </div>

                      <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                        {cm.is_recurring
                          ? paidThisPeriod
                            ? `Paid on ${new Date(cm.last_paid_date!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                            : (cm.due_day ? `Due ${ord(cm.due_day)} every month` : `Recurring · ${cm.frequency}`)
                          : completed ? 'All paid up' : `Remaining: ${fmt(cm.remaining)}${cm.due_date ? ` · Due ${new Date(cm.due_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}`
                        }
                      </div>

                      {cm.total_installments && cm.amount && (
                        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                          <div>
                            <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>Total </span>
                            <span style={{ font: '700 11px Plus Jakarta Sans', color: c.ink }}>{fmt(cm.total_installments * cm.amount)}</span>
                          </div>
                          <div>
                            <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>Remaining </span>
                            <span style={{ font: '700 11px Plus Jakarta Sans', color: c.bad }}>
                              {fmt((cm.total_installments - (cm.current_installment || 0)) * cm.amount)}
                            </span>
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                        {!completed && !paidThisPeriod && (
                          <button
                            onClick={e => { e.stopPropagation(); handleMarkPaid(cm) }}
                            disabled={isPaying}
                            style={{ background: c.goodSoft, color: c.good, border: 'none', borderRadius: 8, padding: '5px 10px', font: '700 11px Plus Jakarta Sans', cursor: 'pointer', opacity: isPaying ? 0.6 : 1 }}
                          >
                            {isPaying ? '...' : <><Check size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Mark Paid</>}
                          </button>
                        )}
                        {paidThisPeriod && (
                          <span style={{ font: '600 11px Plus Jakarta Sans', color: c.good, background: c.goodSoft, borderRadius: 8, padding: '5px 10px' }}>
                            <Check size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Paid {periodLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <div>
                        <div style={{ font: '800 15px Plus Jakarta Sans', color: completed ? c.muted : c.ink }}>{fmt(amount)}</div>
                        <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                          {cm.total_installments ? 'EMI/mo' : cm.is_recurring ? `/${cm.frequency?.slice(0, 2)}` : 'each'}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(cm.id) }}
                        disabled={isDeleting}
                        style={{ background: '#FEE2E2', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Add / Edit Sheet */}
        <BottomSheet open={sheetOpen} onClose={closeSheet}>
          <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4, letterSpacing: '-0.02em' }}>
            {editingId ? 'Edit Bill / Obligation' : 'Add Bill / Obligation'}
          </div>
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16, lineHeight: 1.5 }}>
            Rent, electricity, loan EMIs, subscriptions — anything you owe on a schedule.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={lbl}>Name</label>
              <HelpText>What to call this bill. e.g. Rent, KSEB Bill, Home Loan EMI</HelpText>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. Rent, KSEB Bill, Home Loan EMI" style={inp} />
            </div>

            <div>
              <label style={lbl}>Type</label>
              <HelpText>Recurring: repeats every month, week or year. One-time: a fixed amount you still owe.</HelpText>
              <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, gap: 3 }}>
                {([false, true] as const).map(v => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => set('is_recurring', v)}
                    style={{
                      flex: 1, border: 'none', borderRadius: 10, padding: '9px',
                      font: '700 13px Plus Jakarta Sans',
                      background: form.is_recurring === v ? c.accent : 'transparent',
                      color: form.is_recurring === v ? '#fff' : c.muted,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {v ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.5 9A9 9 0 005.6 5.6L1 10M23 14l-4.6 4.4A9 9 0 013.5 15"/>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                        </svg>
                      )}
                      {v ? 'Recurring' : 'One-time'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {!form.is_recurring ? (
              <>
                <div style={{ background: c.surface2, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Amount Owed</label>
                      <HelpText>Total amount you owe for this obligation.</HelpText>
                      <input type="number" inputMode="decimal" onFocus={e => e.target.select()}
                        value={form.amount} onChange={e => set('amount', e.target.value)}
                        placeholder="₹" min="0" style={inp} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Paid Amount</label>
                      <HelpText>How much you have already paid towards this.</HelpText>
                      <input type="number" inputMode="decimal" onFocus={e => e.target.select()}
                        value={form.paid_amount} onChange={e => set('paid_amount', e.target.value)}
                        placeholder="0" min="0" style={inp} />
                    </div>
                  </div>
                  {form.amount && (
                    <div style={{ background: c.accentSoft, borderRadius: 11, padding: '10px 12px' }}>
                      <div style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, textTransform: 'uppercase' }}>Remaining</div>
                      <div style={{ font: '800 15px Plus Jakarta Sans', color: c.accent, marginTop: 2 }}>
                        {fmt(Math.max(0, parseFloat(form.amount) - (parseFloat(form.paid_amount) || 0)))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label style={lbl}>Due Date</label>
                  <HelpText>When is this bill due? Helps track upcoming payments.</HelpText>
                  <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={inp} />
                </div>
              </>
            ) : (
              <>
                <div style={{ background: c.surface2, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Monthly Amount</label>
                      <HelpText>Amount you pay each installment.</HelpText>
                      <input type="number" inputMode="decimal" onFocus={e => e.target.select()}
                        value={form.amount} onChange={e => handleAmountChange(e.target.value)}
                        placeholder="₹" min="0" style={inp} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Total Months</label>
                      <HelpText>Total duration in months. e.g. a 5-year loan = 60 months.</HelpText>
                      <input type="number" inputMode="numeric" onFocus={e => e.target.select()}
                        value={form.total_installments} onChange={e => handleTenureChange(e.target.value)}
                        placeholder="e.g. 12" min="1" style={inp} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Paid Months</label>
                      <HelpText>Number of installments already paid.</HelpText>
                      <input type="number" inputMode="numeric" onFocus={e => e.target.select()}
                        value={form.current_installment} onChange={e => set('current_installment', e.target.value)}
                        placeholder="0" min="0" style={inp} />
                    </div>
                  </div>
                  {form.amount && form.total_installments && form.current_installment !== '' && (
                    <div style={{ background: c.accentSoft, borderRadius: 11, padding: '10px 12px' }}>
                      <div style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, textTransform: 'uppercase' }}>Remaining</div>
                      <div style={{ font: '800 15px Plus Jakarta Sans', color: c.accent, marginTop: 2 }}>
                        {fmt((parseFloat(form.total_installments) - parseFloat(form.current_installment || '0')) * parseFloat(form.amount))}
                      </div>
                      <div style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, marginTop: 1 }}>
                        {parseFloat(form.total_installments) - parseFloat(form.current_installment || '0')} months left
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Frequency</label>
                    <HelpText>How often this bill repeats.</HelpText>
                    <select value={form.frequency} onChange={e => set('frequency', e.target.value)} style={inp}>
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  {form.frequency === 'monthly' && (
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Due day (1–31)</label>
                      <HelpText>Day of the month this is due — helps you track upcoming payments.</HelpText>
                      <input type="number" value={form.due_day} onChange={e => set('due_day', e.target.value)}
                        placeholder="e.g. 5" min="1" max="31" style={inp} />
                    </div>
                  )}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Category</label>
                <HelpText>Tag this for expense tracking and analytics. Optional.</HelpText>
                <CategorySelect value={form.category_id} onChange={v => set('category_id', v)} state={state} onAddCategory={onAddCategory} style={inp} includeEmpty emptyLabel="None" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Pay from account</label>
                <HelpText>Which account or card this bill is paid from.</HelpText>
                <select value={form.from_account_id} onChange={e => set('from_account_id', e.target.value)} style={inp}>
                  <option value="">None</option>
                  <optgroup label="Bank / Cash">
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                  {(state.credit_cards || []).length > 0 && (
                    <optgroup label="Credit Cards">
                      {(state.credit_cards || []).map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={closeSheet} style={{
              flex: 1, background: c.surface2, color: c.muted, border: 'none',
              borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
            }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{
              flex: 2, background: c.accent, color: '#fff', border: 'none',
              borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Bill / Obligation'}
            </button>
          </div>
        </BottomSheet>

        {/* Mark Paid confirmation */}
        {confirmPay && (() => {
          const isCreditCard = (state.credit_cards || []).some(cc => cc.id === confirmPay.from_account_id)
          const cardName = isCreditCard ? (state.credit_cards || []).find(cc => cc.id === confirmPay.from_account_id)?.name : null
          return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div onClick={() => setConfirmPay(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
              <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>
                  {isCreditCard ? 'Add to card outstanding?' : 'Record as expense?'}
                </div>
                <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 16 }}>
                  {isCreditCard
                    ? <>Marking <strong style={{ color: c.ink }}>{confirmPay.name}</strong> ({fmt(confirmPay.amount)}) paid via <strong style={{ color: c.ink }}>{cardName}</strong>.<br /><br />
                      Tap <strong style={{ color: c.ink }}>Yes</strong> if this amount is <strong style={{ color: c.ink }}>not yet</strong> in your card outstanding (adds it now).<br />
                      Tap <strong style={{ color: c.ink }}>No</strong> if the bank already added it to your statement.</>
                    : <>Mark <strong style={{ color: c.ink }}>{confirmPay.name}</strong> ({fmt(confirmPay.amount)}) as paid.
                      Do you want to record this as an expense and deduct from your account?</>
                  }
                </div>

                {!isCreditCard && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>Pay from account</label>
                    <select value={confirmAccountId} onChange={e => setConfirmAccountId(e.target.value)}
                      style={{ width: '100%', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px', font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none' }}>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={async () => {
                      const cm = confirmPay; setConfirmPay(null)
                      setPaying(cm.id)
                      try { await onMarkPaid(cm, true, isCreditCard ? null : confirmAccountId) } catch (_) {}
                      setPaying(null)
                    }}
                    style={{ width: '100%', background: c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
                  >
                    {isCreditCard ? <><Check size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Yes, add to outstanding</> : <><Check size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Yes, record as expense</>}
                  </button>
                  <button
                    onClick={async () => {
                      const cm = confirmPay; setConfirmPay(null)
                      setPaying(cm.id)
                      try { await onMarkPaid(cm, false, null) } catch (_) {}
                      setPaying(null)
                    }}
                    style={{ width: '100%', background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
                  >
                    {isCreditCard ? 'No, already in statement' : 'No, just mark as paid'}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {dialogNode}
      </div>
    </>
  )
}
