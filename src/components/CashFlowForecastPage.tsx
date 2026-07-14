import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { fmt, round2 } from '@/lib/utils'
import { evaluateAmountExpression } from '@/lib/amountExpression'
import { AmountOperatorRow } from './AmountOperatorRow'
import { buildCashFlowForecast, daysUntil, getForecastDrivers } from '@/lib/cashflow'
import { forecastHealth, getHealthMessage } from '@/components/CashFlowForecastCard'
import { getIncomePattern } from '@/lib/income-pattern'
import { useStrategyData } from './BudgetStrategyCard'
import { CategorySelect } from './CategorySelect'
import { simulatePurchase } from '@/lib/cashflow'
import { buildLifestyleForecast, isBehavioralSpending } from '@/features/forecast/lib/lifestyleForecast'
import { CashFlowGraph } from './CashFlowGraph'
import type { AppState, DerivedMetrics, ForecastMode, ForecastSettings, PlannedExpense } from '@/types'

interface Props {
  state: AppState
  d: DerivedMetrics
  onClose: () => void
  onSetup: () => void
  onSwipeProgress?: (pct: number) => void
  onAddPlannedExpense: (form: Omit<PlannedExpense, 'id' | 'created_at'>) => Promise<void>
  onUpdatePlannedExpense: (id: string, patch: Partial<PlannedExpense>) => Promise<void>
  onDeletePlannedExpense: (id: string) => Promise<void>
  onAddCategory: (name: string, group_name: string) => Promise<string>
  onUpdateForecastSettings: (patch: Partial<ForecastSettings>) => void
  onRecordIncome?: () => void
}

const F = 'Plus Jakarta Sans'
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

function eventTitle(title: string, source: string, isWaiting: boolean): string {
  if (!isWaiting) return title
  if (source === 'salary') return `Expected ${title}`
  return title
}

const EVENT_COLORS: Record<string, string> = {
  salary: '#22C55E',
  commitment: '#EF4444',
  card: '#EF4444',
  borrowing: '#EF4444',
  saving: '#8B5CF6',
  lifestyle: '#3B82F6',
  planned: '#F97316',
}

function eventColor(source: string, fallback: string): string {
  return EVENT_COLORS[source] ?? fallback
}

function InfoTip({ id, text, openId, setOpenId, color }: { id: string; text: string; openId: string | null; setOpenId: (v: string | null) => void; color: string }) {
  const isOpen = openId === id
  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpenId(isOpen ? null : id) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, verticalAlign: 'middle', marginLeft: 3, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={`${color}80`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {isOpen && (
        <div style={{ font: `500 11px ${F}`, color, lineHeight: 1.5, padding: '6px 0 2px', maxWidth: 340 }}>
          {text}
        </div>
      )}
    </>
  )
}

export function CashFlowForecastPage({ state, d, onClose, onSetup, onSwipeProgress, onAddPlannedExpense, onUpdatePlannedExpense, onDeletePlannedExpense, onAddCategory, onUpdateForecastSettings, onRecordIncome }: Props) {
  const c = useTheme()
  const mode: ForecastMode = state.forecast_settings.forecast_mode ?? 'planned'
  const setMode = (m: ForecastMode) => onUpdateForecastSettings({ forecast_mode: m })

  const plannedForecast = useMemo(() => buildCashFlowForecast(state, d), [state, d])
  const lifestyleForecast = useMemo(() => mode === 'lifestyle' ? buildLifestyleForecast(state, d) : null, [state, d, mode])

  const forecast = mode === 'lifestyle' && lifestyleForecast ? lifestyleForecast : plannedForecast
  const { currentBalance, lowestBalance, lowestBalanceDate, nextSalaryDate, recoveryDate, recoveryBalance, projections } = forecast
  const drivers = useMemo(() => getForecastDrivers(projections, 5), [projections])
  const strategyData = useStrategyData(state, d)

  const forecastOutcome = useMemo(() => {
    let income = 0
    let cardTotal = 0
    let borrowingTotal = 0
    let prizedChitTotal = 0
    let savingsTotal = 0
    let commitmentTotal = 0
    let plannedTotal = 0
    let lifestyleTotal = 0
    let lifestyleDays = 0
    const cardItems: { title: string; amount: number }[] = []
    const borrowingItems: { title: string; amount: number }[] = []
    const prizedChitItems: { title: string; amount: number }[] = []
    const savingsItems: { title: string; amount: number }[] = []
    const commitmentItems: { title: string; amount: number }[] = []
    const plannedItems: { title: string; amount: number }[] = []

    for (const p of projections) {
      const ev = p.event
      if (ev.type === 'income') {
        income += ev.amount
      } else if (ev.source === 'card') {
        cardTotal += ev.amount
        cardItems.push({ title: ev.title, amount: ev.amount })
      } else if (ev.source === 'borrowing') {
        borrowingTotal += ev.amount
        borrowingItems.push({ title: ev.title, amount: ev.amount })
      } else if (ev.source === 'saving' && ev.is_prized) {
        prizedChitTotal += ev.amount
        prizedChitItems.push({ title: ev.title, amount: ev.amount })
      } else if (ev.source === 'saving') {
        savingsTotal += ev.amount
        savingsItems.push({ title: ev.title, amount: ev.amount })
      } else if (ev.source === 'commitment') {
        commitmentTotal += ev.amount
        commitmentItems.push({ title: ev.title, amount: ev.amount })
      } else if (ev.source === 'planned') {
        plannedTotal += ev.amount
        plannedItems.push({ title: ev.title, amount: ev.amount })
      } else if (ev.source === 'lifestyle') {
        lifestyleTotal += ev.amount
        lifestyleDays++
      }
    }

    const debt = cardTotal + borrowingTotal + prizedChitTotal
    const totalOut = debt + savingsTotal + commitmentTotal + plannedTotal + lifestyleTotal
    if (income === 0 && totalOut === 0) return null
    return { income, debt, savingsTotal, savingsItems, commitmentTotal, commitmentItems, plannedTotal, plannedItems, lifestyleTotal, lifestyleDays, lifestyleDaily: lifestyleDays > 0 ? Math.round(lifestyleTotal / lifestyleDays) : 0, available: currentBalance + income - totalOut, cardTotal, cardItems, borrowingTotal, borrowingItems, prizedChitTotal, prizedChitItems }
  }, [projections, currentBalance])

  const [debtExpanded, setDebtExpanded] = useState(false)
  const [debtDetailExpanded, setDebtDetailExpanded] = useState(false)
  const [plannedExpanded, setPlannedExpanded] = useState(false)
  const [lifestyleExpanded, setLifestyleExpanded] = useState(false)
  const [openInfoId, setOpenInfoId] = useState<string | null>(null)
  const [peAdding, setPeAdding] = useState(false)
  const [peTitle, setPeTitle] = useState('')
  const [peAmount, setPeAmount] = useState('')
  const peAmountRef = useRef<HTMLInputElement | null>(null)
  const [peAmountFocused, setPeAmountFocused] = useState(false)
  const [peDate, setPeDate] = useState('')
  const [peCategoryId, setPeCategoryId] = useState('')
  const [peEditId, setPeEditId] = useState<string | null>(null)
  const [peSaving, setPeSaving] = useState(false)

  const pendingPlanned = useMemo(() => state.planned_expenses.filter(p => !p.is_completed), [state.planned_expenses])

  const lifestyleDetail = useMemo(() => {
    if (!lifestyleForecast || !lifestyleForecast.dailySpend.source) return null
    const today = new Date()
    const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    if (lifestyleForecast.dailySpend.source === 'budget_strategy') {
      const rec = lifestyleForecast.recommendation
      if (!rec) return null
      return {
        type: 'budget_strategy' as const,
        strategy: rec.strategy,
        needsTarget: rec.needsTarget, needsSpent: rec.needsSpent, needsRemaining: Math.max(0, rec.needsTarget - rec.needsSpent),
        wantsTarget: rec.wantsTarget, wantsSpent: rec.wantsSpent, wantsRemaining: Math.max(0, rec.wantsTarget - rec.wantsSpent),
        daysRemaining: rec.daysRemaining,
        needsDaily: rec.needsDaily,
        wantsDaily: rec.wantsDaily,
      }
    }

    const histDays = lifestyleForecast.dailySpend.days ?? 30
    const cutoffIso = toIso(new Date(today0.getFullYear(), today0.getMonth(), today0.getDate() - histDays))
    const todayIso = toIso(today0)
    const catMap = Object.fromEntries(state.categories.map(cc => [cc.id, cc]))
    const groupsByName = Object.fromEntries(state.groups.map(g => [g.name, g]))
    const txns = state.transactions
      .filter(t => {
        if (t.transaction_date < cutoffIso || t.transaction_date > todayIso) return false
        return isBehavioralSpending(t, catMap, groupsByName)
      })
      .sort((a, b) => a.transaction_date < b.transaction_date ? 1 : -1)

    return { type: 'historical' as const, txns, histDays }
  }, [lifestyleForecast, state, d])

  const resetPeForm = () => { setPeTitle(''); setPeAmount(''); setPeDate(''); setPeCategoryId(''); setPeEditId(null); setPeAdding(false) }

  const peImpact = useMemo(() => {
    const amt = evaluateAmountExpression(peAmount) ?? NaN
    if (!peAdding || !(amt > 0)) return null
    const sim = simulatePurchase(state, d, amt)
    return { lowestBefore: forecast.lowestBalance, lowestAfter: sim.lowestBalance }
  }, [peAdding, peAmount, state, d, forecast])

  const savePe = async () => {
    const rawAmt = evaluateAmountExpression(peAmount)
    const amt = rawAmt === null ? NaN : round2(rawAmt)
    if (!peTitle.trim() || !(amt > 0) || !peDate || !peCategoryId) return
    setPeSaving(true)
    try {
      if (peEditId) {
        await onUpdatePlannedExpense(peEditId, { title: peTitle.trim(), amount: amt, planned_date: peDate, category_id: peCategoryId })
      } else {
        await onAddPlannedExpense({ title: peTitle.trim(), amount: amt, planned_date: peDate, category_id: peCategoryId, notes: null, is_completed: false })
      }
      resetPeForm()
    } finally { setPeSaving(false) }
  }

  const startPeEdit = (pe: PlannedExpense) => {
    setPeTitle(pe.title); setPeAmount(String(pe.amount)); setPeDate(pe.planned_date); setPeCategoryId(pe.category_id || ''); setPeEditId(pe.id); setPeAdding(true); setPlannedExpanded(true)
  }

  // ── Swipe-back gesture (mirrors BorrowingPage) ──
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

  // Lock the dashboard behind this full-screen overlay.
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

  const pattern = getIncomePattern(state.settings)
  const waitingForIncome = d.isWaitingForIncome ?? false
  const incLabel = pattern === 'monthly' ? 'salary' : 'income'
  const health = forecastHealth(lowestBalance)
  const toneColor = health === 'critical' ? c.bad : health === 'warning' ? c.warn : c.good
  const toneSoft = health === 'critical' ? c.badSoft : health === 'warning' ? c.warnSoft : c.goodSoft
  const message = projections.length === 0 ? 'No upcoming events' : getHealthMessage(health, pattern)
  const salaryDays = nextSalaryDate ? daysUntil(nextSalaryDate) : null
  const days = state.forecast_settings.days ?? 60
  const topCauses = drivers.slice(0, 3)

  return createPortal(
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}
      style={{
        position: 'fixed', inset: 0, background: c.bg, zIndex: 100,
        overflowY: dragX > 0 ? 'hidden' : 'auto',
        overscrollBehavior: 'contain', fontFamily: `${F}, sans-serif`, willChange: 'transform',
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
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(12px + env(safe-area-inset-top,0px)) 16px 12px' }}>
          <button onClick={triggerClose} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ font: `800 20px ${F}`, color: c.ink, letterSpacing: '-0.02em' }}>Cash Flow Forecast</div>
            <div style={{ font: `600 12px ${F}`, color: c.muted, marginTop: 1 }}>Next {days} days · {mode === 'lifestyle' ? 'known events + estimated daily spending' : 'known events only'}</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '18px 16px calc(40px + env(safe-area-inset-bottom,0px))' }}>
        {/* Available today */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center' }}>Available Today<InfoTip id="available" text="Your actual balance minus emergency fund reserve. This is what you can realistically spend today." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></div>
          <div style={{ font: `800 30px ${F}`, color: c.ink, letterSpacing: '-0.02em' }}>{fmt(currentBalance)}</div>
          <div style={{ font: `600 12px ${F}`, color: c.muted, marginTop: 2 }}>Available to spend right now</div>
        </div>

        {/* Waiting for income banner */}
        {waitingForIncome && (
          <div style={{ background: `${c.warn}12`, border: `1.5px solid ${c.warn}30`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.warn} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ font: `700 13px ${F}`, color: c.warn }}>Waiting for your {incLabel}</span>
            </div>
            <div style={{ font: `500 12px ${F}`, color: c.muted, lineHeight: 1.5, marginBottom: 10 }}>
              {d.expectedIncomeDate
                ? <>Expected on <strong style={{ color: c.ink }}>{new Date(d.expectedIncomeDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong>. </>
                : null
              }
              This forecast assumes your expected {incLabel} will arrive. Record your {incLabel} when received to begin the new financial cycle.
            </div>
            {onRecordIncome && (
              <button onClick={onRecordIncome} style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', font: `700 13px ${F}`, cursor: 'pointer' }}>
                + Record {pattern === 'monthly' ? 'Salary' : 'Income'}
              </button>
            )}
          </div>
        )}

        {/* Mode Toggle */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3 }}>
            {(['planned', 'lifestyle'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1, border: 'none', cursor: 'pointer', borderRadius: 10, padding: '10px 0',
                  font: `700 13px ${F}`,
                  background: mode === m ? c.bg : 'transparent',
                  color: mode === m ? c.ink : c.muted,
                  boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                {m === 'planned' ? 'Planned' : 'Smart'}
                {m === 'lifestyle' && <span style={{ font: `600 9px ${F}`, color: c.accent, marginLeft: 4, verticalAlign: 'super' }}>BETA</span>}
              </button>
            ))}
          </div>
          <div style={{ font: `600 11px ${F}`, color: c.muted, marginTop: 6, textAlign: 'center' }}>
            {mode === 'planned' ? 'Only known future events' : 'Known events + estimated daily spending'}
          </div>
        </div>

        {/* Smart Forecast Summary Cards */}
        {mode === 'lifestyle' && lifestyleForecast && lifestyleForecast.dailySpend.source && (() => {
          const ds = lifestyleForecast.dailySpend
          const riskColor = lifestyleForecast.risk === 'critical' || lifestyleForecast.risk === 'risk' ? c.bad : lifestyleForecast.risk === 'tight' ? c.warn : c.good
          const riskMsg = lifestyleForecast.risk === 'healthy' ? 'Cash flow looks healthy'
            : lifestyleForecast.risk === 'tight' ? 'Getting tight — watch spending'
            : lifestyleForecast.risk === 'risk' ? 'May run short — recovery expected'
            : 'Cash flow at risk — no recovery in sight'
          const sourceDesc = waitingForIncome && ds.source === 'historical'
            ? `Based on recent spending (waiting for ${incLabel})`
            : ds.source === 'hybrid'
            ? `${Math.round((ds.historyWeight ?? 0) * 100)}% Recent Spending · ${Math.round((1 - (ds.historyWeight ?? 0)) * 100)}% Budget Strategy`
            : ds.source === 'historical' ? `Based on your last ${ds.days ?? 30} days`
            : 'Based on budget strategy'
          const rec = lifestyleForecast.recommendation
          const showRec = rec && ds.source !== 'budget_strategy'
          return (
            <>
              {/* Card 1: Forecast Daily Spending */}
              <div style={{ background: `${c.accent}10`, border: `1.5px solid ${c.accent}30`, borderRadius: 16, padding: 16, marginBottom: showRec ? 8 : 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ font: `700 11px ${F}`, color: c.accent, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>Forecast Daily Spending</div>
                    <div style={{ font: `800 26px ${F}`, color: c.ink, letterSpacing: '-0.02em' }}>{fmt(ds.amount)}<span style={{ font: `600 13px ${F}`, color: c.muted }}>/day</span></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ font: `700 11px ${F}`, color: c.accent, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>Safe Until</div>
                    <div style={{ font: `800 18px ${F}`, color: riskColor }}>{lifestyleForecast.safeUntilLabel}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: riskColor }} />
                  <span style={{ font: `700 12px ${F}`, color: riskColor }}>{riskMsg}</span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ font: `600 10px ${F}`, color: c.muted, letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 4 }}>Based on:</div>
                  {(ds.source === 'hybrid' || ds.source === 'historical') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      <span style={{ font: `600 11px ${F}`, color: c.ink }}>Recent spending{ds.days ? ` (${ds.days} days)` : ''}</span>
                    </div>
                  )}
                  {(ds.source === 'hybrid' || ds.source === 'budget_strategy') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      <span style={{ font: `600 11px ${F}`, color: c.ink }}>Your budget plan</span>
                    </div>
                  )}
                </div>
                {ds.confidence && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <span style={{ font: `600 10px ${F}`, color: c.muted, letterSpacing: '0.03em', textTransform: 'uppercase' }}>Confidence</span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {['low', 'medium', 'high', 'very_high'].map((lvl, i) => {
                        const filled = ['low', 'medium', 'high', 'very_high'].indexOf(ds.confidence!) >= i
                        return <div key={lvl} style={{ width: 14, height: 4, borderRadius: 2, background: filled ? c.accent : `${c.muted}30` }} />
                      })}
                    </div>
                    <span style={{ font: `600 10px ${F}`, color: c.ink, textTransform: 'capitalize' }}>{ds.confidence.replace('_', ' ')}</span>
                  </div>
                )}
                <div style={{ font: `500 11px ${F}`, color: c.muted, marginTop: 6, lineHeight: 1.4 }}>
                  This forecast assumes you continue spending around {fmt(ds.amount)}/day.
                </div>
                {ds.source === 'hybrid' && ds.historyAmount != null && ds.budgetAmount != null && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ font: `600 10px ${F}`, color: c.accent, cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                      Why this forecast?
                    </summary>
                    <div style={{ marginTop: 6, padding: '8px 10px', background: c.surface2, borderRadius: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ font: `500 11px ${F}`, color: c.muted }}>History average</span>
                        <span style={{ font: `600 11px ${F}`, color: c.ink }}>{fmt(ds.historyAmount)}/day</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ font: `500 11px ${F}`, color: c.muted }}>Budget recommendation</span>
                        <span style={{ font: `600 11px ${F}`, color: c.ink }}>{fmt(ds.budgetAmount)}/day</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0 0', borderTop: `1px solid ${c.faint}`, marginTop: 3 }}>
                        <span style={{ font: `600 11px ${F}`, color: c.ink }}>Forecast</span>
                        <span style={{ font: `700 11px ${F}`, color: c.accent }}>{fmt(ds.amount)}/day</span>
                      </div>
                    </div>
                  </details>
                )}
              </div>

              {/* Card 2: Recommended Daily Spending (budget guidance) */}
              {showRec && (
                <div style={{ background: c.surface2, borderRadius: 16, padding: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Recommended Daily Spending</div>
                    <span style={{ font: `800 18px ${F}`, color: c.ink }}>{fmt(rec.amount)}<span style={{ font: `500 11px ${F}`, color: c.muted }}>/day</span></span>
                  </div>
                  <div style={{ font: `500 11px ${F}`, color: c.muted, marginBottom: 6 }}>Based on remaining budget · {rec.daysRemaining} day{rec.daysRemaining === 1 ? '' : 's'} left</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ font: `600 11px ${F}`, color: c.muted }}>Needs <span style={{ font: `700 11px ${F}`, color: c.ink }}>{fmt(rec.needsDaily)}</span></div>
                    <div style={{ font: `600 11px ${F}`, color: c.muted }}>Wants <span style={{ font: `700 11px ${F}`, color: c.ink }}>{fmt(rec.wantsDaily)}</span></div>
                  </div>
                </div>
              )}
            </>
          )
        })()}

        {mode === 'lifestyle' && lifestyleForecast && !lifestyleForecast.dailySpend.source && (
          <div style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <div style={{ font: `700 13px ${F}`, color: c.ink, marginBottom: 4 }}>Not enough data yet</div>
            <div style={{ font: `600 12px ${F}`, color: c.muted, lineHeight: 1.5 }}>Continue tracking expenses for a few weeks or set up a Budget Strategy to enable Smart Forecast.</div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <button onClick={onSetup} style={{ flex: 1, background: c.surface2, color: c.ink, border: 'none', borderRadius: 12, padding: '11px', font: `700 13px ${F}`, cursor: 'pointer' }}>Edit Forecast</button>
        </div>

        {/* Forecast Status */}
        {projections.length > 0 && (() => {
          const lf = mode === 'lifestyle' && lifestyleForecast ? lifestyleForecast : null
          const statusRisk = lf ? lf.risk : (health === 'critical' ? 'risk' : health === 'warning' ? 'tight' : 'healthy')
          const statusColor = statusRisk === 'risk' || statusRisk === 'critical' ? c.bad : statusRisk === 'tight' ? c.warn : c.good
          const statusMsg = statusRisk === 'healthy' ? 'Safe throughout forecast'
            : statusRisk === 'tight' ? 'Cash buffer is getting low'
            : statusRisk === 'critical' ? 'You may run out of money'
            : 'You may run short'
          return (
            <div style={{ background: `${statusColor}10`, border: `1.5px solid ${statusColor}25`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: statusColor }} />
                <span style={{ font: `800 14px ${F}`, color: statusColor, textTransform: 'capitalize' }}>{statusRisk}</span>
              </div>
              <div style={{ font: `600 13px ${F}`, color: c.ink, marginBottom: 10 }}>{statusMsg}</div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div style={{ font: `600 10px ${F}`, color: c.muted, letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 2 }}>Lowest Balance</div>
                  <div style={{ font: `800 18px ${F}`, color: statusColor }}>{fmt(lowestBalance)}</div>
                  {lowestBalanceDate && statusRisk !== 'healthy' && (
                    <div style={{ font: `500 10px ${F}`, color: c.muted, marginTop: 1 }}>Expected {shortDate(lowestBalanceDate)}</div>
                  )}
                </div>
                <div>
                  <div style={{ font: `600 10px ${F}`, color: c.muted, letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 2 }}>Recovery</div>
                  {recoveryDate ? (
                    <>
                      <div style={{ font: `800 18px ${F}`, color: c.good }}>{shortDate(recoveryDate)}</div>
                      <div style={{ font: `500 10px ${F}`, color: c.muted, marginTop: 1 }}>{waitingForIncome ? `Assuming expected ${incLabel}` : `After ${incLabel}`}</div>
                    </>
                  ) : (
                    <div style={{ font: `700 14px ${F}`, color: statusColor === c.good ? c.good : c.muted }}>{statusRisk === 'healthy' ? 'Not needed' : 'None in forecast'}</div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Forecast Health */}
        {projections.length > 0 && (() => {
          const lf2 = mode === 'lifestyle' && lifestyleForecast ? lifestyleForecast : null
          const riskLevel = lf2 ? lf2.risk : (health === 'critical' ? 'risk' : health === 'warning' ? 'tight' : 'healthy')
          const riskColor = riskLevel === 'risk' || riskLevel === 'critical' ? c.bad : riskLevel === 'tight' ? c.warn : c.good
          const daysToDeficit = lowestBalanceDate ? daysUntil(lowestBalanceDate) : days
          let suggestion: string
          if (lowestBalance < 0 && daysToDeficit > 0) {
            const reduceBy = Math.ceil(Math.abs(lowestBalance) / daysToDeficit)
            suggestion = `Reduce spending by ~${fmt(reduceBy)}/day for the next ${daysToDeficit} days to stay positive`
          } else if (riskLevel === 'tight') {
            suggestion = 'Watch discretionary spending — buffer is thin'
          } else {
            suggestion = 'Cash flow looks healthy — no action needed'
          }
          return (
            <div style={{ background: c.surface2, borderRadius: 16, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 999, background: riskColor }} />
                <span style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.03em', textTransform: 'uppercase' }}>Forecast Health</span>
              </div>
              {topCauses.length > 0 && riskLevel !== 'healthy' && (
                <div style={{ font: `600 12px ${F}`, color: c.muted, marginBottom: 4 }}>
                  Reason: {topCauses[0].title} ({fmt(topCauses[0].amount)})
                </div>
              )}
              <div style={{ font: `600 12px ${F}`, color: riskColor, lineHeight: 1.4 }}>{suggestion}</div>
            </div>
          )
        })()}

        {/* Cash Flow Graph */}
        {projections.length > 0 && (
          <CashFlowGraph
            projections={projections}
            currentBalance={currentBalance}
            lowestBalance={lowestBalance}
            lowestBalanceDate={lowestBalanceDate}
            recoveryDate={recoveryDate}
            recoveryBalance={recoveryBalance}
            nextSalaryDate={nextSalaryDate}
            onPointTap={(idx) => {
              const el = document.getElementById(`tl-${idx}`)
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                el.style.background = `${c.accent}15`
                setTimeout(() => { el.style.background = '' }, 2000)
              }
            }}
          />
        )}

        {/* Forecast Summary */}
        {forecastOutcome && (
          <div style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center' }}>
              Forecast Summary<InfoTip id="outcome" text="Summary of money coming in and going out during the forecast period." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} />
            </div>
            {forecastOutcome.income > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                <span style={{ font: `600 13px ${F}`, color: c.ink, display: 'flex', alignItems: 'center' }}>{waitingForIncome ? 'Expected Income' : 'Income'}<InfoTip id="income" text="Expected income during the forecast period." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></span>
                <span style={{ font: `700 14px ${F}`, color: c.good }}>{fmt(forecastOutcome.income)}</span>
              </div>
            )}
            {forecastOutcome.debt > 0 && (
              <>
                <div
                  onClick={() => { setDebtExpanded(!debtExpanded); if (debtExpanded) setDebtDetailExpanded(false) }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ font: `600 13px ${F}`, color: c.ink }}>Expenses<InfoTip id="debt" text="Bills and repayments you owe — credit cards, borrowings, and chit dues." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: debtExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                  <span style={{ font: `700 14px ${F}`, color: c.bad }}>{fmt(forecastOutcome.debt)}</span>
                </div>
                {debtExpanded && (
                  <div style={{ padding: '2px 0 4px 14px' }}>
                    {forecastOutcome.cardTotal > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                        <span style={{ font: `600 12px ${F}`, color: c.ink }}>Credit Card Bills</span>
                        <span style={{ font: `700 12px ${F}`, color: c.ink }}>{fmt(forecastOutcome.cardTotal)}</span>
                      </div>
                    )}
                    {forecastOutcome.borrowingTotal > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                        <span style={{ font: `600 12px ${F}`, color: c.ink }}>Borrowing Repayments</span>
                        <span style={{ font: `700 12px ${F}`, color: c.ink }}>{fmt(forecastOutcome.borrowingTotal)}</span>
                      </div>
                    )}
                    {forecastOutcome.prizedChitTotal > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                        <span style={{ font: `600 12px ${F}`, color: c.ink }}>Prized Chit Dues</span>
                        <span style={{ font: `700 12px ${F}`, color: c.ink }}>{fmt(forecastOutcome.prizedChitTotal)}</span>
                      </div>
                    )}
                    <div
                      onClick={(e) => { e.stopPropagation(); setDebtDetailExpanded(!debtDetailExpanded) }}
                      style={{ font: `600 11px ${F}`, color: c.accent, padding: '6px 0 2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {debtDetailExpanded ? 'Hide details' : 'Show details'}
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: debtDetailExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                    {debtDetailExpanded && (
                      <div style={{ padding: '4px 0 2px 10px' }}>
                        {forecastOutcome.cardItems.map((item, i) => (
                          <div key={`c${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                            <span style={{ font: `500 11px ${F}`, color: c.muted }}>{item.title}</span>
                            <span style={{ font: `600 11px ${F}`, color: c.muted }}>{fmt(item.amount)}</span>
                          </div>
                        ))}
                        {forecastOutcome.borrowingItems.map((item, i) => (
                          <div key={`b${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                            <span style={{ font: `500 11px ${F}`, color: c.muted }}>{item.title}</span>
                            <span style={{ font: `600 11px ${F}`, color: c.muted }}>{fmt(item.amount)}</span>
                          </div>
                        ))}
                        {forecastOutcome.prizedChitItems.map((item, i) => (
                          <div key={`p${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                            <span style={{ font: `500 11px ${F}`, color: c.muted }}>{item.title}</span>
                            <span style={{ font: `600 11px ${F}`, color: c.muted }}>{fmt(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {forecastOutcome.commitmentTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                <span style={{ font: `600 13px ${F}`, color: c.ink }}>Bills & Commitments</span>
                <span style={{ font: `700 14px ${F}`, color: c.bad }}>{fmt(forecastOutcome.commitmentTotal)}</span>
              </div>
            )}
            {forecastOutcome.savingsTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                <span style={{ font: `600 13px ${F}`, color: c.ink }}>Savings Contributions</span>
                <span style={{ font: `700 14px ${F}`, color: '#8B5CF6' }}>{fmt(forecastOutcome.savingsTotal)}</span>
              </div>
            )}
            <div
              onClick={() => setPlannedExpanded(!plannedExpanded)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ font: `600 13px ${F}`, color: c.ink }}>Planned Expenses<InfoTip id="planned" text="Future spending you know about — things like repairs, school fees, trips." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: plannedExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              <span style={{ font: `700 14px ${F}`, color: forecastOutcome.plannedTotal > 0 ? c.warn : c.muted }}>{forecastOutcome.plannedTotal > 0 ? fmt(forecastOutcome.plannedTotal) : '—'}</span>
            </div>
            {plannedExpanded && (
              <div style={{ padding: '4px 0 8px 0' }}>
                {pendingPlanned.map(pe => {
                  const cat = pe.category_id ? state.categories.find(cc => cc.id === pe.category_id) : null
                  return (
                    <div key={pe.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${c.faint}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: `700 13px ${F}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pe.title}</div>
                        <div style={{ font: `600 11px ${F}`, color: c.muted, marginTop: 1 }}>
                          {shortDate(pe.planned_date)}{cat ? ` · ${cat.name}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ font: `700 13px ${F}`, color: c.ink }}>{fmt(pe.amount)}</span>
                        <button onClick={(e) => { e.stopPropagation(); startPeEdit(pe) }} style={{ width: 28, height: 28, borderRadius: 8, background: c.surface, border: `1px solid ${c.faint}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDeletePlannedExpense(pe.id) }} style={{ width: 28, height: 28, borderRadius: 8, background: c.surface, border: `1px solid ${c.faint}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* Add/Edit form */}
                {peAdding ? (
                  <div style={{ background: c.surface, borderRadius: 14, padding: '14px', marginTop: 10, border: `1px solid ${c.faint}` }}>
                    <div style={{ font: `700 13px ${F}`, color: c.ink, marginBottom: 10 }}>{peEditId ? 'Edit Expense' : 'Add Planned Expense'}</div>
                    <input value={peTitle} onChange={e => setPeTitle(e.target.value)} placeholder="Title (e.g. Bike Tyre)" style={{ width: '100%', boxSizing: 'border-box', background: c.bg, border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '10px 12px', font: `700 14px ${F}`, color: c.ink, outline: 'none', marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input
                        ref={peAmountRef}
                        value={peAmount}
                        onChange={e => setPeAmount(e.target.value.replace(/[^0-9.+\-*x×X/÷\s]/g, ''))}
                        onFocus={() => setPeAmountFocused(true)}
                        onBlur={e => {
                          setPeAmountFocused(false)
                          const r = evaluateAmountExpression(e.target.value)
                          if (r !== null) setPeAmount(String(round2(r)))
                        }}
                        onKeyDown={e => {
                          if (e.key !== 'Enter') return
                          const r = evaluateAmountExpression(e.currentTarget.value)
                          if (r !== null) setPeAmount(String(round2(r)))
                        }}
                        inputMode="decimal" placeholder="Amount" style={{ flex: 1, boxSizing: 'border-box', background: c.bg, border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '10px 12px', font: `700 14px ${F}`, color: c.ink, outline: 'none' }} />
                      <input type="date" value={peDate} onChange={e => setPeDate(e.target.value)} style={{ flex: 1, boxSizing: 'border-box', background: c.bg, border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '10px 12px', font: `700 14px ${F}`, color: c.ink, outline: 'none' }} />
                    </div>
                    {peAmountFocused && <div style={{ marginBottom: 8 }}><AmountOperatorRow inputRef={peAmountRef} onChange={setPeAmount} /></div>}
                    <div style={{ marginBottom: 8 }}>
                      <CategorySelect value={peCategoryId} onChange={setPeCategoryId} state={state} onAddCategory={onAddCategory} excludeGroups={['Income', 'Transfer', 'Borrowings', 'Adjustments']} />
                    </div>

                    {/* Impact preview */}
                    {peImpact && (
                      <div style={{ background: c.bg, borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                        <div style={{ font: `700 10px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center' }}>Forecast Impact<InfoTip id="peimpact" text="Shows how adding this expense will change your lowest forecasted balance. Helps you decide before committing." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ font: `600 12px ${F}`, color: c.muted }}>Lowest Balance</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ font: `700 12px ${F}`, color: c.muted }}>{fmt(peImpact.lowestBefore)}</span>
                            <span style={{ font: `600 11px ${F}`, color: c.muted }}>→</span>
                            <span style={{ font: `700 12px ${F}`, color: peImpact.lowestAfter < 0 ? c.bad : peImpact.lowestAfter < 5000 ? c.warn : c.good }}>{fmt(peImpact.lowestAfter)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={savePe} disabled={peSaving || !peTitle.trim() || !(evaluateAmountExpression(peAmount) ?? 0) || !peDate || !peCategoryId} style={{ flex: 1, background: c.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', font: `700 13px ${F}`, cursor: 'pointer', opacity: (peSaving || !peTitle.trim() || !(evaluateAmountExpression(peAmount) ?? 0) || !peDate || !peCategoryId) ? 0.5 : 1 }}>{peSaving ? 'Saving…' : peEditId ? 'Update' : 'Add'}</button>
                      <button onClick={resetPeForm} style={{ flex: 1, background: c.surface, color: c.ink, border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '11px', font: `700 13px ${F}`, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setPeAdding(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'none', border: `1.5px dashed ${c.faint}`, borderRadius: 12, padding: '11px', cursor: 'pointer', marginTop: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    <span style={{ font: `700 13px ${F}`, color: c.accent }}>Add Planned Expense</span>
                  </button>
                )}
              </div>
            )}
            {forecastOutcome.lifestyleTotal > 0 && (
              <>
                <div
                  onClick={() => setLifestyleExpanded(!lifestyleExpanded)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ font: `600 13px ${F}`, color: c.ink }}>Estimated Daily Spending<InfoTip id="lifestyle" text="Estimated everyday spending based on your budget strategy or recent spending history." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: lifestyleExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                  <span style={{ font: `700 14px ${F}`, color: c.warn }}>{fmt(forecastOutcome.lifestyleTotal)}</span>
                </div>
                <div style={{ font: `500 11px ${F}`, color: c.muted, marginTop: -2, marginBottom: 2 }}>~{fmt(forecastOutcome.lifestyleDaily)}/day x {forecastOutcome.lifestyleDays} days · {waitingForIncome && lifestyleForecast?.dailySpend.source === 'historical' ? `recent spending (waiting for ${incLabel})` : lifestyleForecast?.dailySpend.source === 'hybrid' ? 'hybrid forecast' : lifestyleForecast?.dailySpend.source === 'historical' ? `from last ${lifestyleForecast?.dailySpend.days ?? 30} days` : 'from budget strategy'}</div>
                {lifestyleExpanded && lifestyleDetail && lifestyleDetail.type === 'budget_strategy' && (
                  <div style={{ padding: '6px 0 4px' }}>
                    <div style={{ font: `700 10px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
                      How this is calculated · {lifestyleDetail.strategy}
                    </div>
                    {[
                      { label: 'Needs', target: lifestyleDetail.needsTarget, spent: lifestyleDetail.needsSpent, remaining: lifestyleDetail.needsRemaining, daily: lifestyleDetail.needsDaily },
                      { label: 'Wants', target: lifestyleDetail.wantsTarget, spent: lifestyleDetail.wantsSpent, remaining: lifestyleDetail.wantsRemaining, daily: lifestyleDetail.wantsDaily },
                    ].map(row => (
                      <div key={row.label} style={{ marginBottom: 10, padding: '8px 10px', background: c.bg, borderRadius: 10 }}>
                        <div style={{ font: `700 12px ${F}`, color: c.ink, marginBottom: 6 }}>{row.label}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span style={{ font: `500 11px ${F}`, color: c.muted }}>Budget</span>
                          <span style={{ font: `600 11px ${F}`, color: c.ink }}>{fmt(row.target)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span style={{ font: `500 11px ${F}`, color: c.muted }}>Spent so far</span>
                          <span style={{ font: `600 11px ${F}`, color: c.bad }}>-{fmt(row.spent)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0 0', borderTop: `1px solid ${c.faint}`, marginTop: 3 }}>
                          <span style={{ font: `600 11px ${F}`, color: c.ink }}>Remaining</span>
                          <span style={{ font: `700 11px ${F}`, color: c.ink }}>{fmt(row.remaining)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span style={{ font: `500 11px ${F}`, color: c.muted }}>÷ {lifestyleDetail.daysRemaining} days left</span>
                          <span style={{ font: `700 11px ${F}`, color: c.warn }}>{fmt(row.daily)}/day</span>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0 2px', borderTop: `1px solid ${c.faint}` }}>
                      <span style={{ font: `700 11px ${F}`, color: c.ink }}>Total daily estimate</span>
                      <span style={{ font: `700 12px ${F}`, color: c.warn }}>{fmt(lifestyleDetail.needsDaily + lifestyleDetail.wantsDaily)}/day</span>
                    </div>
                  </div>
                )}
                {lifestyleExpanded && lifestyleDetail && lifestyleDetail.type === 'historical' && (
                  <div style={{ padding: '6px 0 4px', maxHeight: 320, overflowY: 'auto' }}>
                    <div style={{ font: `700 10px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
                      Behavioural Spending · Last {lifestyleForecast?.dailySpend.days ?? 30} days ({lifestyleDetail.txns.length})
                    </div>
                    {lifestyleDetail.txns.length === 0 && (
                      <div style={{ font: `600 12px ${F}`, color: c.muted, fontStyle: 'italic', padding: '4px 0' }}>No matching transactions</div>
                    )}
                    {lifestyleDetail.txns.map((t, i) => {
                      const cat = t.category_id ? state.categories.find(cc => cc.id === t.category_id) : null
                      return (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i < lifestyleDetail.txns.length - 1 ? `1px solid ${c.faint}` : 'none' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ font: `600 12px ${F}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || cat?.name || 'Expense'}</div>
                            <div style={{ font: `500 10px ${F}`, color: c.muted }}>{new Date(t.transaction_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{cat ? ` · ${cat.name}` : ''}</div>
                          </div>
                          <span style={{ font: `700 12px ${F}`, color: c.ink, flexShrink: 0, marginLeft: 8 }}>{fmt(t.amount)}</span>
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 2px', marginTop: 4, borderTop: `1px solid ${c.faint}` }}>
                      <span style={{ font: `700 11px ${F}`, color: c.muted }}>Total ÷ {lifestyleDetail.histDays} days</span>
                      <span style={{ font: `700 12px ${F}`, color: c.ink }}>{fmt(lifestyleDetail.txns.reduce((s, t) => s + t.amount, 0))} → {fmt(Math.round(lifestyleDetail.txns.reduce((s, t) => s + t.amount, 0) / lifestyleDetail.histDays))}/day</span>
                    </div>
                  </div>
                )}
              </>
            )}
            {forecastOutcome.income > 0 && (forecastOutcome.debt > 0 || forecastOutcome.commitmentTotal > 0 || forecastOutcome.savingsTotal > 0 || forecastOutcome.plannedTotal > 0 || forecastOutcome.lifestyleTotal > 0) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 2px', marginTop: 4, borderTop: `1px dashed ${c.faint}` }}>
                <span style={{ font: `700 13px ${F}`, color: c.ink, display: 'flex', alignItems: 'center' }}>{waitingForIncome ? 'Projected Ending Balance' : 'Remaining Balance'}<InfoTip id="potavail" text="What remains after all expected income, bills, and spending. This is your projected surplus or shortfall." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></span>
                <span style={{ font: `800 14px ${F}`, color: forecastOutcome.available >= 0 ? c.good : c.bad }}>{fmt(forecastOutcome.available)}</span>
              </div>
            )}
          </div>
        )}

        {/* Budget Progress */}
        {strategyData && (
          <div style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>Budget Progress</div>
            {([
              { label: 'Needs', spent: strategyData.actuals.needs, target: strategyData.targets.needs, color: '#3B82F6' },
              { label: 'Wants', spent: strategyData.actuals.wants, target: strategyData.targets.wants, color: '#F97316' },
              { label: 'Savings', spent: strategyData.actuals.savings, target: strategyData.targets.savings, color: c.accent },
            ] as const).map(row => {
              const remaining = Math.max(0, row.target - row.spent)
              const exhausted = row.spent >= row.target
              const pct = row.target > 0 ? Math.min(100, Math.round(row.spent / row.target * 100)) : 0
              return (
                <div key={row.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                    <span style={{ font: `700 13px ${F}`, color: c.ink }}>{row.label}</span>
                    <span style={{ font: `700 13px ${F}`, color: exhausted ? c.warn : c.ink }}>{exhausted ? 'Budget exhausted' : `${fmt(remaining)} remaining`}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: c.faint, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: exhausted ? c.warn : row.color, width: `${Math.min(100, pct)}%`, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                    <span style={{ font: `500 10px ${F}`, color: c.muted }}>Spent {fmt(row.spent)}</span>
                    <span style={{ font: `500 10px ${F}`, color: c.muted }}>Target {fmt(row.target)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Upcoming Payments */}
        {(() => {
          const upcoming = projections
            .filter(p => p.event.type === 'expense' && (p.event.source === 'commitment' || p.event.source === 'card' || (p.event.source === 'saving' && !p.event.is_prized) || p.event.source === 'planned'))
            .sort((a, b) => a.event.date !== b.event.date ? (a.event.date < b.event.date ? -1 : 1) : b.event.amount - a.event.amount)
            .slice(0, 6)
          if (upcoming.length === 0) return null
          const badge = (src: string) => {
            if (src === 'card') return { label: 'Credit Card', color: '#EF4444' }
            if (src === 'saving') return { label: 'Savings', color: '#8B5CF6' }
            if (src === 'planned') return { label: 'Planned', color: '#F97316' }
            return { label: 'Bill', color: '#3B82F6' }
          }
          return (
            <div style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: 14 }}>
              <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>Upcoming Payments</div>
              {upcoming.map((p, i) => {
                const b = badge(p.event.source)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < upcoming.length - 1 ? `1px solid ${c.faint}` : 'none' }}>
                    <div style={{ width: 6, height: 6, borderRadius: 999, background: b.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ font: `700 13px ${F}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eventTitle(p.event.title, p.event.source, waitingForIncome)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                        <span style={{ font: `600 9px ${F}`, color: b.color, background: `${b.color}15`, padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{b.label}</span>
                        <span style={{ font: `500 10px ${F}`, color: c.muted }}>{shortDate(p.event.date)}</span>
                      </div>
                    </div>
                    <span style={{ font: `800 14px ${F}`, color: c.ink, flexShrink: 0 }}>{fmt(p.event.amount)}</span>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* What's Causing This? */}
        {drivers.length > 0 && (
          <div style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: 24 }}>
            <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center' }}>What's Causing This?<InfoTip id="drivers" text="The largest upcoming expenses in your forecast. These have the biggest impact on your cash flow." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></div>
            {drivers.map((dr, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < drivers.length - 1 ? `1px solid ${c.faint}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 999, background: i === 0 ? c.bad : i === 1 ? c.warn : c.muted, flexShrink: 0 }} />
                  <span style={{ font: `700 14px ${F}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dr.title}</span>
                </div>
                <span style={{ font: `800 14px ${F}`, color: c.ink, whiteSpace: 'nowrap', marginLeft: 12 }}>{fmt(dr.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ width: 34, height: 34, borderRadius: 999, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: 9, height: 9, borderRadius: 999, background: c.accent }} />
          </div>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ font: `800 14px ${F}`, color: c.ink }}>Today</span>
            <span style={{ font: `800 16px ${F}`, color: c.ink }}>{fmt(currentBalance)}</span>
          </div>
        </div>

        {/* Timeline context when waiting for income */}
        {waitingForIncome && projections.length > 0 && (
          <div style={{ margin: '10px 0 4px 46px', padding: '8px 12px', background: `${c.warn}08`, borderRadius: 10 }}>
            <div style={{ font: `500 11px ${F}`, color: c.muted, lineHeight: 1.5 }}>
              Your {incLabel} is overdue and has not been recorded. The timeline below shows your next scheduled {incLabel} based on your configured {incLabel} schedule.
            </div>
          </div>
        )}

        {projections.length === 0 ? (
          <div style={{ margin: '20px 0 0 46px' }}>
            <div style={{ font: `700 13px ${F}`, color: c.ink, marginBottom: 4 }}>You're all caught up</div>
            <div style={{ font: `600 12px ${F}`, color: c.muted, lineHeight: 1.5 }}>No bills, savings or income events in the next {days} days. Add commitments or savings to see them here.</div>
          </div>
        ) : (
          (() => {
            const isSynthetic = (p: typeof projections[0]) => p.event.title === 'Est. Daily Spending'

            if (mode === 'lifestyle') {
              type TimelineItem = { type: 'event'; idx: number } | { type: 'group'; startIdx: number; endIdx: number; totalAmount: number; days: number; balanceAfter: number; dateRange: string }
              const timeline: TimelineItem[] = []
              let i = 0
              while (i < projections.length) {
                if (isSynthetic(projections[i])) {
                  const start = i
                  let total = 0
                  while (i < projections.length && isSynthetic(projections[i])) {
                    total += projections[i].event.amount
                    i++
                  }
                  const count = i - start
                  const endP = projections[i - 1]
                  const startDate = projections[start].event.date
                  const endDate = endP.event.date
                  const dr = count <= 3 ? `${shortDate(startDate)}${count > 1 ? ` – ${shortDate(endDate)}` : ''}` : `${shortDate(startDate)} – ${shortDate(endDate)}`
                  timeline.push({ type: 'group', startIdx: start, endIdx: i - 1, totalAmount: total, days: count, balanceAfter: endP.balanceAfter, dateRange: dr })
                } else {
                  timeline.push({ type: 'event', idx: i })
                  i++
                }
              }

              return timeline.map((item, ti) => {
                if (item.type === 'group') {
                  const balColor2 = item.balanceAfter < 0 ? c.bad : c.muted
                  return (
                    <div key={`g${ti}`}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 8, opacity: 0.7 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 999, background: `${c.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px dashed ${c.accent}40` }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20" /><circle cx="12" cy="12" r="10" strokeDasharray="4 4" /></svg>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ font: `600 13px ${F}`, color: c.muted }}>Estimated Spending · {item.days} day{item.days === 1 ? '' : 's'}</span>
                            <span style={{ font: `700 13px ${F}`, color: c.muted, whiteSpace: 'nowrap' }}>−{fmt(item.totalAmount)}</span>
                          </div>
                          <div style={{ font: `500 10px ${F}`, color: c.muted, marginTop: 1 }}>{item.dateRange} · projection</div>
                          <div style={{ marginTop: 6, padding: '5px 10px', borderRadius: 8, background: c.surface2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ font: `500 10px ${F}`, color: c.muted, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Balance</span>
                            <span style={{ font: `700 12px ${F}`, color: balColor2 }}>{fmt(item.balanceAfter)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }

                const p = projections[item.idx]
                const income = p.event.type === 'income'
                const evColor = eventColor(p.event.source, c.muted)
                const isLowest = !!lowestBalanceDate && p.event.date === lowestBalanceDate && p.balanceAfter === lowestBalance
                const isRecovery = !!recoveryDate && p.event.date === recoveryDate && p.balanceAfter === recoveryBalance
                const balColor = isLowest ? toneColor : isRecovery ? c.good : p.balanceAfter < 0 ? c.bad : c.ink
                const balBg = isLowest ? toneSoft : isRecovery ? c.goodSoft : c.surface2
                return (
                  <div key={`e${ti}`} id={`tl-${item.idx}`}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 8 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 999, background: `${evColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={evColor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          {income ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></> : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>}
                        </svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ font: `700 14px ${F}`, color: c.ink }}>{eventTitle(p.event.title, p.event.source, waitingForIncome)}</span>
                          <span style={{ font: `800 15px ${F}`, color: income ? c.good : c.ink, whiteSpace: 'nowrap' }}>
                            {income ? '+' : '−'}{fmt(p.event.amount)}
                          </span>
                        </div>
                        <div style={{ font: `600 11px ${F}`, color: c.muted, marginTop: 1 }}>{shortDate(p.event.date)} · {p.event.source}</div>
                        <div style={{ marginTop: 8, padding: '7px 11px', borderRadius: 9, background: balBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ font: `600 11px ${F}`, color: isLowest ? toneColor : isRecovery ? c.good : c.muted, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                            {isLowest ? 'Lowest' : isRecovery ? 'Recovery' : 'Balance'}
                          </span>
                          <span style={{ font: `800 14px ${F}`, color: balColor }}>{fmt(p.balanceAfter)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            }

            return projections.map((p, i) => {
              const income = p.event.type === 'income'
              const evColor = eventColor(p.event.source, c.muted)
              const isLowest = !!lowestBalanceDate && p.event.date === lowestBalanceDate && p.balanceAfter === lowestBalance
              const isRecovery = !!recoveryDate && p.event.date === recoveryDate && p.balanceAfter === recoveryBalance
              const balColor = isLowest ? toneColor : isRecovery ? c.good : p.balanceAfter < 0 ? c.bad : c.ink
              const balBg = isLowest ? toneSoft : isRecovery ? c.goodSoft : c.surface2
              return (
                <div key={i} id={`tl-${i}`}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 8 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 999, background: `${evColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={evColor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        {income ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></> : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>}
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ font: `700 14px ${F}`, color: c.ink }}>{eventTitle(p.event.title, p.event.source, waitingForIncome)}</span>
                        <span style={{ font: `800 15px ${F}`, color: income ? c.good : c.ink, whiteSpace: 'nowrap' }}>
                          {income ? '+' : '−'}{fmt(p.event.amount)}
                        </span>
                      </div>
                      <div style={{ font: `600 11px ${F}`, color: c.muted, marginTop: 1 }}>{shortDate(p.event.date)} · {p.event.source}</div>
                      <div style={{ marginTop: 8, padding: '7px 11px', borderRadius: 9, background: balBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ font: `600 11px ${F}`, color: isLowest ? toneColor : isRecovery ? c.good : c.muted, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                          {isLowest ? 'Lowest' : isRecovery ? 'Recovery' : 'Balance'}
                        </span>
                        <span style={{ font: `800 14px ${F}`, color: balColor }}>{fmt(p.balanceAfter)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          })()
        )}

        {/* Forecast Confidence */}
        {mode === 'lifestyle' && lifestyleForecast?.dailySpend.confidence && (
          <details style={{ marginTop: 20, background: c.surface2, borderRadius: 14, overflow: 'hidden' }}>
            <summary style={{ padding: 16, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Forecast Confidence</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {['low', 'medium', 'high', 'very_high'].map((lvl, i) => {
                    const filled = ['low', 'medium', 'high', 'very_high'].indexOf(lifestyleForecast.dailySpend.confidence!) >= i
                    return <div key={lvl} style={{ width: 14, height: 4, borderRadius: 2, background: filled ? c.accent : `${c.muted}30` }} />
                  })}
                </div>
                <span style={{ font: `700 11px ${F}`, color: c.ink, textTransform: 'capitalize' }}>{lifestyleForecast.dailySpend.confidence.replace('_', ' ')}</span>
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </summary>
            <div style={{ padding: '0 16px 16px' }}>
              <div style={{ font: `600 10px ${F}`, color: c.muted, letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 6 }}>Based on:</div>
              {lifestyleForecast.dailySpend.days && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span style={{ font: `600 11px ${F}`, color: c.ink }}>{lifestyleForecast.dailySpend.days} days of spending history</span>
                </div>
              )}
              {lifestyleForecast.dailySpend.budgetAmount != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span style={{ font: `600 11px ${F}`, color: c.ink }}>Active budget strategy</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                <span style={{ font: `600 11px ${F}`, color: c.ink }}>Outlier protection (trimmed mean)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                <span style={{ font: `600 11px ${F}`, color: c.ink }}>Forecast smoothing</span>
              </div>
              {lifestyleForecast.dailySpend.source === 'hybrid' && lifestyleForecast.dailySpend.historyAmount != null && lifestyleForecast.dailySpend.budgetAmount != null && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: c.faint, borderRadius: 10 }}>
                  <div style={{ font: `700 10px ${F}`, color: c.muted, letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 6 }}>Why this forecast?</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ font: `500 11px ${F}`, color: c.muted }}>History average</span>
                    <span style={{ font: `600 11px ${F}`, color: c.ink }}>{fmt(lifestyleForecast.dailySpend.historyAmount)}/day</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ font: `500 11px ${F}`, color: c.muted }}>Budget recommendation</span>
                    <span style={{ font: `600 11px ${F}`, color: c.ink }}>{fmt(lifestyleForecast.dailySpend.budgetAmount)}/day</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0 0', borderTop: `1px solid ${c.faint}`, marginTop: 3 }}>
                    <span style={{ font: `600 11px ${F}`, color: c.ink }}>Hybrid forecast</span>
                    <span style={{ font: `700 11px ${F}`, color: c.accent }}>{fmt(lifestyleForecast.dailySpend.amount)}/day</span>
                  </div>
                </div>
              )}
            </div>
          </details>
        )}

        {/* About this Forecast */}
        <details style={{ marginTop: 14, background: c.surface2, borderRadius: 14, overflow: 'hidden' }}>
          <summary style={{ padding: 16, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>About this Forecast</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </summary>
          <div style={{ padding: '0 16px 16px' }}>
            {waitingForIncome && (
              <div style={{ background: `${c.warn}10`, border: `1px solid ${c.warn}20`, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                <div style={{ font: `600 12px ${F}`, color: c.warn, lineHeight: 1.5 }}>
                  You are currently waiting for your expected {incLabel}. This forecast projects your future cash flow assuming your expected {incLabel} arrives. The timeline shows future scheduled {incLabel} events only — your current overdue {incLabel} is not shown there. Your actual financial cycle will begin only after you record your {incLabel}.
                </div>
              </div>
            )}
            <div style={{ font: `700 10px ${F}`, color: c.muted, letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 8 }}>Includes</div>
            {[
              pattern === 'monthly' ? 'Salary (when confidently known)' : pattern === 'weekly' ? 'Weekly income' : 'Projected income (when configured)',
              'Commitments & bills',
              'Credit card bills due',
              'Savings plan contributions',
              'Borrowed money you owe',
              ...(mode === 'lifestyle' ? ['Estimated daily spending'] : []),
            ].map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                <span style={{ font: `600 12px ${F}`, color: c.ink }}>{t}</span>
              </div>
            ))}
            <div style={{ height: 1, background: c.faint, margin: '10px 0' }} />
            <div style={{ font: `700 10px ${F}`, color: c.muted, letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 8 }}>Not included</div>
            {(mode === 'lifestyle'
              ? ['Future unplanned expenses']
              : ['Daily / everyday spending', 'Future unplanned expenses']
            ).map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <div style={{ width: 5, height: 5, borderRadius: 999, background: c.muted, flexShrink: 0, marginLeft: 3, marginRight: 4 }} />
                <span style={{ font: `600 12px ${F}`, color: c.muted }}>{t}</span>
              </div>
            ))}
            {mode === 'lifestyle' && (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: `${c.warn}10`, border: `1px solid ${c.warn}20` }}>
                <div style={{ font: `600 10px ${F}`, color: c.warn, lineHeight: 1.5 }}>
                  Smart mode uses estimated spending — actual results may vary. Switch to Planned mode for known-events-only projections.
                </div>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>,
    document.body
  )
}
