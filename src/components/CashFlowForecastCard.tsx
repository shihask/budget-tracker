import { useMemo } from 'react'
import { Card } from '@/components/Card'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { buildCashFlowForecast, daysUntil, forecastReady } from '@/lib/cashflow'
import { buildLifestyleForecast } from '@/features/forecast/lib/lifestyleForecast'
import type { AppState, DerivedMetrics } from '@/types'

interface Props {
  state: AppState
  d: DerivedMetrics
  onOpen: () => void
  onSetup: () => void
}

export const LOW_CUSHION = 5000 // below this (but >= 0) the forecast is "getting tight"

type Health = 'healthy' | 'warning' | 'critical'

export function forecastHealth(lowestBalance: number): Health {
  if (lowestBalance < 0) return 'critical'
  if (lowestBalance < LOW_CUSHION) return 'warning'
  return 'healthy'
}

export const HEALTH_MESSAGE: Record<Health, string> = {
  healthy: 'You are covered until payday',
  warning: 'Getting tight before payday',
  critical: 'May run short before payday',
}

export function CashFlowForecastCard({ state, d, onOpen, onSetup }: Props) {
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
  if (!enabled || !ready) {
    const reason = !enabled ? 'Tap to set up your forecast'
      : state.settings.salary_date == null ? 'Add your salary date to begin'
        : 'Add a commitment, savings plan, or salary to forecast'
    return (
      <Card pad={0} style={{ overflow: 'hidden', cursor: 'pointer' }}>
        <div onClick={onSetup} style={{ padding: 18, fontFamily: `${F}, sans-serif` }}>
          <Title tone={c.accent} soft={c.accentSoft} />
          <div style={{ font: `700 14px ${F}`, color: c.ink, marginBottom: 4 }}>Set up Forecast</div>
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
  const message = projections.length === 0 ? 'No upcoming events in this period' : HEALTH_MESSAGE[health]
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
            <span style={{ font: `700 12px ${F}`, color: lifestyleData.risk === 'risk' ? c.bad : lifestyleData.risk === 'watch' ? c.warn : c.good }}>{lifestyleData.safeUntilLabel}</span>
          </div>
        )}
        {salaryDays != null && (
          <div style={{ marginTop: 10, font: `600 12px ${F}`, color: c.muted }}>
            Salary in {salaryDays === 0 ? 'today' : `${salaryDays} day${salaryDays === 1 ? '' : 's'}`}
          </div>
        )}
      </div>
    </Card>
  )
}
