/* ============================================================================
   "How much will I have on 5 Dec?" — answered from the forecast the Cash Flow
   Forecast page shows (same options, same Planned / Lifestyle mode), so Mint
   and the page can never disagree. Pure: no AI, no network.
   ============================================================================ */

import { buildCashFlowForecast, forecastHorizonDays, FORECAST_PAGE_OPTIONS, type CashFlowForecast } from '@/lib/cashflow'
import { localIso } from '@/lib/utils'
import type { AppState, DerivedMetrics, ForecastMode } from '@/types'
import { buildLifestyleForecast } from './lifestyleForecast'

/** The page's own selection (CashFlowForecastPage): Lifestyle mode adds the
 *  estimated daily spending on top of the known events. */
export function buildDisplayedForecast(state: AppState, d: DerivedMetrics): { mode: ForecastMode; forecast: CashFlowForecast } {
  const mode: ForecastMode = state.forecast_settings.forecast_mode ?? 'planned'
  return {
    mode,
    forecast: mode === 'lifestyle'
      ? buildLifestyleForecast(state, d, undefined, FORECAST_PAGE_OPTIONS)
      : buildCashFlowForecast(state, d, FORECAST_PAGE_OPTIONS),
  }
}

/** Last day the engine projects: today + horizon, both ends inclusive. */
export function forecastHorizonEnd(state: AppState, today: string): string {
  const [y, m, dd] = today.split('-').map(Number)
  return localIso(new Date(y, m - 1, dd + forecastHorizonDays(state)))
}

/** Balance at the end of `iso`: after every event dated on or before it.
 *  Events dated today count, so today's answer already pays today's bills. */
export function balanceAtEndOf(forecast: CashFlowForecast, iso: string): number {
  let balance = forecast.currentBalance
  for (const p of forecast.projections) {
    if (p.event.date > iso) break
    balance = p.balanceAfter
  }
  return balance
}

export interface ForecastDateEvent {
  date: string
  title: string
  amount: number
  type: 'income' | 'expense'
}

export interface ForecastOnDate {
  /** The date asked about. */
  date: string
  /** past: before today, nothing to forecast. beyond: after the horizon — the
   *  numbers are for `asOf` (the horizon end) instead, never extrapolated. */
  status: 'ok' | 'past' | 'beyond'
  asOf: string
  balance: number
  /** "Available Today" on the page: balance − emergency fund. */
  availableToday: number
  emergencyFund: number
  mode: ForecastMode
  horizonDays: number
  /** Named events from today to `asOf`. Lifestyle days are summed, not listed. */
  events: ForecastDateEvent[]
  lifestyleTotal: number
  lifestyleDays: number
  /** Set when the balance goes below zero on the way (the end figure alone would hide it). */
  dipsTo: { date: string; balance: number } | null
}

export function forecastOnDate(state: AppState, d: DerivedMetrics, date: string, today: string = localIso(new Date())): ForecastOnDate {
  const { mode, forecast } = buildDisplayedForecast(state, d)
  const horizonEnd = forecastHorizonEnd(state, today)
  const status: ForecastOnDate['status'] = date < today ? 'past' : date > horizonEnd ? 'beyond' : 'ok'
  const asOf = status === 'beyond' ? horizonEnd : status === 'past' ? today : date

  const events: ForecastDateEvent[] = []
  let lifestyleTotal = 0
  let lifestyleDays = 0
  let dipsTo: ForecastOnDate['dipsTo'] = null
  if (status !== 'past') {
    for (const p of forecast.projections) {
      if (p.event.date > asOf) break
      if (p.event.source === 'lifestyle') {
        lifestyleTotal += p.event.amount
        lifestyleDays++
      } else {
        events.push({ date: p.event.date, title: p.event.title, amount: p.event.amount, type: p.event.type })
      }
      if (p.balanceAfter < 0 && (!dipsTo || p.balanceAfter < dipsTo.balance)) {
        dipsTo = { date: p.event.date, balance: p.balanceAfter }
      }
    }
  }

  const balance = balanceAtEndOf(forecast, asOf)
  return {
    date, status, asOf, balance,
    availableToday: forecast.currentBalance,
    emergencyFund: Math.round(d.emergencyFund ?? 0),
    mode,
    horizonDays: forecastHorizonDays(state),
    events,
    lifestyleTotal: Math.round(lifestyleTotal),
    lifestyleDays,
    // Only worth a line when the end figure hides it.
    dipsTo: dipsTo && dipsTo.balance < balance ? dipsTo : null,
  }
}
