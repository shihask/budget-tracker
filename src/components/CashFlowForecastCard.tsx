import { useMemo } from 'react'
import { Card } from '@/components/Card'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { buildCashFlowForecast, daysUntil } from '@/lib/cashflow'
import type { AppState, DerivedMetrics } from '@/types'

interface Props {
  state: AppState
  d: DerivedMetrics
  onOpen: () => void
}

const LOW_CUSHION = 5000 // ₹ — below this the forecast is "cutting it close"

export function CashFlowForecastCard({ state, d, onOpen }: Props) {
  const c = useTheme()
  const forecast = useMemo(() => buildCashFlowForecast(state, d), [state, d])

  const { lowestBalance, lowestBalanceDate, nextSalaryDate, projections } = forecast

  const tone = lowestBalance < 0 ? 'bad' : lowestBalance < LOW_CUSHION ? 'warn' : 'good'
  const toneColor = tone === 'bad' ? c.bad : tone === 'warn' ? c.warn : c.good
  const toneSoft = tone === 'bad' ? c.badSoft : tone === 'warn' ? c.warnSoft : c.goodSoft

  const statusText =
    tone === 'bad' ? 'You may run short before payday'
      : tone === 'warn' ? 'Cutting it close before payday'
        : projections.length > 0 ? 'On track until payday' : 'No upcoming events in 60 days'

  const salaryDays = nextSalaryDate ? daysUntil(nextSalaryDate) : null

  return (
    <Card pad={0} style={{ overflow: 'hidden', cursor: 'pointer' }}>
      <div onClick={onOpen} style={{ padding: 18, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: toneSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={toneColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5h-5" />
              </svg>
            </div>
            <span style={{ font: '800 15px Plus Jakarta Sans', color: c.ink }}>Cash Flow Forecast</span>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>

        <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>
          Lowest projected balance
        </div>
        <div style={{ font: '800 26px Plus Jakarta Sans', color: toneColor, letterSpacing: '-0.02em' }}>
          {fmt(lowestBalance)}
        </div>

        <div style={{
          marginTop: 12, padding: '9px 12px', borderRadius: 11, background: toneSoft,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ font: '700 12px Plus Jakarta Sans', color: toneColor }}>{statusText}</span>
          {salaryDays != null && (
            <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, whiteSpace: 'nowrap' }}>
              Salary in {salaryDays === 0 ? 'today' : `${salaryDays}d`}
            </span>
          )}
        </div>

        {lowestBalanceDate && tone !== 'good' && (
          <div style={{ marginTop: 8, font: '600 12px Plus Jakarta Sans', color: c.muted }}>
            Tightest around {new Date(lowestBalanceDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </div>
        )}
      </div>
    </Card>
  )
}
