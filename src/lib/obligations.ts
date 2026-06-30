import type { AppState } from '@/types'
import { getCurrentFinancialCycle, getExpectedNextPrimaryIncome, type FinancialCycle } from '@/lib/financial-cycle'
import { getNextRecurringDueDate } from '@/lib/recurring'
import { getCreditCardBilling } from '@/lib/credit-card'

export interface ObligationItem { name: string; amount: number }

export interface RemainingObligations {
  total: number
  commitments: number
  savings: number
  creditCardBills: number
  borrowRepayments: number
  plannedExpenses: number
  commitmentItems: ObligationItem[]
  savingsItems: ObligationItem[]
  creditCardItems: ObligationItem[]
  borrowingItems: ObligationItem[]
  plannedExpenseItems: ObligationItem[]
}

export function getRemainingObligations(
  state: AppState,
  precomputedCycle?: FinancialCycle,
): RemainingObligations {
  const cycle = precomputedCycle ?? getCurrentFinancialCycle(state)
  const cycleStartIso = `${cycle.cycleStart.getFullYear()}-${String(cycle.cycleStart.getMonth() + 1).padStart(2, '0')}-${String(cycle.cycleStart.getDate()).padStart(2, '0')}`
  const cycleEndIso = `${cycle.cycleEnd.getFullYear()}-${String(cycle.cycleEnd.getMonth() + 1).padStart(2, '0')}-${String(cycle.cycleEnd.getDate()).padStart(2, '0')}`

  const commitmentItems: ObligationItem[] = []
  for (const c of state.commitments) {
    if (!c.is_active) continue
    if (c.is_recurring && c.last_paid_date) {
      if (new Date(c.last_paid_date) >= cycle.cycleStart) continue
    }
    const amount = c.is_recurring ? c.amount : c.remaining
    if (amount > 0) commitmentItems.push({ name: c.name, amount })
  }
  const commitments = commitmentItems.reduce((s, i) => s + i.amount, 0)

  const nextIncome = getExpectedNextPrimaryIncome(state)
  const windowEnd = nextIncome.expectedDate ?? cycle.cycleEnd

  const savingsItems: ObligationItem[] = state.savings
    .filter(s => s.is_recurring && s.is_active !== false)
    .filter(s => !(s.total_installments != null && s.current_installment >= s.total_installments))
    .filter(s => {
      const nextDue = getNextRecurringDueDate(s)
      if (nextDue === null) return false
      return nextDue >= cycle.cycleStart && nextDue <= windowEnd
    })
    .map(sv => ({ name: sv.name, amount: sv.amount }))
  const savings = savingsItems.reduce((s, i) => s + i.amount, 0)

  const creditCardItems: ObligationItem[] = state.credit_cards
    .filter(cc => cc.is_active && cc.current_balance > 0)
    .map(cc => ({ name: cc.name, amount: Math.max(0, getCreditCardBilling(cc, state.transactions).billedAmount) }))
    .filter(i => i.amount > 0)
  const creditCardBills = creditCardItems.reduce((s, i) => s + i.amount, 0)

  const borrowingItems: ObligationItem[] = state.borrowings
    .filter(b => b.direction === 'borrowed' && b.remaining_amount > 0)
    .map(b => ({ name: b.person_name, amount: b.remaining_amount }))
  const borrowRepayments = borrowingItems.reduce((s, i) => s + i.amount, 0)

  const plannedExpenseItems: ObligationItem[] = state.planned_expenses
    .filter(pe => !pe.is_completed && pe.planned_date >= cycleStartIso && pe.planned_date <= cycleEndIso)
    .map(pe => ({ name: pe.title, amount: pe.amount }))
  const plannedExpenses = plannedExpenseItems.reduce((s, i) => s + i.amount, 0)

  const total = commitments + savings + creditCardBills + borrowRepayments + plannedExpenses

  return {
    total, commitments, savings, creditCardBills, borrowRepayments, plannedExpenses,
    commitmentItems, savingsItems, creditCardItems, borrowingItems, plannedExpenseItems,
  }
}
