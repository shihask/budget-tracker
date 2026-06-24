import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { buildCashFlowForecast, daysUntil, getForecastDrivers } from '@/lib/cashflow'
import { forecastHealth, HEALTH_MESSAGE } from '@/components/CashFlowForecastCard'
import { useStrategyData, getCategoryBucket } from './BudgetStrategyCard'
import type { AppState, BudgetBucket, DerivedMetrics } from '@/types'

interface Props {
  state: AppState
  d: DerivedMetrics
  onClose: () => void
  onSetup: () => void
  onSwipeProgress?: (pct: number) => void
}

const F = 'Plus Jakarta Sans'
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export function CashFlowForecastPage({ state, d, onClose, onSetup, onSwipeProgress }: Props) {
  const c = useTheme()
  const forecast = useMemo(() => buildCashFlowForecast(state, d), [state, d])
  const { currentBalance, lowestBalance, lowestBalanceDate, nextSalaryDate, recoveryDate, recoveryBalance, projections } = forecast
  const drivers = useMemo(() => getForecastDrivers(projections, 5), [projections])
  const strategyData = useStrategyData(state, d)

  const forecastOutcome = useMemo(() => {
    let income = 0
    let cardTotal = 0
    let borrowingTotal = 0
    const cardItems: { title: string; amount: number }[] = []
    const borrowingItems: { title: string; amount: number }[] = []

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
      }
    }

    const debt = cardTotal + borrowingTotal
    if (income === 0 && debt === 0) return null
    return { income, debt, available: income - debt, cardTotal, cardItems, borrowingTotal, borrowingItems }
  }, [projections])

  const [budgetPeriod, setBudgetPeriod] = useState<'current' | 'next'>('next')

  const projectedBudget = useMemo(() => {
    if (!strategyData) return null
    const { actuals, targets } = strategyData

    const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const sd = state.settings.salary_date
    const now = new Date()

    let periodStart: string
    let periodEnd: string

    if (sd && sd >= 1 && sd <= 31) {
      const y = now.getFullYear(), m = now.getMonth(), day = now.getDate()
      if (budgetPeriod === 'next') {
        const s = day >= sd ? new Date(y, m + 1, sd) : new Date(y, m, sd)
        periodStart = toIso(s)
        periodEnd = toIso(new Date(s.getFullYear(), s.getMonth() + 1, sd))
      } else {
        const s = day >= sd ? new Date(y, m, sd) : new Date(y, m - 1, sd)
        periodStart = toIso(s)
        periodEnd = toIso(day >= sd ? new Date(y, m + 1, sd) : new Date(y, m, sd))
      }
    } else {
      if (budgetPeriod === 'next') {
        const s = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        periodStart = toIso(s)
        periodEnd = toIso(new Date(s.getFullYear(), s.getMonth() + 1, 1))
      } else {
        periodStart = toIso(new Date(now.getFullYear(), now.getMonth(), 1))
        periodEnd = toIso(new Date(now.getFullYear(), now.getMonth() + 1, 1))
      }
    }

    const baseActuals = budgetPeriod === 'current' ? actuals : { needs: 0, wants: 0, savings: 0 }
    const projected: Record<BudgetBucket, number> = { ...baseActuals }
    const forecastItems: Record<BudgetBucket, { title: string; amount: number }[]> = { needs: [], wants: [], savings: [] }
    const catMap = Object.fromEntries(state.categories.map(cc => [cc.id, cc]))
    let hasProjection = false

    for (const p of projections) {
      const ev = p.event
      if (ev.type !== 'expense') continue
      if (ev.source === 'card' || ev.source === 'borrowing') continue
      if (ev.date < periodStart || ev.date >= periodEnd) continue

      let bucket: BudgetBucket | null = null
      if (ev.source === 'saving') {
        bucket = 'savings'
      } else if (ev.source === 'commitment') {
        const cat = ev.category_id ? catMap[ev.category_id] : null
        bucket = cat ? getCategoryBucket(cat, state.groups) : 'needs'
      }

      if (bucket) {
        projected[bucket] += ev.amount
        forecastItems[bucket].push({ title: ev.title, amount: ev.amount })
        hasProjection = true
      }
    }

    if (!hasProjection && budgetPeriod === 'next') return null
    if (!hasProjection && budgetPeriod === 'current' && actuals.needs === 0 && actuals.wants === 0 && actuals.savings === 0) return null

    return [
      { label: 'Needs', pct: targets.needs > 0 ? Math.round(projected.needs / targets.needs * 100) : 0, color: '#3B82F6', spending: true, target: targets.needs, projected: projected.needs, items: forecastItems.needs },
      { label: 'Wants', pct: targets.wants > 0 ? Math.round(projected.wants / targets.wants * 100) : 0, color: '#F97316', spending: true, target: targets.wants, projected: projected.wants, items: forecastItems.wants },
      { label: 'Savings', pct: targets.savings > 0 ? Math.round(projected.savings / targets.savings * 100) : 0, color: c.accent, spending: false, target: targets.savings, projected: projected.savings, items: forecastItems.savings },
    ] as const
  }, [strategyData, projections, state, c.accent, budgetPeriod])

  const [expandedBucket, setExpandedBucket] = useState<string | null>(null)
  const [debtExpanded, setDebtExpanded] = useState(false)
  const [debtDetailExpanded, setDebtDetailExpanded] = useState(false)

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

  const health = forecastHealth(lowestBalance)
  const toneColor = health === 'critical' ? c.bad : health === 'warning' ? c.warn : c.good
  const toneSoft = health === 'critical' ? c.badSoft : health === 'warning' ? c.warnSoft : c.goodSoft
  const message = projections.length === 0 ? 'No upcoming events' : HEALTH_MESSAGE[health]
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
            <div style={{ font: `600 12px ${F}`, color: c.muted, marginTop: 1 }}>Next {days} days · known events only</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '18px 16px calc(40px + env(safe-area-inset-bottom,0px))' }}>
        {/* Available today */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>Available Today</div>
          <div style={{ font: `800 30px ${F}`, color: c.ink, letterSpacing: '-0.02em' }}>{fmt(currentBalance)}</div>
          <div style={{ font: `600 12px ${F}`, color: c.muted, marginTop: 2 }}>Available to spend right now</div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <button onClick={onSetup} style={{ flex: 1, background: c.surface2, color: c.ink, border: 'none', borderRadius: 12, padding: '11px', font: `700 13px ${F}`, cursor: 'pointer' }}>Edit Forecast</button>
        </div>

        {/* Status / lowest + warning causes */}
        <div style={{ background: toneSoft, borderRadius: 16, padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ font: `700 12px ${F}`, color: toneColor }}>Lowest Balance</span>
            <span style={{ font: `800 20px ${F}`, color: toneColor }}>{fmt(lowestBalance)}</span>
          </div>
          <div style={{ marginTop: 6, font: `700 13px ${F}`, color: toneColor }}>
            {message}{lowestBalanceDate && health !== 'healthy' ? ` · around ${shortDate(lowestBalanceDate)}` : ''}
          </div>
          {salaryDays != null && (
            <div style={{ marginTop: 4, font: `600 13px ${F}`, color: c.muted }}>
              Next salary in {salaryDays === 0 ? 'today' : `${salaryDays} day${salaryDays === 1 ? '' : 's'}`}
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
                <span style={{ font: `700 12px ${F}`, color: c.ink }}>Recovery Date</span>
                <span style={{ font: `800 14px ${F}`, color: c.good }}>{shortDate(recoveryDate)}</span>
              </div>
              <div style={{ font: `600 12px ${F}`, color: c.muted, marginTop: 2 }}>After Salary Credit · Balance {fmt(recoveryBalance)}</div>
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
          <div style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: (projectedBudget || strategyData) ? 0 : 24 }}>
            <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>
              Forecast Outcome
            </div>
            {forecastOutcome.income > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                <span style={{ font: `600 13px ${F}`, color: c.ink }}>Income Received</span>
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
                    <span style={{ font: `600 13px ${F}`, color: c.ink }}>Debt & Liability Payments</span>
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
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {forecastOutcome.income > 0 && forecastOutcome.debt > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 2px', marginTop: 4, borderTop: `1px dashed ${c.faint}` }}>
                <span style={{ font: `700 13px ${F}`, color: c.ink }}>Available After Obligations</span>
                <span style={{ font: `800 14px ${F}`, color: forecastOutcome.available >= 0 ? c.good : c.bad }}>{fmt(forecastOutcome.available)}</span>
              </div>
            )}
          </div>
        )}

        {/* Projected Budget Completion */}
        {(projectedBudget || strategyData) && (
          <div style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: 24, marginTop: forecastOutcome ? 2 : 0, borderTop: forecastOutcome ? `1px solid ${c.faint}` : 'none', borderTopLeftRadius: forecastOutcome ? 0 : 16, borderTopRightRadius: forecastOutcome ? 0 : 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Projected Budget Completion
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
            {!projectedBudget && (
              <div style={{ font: `600 12px ${F}`, color: c.muted, padding: '8px 0', fontStyle: 'italic' }}>No known items for this cycle</div>
            )}
            {projectedBudget?.map(({ label, pct, color, spending, target, projected, items }) => {
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
                      <span style={{ font: `700 14px ${F}`, color: c.ink }}>{label}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ font: `800 15px ${F}`, color: ok ? c.good : c.warn }}>{pct}%</span>
                      <span style={{ fontSize: 14, color: ok ? c.good : c.warn }}>{ok ? '✓' : '⚠'}</span>
                    </div>
                  </div>
                  <div style={{ padding: '0 0 8px 18px', font: `600 11px ${F}`, color: ok ? c.good : c.warn, borderBottom: !expanded && label !== 'Savings' ? `1px solid ${c.faint}` : 'none' }}>
                    {ok ? '✓' : '⚠'} {status}
                  </div>
                  {expanded && (
                    <div style={{ padding: '4px 0 10px 18px', borderBottom: label !== 'Savings' ? `1px solid ${c.faint}` : 'none' }}>
                      {items.map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                          <span style={{ font: `600 12px ${F}`, color: c.ink }}>+ {item.title}</span>
                          <span style={{ font: `700 12px ${F}`, color: c.ink }}>{fmt(item.amount)}</span>
                        </div>
                      ))}
                      {items.length === 0 && (
                        <div style={{ font: `600 12px ${F}`, color: c.muted, padding: '5px 0', fontStyle: 'italic' }}>No upcoming items</div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0 0', marginTop: 4, borderTop: `1px dashed ${c.faint}` }}>
                        <span style={{ font: `600 11px ${F}`, color: c.muted }}>Target</span>
                        <span style={{ font: `700 12px ${F}`, color: c.muted }}>{fmt(target)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Forecast Drivers */}
        {drivers.length > 0 && (
          <div style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: 24 }}>
            <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12 }}>Forecast Drivers</div>
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
          <div style={{ margin: '20px 0 0 46px', font: `600 13px ${F}`, color: c.muted }}>
            No upcoming money events in the next {days} days.
          </div>
        ) : (
          projections.map((p, i) => {
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
        )}

        {/* Disclaimer */}
        <div style={{ marginTop: 28, padding: 16, borderRadius: 14, background: c.surface2 }}>
          <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>What this forecast includes</div>
          {['Salary (when confidently known)', 'Commitments & bills', 'Credit-card bills due', 'Savings plan contributions', 'Borrowed money you owe (at payday)'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              <span style={{ font: `600 13px ${F}`, color: c.ink }}>{t}</span>
            </div>
          ))}
          <div style={{ height: 1, background: c.faint, margin: '12px 0' }} />
          <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>Not included</div>
          {['Daily / everyday spending', 'Future unplanned expenses'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: 999, background: c.muted, flexShrink: 0, marginLeft: 4, marginRight: 5 }} />
              <span style={{ font: `600 13px ${F}`, color: c.muted }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
