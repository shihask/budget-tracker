import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { buildCashFlowForecast, daysUntil } from '@/lib/cashflow'
import { forecastHealth, HEALTH_MESSAGE } from '@/components/CashFlowForecastCard'
import type { AppState, DerivedMetrics } from '@/types'

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
  const [tick, setTick] = useState(0)
  const forecast = useMemo(() => buildCashFlowForecast(state, d), [state, d, tick])
  const { currentBalance, lowestBalance, lowestBalanceDate, nextSalaryDate, recoveryDate, recoveryBalance, projections } = forecast

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
        {/* Current balance context */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>Current Balance</div>
          <div style={{ font: `800 30px ${F}`, color: c.ink, letterSpacing: '-0.02em' }}>{fmt(currentBalance)}</div>
          <div style={{ font: `600 12px ${F}`, color: c.muted, marginTop: 2 }}>Forecast · next {days} days</div>
        </div>

        {/* Actions — forecast is derived, never stored; Recalculate just reruns it */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <button onClick={onSetup} style={{ flex: 1, background: c.surface2, color: c.ink, border: 'none', borderRadius: 12, padding: '11px', font: `700 13px ${F}`, cursor: 'pointer' }}>Edit Forecast</button>
          <button onClick={() => setTick(t => t + 1)} style={{ flex: 1, background: c.surface2, color: c.ink, border: 'none', borderRadius: 12, padding: '11px', font: `700 13px ${F}`, cursor: 'pointer' }}>Recalculate</button>
        </div>

        {/* Status / lowest */}
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
          {recoveryDate && recoveryBalance != null && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.faint}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ font: `700 12px ${F}`, color: c.good }}>Back positive · {shortDate(recoveryDate)}</span>
              <span style={{ font: `800 14px ${F}`, color: c.good }}>{fmt(recoveryBalance)}</span>
            </div>
          )}
        </div>

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
