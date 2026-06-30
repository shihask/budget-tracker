import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { useAppDialog } from './AppDialog'
import { fmt } from '@/lib/utils'
import { BottomSheet, HelpText } from './BottomSheet'
import { CategorySelect } from './CategorySelect'
import { SAVINGS_GROUP } from '@/lib/constants'
import { isRecurringCompleted, getRecurringPeriodLabel, getNextRecurringDueDate } from '@/lib/recurring'
import type { AppState, Savings, SavingsType, SavingsFrequency } from '@/types'

// ── Type config ───────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<SavingsType, {
  label: string
  color: string
  isRecurring: boolean
  showMaturity: boolean
  showInterest: boolean
  showCurrentValue: boolean
  amountLabel: string
  placeholder: string
}> = {
  sip:      { label: 'SIP / Mutual Fund', color: '#6366F1', isRecurring: true,  showMaturity: false, showInterest: false, showCurrentValue: true,  amountLabel: 'Monthly SIP amount',    placeholder: '₹ 5,000' },
  gold:     { label: 'Gold Scheme',        color: '#F59E0B', isRecurring: true,  showMaturity: false, showInterest: false, showCurrentValue: false, amountLabel: 'Monthly amount',        placeholder: '₹ 2,000' },
  rd:       { label: 'Recurring Deposit',  color: '#3B82F6', isRecurring: true,  showMaturity: true,  showInterest: true,  showCurrentValue: false, amountLabel: 'Monthly deposit',       placeholder: '₹ 10,000' },
  fd:       { label: 'Fixed Deposit',      color: '#8B5CF6', isRecurring: false, showMaturity: true,  showInterest: true,  showCurrentValue: false, amountLabel: 'Principal amount',      placeholder: '₹ 1,00,000' },
  ppf_nps:  { label: 'PPF / NPS',          color: '#10B981', isRecurring: true,  showMaturity: true,  showInterest: false, showCurrentValue: true,  amountLabel: 'Annual contribution',   placeholder: '₹ 1,50,000' },
  chit:     { label: 'Chit Fund / Kuri',   color: '#F97316', isRecurring: true,  showMaturity: false, showInterest: false, showCurrentValue: false, amountLabel: 'Monthly contribution',  placeholder: '₹ 5,000' },
  custom:   { label: 'Other',              color: '#64748B', isRecurring: true,  showMaturity: false, showInterest: false, showCurrentValue: false, amountLabel: 'Amount',                placeholder: '₹ 0' },
}

const TYPE_ORDER: SavingsType[] = ['sip', 'gold', 'rd', 'fd', 'ppf_nps', 'chit', 'custom']

// ── Form state ────────────────────────────────────────────────────────────────

type SForm = {
  name: string
  type: SavingsType
  amount: string
  is_recurring: boolean
  frequency: SavingsFrequency
  due_day: string
  total_installments: string
  current_installment: string
  total_target: string
  current_value: string
  maturity_date: string
  interest_rate: string
  from_account_id: string
  category_id: string
  notes: string
  is_prized: boolean
  prize_month: string
  investment_source: 'existing' | 'new'
}

const EMPTY_FORM: SForm = {
  name: '', type: 'sip', amount: '', is_recurring: true, frequency: 'monthly',
  due_day: '', total_installments: '', current_installment: '0',
  total_target: '', current_value: '0', maturity_date: '', interest_rate: '',
  from_account_id: '', category_id: '', notes: '', is_prized: false, prize_month: '',
  investment_source: 'existing',
}

function formFromSavings(sv: Savings): SForm {
  return {
    name: sv.name,
    type: sv.type,
    amount: String(sv.amount),
    is_recurring: sv.is_recurring,
    frequency: sv.frequency ?? 'monthly',
    due_day: sv.due_day ? String(sv.due_day) : '',
    total_installments: sv.total_installments ? String(sv.total_installments) : '',
    current_installment: String(sv.current_installment),
    total_target: sv.total_target ? String(sv.total_target) : '',
    current_value: String(sv.current_value),
    maturity_date: sv.maturity_date ?? '',
    interest_rate: sv.interest_rate ? String(sv.interest_rate) : '',
    from_account_id: sv.from_account_id ?? '',
    category_id: sv.category_id ?? '',
    notes: sv.notes ?? '',
    is_prized: sv.is_prized ?? false,
    prize_month: sv.prize_month ? String(sv.prize_month) : '',
    investment_source: sv.investment_source ?? 'existing',
  }
}

function payloadFromForm(form: SForm): Omit<Savings, 'id' | 'created_at'> {
  const cfg = TYPE_CONFIG[form.type]
  const isChit = form.type === 'chit'
  return {
    name: form.name.trim(),
    type: form.type,
    amount: parseFloat(form.amount) || 0,
    is_recurring: cfg.isRecurring,
    frequency: cfg.isRecurring ? form.frequency : null,
    due_day: (cfg.isRecurring && form.frequency === 'monthly' && form.due_day) ? parseInt(form.due_day) : null,
    total_installments: form.total_installments ? parseInt(form.total_installments) : null,
    current_installment: (isChit && form.is_prized && form.prize_month)
      ? Math.max(parseInt(form.current_installment) || 0, parseInt(form.prize_month) || 0)
      : parseInt(form.current_installment) || 0,
    total_target: form.total_target ? parseFloat(form.total_target) : null,
    current_value: (isChit && form.is_prized) ? (parseFloat(form.current_value) || 0) : (!isChit ? parseFloat(form.current_value) || 0 : 0),
    maturity_date: form.maturity_date || null,
    interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
    from_account_id: form.from_account_id || null,
    category_id: form.category_id || null,
    notes: form.notes.trim() || null,
    is_active: true,
    is_prized: isChit ? form.is_prized : false,
    prize_month: (isChit && form.is_prized && form.prize_month) ? parseInt(form.prize_month) : null,
    last_contribution_date: null,
    paid_date: null,
    investment_source: form.investment_source,
  }
}

const ord = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  state: AppState
  onClose: () => void
  onAdd: (form: Omit<Savings, 'id' | 'created_at'>, debitAccountId?: string) => Promise<void>
  onUpdate: (id: string, patch: Partial<Omit<Savings, 'id' | 'user_id' | 'created_at'>>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRecordContribution: (sv: Savings, recordExpense: boolean, accountId: string | null) => Promise<void>
  onUpdateValue: (id: string, currentValue: number) => Promise<void>
  onRecordPayout: (sv: Savings, amount: number, accountId: string) => Promise<void>
  onRevertPayout: (sv: Savings) => Promise<void>
  onAddCategory: (name: string, group_name: string) => Promise<string>
  startAdd?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SavingsPage({ state, onClose, onAdd, onUpdate, onDelete, onRecordContribution, onUpdateValue, onRecordPayout, onRevertPayout, onAddCategory, startAdd }: Props) {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [contributing, setContributing] = useState<string | null>(null)
  const [confirmContrib, setConfirmContrib] = useState<Savings | null>(null)
  const [confirmAccountId, setConfirmAccountId] = useState('')
  const [updateValueId, setUpdateValueId] = useState<string | null>(null)
  const [newValueInput, setNewValueInput] = useState('')
  const [confirmPayout, setConfirmPayout] = useState<Savings | null>(null)
  const [payoutAccountId, setPayoutAccountId] = useState('')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [recordingPayout, setRecordingPayout] = useState<string | null>(null)
  const [revertConfirm, setRevertConfirm] = useState<Savings | null>(null)
  const [reverting, setReverting] = useState<string | null>(null)
  const [saveConfirmPending, setSaveConfirmPending] = useState<{
    payload: Omit<Savings, 'id' | 'created_at'>
    accountId: string
    accountName: string
  } | null>(null)
  const [confirmingSave, setConfirmingSave] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteProtect, setDeleteProtect] = useState<Savings | null>(null)
  const [archiving, setArchiving] = useState<string | null>(null)

  const active = state.savings.filter(s => s.is_active)
  const completed = state.savings.filter(s => !s.is_active)
  const [showCompleted, setShowCompleted] = useState(false)
  const accounts = state.accounts.filter(a => a.is_active)

  useEffect(() => {
    if (startAdd) { setEditingId(null); setForm(EMPTY_FORM); setSheetOpen(true) }
  }, [startAdd])

  // Sync is_recurring when type changes
  const setType = (type: SavingsType) => {
    const cfg = TYPE_CONFIG[type]
    setForm(f => ({
      ...f, type,
      is_recurring: cfg.isRecurring,
      frequency: cfg.label === 'PPF / NPS' ? 'yearly' : f.frequency,
    }))
  }

  const set = <K extends keyof SForm>(key: K, val: SForm[K]) =>
    setForm(f => {
      const next = { ...f, [key]: val }
      // Auto-calculate goal amount for recurring types when amount or tenure changes
      if ((key === 'amount' || key === 'total_installments') && TYPE_CONFIG[next.type].isRecurring) {
        const amt = parseFloat(next.amount)
        const months = parseInt(next.total_installments)
        if (amt > 0 && months > 0) next.total_target = String(amt * months)
      }
      return next
    })

  const openAdd  = () => { setEditingId(null); setForm(EMPTY_FORM); setSheetOpen(true) }
  const openEdit = (sv: Savings) => { setEditingId(sv.id); setForm(formFromSavings(sv)); setSheetOpen(true) }
  const closeSheet = () => { setSheetOpen(false); setForm(EMPTY_FORM); setEditingId(null) }

  const handleSave = async () => {
    if (!form.name.trim() || !parseFloat(form.amount)) return
    if (editingId) {
      setSaving(true)
      try { await onUpdate(editingId, payloadFromForm(form)); closeSheet() } catch (_) {}
      setSaving(false)
      return
    }
    const payload = payloadFromForm(form)
    const acct = accounts.find(a => a.id === form.from_account_id)
    setSaveConfirmPending({ payload, accountId: form.from_account_id, accountName: acct?.name ?? '' })
  }

  const handleSaveConfirm = async () => {
    if (!saveConfirmPending) return
    setConfirmingSave(true)
    setSaveError(null)
    try {
      const { payload, accountId } = saveConfirmPending
      const debit = payload.investment_source === 'new' && accountId ? accountId : undefined
      await onAdd(payload, debit)
      setSaveConfirmPending(null)
      closeSheet()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Failed to save. Please try again.'
      setSaveError(msg)
    }
    setConfirmingSave(false)
  }

  const handleArchive = async (sv: Savings) => {
    setArchiving(sv.id)
    setDeleteProtect(null)
    try { await onUpdate(sv.id, { is_active: false }) } catch (_) {}
    setArchiving(null)
  }

  const handleDelete = async (id: string) => {
    const sv = state.savings.find(s => s.id === id)
    if (sv && hasTxHistory(sv)) {
      setDeleteProtect(sv)
      return
    }
    if (!await confirm(`Delete "${sv?.name || 'this investment'}"? This cannot be undone.`)) return
    setDeleting(id)
    try { await onDelete(id) } catch (_) {}
    setDeleting(null)
  }

  const handleContribute = (sv: Savings) => {
    setConfirmAccountId(sv.from_account_id || accounts[0]?.id || '')
    setConfirmContrib(sv)
  }

  const handlePayout = (sv: Savings) => {
    setPayoutAccountId(sv.from_account_id || accounts[0]?.id || '')
    setPayoutAmount(sv.current_value > 0 ? String(sv.current_value) : '')
    setConfirmPayout(sv)
  }

  const handleUpdateValue = async () => {
    if (!updateValueId) return
    const val = parseFloat(newValueInput)
    if (isNaN(val) || val < 0) return
    setSaving(true)
    try { await onUpdateValue(updateValueId, val) } catch (_) {}
    setSaving(false)
    setUpdateValueId(null)
    setNewValueInput('')
  }

  // ── Swipe-back gesture ───────────────────────────────────────────────────────
  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const dragXRef = useRef(0)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // Cancel any in-flight close timer when this instance unmounts (e.g. key-counter remount)
  useEffect(() => {
    return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current) }
  }, [])

  const triggerClose = () => {
    setClosing(true)
    closeTimerRef.current = setTimeout(() => { onClose() }, 290)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (closing || sheetOpen || confirmContrib || updateValueId || confirmPayout || revertConfirm || saveConfirmPending || deleteProtect) return
    const t = e.touches[0]
    if (t.clientX > 28) return
    gestureRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: Date.now() }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dy = Math.abs(t.clientY - gestureRef.current.startY)
    if (dy > Math.abs(dx) + 5 && Math.abs(dx) < 15) { gestureRef.current = null; setDragX(0); return }
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

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    font: '600 11px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block',
  }

  const cfg = TYPE_CONFIG[form.type]

  const hasTxHistory = (sv: Savings) =>
    state.transactions.some(t =>
      (t.transaction_type === 'savings_contribution' || t.transaction_type === 'savings_withdrawal') &&
      (t.savings_id === sv.id || (t.description !== null && (t.description === sv.name || t.description.startsWith(sv.name + ' —'))))
    )

  const editingSv = editingId ? state.savings.find(sv => sv.id === editingId) ?? null : null
  const editHasTx = editingSv !== null && hasTxHistory(editingSv)
  const prizeMonthLocked = editingSv?.is_prized === true && editingSv.current_value === 0

  // ── Derived stats for active savings ─────────────────────────────────────────
  const totalMonthly   = active.filter(s => s.is_recurring && s.frequency === 'monthly').reduce((a, s) => a + s.amount, 0)
  const totalContrib      = active.filter(s => !s.is_prized).reduce((a, s) => a + (s.is_recurring ? s.current_installment * s.amount : s.amount), 0)
  const totalPortfolio    = active.reduce((a, s) => a + (s.current_value || 0), 0)
  const hasUnvaluedPlans  = active.filter(s => !s.is_prized).some(s => !s.current_value)

  return (
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
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
            </svg>
          </div>
          <span style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Savings & Investments</span>
        </div>
        <button onClick={openAdd} style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: c.accentSoft, color: c.accent, cursor: 'pointer', font: '700 20px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>

      <div style={{ padding: '16px 16px calc(32px + env(safe-area-inset-bottom,0px))', maxWidth: 540, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {/* Summary strip */}
        {active.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1, background: 'rgba(16,185,129,0.1)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Monthly</div>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: '#10B981', marginTop: 3 }}>{fmt(totalMonthly)}</div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{active.length} plan{active.length !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ flex: 1, background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Invested</div>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginTop: 3 }}>{fmt(totalContrib)}</div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>capital deployed</div>
            </div>
            {totalPortfolio > 0 && (
              <div style={{ flex: 1, background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Portfolio</div>
                <div style={{ font: '800 20px Plus Jakarta Sans', color: totalPortfolio >= totalContrib ? '#10B981' : '#EF4444', marginTop: 3 }}>{fmt(totalPortfolio)}</div>
                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{hasUnvaluedPlans ? 'market-linked only' : 'current value'}</div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {active.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
              </svg>
            </div>
            <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>No savings tracked yet</div>
            <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 24 }}>
              Add your SIPs, gold schemes, RDs, FDs and any other investments here.
            </div>
            <button onClick={openAdd} style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 14, padding: '13px 28px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>
              Add investment
            </button>
          </div>
        )}

        {/* Cards */}
        {active.map(sv => {
          const tcfg   = TYPE_CONFIG[sv.type]
          const col    = tcfg.color
          const contrib = sv.is_recurring ? sv.current_installment * sv.amount : sv.amount
          const target  = sv.total_target ?? (sv.is_recurring && sv.total_installments ? sv.total_installments * sv.amount : null)
          const pct     = target && target > 0 ? Math.min(100, (contrib / target) * 100) : null
          const returns = sv.current_value > 0 ? sv.current_value - contrib : null
          const isDel   = deleting === sv.id
          const isCont  = contributing === sv.id

          const contributedThisPeriod = isRecurringCompleted(sv.last_contribution_date, sv.frequency)
          const periodLabel = getRecurringPeriodLabel(sv.frequency)
          const nextDue = sv.is_recurring ? getNextRecurringDueDate(sv) : null

          return (
            <div
              key={sv.id}
              onClick={() => !isCont && !isDel && openEdit(sv)}
              style={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 18, padding: '14px 14px 12px', marginBottom: 12, opacity: isDel ? 0.4 : 1, cursor: 'pointer' }}
            >
              {/* Row 1: icon + name + type badge + amount */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: col + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>{sv.name}</span>
                    <span style={{ font: '600 10px Plus Jakarta Sans', color: col, background: col + '18', borderRadius: 999, padding: '2px 7px' }}>{tcfg.label}</span>
                    {sv.type === 'chit' && (
                      <span style={{ font: '700 10px Plus Jakarta Sans', color: sv.is_prized ? '#10B981' : '#F97316', background: sv.is_prized ? 'rgba(16,185,129,0.12)' : 'rgba(249,115,22,0.12)', borderRadius: 999, padding: '2px 7px' }}>
                        {sv.is_prized ? 'Prized' : 'Unprized'}
                      </span>
                    )}
                    {sv.is_recurring && sv.type !== 'chit' && (
                      <span style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, background: c.accentSoft, borderRadius: 999, padding: '2px 7px' }}>{sv.frequency}</span>
                    )}
                  </div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>
                    {sv.is_recurring && sv.due_day
                      ? contributedThisPeriod
                        ? `Paid on ${new Date((sv.paid_date ?? sv.last_contribution_date)!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · Due ${ord(sv.due_day)}`
                        : `Due by ${ord(sv.due_day)} every month`
                      : sv.maturity_date
                        ? `Matures ${new Date(sv.maturity_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : sv.is_recurring ? `Recurring · ${sv.frequency}` : 'One-time'
                    }
                    {nextDue && !contributedThisPeriod && (
                      <span style={{ marginLeft: 6, color: c.accent, fontWeight: 700 }}>
                        · Next {nextDue.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>{fmt(sv.amount)}</div>
                  <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                    {sv.is_recurring ? `/${sv.frequency?.slice(0, 2) ?? 'mo'}` : 'principal'}
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {sv.type === 'chit' && sv.is_prized ? (
                  <>
                    <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: 10, padding: '8px 12px', flex: 1, minWidth: 80 }}>
                      <div style={{ font: '600 9px Plus Jakarta Sans', color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Prize Received</div>
                      <div style={{ font: '700 13px Plus Jakarta Sans', color: '#10B981', marginTop: 2 }}>
                        {sv.current_value > 0 ? fmt(sv.current_value) : 'In balance'}
                      </div>
                      {sv.prize_month && sv.total_installments && (
                        <div style={{ font: '600 9px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>Month {sv.prize_month} of {sv.total_installments}</div>
                      )}
                    </div>
                    {sv.total_installments && sv.current_installment < sv.total_installments && (
                      <div style={{ background: 'rgba(249,115,22,0.08)', borderRadius: 10, padding: '8px 12px', flex: 1, minWidth: 80 }}>
                        <div style={{ font: '600 9px Plus Jakarta Sans', color: '#F97316', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Remaining Obligation</div>
                        <div style={{ font: '700 13px Plus Jakarta Sans', color: '#F97316', marginTop: 2 }}>{fmt((sv.total_installments - sv.current_installment) * sv.amount)}</div>
                        <div style={{ font: '600 9px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{sv.total_installments - sv.current_installment} installment{sv.total_installments - sv.current_installment !== 1 ? 's' : ''} left</div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ background: c.surface2, borderRadius: 10, padding: '8px 12px', flex: 1, minWidth: 80 }}>
                      <div style={{ font: '600 9px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sv.is_recurring ? 'Invested' : 'Principal'}</div>
                      <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{fmt(contrib)}</div>
                      {sv.total_installments && (
                        <div style={{ font: '600 9px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                          {sv.is_recurring ? `${sv.current_installment}/${sv.total_installments}` : `${sv.current_installment} / ${sv.total_installments} mo`}
                        </div>
                      )}
                    </div>
                    {sv.current_value > 0 && (
                      <div style={{ background: (returns ?? 0) >= 0 ? 'rgba(16,185,129,0.08)' : '#FEF2F2', borderRadius: 10, padding: '8px 12px', flex: 1, minWidth: 80 }}>
                        <div style={{ font: '600 9px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Value</div>
                        <div style={{ font: '700 13px Plus Jakarta Sans', color: '#10B981', marginTop: 2 }}>{fmt(sv.current_value)}</div>
                        {returns !== null && (
                          <div style={{ font: '600 9px Plus Jakarta Sans', color: (returns ?? 0) >= 0 ? '#10B981' : '#EF4444', marginTop: 1 }}>
                            {returns >= 0 ? '+' : ''}{fmt(returns)}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                {sv.interest_rate && (
                  <div style={{ background: c.surface2, borderRadius: 10, padding: '8px 12px', flex: 1, minWidth: 80 }}>
                    <div style={{ font: '600 9px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Interest</div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{sv.interest_rate}% p.a.</div>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {pct !== null && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>Progress</span>
                    <span style={{ font: '700 10px Plus Jakarta Sans', color: col }}>{Math.round(pct)}% of {fmt(target!)}</span>
                  </div>
                  <div style={{ height: 5, background: c.surface2, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 999, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )}

              {/* Notes */}
              {sv.notes && (
                <div style={{ marginTop: 10, font: '500 12px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 10, padding: '7px 10px', lineHeight: 1.5 }}>
                  {sv.notes}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.faint}` }}>
                {sv.is_recurring && !contributedThisPeriod && (
                  <button
                    onClick={e => { e.stopPropagation(); handleContribute(sv) }}
                    disabled={isCont}
                    style={{ background: col + '18', color: col, border: 'none', borderRadius: 10, padding: '7px 12px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer', flex: 1, opacity: isCont ? 0.6 : 1 }}
                  >
                    {isCont ? '...' : '+ Record Contribution'}
                  </button>
                )}
                {sv.is_recurring && contributedThisPeriod && (
                  <span style={{ font: '600 12px Plus Jakarta Sans', color: '#10B981', background: 'rgba(16,185,129,0.1)', borderRadius: 10, padding: '7px 12px', flex: 1, textAlign: 'center' }}>
                    Invested {periodLabel}
                  </span>
                )}
                {tcfg.showCurrentValue && (
                  <button
                    onClick={e => { e.stopPropagation(); setUpdateValueId(sv.id); setNewValueInput(sv.current_value > 0 ? String(sv.current_value) : '') }}
                    style={{ background: c.surface2, color: c.muted, border: 'none', borderRadius: 10, padding: '7px 12px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}
                  >
                    Update value
                  </button>
                )}
                {(sv.type === 'chit' ? sv.is_prized && sv.current_value > 0 : sv.current_value > 0) && accounts.length > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); handlePayout(sv) }}
                    disabled={recordingPayout === sv.id}
                    style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: 'none', borderRadius: 10, padding: '7px 12px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer', opacity: recordingPayout === sv.id ? 0.6 : 1 }}
                  >
                    {recordingPayout === sv.id ? '...' : sv.type === 'chit' ? 'Record Payout' : 'Redeem'}
                  </button>
                )}
                {sv.type === 'chit' && sv.is_prized && sv.current_value === 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setRevertConfirm(sv) }}
                    disabled={reverting === sv.id}
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: 'none', borderRadius: 10, padding: '7px 12px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer', opacity: reverting === sv.id ? 0.6 : 1 }}
                  >
                    {reverting === sv.id ? '...' : 'Revert payout'}
                  </button>
                )}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(sv.id) }}
                  disabled={isDel}
                  style={{ background: '#FEE2E2', border: 'none', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                  </svg>
                </button>
              </div>
            </div>
          )
        })}

        {/* Completed / Archived section */}
        {completed.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setShowCompleted(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', width: '100%' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: showCompleted ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>
                Completed / Archived ({completed.length})
              </span>
            </button>
            {showCompleted && completed.map(sv => {
              const tcfg = TYPE_CONFIG[sv.type]
              const col = tcfg.color
              const contrib = sv.is_recurring ? sv.current_installment * sv.amount : sv.amount
              return (
                <div key={sv.id} style={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 14, padding: '12px 14px', marginBottom: 8, opacity: 0.7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: col + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{sv.name}</div>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                        {tcfg.label} · {sv.current_installment} installments · {fmt(contrib)} total
                      </div>
                    </div>
                    <button
                      onClick={() => onUpdate(sv.id, { is_active: true })}
                      style={{ background: c.accentSoft, color: c.accent, border: 'none', borderRadius: 8, padding: '5px 10px', font: '600 11px Plus Jakarta Sans', cursor: 'pointer', flexShrink: 0 }}
                    >
                      Reactivate
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Add / Edit Sheet ──────────────────────────────────────────────────── */}
      <BottomSheet open={sheetOpen} onClose={closeSheet}>
        <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>
          {editingId ? 'Edit Investment' : 'Add Investment'}
        </div>

        {editHasTx && (
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '10px 14px', marginBottom: 4 }}>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: '#B45309', lineHeight: 1.5 }}>
              This investment has transaction history. Some fields are locked to preserve data integrity.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Type selector */}
          <div>
            <label style={lbl}>Type</label>
            {editingId
              ? <HelpText>Investment type cannot be changed after creation.</HelpText>
              : <HelpText>The kind of investment. Changes which fields are shown below.</HelpText>
            }
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TYPE_ORDER.map(t => {
                const tcfg = TYPE_CONFIG[t]
                const isActive = form.type === t
                return (
                  <button
                    key={t}
                    onClick={() => !editingId && setType(t)}
                    disabled={!!editingId}
                    style={{
                      border: `1.5px solid ${isActive ? tcfg.color : c.faint}`,
                      background: isActive ? tcfg.color + '18' : 'transparent',
                      color: isActive ? tcfg.color : c.muted,
                      borderRadius: 10, padding: '7px 12px',
                      font: `${isActive ? '700' : '600'} 12px Plus Jakarta Sans`,
                      cursor: editingId ? 'not-allowed' : 'pointer',
                      opacity: editingId && !isActive ? 0.4 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    {tcfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Investment source */}
          <div>
            <label style={lbl}>Investment Source</label>
            {editingId
              ? <HelpText>Investment source cannot be changed after creation.</HelpText>
              : <HelpText>Existing: import without affecting balances. New: deduct from account and create a transaction.</HelpText>
            }
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { val: 'existing' as const, label: 'Existing Investment', desc: 'Already exists — no balance change' },
                { val: 'new' as const, label: 'New Investment', desc: 'Being created now — deduct from account' },
              ]).map(opt => {
                const isSelected = form.investment_source === opt.val
                return (
                  <button
                    key={opt.val}
                    onClick={() => !editingId && set('investment_source', opt.val)}
                    disabled={!!editingId}
                    style={{
                      flex: 1,
                      border: `1.5px solid ${isSelected ? c.accent : c.faint}`,
                      background: isSelected ? c.accentSoft : 'transparent',
                      color: isSelected ? c.accent : c.muted,
                      borderRadius: 12, padding: '10px 12px',
                      cursor: editingId ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      opacity: editingId && !isSelected ? 0.4 : 1,
                    }}
                  >
                    <div style={{ font: '700 13px Plus Jakarta Sans' }}>{opt.label}</div>
                    <div style={{ font: '600 11px Plus Jakarta Sans', marginTop: 2, opacity: 0.8 }}>{opt.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label style={lbl}>Name</label>
            <HelpText>A recognizable name. e.g. Axis Bluechip SIP, HDFC Home RD, Gold Scheme Jan.</HelpText>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder={`e.g. Axis Bluechip SIP, HDFC RD`} style={inp} autoFocus />
          </div>

          {/* Amount */}
          <div>
            <label style={lbl}>{cfg.amountLabel}</label>
            <HelpText>How much you contribute each period.</HelpText>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '600 14px Plus Jakarta Sans', color: c.muted }}>₹</span>
              <input
                type="text" inputMode="decimal" onFocus={e => e.target.select()}
                value={form.amount} onChange={e => set('amount', e.target.value)}
                placeholder={cfg.placeholder.replace('₹ ', '')} min="0"
                style={{ ...inp, paddingLeft: 28 }}
              />
            </div>
          </div>

          {/* Recurring plan fields */}
          {cfg.isRecurring && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Frequency</label>
                <HelpText>How often you make contributions to this investment.</HelpText>
                <select value={form.frequency} onChange={e => set('frequency', e.target.value as SavingsFrequency)} style={inp}>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              {form.frequency === 'monthly' && (
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Due day</label>
                  <HelpText>Day of month by which the scheme expects payment (e.g. 28 if due by 28th).</HelpText>
                  <input type="text" value={form.due_day} onChange={e => set('due_day', e.target.value)}
                    placeholder="e.g. 28" min="1" max="31" style={inp} />
                </div>
              )}
            </div>
          )}

          {/* Tenure / target */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>{cfg.isRecurring ? 'Total months / tenure' : 'Tenure (months)'}</label>
              {editingId
                ? <HelpText>Tenure is part of the original contract and cannot be changed.</HelpText>
                : <HelpText>Total duration of this plan. e.g. 5-year RD = 60 months.</HelpText>
              }
              <input type="text" inputMode="numeric" value={form.total_installments}
                onChange={e => !editingId && set('total_installments', e.target.value)}
                placeholder="e.g. 60" min="1"
                disabled={!!editingId}
                style={{ ...inp, ...(editingId ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>{cfg.isRecurring ? 'Contributions so far' : 'Months elapsed'}</label>
              <HelpText>How many contributions you have already made — used to calculate progress.</HelpText>
              <input type="text" inputMode="numeric" value={form.current_installment}
                onChange={e => set('current_installment', e.target.value)} placeholder="0" min="0" style={inp} />
            </div>
          </div>

          {/* Goal amount */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>{form.type === 'chit' ? 'Chit Value' : form.type === 'fd' ? 'Maturity Value (Optional)' : 'Goal amount (optional)'}</label>
              {(() => {
                const amt = parseFloat(form.amount), months = parseInt(form.total_installments)
                const autoVal = cfg.isRecurring && amt > 0 && months > 0 ? amt * months : null
                return autoVal && String(autoVal) === form.total_target
                  ? <span style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, background: c.accentSoft, borderRadius: 999, padding: '2px 8px' }}>Auto-calculated</span>
                  : null
              })()}
            </div>
            <HelpText>{form.type === 'chit' ? 'The fixed prize value of this chit fund. Auto-fills from contribution × members.' : form.type === 'fd' ? 'Expected maturity value of this Fixed Deposit.' : 'Total amount you aim to accumulate. Auto-fills from amount × months — you can override it.'}</HelpText>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '600 14px Plus Jakarta Sans', color: c.muted }}>₹</span>
              <input type="text" inputMode="decimal" value={form.total_target}
                onChange={e => set('total_target', e.target.value)} placeholder="e.g. 60,000"
                min="0" style={{ ...inp, paddingLeft: 28 }} />
            </div>
          </div>

          {/* Maturity date + interest rate */}
          {(cfg.showMaturity || cfg.showInterest) && (
            <div style={{ display: 'flex', gap: 8 }}>
              {cfg.showMaturity && (
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Maturity date</label>
                  <HelpText>When this investment matures or ends.</HelpText>
                  <input type="date" value={form.maturity_date} onChange={e => set('maturity_date', e.target.value)} style={inp} />
                </div>
              )}
              {cfg.showInterest && (
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Interest rate (% p.a.)</label>
                  <HelpText>Annual interest rate offered by the bank — for reference only, not used in calculations.</HelpText>
                  <input type="text" inputMode="decimal" value={form.interest_rate}
                    onChange={e => set('interest_rate', e.target.value)} placeholder="7.5" min="0" max="100" step="0.01" style={inp} />
                </div>
              )}
            </div>
          )}

          {/* Chit prized toggle */}
          {form.type === 'chit' && (
            <div>
              <label style={lbl}>Prize status</label>
              <HelpText>Whether you have already received the chit prize pot this cycle.</HelpText>
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ val: false, label: 'Unprized', desc: 'Still waiting for prize' }, { val: true, label: 'Prized', desc: 'Already received prize pot' }].map(opt => (
                  <button
                    key={String(opt.val)}
                    onClick={() => set('is_prized', opt.val)}
                    style={{
                      flex: 1, border: `1.5px solid ${form.is_prized === opt.val ? (opt.val ? '#10B981' : '#F97316') : c.faint}`,
                      background: form.is_prized === opt.val ? (opt.val ? 'rgba(16,185,129,0.1)' : 'rgba(249,115,22,0.1)') : 'transparent',
                      color: form.is_prized === opt.val ? (opt.val ? '#10B981' : '#F97316') : c.muted,
                      borderRadius: 12, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ font: '700 13px Plus Jakarta Sans' }}>{opt.label}</div>
                    <div style={{ font: '600 11px Plus Jakarta Sans', marginTop: 2, opacity: 0.8 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Prize month + prize amount (chit, prized only) */}
          {form.type === 'chit' && form.is_prized && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Prize Month</label>
                {prizeMonthLocked
                  ? <HelpText>Prize month cannot be changed after payout is recorded.</HelpText>
                  : <HelpText>Which installment number you received the prize at (e.g. 8 of 10).</HelpText>
                }
                <input type="text" inputMode="numeric" value={form.prize_month}
                  onChange={e => !prizeMonthLocked && set('prize_month', e.target.value)}
                  placeholder="e.g. 8" min="1"
                  disabled={prizeMonthLocked}
                  style={{ ...inp, ...(prizeMonthLocked ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Prize Amount Received</label>
                <HelpText>Actual cash received after deductions (charity, current month, etc.).</HelpText>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '600 14px Plus Jakarta Sans', color: c.muted }}>₹</span>
                  <input type="text" inputMode="decimal" value={form.current_value === '0' ? '' : form.current_value}
                    onChange={e => set('current_value', e.target.value || '0')} placeholder="e.g. 43,000"
                    min="0" style={{ ...inp, paddingLeft: 28 }} />
                </div>
              </div>
            </div>
          )}

          {/* Current value (for SIP / PPF) */}
          {cfg.showCurrentValue && (
            <div>
              <label style={lbl}>Current portfolio value (optional)</label>
              <HelpText>Current market value from your fund app or bank statement. Used to track gains/losses.</HelpText>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '600 14px Plus Jakarta Sans', color: c.muted }}>₹</span>
                <input type="text" inputMode="decimal" value={form.current_value === '0' ? '' : form.current_value}
                  onChange={e => set('current_value', e.target.value || '0')} placeholder="As per latest NAV"
                  min="0" style={{ ...inp, paddingLeft: 28 }} />
              </div>
            </div>
          )}

          {/* Category + Account */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Category</label>
              <HelpText>Tag contributions as an expense category. Only relevant when recording contributions as expenses.</HelpText>
              <CategorySelect
                value={form.category_id} onChange={v => set('category_id', v)}
                state={state} onAddCategory={onAddCategory}
                style={inp} includeEmpty emptyLabel="None"
                filterGroup={SAVINGS_GROUP}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Debit from account</label>
              <HelpText>Which account your contributions are deducted from.</HelpText>
              <select value={form.from_account_id} onChange={e => set('from_account_id', e.target.value)} style={inp}>
                <option value="">None</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={lbl}>Notes (optional)</label>
            <HelpText>Folio number, fund house, bank branch, or any other reference info.</HelpText>
            <input value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Folio no., bank, fund house…" style={inp} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={closeSheet} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleSave} disabled={saving}
            style={{ flex: 2, background: '#10B981', color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving...' : editingId ? 'Save Changes' : form.investment_source === 'new' ? 'Review & Create' : 'Review & Add'}
          </button>
        </div>
      </BottomSheet>

      {/* ── Record contribution confirmation ──────────────────────────────────── */}
      {confirmContrib && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setConfirmContrib(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Record contribution?</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 16 }}>
              Record <strong style={{ color: c.ink }}>{confirmContrib.name}</strong> ({fmt(confirmContrib.amount)}) contribution. Deduct from your account?
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>Debit from</label>
              <select value={confirmAccountId} onChange={e => setConfirmAccountId(e.target.value)}
                style={{ width: '100%', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px', font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none' }}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={async () => {
                  const sv = confirmContrib; setConfirmContrib(null)
                  setContributing(sv.id)
                  try { await onRecordContribution(sv, true, confirmAccountId) } catch (_) {}
                  setContributing(null)
                }}
                style={{ width: '100%', background: '#10B981', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Yes, record as expense
              </button>
              <button
                onClick={async () => {
                  const sv = confirmContrib; setConfirmContrib(null)
                  setContributing(sv.id)
                  try { await onRecordContribution(sv, false, null) } catch (_) {}
                  setContributing(null)
                }}
                style={{ width: '100%', background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                No, just mark as contributed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record payout / redemption ──────────────────────────────────────── */}
      {confirmPayout && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setConfirmPayout(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
              {confirmPayout.type === 'chit' ? 'Record Prize Payout' : 'Redeem Investment'}
            </div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 16 }}>
              {confirmPayout.type === 'chit'
                ? 'Received the prize now? Add it to your account balance and create a transaction record.'
                : 'Withdrew now? Add the amount to your account balance and create a transaction record.'}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>Amount</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '600 14px Plus Jakarta Sans', color: c.muted }}>₹</span>
                <input
                  type="text" inputMode="decimal"
                  value={payoutAmount}
                  onChange={e => setPayoutAmount(e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="Amount received"
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px 10px 28px', font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>Credit to</label>
              <select value={payoutAccountId} onChange={e => setPayoutAccountId(e.target.value)}
                style={{ width: '100%', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px', font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none' }}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={async () => {
                  const sv = confirmPayout
                  const amount = parseFloat(payoutAmount)
                  if (!amount || amount <= 0 || !payoutAccountId) return
                  setConfirmPayout(null)
                  setRecordingPayout(sv.id)
                  try { await onRecordPayout(sv, amount, payoutAccountId) } catch (_) {}
                  setRecordingPayout(null)
                }}
                style={{ width: '100%', background: '#10B981', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                {confirmPayout.type === 'chit' ? 'Record Payout & Add to Balance' : 'Record Redemption & Add to Balance'}
              </button>
              <button
                onClick={async () => {
                  const sv = confirmPayout
                  setConfirmPayout(null)
                  try { await onUpdateValue(sv.id, 0) } catch (_) {}
                }}
                style={{ width: '100%', background: c.surface2, color: c.ink, border: `1.5px solid ${c.faint}`, borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Already in my balance — no transaction
              </button>
              <button
                onClick={() => setConfirmPayout(null)}
                style={{ width: '100%', background: 'none', color: c.muted, border: 'none', borderRadius: 12, padding: '10px', font: '600 13px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Revert payout confirm ───────────────────────────────────────────── */}
      {revertConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setRevertConfirm(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Revert Payout?</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 20 }}>
              This will delete the payout transaction and deduct the credited amount from your account. The "Record Payout" button will reappear.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={async () => {
                  const sv = revertConfirm
                  setRevertConfirm(null)
                  setReverting(sv.id)
                  try { await onRevertPayout(sv) } catch (_) {}
                  setReverting(null)
                }}
                style={{ width: '100%', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Yes, Revert
              </button>
              <button
                onClick={() => setRevertConfirm(null)}
                style={{ width: '100%', background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Update current value ─────────────────────────────────────────────── */}
      {updateValueId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setUpdateValueId(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Update current value</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5, marginBottom: 16 }}>
              Enter the current market value of this investment (check your fund app or bank statement).
            </div>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '600 14px Plus Jakarta Sans', color: c.muted }}>₹</span>
              <input
                type="text" inputMode="decimal" value={newValueInput}
                onChange={e => setNewValueInput(e.target.value)}
                onFocus={e => e.target.select()}
                placeholder="Current portfolio value"
                autoFocus
                style={{ ...inp, paddingLeft: 28 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setUpdateValueId(null)} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleUpdateValue} disabled={saving} style={{ flex: 2, background: '#10B981', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? '...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Save confirmation (portal — must sit above BottomSheet portal) ────── */}
      {saveConfirmPending && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => { setSaveConfirmPending(null); setSaveError(null) }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            {saveConfirmPending.payload.investment_source === 'existing' ? (
              <>
                <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Add existing investment?</div>
                <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 6 }}>
                  <strong style={{ color: c.ink }}>{saveConfirmPending.payload.name}</strong> will be added to your portfolio.
                </div>
                <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, font: '600 12px Plus Jakarta Sans', color: '#059669', lineHeight: 1.6 }}>
                  This will NOT affect account balances and will NOT create any transactions.
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setSaveConfirmPending(null); setSaveError(null) }} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleSaveConfirm} disabled={confirmingSave} style={{ flex: 2, background: '#10B981', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: confirmingSave ? 'not-allowed' : 'pointer', opacity: confirmingSave ? 0.7 : 1 }}>
                    {confirmingSave ? 'Adding...' : 'Add Investment'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Create investment?</div>
                <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 6 }}>
                  <strong style={{ color: c.ink }}>{fmt(saveConfirmPending.payload.amount)}</strong> will be deducted from <strong style={{ color: c.ink }}>{saveConfirmPending.accountName || 'your account'}</strong>.
                </div>
                <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, font: '600 12px Plus Jakarta Sans', color: '#4F46E5', lineHeight: 1.6 }}>
                  A savings contribution transaction will be created.
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setSaveConfirmPending(null); setSaveError(null) }} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleSaveConfirm} disabled={confirmingSave || !saveConfirmPending.accountId} style={{ flex: 2, background: '#10B981', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: (confirmingSave || !saveConfirmPending.accountId) ? 'not-allowed' : 'pointer', opacity: (confirmingSave || !saveConfirmPending.accountId) ? 0.7 : 1 }}>
                    {confirmingSave ? 'Creating...' : 'Create Investment'}
                  </button>
                </div>
                {saveError && (
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: '#EF4444', marginTop: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: '8px 12px', lineHeight: 1.5 }}>
                    {saveError}
                  </div>
                )}
                {!saveConfirmPending.accountId && !saveError && (
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: '#EF4444', marginTop: 10, textAlign: 'center' }}>
                    Select a "Debit from account" in the form to continue.
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
      document.body)}

      {/* ── Delete protection ─────────────────────────────────────────────────── */}
      {deleteProtect && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setDeleteProtect(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Cannot delete investment</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 20 }}>
              <strong style={{ color: c.ink }}>{deleteProtect.name}</strong> has financial history and cannot be deleted. Archive or mark it as completed instead.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => handleArchive(deleteProtect)}
                disabled={archiving === deleteProtect.id}
                style={{ width: '100%', background: c.surface2, color: c.ink, border: `1.5px solid ${c.faint}`, borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer', opacity: archiving === deleteProtect.id ? 0.6 : 1 }}
              >
                {archiving === deleteProtect.id ? '...' : 'Archive Investment'}
              </button>
              <button
                onClick={() => handleArchive(deleteProtect)}
                disabled={archiving === deleteProtect.id}
                style={{ width: '100%', background: '#10B981', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer', opacity: archiving === deleteProtect.id ? 0.6 : 1 }}
              >
                {archiving === deleteProtect.id ? '...' : 'Mark Completed'}
              </button>
              <button onClick={() => setDeleteProtect(null)} style={{ width: '100%', background: 'none', color: c.muted, border: 'none', borderRadius: 12, padding: '10px', font: '600 13px Plus Jakarta Sans', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogNode}
    </div>
  )
}
