import type { AppState, DerivedMetrics } from '@/types'
import type { ChallengeCalc } from '@/lib/challenge'
import { fmt, iso, addDays, TODAY } from '@/lib/utils'
import { detectRecurringExpenses } from '@/components/SavingsSuggestions'
import { detectCategorySpike } from '@/lib/notification-engine'
import { buildCashFlowForecast } from '@/lib/cashflow'

export type MintSuggestionType = 'spend_less' | 'save_money' | 'recover' | 'prepare' | 'celebrate'

export interface MintSuggestion {
  id: 'mission_risk' | 'recurring_spend' | 'category_spike' | 'unused_budget' | 'forecast' | 'celebrate'
  type: MintSuggestionType
  title: string
  body: string
  savingAmount: number | null
  priority: number
  detector: string
  confidence: number
}

const FORECAST_THRESHOLD = 500

// Deterministic priority waterfall — exactly one suggestion fires (plus the always-available
// celebrate fallback). No LLM, no persisted mission state — every rule reads only state/d/calc,
// all of which the caller already has. Priority 2 (Recovery) is intentionally never checked: the
// Grow page's own Recovery card already shows nearly the same message, so Mint always falls
// through to something the page doesn't already say.
//
// Contract (enforced by src/lib/__tests__/mint-suggestions.test.ts, not just documented here):
//   - Deterministic: same (state, d, calc) in -> same suggestions out, every call.
//   - No side effects: reads state/d/calc only, never mutates them, never touches localStorage
//     or Supabase (that's deliberately Grow's job when it decides what to do with the result).
//   - Result is sorted by priority ascending (ties broken by array order below).
//   - No duplicate ids within one result.
//   - confidence is always an integer in [0, 100].
//   - Every suggestion has a non-empty title and body.
//   - Never returns an empty array — the celebrate rule is the fallback of last resort.
// These hold today because the waterfall short-circuits to a single suggestion; they're written
// down now, before Phase 3/4 give any reason to relax the short-circuit into "return several,"
// so a later change can be checked against an explicit contract instead of just "it still compiles."
export function generateMintSuggestions(state: AppState, d: DerivedMetrics, calc: ChallengeCalc): MintSuggestion[] {
  // 1. Mission Risk
  if (calc.pctUsed > 70) {
    return [{
      id: 'mission_risk',
      type: 'spend_less',
      priority: 1,
      detector: 'mission_risk',
      confidence: 90,
      title: 'Mission at risk',
      body: `You've used ${Math.round(calc.pctUsed)}% of today's budget already. Avoid non-essential spending for the rest of today to stay on track.`,
      savingAmount: null,
    }]
  }

  // 3. Recurring Spend
  const topRecurring = detectRecurringExpenses(state)[0]
  if (topRecurring) {
    return [{
      id: 'recurring_spend',
      type: 'save_money',
      priority: 3,
      detector: 'recurring_spend',
      confidence: 75,
      title: `Recurring spend: ${topRecurring.description}`,
      body: `You've spent ${fmt(topRecurring.monthlyAmount)} on ${topRecurring.description} this month (${topRecurring.count}x already). Skip it today — that's real money staying in your pocket.`,
      savingAmount: topRecurring.monthlyAmount,
    }]
  }

  // 4. Category Spike
  const spike = detectCategorySpike(state)
  if (spike) {
    return [{
      id: 'category_spike',
      type: 'spend_less',
      priority: 4,
      detector: 'category_spike',
      confidence: 70,
      title: `${spike.category} spending is up`,
      body: `${spike.category} spending is up ${Math.round(spike.pct)}% vs last month. Cutting back on ${spike.category.toLowerCase()} today helps bring it back down.`,
      savingAmount: null,
    }]
  }

  // 5. Unused Budget
  if (calc.status === 'on_track' && calc.pctUsed < 50) {
    const remainingToday = calc.target - calc.spentToday
    const suggestedAmount = Math.round(remainingToday * 0.5)
    if (suggestedAmount > 0) {
      return [{
        id: 'unused_budget',
        type: 'save_money',
        priority: 5,
        detector: 'unused_budget',
        confidence: 60,
        title: 'Ahead of budget today',
        body: `You've only used ${Math.round(calc.pctUsed)}% of today's budget. Consider moving ${fmt(suggestedAmount)} into savings while you're ahead.`,
        savingAmount: suggestedAmount,
      }]
    }
  }

  // 6. Forecast
  const tomorrowStr = iso(addDays(TODAY, 1))
  const forecast = buildCashFlowForecast(state, d)
  const tomorrowBill = forecast.projections.find(p =>
    p.event.date === tomorrowStr &&
    p.event.type === 'expense' &&
    p.event.source !== 'lifestyle' &&
    p.event.amount >= FORECAST_THRESHOLD
  )
  if (tomorrowBill) {
    return [{
      id: 'forecast',
      type: 'prepare',
      priority: 6,
      detector: 'forecast',
      confidence: 65,
      title: 'Big expense tomorrow',
      body: `Tomorrow you'll need ${fmt(tomorrowBill.event.amount)} for your ${tomorrowBill.event.title}. Avoid extra spending today so tomorrow stays comfortable.`,
      savingAmount: null,
    }]
  }

  // 7. Celebrate (fallback — always available, never an empty section)
  return [{
    id: 'celebrate',
    type: 'celebrate',
    priority: 7,
    detector: 'celebrate',
    confidence: 50,
    title: "You're doing great",
    body: "You're doing great today. Keep it up!",
    savingAmount: null,
  }]
}
