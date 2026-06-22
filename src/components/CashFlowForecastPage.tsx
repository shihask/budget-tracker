import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { buildCashFlowForecast, daysUntil } from '@/lib/cashflow'
import type { AppState, DerivedMetrics } from '@/types'

interface Props {
  state: AppState
  d: DerivedMetrics
  onClose: () => void
}

const LOW_CUSHION = 5000

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function CashFlowForecastPage({ state, d, onClose }: Props) {
  const c = useTheme()
  const forecast = useMemo(() => buildCashFlowForecast(state, d), [state, d])
  const { currentBalance, lowestBalance, lowestBalanceDate, nextSalaryDate, projections } = forecast

  // Lock background scroll while the overlay is open.
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

  const tone = lowestBalance < 0 ? 'bad' : lowestBalance < LOW_CUSHION ? 'warn' : 'good'
  const toneColor = tone === 'bad' ? c.bad : tone === 'warn' ? c.warn : c.good
  const toneSoft = tone === 'bad' ? c.badSoft : tone === 'warn' ? c.warnSoft : c.goodSoft
  const statusText =
    tone === 'bad' ? 'You may run short before payday'
      : tone === 'warn' ? 'Cutting it close before payday'
        : projections.length > 0 ? 'On track until payday' : 'No upcoming events'
  const salaryDays = nextSalaryDate ? daysUntil(nextSalaryDate) : null

  const F = 'Plus Jakarta Sans'

  const BalanceRow = ({ value, label, lowest }: { value: number; label: string; lowest?: boolean }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 12px', margin: '6px 0 6px 46px', borderRadius: 10,
      background: lowest ? toneSoft : c.surface2,
    }}>
      <span style={{ font: `600 11px ${F}`, color: lowest ? toneColor : c.muted, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
        {lowest ? 'Lowest point' : label}
      </span>
      <span style={{ font: `800 14px ${F}`, color: lowest ? toneColor : c.ink }}>{fmt(value)}</span>
    </div>
  )

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: c.bg, zIndex: 100,
      overflowY: 'auto', overscrollBehavior: 'contain', fontFamily: `${F}, sans-serif`,
      animation: 'slideInFromRight 0.32s cubic-bezier(0.32,0.72,0,1)',
    }}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(12px + env(safe-area-inset-top,0px)) 16px 12px' }}>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ font: `800 20px ${F}`, color: c.ink, letterSpacing: '-0.02em' }}>Cash Flow Forecast</div>
            <div style={{ font: `600 12px ${F}`, color: c.muted, marginTop: 1 }}>Next 60 days · known events only</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px calc(40px + env(safe-area-inset-bottom,0px))' }}>
        {/* Summary */}
        <div style={{ background: toneSoft, borderRadius: 16, padding: 18, marginBottom: 22 }}>
          <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>
            Lowest projected balance
          </div>
          <div style={{ font: `800 28px ${F}`, color: toneColor, letterSpacing: '-0.02em' }}>{fmt(lowestBalance)}</div>
          <div style={{ marginTop: 6, font: `700 13px ${F}`, color: toneColor }}>
            {statusText}{lowestBalanceDate && tone !== 'good' ? ` · around ${shortDate(lowestBalanceDate)}` : ''}
          </div>
          {salaryDays != null && (
            <div style={{ marginTop: 4, font: `600 13px ${F}`, color: c.muted }}>
              Next salary in {salaryDays === 0 ? 'today' : `${salaryDays} day${salaryDays === 1 ? '' : 's'}`}
            </div>
          )}
        </div>

        {/* Timeline */}
        {/* Today */}
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
            No upcoming money events in the next 60 days.
          </div>
        ) : (
          projections.map((p, i) => {
            const income = p.event.type === 'income'
            const isLowest = !!lowestBalanceDate && p.event.date === lowestBalanceDate && p.balanceAfter === lowestBalance
            const evColor = income ? c.good : c.ink
            return (
              <div key={i}>
                {/* connector + event */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                  <div style={{ width: 34, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 999, background: income ? c.goodSoft : c.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={income ? c.good : c.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        {income ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></> : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>}
                      </svg>
                    </div>
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div>
                      <div style={{ font: `700 14px ${F}`, color: c.ink }}>{p.event.title}</div>
                      <div style={{ font: `600 11px ${F}`, color: c.muted }}>{shortDate(p.event.date)} · {p.event.source}</div>
                    </div>
                    <span style={{ font: `800 15px ${F}`, color: evColor, whiteSpace: 'nowrap' }}>
                      {income ? '+' : '−'}{fmt(p.event.amount)}
                    </span>
                  </div>
                </div>
                <BalanceRow value={p.balanceAfter} label="Balance" lowest={isLowest} />
              </div>
            )
          })
        )}
      </div>
    </div>,
    document.body
  )
}
