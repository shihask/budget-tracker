import { useMemo } from 'react'
import { Card } from '@/components/Card'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { buildCashFlowForecast, daysUntil, forecastReady } from '@/lib/cashflow'
import { buildLifestyleForecast } from '@/features/forecast/lib/lifestyleForecast'
import { getIncomePattern } from '@/lib/income-pattern'
import type { AppState, DerivedMetrics, IncomePattern } from '@/types'

interface Props {
  state: AppState
  d: DerivedMetrics
  onOpen: () => void
  onSetup: () => void
  onRecordIncome?: () => void
}

export const LOW_CUSHION = 5000 // below this (but >= 0) the forecast is "getting tight"

type Health = 'healthy' | 'warning' | 'critical'

export function forecastHealth(lowestBalance: number): Health {
  if (lowestBalance < 0) return 'critical'
  if (lowestBalance < LOW_CUSHION) return 'warning'
  return 'healthy'
}

export function getHealthMessage(health: Health, pattern: IncomePattern): string {
  const anchor = pattern === 'monthly' ? 'payday' : 'next income'
  const messages: Record<Health, string> = {
    healthy: `Cash flow looks healthy until ${anchor}`,
    warning: `Getting tight before ${anchor}`,
    critical: `May run short before ${anchor}`,
  }
  return messages[health]
}

export function CashFlowForecastCard({ state, d, onOpen, onSetup, onRecordIncome }: Props) {
  const c = useTheme()
  const F = 'Plus Jakarta Sans'
  const enabled = state.forecast_settings.enabled ?? true
  const ready = forecastReady(state)
  const mode = state.forecast_settings.forecast_mode ?? 'planned'
  const plannedForecast = useMemo(() => buildCashFlowForecast(state, d), [state, d])
  const lifestyleData = useMemo(() => mode === 'lifestyle' ? buildLifestyleForecast(state, d) : null, [state, d, mode])
  const forecast = lifestyleData ?? plannedForecast

  const Title = ({ tone, soft }: { tone: string; soft: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: soft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tone} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5h-5" /></svg>
        </div>
        <span style={{ font: `800 15px ${F}`, color: c.ink }}>Cash Flow Forecast</span>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
    </div>
  )

  // ── Not ready / disabled → "Set up Forecast" ──
  const pattern = getIncomePattern(state.settings)
  if (!enabled || !ready) {
    const reason = !enabled ? 'Tell us how you receive income to unlock cash flow forecasting.'
      : pattern === 'monthly' && state.settings.salary_date == null ? 'Add your salary date so we can project your cash flow.'
      : pattern === 'weekly' && !(state.settings.weekly_income && state.settings.income_day != null) ? 'Set your weekly income to project your cash flow.'
      : 'Add a commitment or savings plan to see what lies ahead.'
    return (
      <Card pad={0} style={{ overflow: 'hidden', cursor: 'pointer' }}>
        <div onClick={onSetup} style={{ padding: 18, fontFamily: `${F}, sans-serif` }}>
          <Title tone={c.accent} soft={c.accentSoft} />
          <div style={{ font: `700 14px ${F}`, color: c.ink, marginBottom: 4 }}>Plan Ahead</div>
          <div style={{ font: `600 12px ${F}`, color: c.muted }}>{reason}</div>
        </div>
      </Card>
    )
  }

  // ── Ready → results ──
  const { lowestBalance, nextSalaryDate, projections } = forecast
  const health = forecastHealth(lowestBalance)
  const toneColor = health === 'critical' ? c.bad : health === 'warning' ? c.warn : c.good
  const toneSoft = health === 'critical' ? c.badSoft : health === 'warning' ? c.warnSoft : c.goodSoft
  const message = projections.length === 0 ? 'No upcoming events in this period' : getHealthMessage(health, pattern)
  const salaryDays = nextSalaryDate ? daysUntil(nextSalaryDate) : null

  return (
    <Card pad={0} style={{ overflow: 'hidden', cursor: 'pointer' }}>
      <div onClick={onOpen} style={{ padding: 18, fontFamily: `${F}, sans-serif` }}>
        <Title tone={toneColor} soft={toneSoft} />
        <div style={{ font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>Lowest Balance</div>
        <div style={{ font: `800 26px ${F}`, color: toneColor, letterSpacing: '-0.02em' }}>{fmt(lowestBalance)}</div>
        <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 11, background: toneSoft, font: `700 12px ${F}`, color: toneColor }}>{message}</div>
        {lifestyleData && lifestyleData.dailySpend.source && (
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ font: `600 12px ${F}`, color: c.muted }}>Safe Until</span>
            <span style={{ font: `700 12px ${F}`, color: lifestyleData.risk === 'risk' || lifestyleData.risk === 'critical' ? c.bad : lifestyleData.risk === 'tight' ? c.warn : c.good }}>{lifestyleData.safeUntilLabel}</span>
          </div>
        )}
        {(pattern === 'monthly' || pattern === 'weekly') && (
          d.isWaitingForIncome ? (() => {
            const incLabel = pattern === 'monthly' ? 'Salary' : 'Income'
            let overdueText = ''
            if (d.expectedIncomeDate) {
              const today = new Date(); today.setHours(0,0,0,0)
              const expected = new Date(d.expectedIncomeDate); expected.setHours(0,0,0,0)
              const overdueDays = Math.round((today.getTime() - expected.getTime()) / 86400000)
              if (overdueDays === 0) overdueText = `${incLabel} expected today. Record it when received.`
              else if (overdueDays === 1) overdueText = `${incLabel} expected yesterday. Record it when received.`
              else if (overdueDays <= 7) overdueText = `${incLabel} was expected ${overdueDays} days ago. Record it if you've already been paid.`
              else overdueText = `${incLabel} not yet recorded. Record your latest income to start the new cycle.`
            }
            return (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ font: `600 12px ${F}`, color: c.warn, flex: 1, lineHeight: 1.4 }}>{overdueText}</div>
                {onRecordIncome && (
                  <button
                    onClick={e => { e.stopPropagation(); onRecordIncome() }}
                    style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '7px 14px', font: `700 12px ${F}`, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    + Record
                  </button>
                )}
              </div>
            )
          })() : salaryDays != null ? (
            <div style={{ marginTop: 10, font: `600 12px ${F}`, color: c.muted }}>
              {pattern === 'monthly' ? 'Salary' : 'Income'} in {salaryDays === 0 ? 'today' : `${salaryDays} day${salaryDays === 1 ? '' : 's'}`}
            </div>
          ) : null
        )}
      </div>
    </Card>
  )
}
