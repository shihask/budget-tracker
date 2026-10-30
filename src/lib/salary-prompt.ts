import type { AppState, Transaction } from '@/types'
import { getIncomePattern } from '@/lib/income-pattern'
import { INCOME_GROUP } from '@/lib/constants'
import { localIso } from '@/lib/utils'
import {
  isPrimaryIncomeTransaction, parseTxDate, getClusterWindow, getEarlyPaydayTolerance,
} from '@/lib/financial-cycle'

// "Did your salary come in?" — asked on and after payday until the salary is recorded.
// Monthly income pattern with a salary date only; other patterns have no single payday.

/** How long after payday we keep asking. The cycle engine's own late-salary window:
 *  a salary recorded later than this wouldn't anchor the cycle to this payday anyway. */
export const SALARY_PROMPT_DAYS = getClusterWindow('monthly')

const MS_DAY = 86400000
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** The latest salary day on or before `today` (clamped to short months). */
export function latestPayday(salaryDate: number, today: Date): Date {
  const y = today.getFullYear(), m = today.getMonth()
  const thisMonth = new Date(y, m, Math.min(salaryDate, new Date(y, m + 1, 0).getDate()))
  if (today.getDate() >= thisMonth.getDate()) return thisMonth
  return new Date(y, m - 1, Math.min(salaryDate, new Date(y, m, 0).getDate()))
}

function primaryIncomes(state: AppState): Transaction[] {
  return state.transactions
    .filter(t => isPrimaryIncomeTransaction(t, state))
    .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))
}

/** The payday the prompt is asking about, or null when there is nothing to ask:
 *  not a monthly earner, no salary date, payday too long ago, or a salary already
 *  recorded for it (an early salary — up to the engine's early tolerance — counts). */
export function pendingSalaryPayday(state: AppState, now: Date = new Date()): Date | null {
  if (getIncomePattern(state.settings) !== 'monthly') return null
  const sd = state.settings.salary_date
  if (sd == null || sd < 1 || sd > 31) return null
  if (!state.accounts.some(a => a.is_active)) return null

  const today = midnight(now)
  const payday = latestPayday(sd, today)
  if ((today.getTime() - payday.getTime()) / MS_DAY > SALARY_PROMPT_DAYS) return null

  const earliest = new Date(payday.getFullYear(), payday.getMonth(), payday.getDate() - getEarlyPaydayTolerance('monthly'))
  const recorded = primaryIncomes(state).some(t => parseTxDate(t.transaction_date) >= earliest)
  return recorded ? null : payday
}

export interface SalaryDefaults {
  amount: number | null
  accountId: string
  categoryId: string | null
}

/** Prefill: the configured monthly salary (else the last salary's amount), the
 *  account the last salary landed in (else the first active bank account), and
 *  the primary income category (else "Salary"). All editable in the sheet. */
export function salaryDefaults(state: AppState): SalaryDefaults {
  const last = primaryIncomes(state)[0]
  const active = state.accounts.filter(a => a.is_active)
  const lastAccount = last?.from_account_id && active.find(a => a.id === last.from_account_id)
  const account = lastAccount || active.find(a => a.type === 'bank') || active[0]

  const salaryCat = state.categories.find(c => c.group_name === INCOME_GROUP && c.name.toLowerCase() === 'salary')
  return {
    amount: state.settings.monthly_salary || last?.amount || null,
    accountId: account?.id ?? '',
    categoryId: state.settings.primary_income_category_id || salaryCat?.id || last?.category_id || null,
  }
}

/** "Not yet received" (or closing the sheet) hides the prompt for the rest of the local day. */
export const salaryPromptSnoozeKey = (uid: string) => `mp_salary_prompt_snoozed_${uid}`

export function isSalaryPromptSnoozed(uid: string, now: Date = new Date()): boolean {
  try { return localStorage.getItem(salaryPromptSnoozeKey(uid)) === localIso(now) } catch { return false }
}

export function snoozeSalaryPrompt(uid: string, now: Date = new Date()): void {
  try { localStorage.setItem(salaryPromptSnoozeKey(uid), localIso(now)) } catch { /* storage blocked: it asks again next open */ }
}
