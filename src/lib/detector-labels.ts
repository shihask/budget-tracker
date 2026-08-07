// Single source of human-friendly names for every detector slug produced by
// notification-engine.ts and mint-suggestions.ts. Used anywhere a detector needs to
// be shown to a user (ExplainPanel today; NotificationsSheet/Coach can reuse later)
// instead of each surface inventing its own labels that can drift apart.
export const DETECTOR_LABELS: Record<string, string> = {
  // notification-engine.ts — domain: budget
  budget_period_alert: 'Budget',
  budget_pace: 'Budget Pace',
  budget_spike: 'Spending Pattern',
  budget_progress: 'Spending Pattern',
  budget_discipline: 'Spending Pattern',
  budget_top_category: 'Spending Pattern',
  // notification-engine.ts — domain: cash_health
  cash_shortfall: 'Cash Flow',
  cash_forecast_negative: 'Cash Flow',
  cash_sufficient: 'Cash Flow',
  // notification-engine.ts — domain: bills
  bill_due: 'Upcoming Bill',
  // notification-engine.ts — domain: income
  income_salary_received: 'Income',
  income_salary_expected: 'Income',
  // notification-engine.ts — domain: goals
  goal_reached: 'Goal Progress',
  goal_milestone: 'Goal Progress',
  goal_behind_pace: 'Goal Progress',
  // notification-engine.ts — domain: savings
  savings_target_reached: 'Savings',
  savings_due: 'Savings',
  // notification-engine.ts — domain: challenge
  challenge_streak_milestone: 'Daily Mission',
  challenge_under_budget: 'Daily Mission',
  // mint-suggestions.ts
  mission_risk: 'Daily Mission',
  recurring_spend: 'Recurring Spend',
  category_spike: 'Spending Pattern',
  unused_budget: 'Daily Mission',
  forecast: 'Upcoming Bill',
  celebrate: 'Daily Mission',
}

const warned = new Set<string>()

// Falls back to the raw slug for an unregistered detector, but warns once in dev so a
// newly-added detector that forgot its label doesn't silently ship as e.g. "budget_new_thing".
export function getDetectorLabel(detector: string): string {
  const label = DETECTOR_LABELS[detector]
  if (label) return label
  if (import.meta.env.DEV && !warned.has(detector)) {
    warned.add(detector)
    console.warn(`[detector-labels] No friendly label registered for detector "${detector}" — add it to DETECTOR_LABELS.`)
  }
  return detector
}
