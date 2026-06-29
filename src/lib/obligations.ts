import type { AppState } from '@/types'
import { getCurrentFinancialCycle, type FinancialCycle } from '@/lib/financial-cycle'
import { isRecurringCompleted } from '@/lib/recurring'
import { getCreditCardBilling } from '@/lib/credit-card'

export interface RemainingObligations {
  total: number
  commitments: number
  savings: number
  creditCardBills: number
  borrowRepayments: number
  plannedExpenses: number
}

export function getRemainingObligations(
  state: AppState,
  precomputedCycle?: FinancialCycle,
): RemainingObligations {
  const cycle = precomputedCycle ?? getCurrentFinancialCycle(state)
  const cycleStartIso = `${cycle.cycleStart.getFullYear()}-${String(cycle.cycleStart.getMonth() + 1).padStart(2, '0')}-${String(cycle.cycleStart.getDate()).padStart(2, '0')}`
  const cycleEndIso = `${cycle.cycleEnd.getFullYear()}-${String(cycle.cycleEnd.getMonth() + 1).padStart(2, '0')}-${String(cycle.cycleEnd.getDate()).padStart(2, '0')}`

  const commitments = state.commitments
    .filter(c => c.is_active)
    .reduce((s, c) => {
      if (c.is_recurring && c.last_paid_date) {
        if (new Date(c.last_paid_date) >= cycle.cycleStart) return s
      }
      return s + (c.is_recurring ? c.amount : c.remaining)
    }, 0)

  const savings = state.savings
    .filter(s => s.is_recurring && s.is_active !== false)
    .filter(s => !(s.total_installments != null && s.current_installment >= s.total_installments))
    .filter(s => !isRecurringCompleted(s.last_contribution_date, s.frequency))
    .reduce((s, sv) => s + sv.amount, 0)

  const creditCardBills = state.credit_cards
    .filter(cc => cc.is_active && cc.current_balance > 0)
    .reduce((s, cc) => {
      const billing = getCreditCardBilling(cc, state.transactions)
      return s + Math.max(0, billing.billedAmount)
    }, 0)

  const borrowRepayments = state.borrowings
    .filter(b => b.direction === 'borrowed' && b.remaining_amount > 0)
    .reduce((s, b) => s + b.remaining_amount, 0)

  const plannedExpenses = state.planned_expenses
    .filter(pe => !pe.is_completed && pe.planned_date >= cycleStartIso && pe.planned_date <= cycleEndIso)
    .reduce((s, pe) => s + pe.amount, 0)

  const total = commitments + savings + creditCardBills + borrowRepayments + plannedExpenses

  return { total, commitments, savings, creditCardBills, borrowRepayments, plannedExpenses }
}
