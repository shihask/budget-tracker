import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, AlertTriangle } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { buildCashFlowForecast, daysUntil, getForecastDrivers } from '@/lib/cashflow'
import { forecastHealth, getHealthMessage } from '@/components/CashFlowForecastCard'
import { getIncomePattern } from '@/lib/income-pattern'
import { useStrategyData, getCategoryBucket } from './BudgetStrategyCard'
import { CategorySelect } from './CategorySelect'
import { simulatePurchase } from '@/lib/cashflow'
import { buildLifestyleForecast } from '@/features/forecast/lib/lifestyleForecast'
import type { AppState, BudgetBucket, DerivedMetrics, ForecastMode, ForecastSettings, PlannedExpense } from '@/types'

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
}

const F = 'Plus Jakarta Sans'
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

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

export function CashFlowForecastPage({ state, d, onClose, onSetup, onSwipeProgress, onAddPlannedExpense, onUpdatePlannedExpense, onDeletePlannedExpense, onAddCategory, onUpdateForecastSettings }: Props) {
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
    let plannedTotal = 0
    const cardItems: { title: string; amount: number }[] = []
    const borrowingItems: { title: string; amount: number }[] = []
    const prizedChitItems: { title: string; amount: number }[] = []
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
      } else if (ev.source === 'planned') {
        plannedTotal += ev.amount
        plannedItems.push({ title: ev.title, amount: ev.amount })
      }
    }

    const debt = cardTotal + borrowingTotal + prizedChitTotal
    if (income === 0 && debt === 0 && plannedTotal === 0) return null
    return { income, debt, plannedTotal, plannedItems, available: income - debt - plannedTotal, cardTotal, cardItems, borrowingTotal, borrowingItems, prizedChitTotal, prizedChitItems }
  }, [projections])

  const [budgetPeriod, setBudgetPeriod] = useState<'current' | 'next'>('current')

  const projectedBudget = useMemo(() => {
    if (!strategyData) return null
    const { actuals, targets, pcts } = strategyData

    const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const sd = state.settings.salary_date
    const now = new Date()

    let periodStart: string
    let periodEnd: string

    if (sd && sd >= 1 && sd <= 31) {
      const y = now.getFullYear(), m = now.getMonth(), day = now.getDate()
      if (budgetPeriod === 'current') {
        const s = day >= sd ? new Date(y, m, sd) : new Date(y, m - 1, sd)
        periodStart = toIso(s)
        periodEnd = toIso(day >= sd ? new Date(y, m + 1, sd) : new Date(y, m, sd))
      } else {
        const s = day >= sd ? new Date(y, m + 1, sd) : new Date(y, m, sd)
        periodStart = toIso(s)
        periodEnd = toIso(new Date(s.getFullYear(), s.getMonth() + 1, sd))
      }
    } else {
      if (budgetPeriod === 'current') {
        periodStart = toIso(new Date(now.getFullYear(), now.getMonth(), 1))
        periodEnd = toIso(new Date(now.getFullYear(), now.getMonth() + 1, 1))
      } else {
        const s = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        periodStart = toIso(s)
        periodEnd = toIso(new Date(s.getFullYear(), s.getMonth() + 1, 1))
      }
    }

    const isCurrent = budgetPeriod === 'current'
    const baseActuals = isCurrent ? actuals : { needs: 0, wants: 0, savings: 0 }
    const projected: Record<BudgetBucket, number> = { ...baseActuals }
    const forecastItems: Record<BudgetBucket, { title: string; amount: number }[]> = { needs: [], wants: [], savings: [] }
    const catMap = Object.fromEntries(state.categories.map(cc => [cc.id, cc]))
    let hasProjection = false

    for (const p of projections) {
      const ev = p.event
      if (ev.type !== 'expense') continue
      if (ev.source === 'card' || ev.source === 'borrowing') continue
      if (ev.source === 'saving' && ev.is_prized) continue
      if (ev.date < periodStart || ev.date >= periodEnd) continue

      let bucket: BudgetBucket | null = null
      if (ev.source === 'saving') {
        bucket = 'savings'
      } else if (ev.source === 'commitment' || ev.source === 'planned') {
        const cat = ev.category_id ? catMap[ev.category_id] : null
        bucket = cat ? getCategoryBucket(cat, state.groups) : (ev.source === 'commitment' ? 'needs' : null)
      }

      if (bucket) {
        projected[bucket] += ev.amount
        forecastItems[bucket].push({ title: ev.title, amount: ev.amount })
        hasProjection = true
      }
    }

    const hasBuckets = hasProjection || (isCurrent && (actuals.needs > 0 || actuals.wants > 0 || actuals.savings > 0))
    return {
      periodStart,
      periodEnd,
      isCurrent,
      buckets: hasBuckets ? [
        { label: 'Needs', pct: targets.needs > 0 ? Math.round(projected.needs / targets.needs * 100) : 0, color: '#3B82F6', spending: true, target: targets.needs, targetPct: pcts.needs, projected: projected.needs, currentSpend: baseActuals.needs, items: forecastItems.needs },
        { label: 'Wants', pct: targets.wants > 0 ? Math.round(projected.wants / targets.wants * 100) : 0, color: '#F97316', spending: true, target: targets.wants, targetPct: pcts.wants, projected: projected.wants, currentSpend: baseActuals.wants, items: forecastItems.wants },
        { label: 'Savings', pct: targets.savings > 0 ? Math.round(projected.savings / targets.savings * 100) : 0, color: c.accent, spending: false, target: targets.savings, targetPct: pcts.savings, projected: projected.savings, currentSpend: baseActuals.savings, items: forecastItems.savings },
      ] as const : null,
    }
  }, [strategyData, projections, state, c.accent, budgetPeriod])

  const [expandedBucket, setExpandedBucket] = useState<string | null>(null)
  const [debtExpanded, setDebtExpanded] = useState(false)
  const [debtDetailExpanded, setDebtDetailExpanded] = useState(false)
  const [plannedExpanded, setPlannedExpanded] = useState(false)
  const [openInfoId, setOpenInfoId] = useState<string | null>(null)
  const [peAdding, setPeAdding] = useState(false)
  const [peTitle, setPeTitle] = useState('')
  const [peAmount, setPeAmount] = useState('')
  const [peDate, setPeDate] = useState('')
  const [peCategoryId, setPeCategoryId] = useState('')
  const [peEditId, setPeEditId] = useState<string | null>(null)
  const [peSaving, setPeSaving] = useState(false)

  const pendingPlanned = useMemo(() => state.planned_expenses.filter(p => !p.is_completed), [state.planned_expenses])

  const resetPeForm = () => { setPeTitle(''); setPeAmount(''); setPeDate(''); setPeCategoryId(''); setPeEditId(null); setPeAdding(false) }

  const peImpact = useMemo(() => {
    const amt = parseFloat(peAmount)
    if (!peAdding || !(amt > 0)) return null
    const sim = simulatePurchase(state, d, amt)
    return { lowestBefore: forecast.lowestBalance, lowestAfter: sim.lowestBalance }
  }, [peAdding, peAmount, state, d, forecast])

  const savePe = async () => {
    const amt = parseFloat(peAmount)
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
            <div style={{ font: `600 12px ${F}`, color: c.muted, marginTop: 1 }}>Next {days} days · {mode === 'lifestyle' ? 'includes daily spending' : 'known events only'}</div>
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

        {/* Mode Toggle */}
        <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, marginBottom: 14 }}>
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
              {m === 'planned' ? 'Planned' : 'Lifestyle'}
              {m === 'lifestyle' && <span style={{ font: `600 9px ${F}`, color: c.accent, marginLeft: 4, verticalAlign: 'super' }}>BETA</span>}
            </button>
          ))}
        </div>

        {/* Lifestyle Summary Card */}
        {mode === 'lifestyle' && lifestyleForecast && lifestyleForecast.dailySpend.source && (
          <div style={{ background: `${c.accent}10`, border: `1.5px solid ${c.accent}30`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ font: `700 11px ${F}`, color: c.accent, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>Est. Daily Spend</div>
                <div style={{ font: `800 26px ${F}`, color: c.ink, letterSpacing: '-0.02em' }}>{fmt(lifestyleForecast.dailySpend.amount)}<span style={{ font: `600 13px ${F}`, color: c.muted }}>/day</span></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ font: `700 11px ${F}`, color: c.accent, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>Safe Until</div>
                <div style={{ font: `800 18px ${F}`, color: lifestyleForecast.risk === 'risk' ? c.bad : lifestyleForecast.risk === 'watch' ? c.warn : c.good }}>{lifestyleForecast.safeUntilLabel}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                background: lifestyleForecast.risk === 'risk' ? c.bad : lifestyleForecast.risk === 'watch' ? c.warn : c.good,
              }} />
              <span style={{
                font: `700 12px ${F}`,
                color: lifestyleForecast.risk === 'risk' ? c.bad : lifestyleForecast.risk === 'watch' ? c.warn : c.good,
              }}>
                {lifestyleForecast.risk === 'safe' ? 'Cash flow looks healthy' : lifestyleForecast.risk === 'watch' ? 'Getting tight — watch spending' : 'May run short — reduce spending'}
              </span>
            </div>
            {lifestyleForecast.dailySpend.breakdown && (
              <div style={{ display: 'flex', gap: 12, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.accent}20` }}>
                <div style={{ font: `600 11px ${F}`, color: c.muted }}>Needs <span style={{ font: `700 11px ${F}`, color: c.ink }}>{fmt(lifestyleForecast.dailySpend.breakdown.needs)}</span></div>
                <div style={{ font: `600 11px ${F}`, color: c.muted }}>Wants <span style={{ font: `700 11px ${F}`, color: c.ink }}>{fmt(lifestyleForecast.dailySpend.breakdown.wants)}</span></div>
              </div>
            )}
            <div style={{ font: `600 10px ${F}`, color: c.muted, marginTop: 8 }}>
              Based on: {lifestyleForecast.dailySpend.source === 'budget_strategy' ? 'Budget Strategy' : 'Last 30 Days'}
            </div>
          </div>
        )}

        {mode === 'lifestyle' && lifestyleForecast && !lifestyleForecast.dailySpend.source && (
          <div style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <div style={{ font: `700 13px ${F}`, color: c.ink, marginBottom: 4 }}>Lifestyle Forecast needs data</div>
            <div style={{ font: `600 12px ${F}`, color: c.muted, lineHeight: 1.5 }}>Set up a Budget Strategy or record at least a few days of spending to enable lifestyle projections.</div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <button onClick={onSetup} style={{ flex: 1, background: c.surface2, color: c.ink, border: 'none', borderRadius: 12, padding: '11px', font: `700 13px ${F}`, cursor: 'pointer' }}>Edit Forecast</button>
        </div>

        {/* Status / lowest + warning causes */}
        <div style={{ background: toneSoft, borderRadius: 16, padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ font: `700 12px ${F}`, color: toneColor, display: 'flex', alignItems: 'center' }}>Lowest Balance<InfoTip id="lowest" text="The minimum your balance will reach after all known upcoming events. If negative, you may run short before next income." openId={openInfoId} setOpenId={setOpenInfoId} color={toneColor} /></span>
            <span style={{ font: `800 20px ${F}`, color: toneColor }}>{fmt(lowestBalance)}</span>
          </div>
          <div style={{ marginTop: 6, font: `700 13px ${F}`, color: toneColor }}>
            {message}{lowestBalanceDate && health !== 'healthy' ? ` · around ${shortDate(lowestBalanceDate)}` : ''}
          </div>
          {salaryDays != null && (pattern === 'monthly' || pattern === 'weekly') && (
            <div style={{ marginTop: 4, font: `600 13px ${F}`, color: c.muted }}>
              {pattern === 'monthly' ? 'Next salary' : 'Next income'} in {salaryDays === 0 ? 'today' : `${salaryDays} day${salaryDays === 1 ? '' : 's'}`}
            </div>
          )}
          {health !== 'healthy' && topCauses.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${toneColor}22` }}>
              <div style={{ font: `700 11px ${F}`, color: toneColor, letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 6 }}>Main causes</div>
              {topCauses.map((dr, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 5, height: 5, borderRadius: 999, background: toneColor, flexShrink: 0 }} />
                  <span style={{ flex: 1, font: `600 13px ${F}`, color: toneColor }}>{dr.title}</span>
                  <span style={{ font: `700 13px ${F}`, color: toneColor }}>{fmt(dr.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {recoveryDate && recoveryBalance != null && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.faint}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ font: `700 12px ${F}`, color: c.ink, display: 'flex', alignItems: 'center' }}>Recovery Date<InfoTip id="recovery" text="The date your balance returns to positive after going negative. Usually after income credit." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></span>
                <span style={{ font: `800 14px ${F}`, color: c.good }}>{shortDate(recoveryDate)}</span>
              </div>
              <div style={{ font: `600 12px ${F}`, color: c.muted, marginTop: 2 }}>After Income Credit · Balance {fmt(recoveryBalance)}</div>
            </div>
          )}
          {health === 'healthy' && projections.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${toneColor}22`, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              <span style={{ font: `700 12px ${F}`, color: c.good }}>Cash Flow Remains Positive</span>
            </div>
          )}
        </div>

        {/* Forecast Outcome */}
        {forecastOutcome && (
          <div style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: (projectedBudget?.buckets || strategyData) ? 0 : 24 }}>
            <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center' }}>
              Forecast Outcome<InfoTip id="outcome" text="Summary of money coming in and going out during the forecast period. Shows income, debt payments, planned expenses, and what remains." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} />
            </div>
            {forecastOutcome.income > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                <span style={{ font: `600 13px ${F}`, color: c.ink, display: 'flex', alignItems: 'center' }}>Income Received<InfoTip id="income" text="Expected income based on your history or settings." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></span>
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
                    <span style={{ font: `600 13px ${F}`, color: c.ink }}>Debt & Liability Payments<InfoTip id="debt" text="Credit card bills, borrowing repayments, and prized chit dues. These are obligations that must be paid." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></span>
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
            <div
              onClick={() => setPlannedExpanded(!plannedExpanded)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ font: `600 13px ${F}`, color: c.ink }}>Planned Expenses<InfoTip id="planned" text="One-time future spending you know about — bike repairs, school fees, vacations. Tap to manage." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></span>
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
                      <input value={peAmount} onChange={e => setPeAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Amount" style={{ flex: 1, boxSizing: 'border-box', background: c.bg, border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '10px 12px', font: `700 14px ${F}`, color: c.ink, outline: 'none' }} />
                      <input type="date" value={peDate} onChange={e => setPeDate(e.target.value)} style={{ flex: 1, boxSizing: 'border-box', background: c.bg, border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '10px 12px', font: `700 14px ${F}`, color: c.ink, outline: 'none' }} />
                    </div>
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
                      <button onClick={savePe} disabled={peSaving || !peTitle.trim() || !parseFloat(peAmount) || !peDate || !peCategoryId} style={{ flex: 1, background: c.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', font: `700 13px ${F}`, cursor: 'pointer', opacity: (peSaving || !peTitle.trim() || !parseFloat(peAmount) || !peDate || !peCategoryId) ? 0.5 : 1 }}>{peSaving ? 'Saving…' : peEditId ? 'Update' : 'Add'}</button>
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
            {forecastOutcome.income > 0 && (forecastOutcome.debt > 0 || forecastOutcome.plannedTotal > 0) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 2px', marginTop: 4, borderTop: `1px dashed ${c.faint}` }}>
                <span style={{ font: `700 13px ${F}`, color: c.ink, display: 'flex', alignItems: 'center' }}>Potential Available<InfoTip id="potavail" text="Income minus all debt payments and planned expenses. This is what remains for daily spending, savings, and unplanned needs." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></span>
                <span style={{ font: `800 14px ${F}`, color: forecastOutcome.available >= 0 ? c.good : c.bad }}>{fmt(forecastOutcome.available)}</span>
              </div>
            )}
          </div>
        )}

        {/* Projected Budget Completion */}
        {(projectedBudget?.buckets || strategyData) && (
          <div style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: 24, marginTop: forecastOutcome ? 2 : 0, borderTop: forecastOutcome ? `1px solid ${c.faint}` : 'none', borderTopLeftRadius: forecastOutcome ? 0 : 16, borderTopRightRadius: forecastOutcome ? 0 : 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>
                Projected Budget Completion<InfoTip id="budgetproj" text="Shows how known upcoming items (commitments, savings plans, planned expenses) align with your budget strategy targets. Only forecast items — not past spending." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} />
              </div>
              <div style={{ display: 'flex', background: c.faint, borderRadius: 8, padding: 2 }}>
                {(['current', 'next'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setBudgetPeriod(p)}
                    style={{
                      font: `700 10px ${F}`, border: 'none', cursor: 'pointer',
                      padding: '4px 10px', borderRadius: 6,
                      background: budgetPeriod === p ? c.surface : 'transparent',
                      color: budgetPeriod === p ? c.ink : c.muted,
                      boxShadow: budgetPeriod === p ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {p === 'current' ? 'This Cycle' : 'Next Cycle'}
                  </button>
                ))}
              </div>
            </div>
            {projectedBudget && (
              <div style={{ font: `600 11px ${F}`, color: c.muted, marginBottom: 6 }}>
                {shortDate(projectedBudget.periodStart)} — {shortDate(projectedBudget.periodEnd)}
              </div>
            )}
            {!projectedBudget?.buckets && (
              <div style={{ font: `600 12px ${F}`, color: c.muted, padding: '8px 0', fontStyle: 'italic' }}>No known items for this cycle</div>
            )}
            {projectedBudget?.buckets?.map(({ label, pct, color, spending, target, targetPct, projected, currentSpend, items }) => {
              const ok = spending ? pct <= 100 : pct >= 100
              const expanded = expandedBucket === label
              const diff = Math.abs(projected - target)
              const status = spending
                ? (pct <= 100 ? 'On Track' : `Over by ${fmt(diff)}`)
                : (pct >= 100 ? 'On Track' : `Behind Target by ${fmt(diff)}`)
              return (
                <div key={label}>
                  <div
                    onClick={() => setExpandedBucket(expanded ? null : label)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 2px', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
                      <span style={{ font: `700 14px ${F}`, color: c.ink }}>{label} <span style={{ font: `600 11px ${F}`, color: c.muted }}>({targetPct}%)</span></span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ font: `800 15px ${F}`, color: ok ? c.good : c.warn }}>{pct}%</span>
                      <span style={{ color: ok ? c.good : c.warn, display: 'flex', alignItems: 'center' }}>{ok ? <Check size={14} /> : <AlertTriangle size={14} />}</span>
                    </div>
                  </div>
                  {!expanded && (
                    <div style={{ padding: '0 0 8px 18px', font: `600 11px ${F}`, color: ok ? c.good : c.warn, borderBottom: label !== 'Savings' ? `1px solid ${c.faint}` : 'none' }}>
                      {ok ? <Check size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> : <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />} {status}
                    </div>
                  )}
                  {expanded && (() => {
                    const itemTotal = items.reduce((s, it) => s + it.amount, 0)
                    const showCurrentSpend = projectedBudget!.isCurrent && currentSpend > 0
                    return (
                      <div style={{ padding: '4px 0 10px 18px', borderBottom: label !== 'Savings' ? `1px solid ${c.faint}` : 'none' }}>
                        {showCurrentSpend && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                            <span style={{ font: `600 12px ${F}`, color: c.muted }}>{spending ? 'Spent so far' : 'Saved so far'}</span>
                            <span style={{ font: `700 12px ${F}`, color: c.ink }}>{fmt(currentSpend)}</span>
                          </div>
                        )}
                        {items.map((item, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                            <span style={{ font: `600 12px ${F}`, color: c.ink }}>+ {item.title}</span>
                            <span style={{ font: `700 12px ${F}`, color: c.ink }}>{fmt(item.amount)}</span>
                          </div>
                        ))}
                        {!showCurrentSpend && items.length === 0 && (
                          <div style={{ font: `600 12px ${F}`, color: c.muted, padding: '5px 0', fontStyle: 'italic' }}>Nothing planned in this period</div>
                        )}
                        {(showCurrentSpend || items.length > 1) && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0 0', marginTop: 4, borderTop: `1px solid ${c.faint}` }}>
                            <span style={{ font: `700 12px ${F}`, color: c.ink }}>Projected</span>
                            <span style={{ font: `700 12px ${F}`, color: c.ink }}>{fmt(projected)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0 0', marginTop: (!showCurrentSpend && items.length <= 1) ? 4 : 0, borderTop: (!showCurrentSpend && items.length <= 1) ? `1px solid ${c.faint}` : 'none' }}>
                          <span style={{ font: `600 12px ${F}`, color: c.muted }}>Target</span>
                          <span style={{ font: `700 12px ${F}`, color: c.muted }}>{fmt(target)}</span>
                        </div>
                        {diff > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0 0' }}>
                            <span style={{ font: `700 12px ${F}`, color: ok ? c.good : c.warn, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{ok ? <Check size={12} /> : <AlertTriangle size={12} />} {status}</span>
                            <span style={{ font: `700 12px ${F}`, color: ok ? c.good : c.warn }}>{spending ? (ok ? '' : `+${fmt(diff)}`) : (ok ? `+${fmt(diff)}` : `−${fmt(diff)}`)}</span>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        )}

        {/* Forecast Drivers */}
        {drivers.length > 0 && (
          <div style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: 24 }}>
            <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center' }}>Forecast Drivers<InfoTip id="drivers" text="The largest upcoming expenses in your forecast, ranked by amount. These have the biggest impact on your cash flow." openId={openInfoId} setOpenId={setOpenInfoId} color={c.muted} /></div>
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
                            <span style={{ font: `600 13px ${F}`, color: c.muted }}>Daily Spending × {item.days}d</span>
                            <span style={{ font: `700 13px ${F}`, color: c.muted, whiteSpace: 'nowrap' }}>−{fmt(item.totalAmount)}</span>
                          </div>
                          <div style={{ font: `500 10px ${F}`, color: c.muted, marginTop: 1 }}>{item.dateRange} · projection</div>
                          <div style={{ marginTop: 6, padding: '5px 10px', borderRadius: 8, background: c.surface2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ font: `500 10px ${F}`, color: c.muted, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Balance after</span>
                            <span style={{ font: `700 12px ${F}`, color: balColor2 }}>{fmt(item.balanceAfter)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }

                const p = projections[item.idx]
                const income = p.event.type === 'income'
                const isLowest = !!lowestBalanceDate && p.event.date === lowestBalanceDate && p.balanceAfter === lowestBalance
                const isRecovery = !!recoveryDate && p.event.date === recoveryDate && p.balanceAfter === recoveryBalance
                const balColor = isLowest ? toneColor : isRecovery ? c.good : p.balanceAfter < 0 ? c.bad : c.ink
                const balBg = isLowest ? toneSoft : isRecovery ? c.goodSoft : c.surface2
                return (
                  <div key={`e${ti}`}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 8 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 999, background: income ? c.goodSoft : c.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={income ? c.good : c.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          {income ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></> : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>}
                        </svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ font: `700 14px ${F}`, color: c.ink }}>{p.event.title}</span>
                          <span style={{ font: `800 15px ${F}`, color: income ? c.good : c.ink, whiteSpace: 'nowrap' }}>
                            {income ? '+' : '−'}{fmt(p.event.amount)}
                          </span>
                        </div>
                        <div style={{ font: `600 11px ${F}`, color: c.muted, marginTop: 1 }}>{shortDate(p.event.date)} · {p.event.source}</div>
                        <div style={{ marginTop: 8, padding: '7px 11px', borderRadius: 9, background: balBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ font: `600 11px ${F}`, color: isLowest ? toneColor : isRecovery ? c.good : c.muted, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                            {isLowest ? 'Lowest point' : isRecovery ? 'Back positive' : 'Balance after'}
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
              const isLowest = !!lowestBalanceDate && p.event.date === lowestBalanceDate && p.balanceAfter === lowestBalance
              const isRecovery = !!recoveryDate && p.event.date === recoveryDate && p.balanceAfter === recoveryBalance
              const balColor = isLowest ? toneColor : isRecovery ? c.good : p.balanceAfter < 0 ? c.bad : c.ink
              const balBg = isLowest ? toneSoft : isRecovery ? c.goodSoft : c.surface2
              return (
                <div key={i}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 8 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 999, background: income ? c.goodSoft : c.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={income ? c.good : c.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        {income ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></> : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>}
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ font: `700 14px ${F}`, color: c.ink }}>{p.event.title}</span>
                        <span style={{ font: `800 15px ${F}`, color: income ? c.good : c.ink, whiteSpace: 'nowrap' }}>
                          {income ? '+' : '−'}{fmt(p.event.amount)}
                        </span>
                      </div>
                      <div style={{ font: `600 11px ${F}`, color: c.muted, marginTop: 1 }}>{shortDate(p.event.date)} · {p.event.source}</div>
                      <div style={{ marginTop: 8, padding: '7px 11px', borderRadius: 9, background: balBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ font: `600 11px ${F}`, color: isLowest ? toneColor : isRecovery ? c.good : c.muted, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                          {isLowest ? 'Lowest point' : isRecovery ? 'Back positive' : 'Balance after'}
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

        {/* Disclaimer */}
        <div style={{ marginTop: 28, padding: 16, borderRadius: 14, background: c.surface2 }}>
          <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>What this forecast includes</div>
          {[
            pattern === 'monthly' ? 'Salary (when confidently known)' : pattern === 'weekly' ? 'Weekly income' : 'Projected income (when configured)',
            'Commitments & bills',
            'Credit-card bills due',
            'Savings plan contributions',
            'Borrowed money you owe (at next income)',
            ...(mode === 'lifestyle' ? ['Estimated daily spending (projection)'] : []),
          ].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              <span style={{ font: `600 13px ${F}`, color: c.ink }}>{t}</span>
            </div>
          ))}
          <div style={{ height: 1, background: c.faint, margin: '12px 0' }} />
          <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>Not included</div>
          {(mode === 'lifestyle'
            ? ['Future unplanned expenses']
            : ['Daily / everyday spending', 'Future unplanned expenses']
          ).map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: 999, background: c.muted, flexShrink: 0, marginLeft: 4, marginRight: 5 }} />
              <span style={{ font: `600 13px ${F}`, color: c.muted }}>{t}</span>
            </div>
          ))}
          {mode === 'lifestyle' && (
            <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: `${c.warn}10`, border: `1px solid ${c.warn}25` }}>
              <div style={{ font: `600 11px ${F}`, color: c.warn, lineHeight: 1.5 }}>
                Lifestyle mode uses estimated spending — actual results may vary. Switch to Planned mode for guaranteed-only projections.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
