import type { AppState, BudgetBucket, BudgetStrategySettings, BudgetStrategyType, DerivedMetrics } from '@/types'
import { getIncomePattern, getVariableMonthlyIncome } from '@/lib/income-pattern'
import { getCurrentFinancialCycle } from '@/lib/financial-cycle'

export const STRATEGY_PRESETS: Record<
  Exclude<BudgetStrategyType, 'none' | 'custom'>,
  { needs: number; wants: number; savings: number; label: string }
> = {
  balanced: { needs: 50, wants: 30, savings: 20, label: 'Balanced (50/30/20)' },
  stable:   { needs: 60, wants: 20, savings: 20, label: 'Stable (60/20/20)' },
  growth:   { needs: 45, wants: 20, savings: 35, label: 'Growth (45/20/35)' },
}

export function getStrategyPcts(bss: BudgetStrategySettings): { needs: number; wants: number; savings: number; label: string } | null {
  const s = bss.budget_strategy ?? 'none'
  if (s === 'none') return null
  if (s === 'custom') {
    const n = bss.custom_needs_pct ?? 50
    const w = bss.custom_wants_pct ?? 30
    const sv = bss.custom_savings_pct ?? 20
    return { needs: n, wants: w, savings: sv, label: `Custom (${n}/${w}/${sv})` }
  }
  return STRATEGY_PRESETS[s]
}

// Derives the budget bucket for a category based on its group type.
// The budget_bucket column is only used for Other-group categories.
// Fallback for built-in groups that may not have `type` set in the DB yet.
const BUILTIN_BUCKETS: Record<string, BudgetBucket> = {
  Lifestyle: 'wants', Utilities: 'needs', Transport: 'needs',
  Health: 'needs', Family: 'needs', Obligations: 'needs',
}

// Returns the auto-derived bucket for a category based on its group type (no user override).
export function getAutoBucket(groups: AppState['groups'], groupName: string): BudgetBucket | null {
  const group = groups.find(g => g.name === groupName)
  if (!group || group.name === 'Other') return null
  switch (group.type) {
    case 'essential':
    case 'commitment':
      return 'needs'
    case 'savings':
      return 'savings'
    case 'discretionary':
      return 'wants'
    default:
      return BUILTIN_BUCKETS[groupName] ?? null
  }
}

// User-set budget_bucket overrides the auto-derived value for any category.
export function getCategoryBucket(cat: AppState['categories'][0], groups: AppState['groups']): BudgetBucket | null {
  if (cat.budget_bucket != null) return cat.budget_bucket
  return getAutoBucket(groups, cat.group_name)
}

export interface StrategyData {
  pcts: { needs: number; wants: number; savings: number; label: string }
  base: 'income' | 'available_funds'
  income: number
  actuals: Record<BudgetBucket, number>
  targets: Record<BudgetBucket, number>
  needsScore: number
  wantsScore: number
  savingsScore: number
  overallScore: number
  categoryBreakdown: Record<BudgetBucket, { name: string; amount: number }[]>
}

// Pure calculation, safe to call outside a React render (e.g. from the notification
// engine) — BudgetStrategyCard.tsx's useStrategyData hook is a thin useMemo wrapper
// around this function, not the other way around.
export function computeStrategyData(state: AppState, d: DerivedMetrics): StrategyData | null {
  const pcts = getStrategyPcts(state.budget_strategy_settings)
  if (!pcts) return null

  const pattern = getIncomePattern(state.settings)

  const base = state.budget_strategy_settings.budget_strategy_base ?? 'income'

  const cycle = d.financialCycle ?? getCurrentFinancialCycle(state)
  const periodStart = cycle.cycleStart

  const income = base === 'available_funds'
    ? Math.max(0, d.availableBalance)
    : pattern === 'weekly'
      ? (state.settings.weekly_income ?? 0)
      : pattern === 'variable' || pattern === 'business'
        ? getVariableMonthlyIncome(state.settings)
        : (state.settings.monthly_salary ?? 0)

  const actuals: Record<BudgetBucket, number> = { needs: 0, wants: 0, savings: 0 }
  const catTotals: Record<BudgetBucket, Record<string, number>> = { needs: {}, wants: {}, savings: {} }
  const catMap = Object.fromEntries(state.categories.map(c => [c.id, c]))

  for (const t of state.transactions) {
    if (new Date(t.transaction_date) < periodStart) continue
    const cat = catMap[t.category_id ?? '']
    if (!cat) continue

    // System transactions are never spending
    if (t.transaction_type === 'opening_balance' || t.transaction_type === 'balance_adjustment' || t.transaction_type === 'credit_card_payment' || t.transaction_type === 'cc_opening_balance' || t.transaction_type === 'cc_balance_adjustment') continue

    let effectiveBucket: BudgetBucket | null = null

    if (t.transaction_type === 'savings_contribution') {
      effectiveBucket = 'savings'
    } else if (t.transaction_type === 'expense' || t.transaction_type === 'commitment') {
      effectiveBucket = getCategoryBucket(cat, state.groups)
    } else if (t.transaction_type === 'borrowing_repayment') {
      if (!t.is_credit) {
        effectiveBucket = cat.budget_bucket ?? 'needs'
      }
    } else {
      continue
    }

    if (!effectiveBucket) continue
    actuals[effectiveBucket] += t.amount
    catTotals[effectiveBucket][cat.name] = (catTotals[effectiveBucket][cat.name] || 0) + t.amount
  }

  const categoryBreakdown: Record<BudgetBucket, { name: string; amount: number }[]> = { needs: [], wants: [], savings: [] }
  for (const b of ['needs', 'wants', 'savings'] as BudgetBucket[]) {
    categoryBreakdown[b] = Object.entries(catTotals[b])
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
  }

  const targets = {
    needs:   Math.round(income * pcts.needs   / 100),
    wants:   Math.round(income * pcts.wants   / 100),
    savings: Math.round(income * pcts.savings / 100),
  }

  // Adherence scores: needs/wants = staying within budget, savings = hitting target
  const needsScore   = targets.needs   > 0 ? Math.max(0, Math.min(100, actuals.needs   <= targets.needs   ? 100 : Math.round((2 - actuals.needs   / targets.needs)   * 100))) : 100
  const wantsScore   = targets.wants   > 0 ? Math.max(0, Math.min(100, actuals.wants   <= targets.wants   ? 100 : Math.round((2 - actuals.wants   / targets.wants)   * 100))) : 100
  const savingsScore = targets.savings > 0 ? Math.min(100, Math.round(actuals.savings / targets.savings * 100)) : 0
  const overallScore = Math.round((needsScore + wantsScore + savingsScore) / 3)

  return { pcts, base, income, actuals, targets, needsScore, wantsScore, savingsScore, overallScore, categoryBreakdown }
}
