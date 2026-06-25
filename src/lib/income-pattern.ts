import type { IncomePattern, Settings } from '@/types'

export function getIncomePattern(settings: Settings): IncomePattern {
  return settings.income_pattern ?? 'monthly'
}

export const INCOME_PATTERN_OPTIONS: { value: IncomePattern; label: string; description: string }[] = [
  { value: 'monthly',  label: 'Monthly Salary',              description: 'Fixed salary credited each month' },
  { value: 'weekly',   label: 'Weekly Income',               description: 'Paid weekly on a specific day' },
  { value: 'variable', label: 'Daily / Variable Income',     description: 'Irregular or daily earnings' },
  { value: 'business', label: 'Business Owner / Self Employed', description: 'Business income or owner drawings' },
]

export function getVariableMonthlyIncome(settings: Settings): number {
  const pattern = getIncomePattern(settings)
  if (pattern === 'variable') {
    return (settings.average_daily_income ?? 0) * (settings.working_days_per_week ?? 6) * 4.3
  }
  if (pattern === 'business') {
    return settings.business_monthly_drawings ?? 0
  }
  return 0
}

export function suggestBudgetByIncomePattern(pattern: IncomePattern, income: number | null): number | null {
  if (!income || income <= 0) return null
  switch (pattern) {
    case 'monthly':
      return Math.round(income / 4.3 / 500) * 500
    case 'weekly':
      return Math.round(income / 500) * 500
    case 'variable':
    case 'business':
      return null
  }
}
