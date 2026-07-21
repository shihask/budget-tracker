import { useRef, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import type { ColorTokens } from '@/lib/tokens'
import { parseExpenseWithAI, extractReceiptWithAI, type AIReceiptExtraction } from '@/lib/gemini'
import { compressImage, type PickedReceipt } from '@/lib/imageCompress'
import { buildCashFlowForecast } from '@/lib/cashflow'
import { MintAnimation } from './MintAnimation'
import { CategorySelect } from './CategorySelect'
import { Camera } from 'lucide-react'
import type { AppState, DerivedMetrics, Transaction, Category } from '@/types'
import { INCOME_GROUP, ADJUSTMENT_GROUP } from '@/lib/constants'
import { getIncomePattern } from '@/lib/income-pattern'
import { getCurrentFinancialCycle } from '@/lib/financial-cycle'
import { computeChallenge } from '@/lib/challenge'
import { getStrategyPcts, getCategoryBucket } from './BudgetStrategyCard'
import { getCreditCardBilling } from '@/lib/credit-card'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-categorize`

const CHART_COLORS = ['#16C98A', '#F97316', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B']

type SavedExpense = { description: string; amount: number; account: string; category: string; date: string }
type EditPrompt = {
  transaction: Transaction
  field: 'amount' | 'description' | 'category'
  newAmount?: number
  newDescription?: string
  newCategoryId?: string
  newCategoryName?: string
}
type DeletePrompt = { transaction: Transaction }
type ChartItem = { name: string; amount: number; pct: number; color: string }
type ChartData =
  | { type: 'categories'; items: ChartItem[]; total: number }
  | { type: 'budget'; spent: number; budget: number }
  | { type: 'monthly'; thisMonth: number; lastMonth: number; income: number }
type SummaryCard = { icon: string; label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }
type ReceiptPrompt = {
  receipt: PickedReceipt
  description: string
  amount: number
  transactionDate: string
  categoryId: string | null
  categorySuggestion: { name: string; group: string } | null
  accountId: string
  confidence: 'high' | 'low'
}
type Message = { role: 'user' | 'ai'; text: string; savedExpense?: SavedExpense; warning?: boolean; editPrompt?: EditPrompt; deletePrompt?: DeletePrompt; chartData?: ChartData; summaryCards?: SummaryCard[]; actionChips?: string[]; receiptPrompt?: ReceiptPrompt; imagePreviewUrl?: string }

function shouldShowChart(question: string): 'categories' | 'budget' | 'monthly' | null {
  const q = question.toLowerCase()
  if (/\b(last month|compare|this month vs)\b/.test(q)) return 'monthly'
  if (/\b(budget|weekly budget|overspend|recovery|on track)\b/.test(q)) return 'budget'
  if (/\b(categor|breakdown|story|summary|where did|spending|happened|balance low|where.?my|what drove)\b/.test(q)) return 'categories'
  return null
}

function buildCategoryChart(state: AppState): ChartData {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const catTotals: Record<string, number> = {}
  state.transactions
    .filter(t => new Date(t.transaction_date) >= monthStart && t.transaction_type === 'expense')
    .forEach(t => {
      const name = state.categories.find(c => c.id === t.category_id)?.name ?? 'Uncategorized'
      catTotals[name] = (catTotals[name] ?? 0) + t.amount
    })
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const total = sorted.reduce((s, [, v]) => s + v, 0)
  return {
    type: 'categories',
    total,
    items: sorted.map(([name, amount], i) => ({
      name, amount,
      pct: total > 0 ? Math.round((amount / total) * 100) : 0,
      color: CHART_COLORS[i % CHART_COLORS.length],
    })),
  }
}

function buildBudgetChart(d: DerivedMetrics): ChartData {
  return { type: 'budget', spent: d.weeklySpent, budget: d.weeklyBudget }
}

function buildMonthlyChart(state: AppState): ChartData {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const thisMonth = state.transactions
    .filter(t => new Date(t.transaction_date) >= monthStart && t.transaction_type === 'expense')
    .reduce((s, t) => s + t.amount, 0)
  const lastMonth = state.transactions
    .filter(t => { const dt = new Date(t.transaction_date); return dt >= lastMonthStart && dt <= lastMonthEnd && t.transaction_type === 'expense' })
    .reduce((s, t) => s + t.amount, 0)
  const income = state.transactions
    .filter(t => new Date(t.transaction_date) >= monthStart && t.transaction_type === 'income')
    .reduce((s, t) => s + t.amount, 0)
  return { type: 'monthly', thisMonth, lastMonth, income }
}

function buildSummaryCards(state: AppState, d: DerivedMetrics, question: string): SummaryCard[] | null {
  const q = question.toLowerCase()

  if (/survive|afford|enough|make it|tight|last until/i.test(q)) {
    const daysLeft = d.cycleDaysLeft ?? 0
    const dailySafe = Math.round(d.safeDailySpend ?? 0)
    const freeMoney = d.realFreeMoney ?? 0
    return [
      {
        icon: '💰', label: 'Free Money',
        value: `₹${freeMoney.toLocaleString()}`,
        tone: freeMoney < 0 ? 'bad' : freeMoney < 2000 ? 'warn' : 'good',
      },
      {
        icon: '📅', label: 'Days Left',
        value: `${daysLeft}`,
        sub: 'until salary',
        tone: daysLeft <= 3 ? 'warn' : 'neutral',
      },
      {
        icon: '📊', label: 'Daily Safe Spend',
        value: `₹${dailySafe.toLocaleString()}/day`,
        tone: dailySafe < 500 ? 'warn' : 'good',
      },
    ]
  }

  if (/budget|overspend|weekly spend/i.test(q)) {
    const pct = d.weeklyBudget > 0 ? Math.round((d.weeklySpent / d.weeklyBudget) * 100) : 0
    const remaining = d.weeklyBudget - d.weeklySpent
    return [
      {
        icon: '🎯', label: 'Weekly Budget',
        value: `₹${d.weeklyBudget.toLocaleString()}`,
        tone: 'neutral',
      },
      {
        icon: '💸', label: 'Spent',
        value: `₹${d.weeklySpent.toLocaleString()}`,
        sub: `${pct}% used`,
        tone: pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'good',
      },
      {
        icon: '✅', label: 'Remaining',
        value: `₹${Math.max(0, remaining).toLocaleString()}`,
        tone: remaining < 0 ? 'bad' : 'good',
      },
    ]
  }

  if (/financial health|how am i doing|overall/i.test(q)) {
    const activeAccs = state.accounts.filter(a => a.is_active)
    const totalBalance = activeAccs.reduce((s, a) => s + a.current_balance, 0)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthlySpend = state.transactions
      .filter(t => new Date(t.transaction_date) >= monthStart && t.transaction_type === 'expense')
      .reduce((s, t) => s + t.amount, 0)
    const freeMoney = d.realFreeMoney ?? 0
    return [
      { icon: '🏦', label: 'Balance', value: `₹${totalBalance.toLocaleString()}`, tone: 'neutral' },
      { icon: '📉', label: 'Month Spend', value: `₹${monthlySpend.toLocaleString()}`, tone: 'neutral' },
      { icon: '💰', label: 'Free Money', value: `₹${freeMoney.toLocaleString()}`, tone: freeMoney < 0 ? 'bad' : freeMoney < 2000 ? 'warn' : 'good' },
    ]
  }

  return null
}

function buildActionChips(question: string): string[] {
  const q = question.toLowerCase()
  if (/survive|afford|enough|make it/i.test(q)) return ['View Spending', 'Recovery Plan', 'Show Forecast']
  if (/budget|overspend/i.test(q)) return ['View Budget', 'Show Spending', 'Show Chart']
  return []
}

function guessTransactionType(text: string): 'income' | 'expense' {
  const lower = text.toLowerCase()
  return /\b(received|receive|salary|income|earned|earn|credited|got paid|deposited|deposit)\b/.test(lower)
    ? 'income'
    : 'expense'
}

const FINANCE_QUERY_WORDS = [
  'expense', 'expenses', 'spend', 'spent', 'spending',
  'budget', 'balance', 'category', 'categories',
  'transaction', 'transactions', 'summary', 'report',
  'analytics', 'compare', 'remaining', 'total', 'monthly', 'weekly',
  'saving', 'savings', 'investment', 'investments', 'invest',
  'sip', 'mutual fund', 'fd', 'fixed deposit', 'rd', 'recurring deposit',
  'gold', 'ppf', 'nps', 'chit', 'kuri', 'portfolio', 'contribution',
  'maturity', 'prized', 'corpus',
]

function classifyIntent(text: string): 'question' | 'edit' | 'delete' | 'transaction' {
  const q = text.toLowerCase().trim()

  // Stage 1: question keywords or finance query words → never try to parse as transaction
  if (/\b(what|how|why|show|compare|give|list|tell|which|when|am i|did i|can i)\b/.test(q)) return 'question'
  if (FINANCE_QUERY_WORDS.some(w => q.includes(w))) return 'question'

  // Stage 2a: delete intent
  if (/\b(delete|remove)\b/.test(q)) return 'delete'

  // Stage 2b: edit intent
  if (/\b(change|edit|update|fix|wrong|replace|correct|rename|recategorize|categorize)\b/.test(q)) return 'edit'

  // Stage 3: contains a number → likely a transaction entry
  if (/\d/.test(q)) return 'transaction'

  return 'question'
}

// Intent selects which context modules get sent to the AI.
// Hard caps on list lengths keep token cost fixed regardless of transaction history size.
type ContextIntent = 'spending' | 'budget' | 'financial_health' | 'networth' | 'goals' | 'borrowings' | 'investments' | 'general'

// Module token budgets — these caps are what keep context size stable as data grows.
const CTX_LIMITS = {
  categories: 5,   // top N spending categories
  recurring: 3,    // top N recurring patterns
  recent: 4,       // most recent transactions
  goals: 3,        // active goals shown
  borrowers: 5,    // people in lent/owed lists (each side)
}

function classifyContextIntent(text: string): ContextIntent {
  const q = text.toLowerCase()
  if (/\b(invest|sip|mutual fund|portfolio|gold|chit|kuri|ppf|nps|rd|fd|fixed deposit|recurring deposit)\b/.test(q)) return 'investments'
  if (/\b(goal|target|save for|saving up|wedding|trip|house|plan for)\b/.test(q)) return 'goals'
  if (/\b(who owes|owe me|lent to|borrowed from|cc bill|outstanding dues?)\b/.test(q)) return 'borrowings'
  if (/\b(net worth|total wealth|how much do i have)\b/.test(q)) return 'networth'
  // financial_health: situational questions that need the full picture but not category drill-down
  if (/\b(how am i doing|am i doing (ok|well|good)|good position|afford|can i buy|current situation|financial health|overall|real situation|position right now|safe to|is it ok to)\b/.test(q)) return 'financial_health'
  if (/\b(budget|weekly|overspend|daily limit|challenge|on track|recovery|free money|free cash|strategy|needs|wants|50.30|60.20|allocation)\b/.test(q)) return 'budget'
  if (/\b(spend|spent|spending|categor|summary|where did|breakdown|expense|this month|last month|compare|story|happened|balance low)\b/.test(q)) return 'spending'
  return 'general'
}

function buildContext(state: AppState, d: DerivedMetrics, intent: ContextIntent = 'general'): string {
  const activeAccs = state.accounts.filter(a => a.is_active)
  const totalBalance = activeAccs.reduce((s, a) => s + a.current_balance, 0)

  const now = new Date()
  const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const isBorrowingTx = (t: Transaction) =>
    t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment'

  const isSystemTx = (t: Transaction) =>
    t.transaction_type === 'opening_balance' ||
    t.transaction_type === 'balance_adjustment' ||
    t.transaction_type === 'cc_opening_balance' ||
    t.transaction_type === 'cc_balance_adjustment'

  // ── Pre-compute aggregates used across multiple modules ──
  const thisMonthTxns = state.transactions.filter(t =>
    new Date(t.transaction_date) >= monthStart && t.transaction_type === 'expense' && !isSystemTx(t)
  )
  const lastMonthTxns = state.transactions.filter(t => {
    const dt = new Date(t.transaction_date)
    return dt >= lastMonthStart && dt <= lastMonthEnd && t.transaction_type === 'expense' && !isSystemTx(t)
  })
  const thisMonthIncome = state.transactions
    .filter(t => new Date(t.transaction_date) >= monthStart && t.transaction_type === 'income' && !isSystemTx(t))
    .reduce((s, t) => s + t.amount, 0)
  const thisMonthTransfers = state.transactions
    .filter(t => new Date(t.transaction_date) >= monthStart && t.transaction_type === 'transfer')
    .reduce((s, t) => s + t.amount, 0)
  const savingsContrib = state.transactions
    .filter(t => new Date(t.transaction_date) >= monthStart && t.transaction_type === 'savings_contribution')
    .reduce((s, t) => s + t.amount, 0)
  const savingsWithdraw = state.transactions
    .filter(t => new Date(t.transaction_date) >= monthStart && t.transaction_type === 'savings_withdrawal')
    .reduce((s, t) => s + t.amount, 0)

  const monthlySpend = thisMonthTxns.reduce((s, t) => s + t.amount, 0)
  const lastMonthSpend = lastMonthTxns.reduce((s, t) => s + t.amount, 0)
  const monthStartBalance = Math.round(totalBalance + monthlySpend - thisMonthIncome)
  const trackingDays = new Set(thisMonthTxns.map(t => t.transaction_date)).size
  const trackingCount = thisMonthTxns.length

  const transferNote = thisMonthTransfers > 0 ? ` | transfers:₹${thisMonthTransfers.toLocaleString()} (internal)` : ''
  const savingsNote = (savingsContrib > 0 || savingsWithdraw > 0)
    ? ` | savings-contrib:₹${savingsContrib.toLocaleString()} savings-withdraw:₹${savingsWithdraw.toLocaleString()}`
    : ''

  // ── MODULE: Core (always sent) ──
  const parts: string[] = []
  parts.push(
    `Date:${localDateStr} Balance:₹${totalBalance.toLocaleString()} MonthStartBalance(approx):₹${monthStartBalance.toLocaleString()} Emergency:₹${d.emergencyFund.toLocaleString()} FreeMoney:₹${d.realFreeMoney.toLocaleString()}` +
    `\nAccounts: ${activeAccs.map(a => `${a.name}:₹${a.current_balance.toLocaleString()}`).join(' | ')}` +
    `\nSpend: this-month ₹${monthlySpend.toLocaleString()} | income ₹${thisMonthIncome.toLocaleString()} | last-month ₹${lastMonthSpend.toLocaleString()}${transferNote}${savingsNote}` +
    `\nTracking: ${trackingCount} transactions across ${trackingDays} days this month` +
    (d.isWaitingForIncome
      ? `\nFinancial-Cycle: WAITING for income (expected ${d.expectedIncomeDate ? new Date(d.expectedIncomeDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'unknown'}). Current cycle started ${d.financialCycle?.startLabel ?? 'unknown'}. Salary/income has NOT been received yet. Safe daily spend: ₹0 until income is recorded.`
      : d.financialCycle
      ? `\nFinancial-Cycle: active since ${d.financialCycle.startLabel}, ${d.cycleDaysLeft}d left, safe-daily:₹${Math.round(d.safeDailySpend).toLocaleString()} safe-weekly:₹${Math.round(d.safeWeeklySpend).toLocaleString()}`
      : '')
  )

  // ── MODULE: Cash flow forecast (always sent — answers "enough before salary?" / affordability) ──
  {
    const fc = buildCashFlowForecast(state, d)
    const upcoming = fc.projections.slice(0, 8)
      .map(p => `${p.event.date} ${p.event.type === 'income' ? '+' : '-'}₹${p.event.amount.toLocaleString()} ${p.event.title}(${p.event.source})→₹${p.balanceAfter.toLocaleString()}`)
      .join(' | ')
    parts.push(
      `Cash-flow forecast (known events, next 60d; spendable-now ₹${fc.currentBalance.toLocaleString()}):` +
      `\nLowest projected ₹${fc.lowestBalance.toLocaleString()}${fc.lowestBalanceDate ? ` on ${fc.lowestBalanceDate}` : ''}` +
      `${fc.nextSalaryDate
        ? ` | ${getIncomePattern(state.settings) === 'monthly' ? 'next salary' : 'next income'} ${fc.nextSalaryDate}`
        : getIncomePattern(state.settings) === 'monthly'
        ? ' | next salary: unknown'
        : getIncomePattern(state.settings) === 'weekly'
        ? ' | next income: unknown'
        : ' | no projected income available yet'}` +
      `${upcoming ? `\nUpcoming: ${upcoming}` : ''}`
    )
  }

  // ── MODULE: Spending breakdown ──
  // spending: full detail (categories, recurring, recent) capped at CTX_LIMITS
  // general: same but also shown as a broad fallback
  // financial_health / budget: NOT included — those don't need category drill-down
  if (['spending', 'general'].includes(intent)) {
    const todayTxns = state.transactions.filter(t =>
      t.transaction_date === localDateStr && t.transaction_type === 'expense'
    )
    const todaySpend = todayTxns.reduce((s, t) => s + t.amount, 0)
    const todayStr = todayTxns.length > 0
      ? todayTxns.map(t => `${t.description} ₹${t.amount.toLocaleString()} (${state.categories.find(c => c.id === t.category_id)?.name ?? 'Uncategorized'})`).join(' | ')
      : 'none'

    const catTotals: Record<string, number> = {}
    thisMonthTxns.forEach(t => {
      const name = state.categories.find(c => c.id === t.category_id)?.name ?? 'Uncategorized'
      catTotals[name] = (catTotals[name] ?? 0) + t.amount
    })
    const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, CTX_LIMITS.categories)
      .map(([n, v]) => `${n}: ₹${v.toLocaleString()}`).join(', ')

    const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(now.getDate() - 90)
    const descCount: Record<string, { count: number; total: number }> = {}
    state.transactions
      .filter(t => new Date(t.transaction_date) >= ninetyDaysAgo && t.transaction_type === 'expense')
      .forEach(t => {
        const key = t.description.toLowerCase().trim()
        if (!descCount[key]) descCount[key] = { count: 0, total: 0 }
        descCount[key].count++; descCount[key].total += t.amount
      })
    const recurring = Object.entries(descCount).filter(([, v]) => v.count >= 3)
      .sort((a, b) => b[1].total - a[1].total).slice(0, CTX_LIMITS.recurring)
      .map(([name, v]) => `${name} (${v.count}x, avg ₹${Math.round(v.total / v.count).toLocaleString()})`).join(', ')

    const recent = state.transactions.slice(0, CTX_LIMITS.recent).map(t => {
      const catName = state.categories.find(c => c.id === t.category_id)?.name ?? ''
      return `${t.transaction_date} ${t.description} ₹${t.amount} ${catName} [${isBorrowingTx(t) ? 'balance-sheet' : t.transaction_type}]`
    }).join('\n')

    parts.push(
      `Today(${localDateStr}): ₹${todaySpend.toLocaleString()} | ${todayStr}` +
      `\nCategories(month): ${topCats || 'no data'}` +
      `\nRecurring(90d): ${recurring || 'none'}` +
      `\nRecent:\n${recent}`
    )
  }

  // ── MODULE: Budget & challenge ──
  // spending gets just the budget line (no challenge detail — not relevant to category analysis)
  // budget / financial_health / general get the full challenge block
  if (['budget', 'spending', 'financial_health', 'general'].includes(intent)) {
    const pct = Math.round(d.weeklySpent / d.weeklyBudget * 100)
    parts.push(`Budget: weekly ₹${d.weeklyBudget.toLocaleString()} spent ₹${d.weeklySpent.toLocaleString()} (${pct}% used)`)

    if (state.settings.challenge_enabled && intent !== 'spending') {
      const diff = state.settings.challenge_difficulty ?? 'medium'
      const ch = computeChallenge(state, diff, d.realFreeMoney, d.financialCycle)
      const streak = state.settings.challenge_streak ?? 0
      const totalDays = state.settings.challenge_total_days ?? 0
      const successDays = state.settings.challenge_success_days ?? 0
      const successRate = totalDays >= 3 ? `${Math.round((successDays / totalDays) * 100)}% (${successDays}/${totalDays})` : 'starting'
      parts.push(`DailyChallenge: difficulty:${diff} target:₹${Math.round(ch.adjustedTarget).toLocaleString()} spent-today:₹${Math.round(ch.spentToday).toLocaleString()} remaining:₹${Math.round(ch.remaining).toLocaleString()} status:${ch.status} streak:${streak}-days success-rate:${successRate} plant:${ch.plantGrowth.milestoneLabel} salary-pace:${ch.survivalStatus} safe-daily:₹${Math.round(ch.safeDailyLimit).toLocaleString()}`)
    }
  }

  // ── MODULE: Credit cards ──
  // NOT sent for spending or budget (they don't need CC details)
  if (['borrowings', 'networth', 'financial_health', 'general'].includes(intent)) {
    const activeCCs = (state.credit_cards ?? []).filter(cc => cc.is_active)
    if (activeCCs.length > 0) {
      parts.push(`CreditCards: ${activeCCs.map(cc => {
        const last = cc.last_four ? ` •${cc.last_four}` : ''
        const billing = getCreditCardBilling(cc, state.transactions)
        return `${cc.name}${last} total ₹${Math.round(cc.current_balance).toLocaleString('en-IN')} (billed ₹${Math.round(billing.billedAmount).toLocaleString('en-IN')} + unbilled ₹${Math.round(billing.unbilledAmount).toLocaleString('en-IN')}) / limit ₹${Math.round(cc.credit_limit).toLocaleString('en-IN')}`
      }).join(' | ')}`)
    }
  }

  // ── MODULE: Borrowings ──
  // borrowings / networth: full per-person list (capped at CTX_LIMITS.borrowers each side)
  // financial_health / general: totals only — enough for situational awareness
  // spending / budget: omitted — category drill-down doesn't need balance-sheet data
  if (state.settings.track_borrowings) {
    const lent = state.borrowings.filter(b => b.direction === 'lent' && b.remaining_amount > 0)
    const borrowed = state.borrowings.filter(b => b.direction === 'borrowed' && b.remaining_amount > 0)
    const totalLent = lent.reduce((s, b) => s + b.remaining_amount, 0)
    const totalOwed = borrowed.reduce((s, b) => s + b.remaining_amount, 0)

    if (['borrowings', 'networth'].includes(intent)) {
      const lentStr = lent.slice(0, CTX_LIMITS.borrowers).map(b => `${b.person_name} ₹${b.remaining_amount.toLocaleString()}`).join(', ') || 'none'
      const owedStr = borrowed.slice(0, CTX_LIMITS.borrowers).map(b => `${b.person_name} ₹${b.remaining_amount.toLocaleString()}`).join(', ') || 'none'
      parts.push(`Borrowings[balance-sheet]: owed-to-you: ${lentStr} (₹${totalLent.toLocaleString()}) | you-owe: ${owedStr} (₹${totalOwed.toLocaleString()})`)
    } else if (['financial_health', 'general'].includes(intent) && (totalLent > 0 || totalOwed > 0)) {
      parts.push(`Borrowings[balance-sheet]: owed-to-you:₹${totalLent.toLocaleString()} you-owe:₹${totalOwed.toLocaleString()} (recoverable, not real spend)`)
    }
  }

  // ── MODULE: Bills & obligations ──
  // spending intent omitted — bills are commitments, not category spend
  if (['budget', 'goals', 'financial_health', 'general'].includes(intent)) {
    const activeCommitments = (state.commitments ?? []).filter(c => c.is_active)
    if (activeCommitments.length > 0) {
      parts.push(`BillsAndObligations: ${activeCommitments.map(c => {
        const paid = c.remaining < c.amount
        const dueStr = c.due_day ? ` due-day:${c.due_day}` : ''
        return `${c.name} ₹${c.amount.toLocaleString()}${dueStr} [${paid ? 'paid' : 'unpaid'}]`
      }).join(' | ')} | remaining-unpaid: ₹${d.remainingCommitments.toLocaleString()}`)
    }
  }

  // ── MODULE: Goals ──
  // financial_health gets goals too — needed to answer "can I afford X" questions
  if (['goals', 'financial_health', 'general'].includes(intent)) {
    const activeGoals = (state.goals ?? []).filter(g => g.is_active)
    if (activeGoals.length > 0) {
      parts.push(`Goals: ${activeGoals.slice(0, CTX_LIMITS.goals).map(g => {
        const pct = g.goal_amount > 0 ? Math.round((g.current_saved / g.goal_amount) * 100) : 0
        const tDate = new Date(g.target_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
        return `${g.name}(${g.goal_type}) ${pct}% · ₹${g.current_saved.toLocaleString()}/${g.goal_amount.toLocaleString()} by ${tDate}`
      }).join(' | ')}`)
    }
  }

  // ── MODULE: Savings & investments ──
  // investments / goals / networth: full per-instrument detail
  // financial_health / general: summary totals only
  // spending / budget: omitted
  const activeSavings = (state.savings ?? []).filter(s => s.is_active)
  if (activeSavings.length > 0) {
    const totalMonthly = activeSavings.filter(s => s.is_recurring && s.frequency === 'monthly').reduce((a, s) => a + s.amount, 0)
    const totalContributed = activeSavings.reduce((a, s) => a + s.current_installment * s.amount, 0)
    const totalPortfolio = activeSavings.filter(s => s.current_value > 0).reduce((a, s) => a + s.current_value, 0)

    if (['investments', 'goals', 'networth'].includes(intent)) {
      const portfolioStr = totalPortfolio > 0 ? ` | portfolio-value:₹${totalPortfolio.toLocaleString()}` : ''
      const items = activeSavings.map(s => {
        const contributed = s.current_installment * s.amount
        const progress = s.total_installments ? `${s.current_installment}/${s.total_installments}` : `${s.current_installment} done`
        const valueStr = s.current_value > 0 ? ` current-value:₹${s.current_value.toLocaleString()}` : ''
        const prizedStr = s.type === 'chit'
          ? s.is_prized
            ? ` [prized at month ${s.prize_month ?? '?'} prize-received:₹${s.current_value.toLocaleString()}${s.total_installments && s.current_installment < s.total_installments ? ` remaining:${s.total_installments - s.current_installment}-installments=₹${((s.total_installments - s.current_installment) * s.amount).toLocaleString()}` : ''}]`
            : ` [unprized]`
          : ''
        const dueStr = s.due_day ? ` due-day:${s.due_day}` : ''
        return `${s.name}(${s.type}) ₹${s.amount.toLocaleString()}/${s.frequency ?? 'one-time'} contributed:₹${contributed.toLocaleString()} [${progress}]${valueStr}${prizedStr}${dueStr}`
      }).join(' | ')
      parts.push(`SavingsAndInvestments: monthly-commitment:₹${totalMonthly.toLocaleString()} total-contributed:₹${totalContributed.toLocaleString()}${portfolioStr} | ${items}`)
    } else if (['financial_health', 'general'].includes(intent)) {
      const portfolioStr = totalPortfolio > 0 ? ` portfolio-value:₹${totalPortfolio.toLocaleString()}` : ''
      parts.push(`Savings: monthly-commitment:₹${totalMonthly.toLocaleString()} total-contributed:₹${totalContributed.toLocaleString()}${portfolioStr}`)
    }
  }

  // ── MODULE: Budget Strategy ──
  // Relevant for financial_health / budget / general
  if (['financial_health', 'budget', 'general'].includes(intent)) {
    const stratPcts = getStrategyPcts(state.budget_strategy_settings)
    if (stratPcts) {
      const stratStart = (d.financialCycle ?? getCurrentFinancialCycle(state)).cycleStart
      const stratIncome = state.transactions
        .filter(t => t.transaction_type === 'income' && new Date(t.transaction_date) >= stratStart)
        .reduce((s, t) => s + t.amount, 0)
      const catMap = Object.fromEntries(state.categories.map(c => [c.id, c]))
      const actuals: Record<string, number> = { needs: 0, wants: 0, savings: 0 }
      for (const t of state.transactions) {
        if (new Date(t.transaction_date) < stratStart) continue
        const cat = catMap[t.category_id ?? '']
        if (!cat) continue
        let bucket: string | null = null
        if (t.transaction_type === 'opening_balance' || t.transaction_type === 'balance_adjustment' || t.transaction_type === 'credit_card_payment' || t.transaction_type === 'cc_opening_balance' || t.transaction_type === 'cc_balance_adjustment') {
          continue  // system transactions never count toward strategy
        } else if (t.transaction_type === 'savings_contribution') {
          bucket = 'savings'
        } else if (t.transaction_type === 'expense' || t.transaction_type === 'commitment') {
          bucket = getCategoryBucket(cat, state.groups)
        } else if (t.transaction_type === 'borrowing_repayment' && !t.is_credit) {
          bucket = cat.budget_bucket ?? 'needs'
        }
        if (!bucket) continue
        actuals[bucket] += t.amount
      }
      const targets = {
        needs:   Math.round(stratIncome * stratPcts.needs   / 100),
        wants:   Math.round(stratIncome * stratPcts.wants   / 100),
        savings: Math.round(stratIncome * stratPcts.savings / 100),
      }
      const pctUsed = (actual: number, target: number) => target > 0 ? `${Math.round(actual / target * 100)}%` : 'no-target'
      parts.push(
        `BudgetStrategy: ${stratPcts.label} | income:₹${stratIncome.toLocaleString()} | ` +
        `needs:₹${actuals.needs.toLocaleString()}/₹${targets.needs.toLocaleString()}(${pctUsed(actuals.needs, targets.needs)}) ` +
        `wants:₹${actuals.wants.toLocaleString()}/₹${targets.wants.toLocaleString()}(${pctUsed(actuals.wants, targets.wants)}) ` +
        `savings:₹${actuals.savings.toLocaleString()}/₹${targets.savings.toLocaleString()}(${pctUsed(actuals.savings, targets.savings)})`
      )
    }
  }

  // ── Hard ceiling for 'general' intent ──
  // ~1600 chars ≈ 400 tokens. Drop lowest-priority modules first so current
  // liabilities (budget, credit cards, borrowings) are always preserved.
  if (intent === 'general') {
    const MAX_CHARS = 1600
    const dropOrder = ['Goals:', 'Savings:', 'BillsAndObligations:']
    for (const prefix of dropOrder) {
      if (parts.join('\n').length <= MAX_CHARS) break
      const idx = parts.findIndex(p => p.startsWith(prefix))
      if (idx !== -1) parts.splice(idx, 1)
    }
  }

  return parts.join('\n')
}

type ParsedEdit =
  | { type: 'amount'; description: string; oldAmount: number | null; newAmount: number }
  | { type: 'description'; oldDescription: string; newDescription: string }
  | { type: 'category'; description: string; newCategoryId: string; newCategoryName: string }
  | { type: 'category_not_found'; description: string; attempted: string }

function findCategory(name: string, categories: Category[]): Category | null {
  const lower = name.toLowerCase().trim()
  return (
    categories.find(c => c.name.toLowerCase() === lower) ??
    categories.find(c => c.name.toLowerCase().includes(lower)) ??
    categories.find(c => lower.includes(c.name.toLowerCase())) ??
    null
  )
}

function parseEditIntent(text: string, categories: Category[]): ParsedEdit | null {
  const t = text.trim()

  // Amount: "change fuel 500 to 300"
  const withOld = t.match(/(?:change|fix|update|edit|correct|replace)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/i)
  if (withOld) return { type: 'amount', description: withOld[1].trim(), oldAmount: parseFloat(withOld[2]), newAmount: parseFloat(withOld[3]) }

  // Amount: "change fuel to 300"
  const amountOnly = t.match(/(?:change|fix|update|edit|correct|replace)\s+(.+?)\s+to\s+(\d+(?:\.\d+)?)\s*$/i)
  if (amountOnly) return { type: 'amount', description: amountOnly[1].trim(), oldAmount: null, newAmount: parseFloat(amountOnly[2]) }

  // Category: "recategorize petrol to Travel" / "move petrol to Travel"
  const recatMatch = t.match(/(?:recategorize|categorize|move)\s+(.+?)\s+to\s+(.+)/i)
  if (recatMatch) {
    const desc = recatMatch[1].trim()
    const attempt = recatMatch[2].trim()
    const cat = findCategory(attempt, categories)
    return cat ? { type: 'category', description: desc, newCategoryId: cat.id, newCategoryName: cat.name }
               : { type: 'category_not_found', description: desc, attempted: attempt }
  }

  // Category: "change petrol category to Travel"
  const changeCatMatch = t.match(/(?:change|update|set)\s+(.+?)\s+category\s+to\s+(.+)/i)
  if (changeCatMatch) {
    const desc = changeCatMatch[1].trim()
    const attempt = changeCatMatch[2].trim()
    const cat = findCategory(attempt, categories)
    return cat ? { type: 'category', description: desc, newCategoryId: cat.id, newCategoryName: cat.name }
               : { type: 'category_not_found', description: desc, attempted: attempt }
  }

  // Description rename: "rename tea to Coffee Shop" / "change tea to Coffee Shop"
  const renameMatch = t.match(/(?:rename|change|update)\s+(.+?)\s+to\s+(.+)/i)
  if (renameMatch) {
    const newDesc = renameMatch[2].trim()
    if (!/^\d+(?:\.\d+)?$/.test(newDesc)) {
      return { type: 'description', oldDescription: renameMatch[1].trim(), newDescription: newDesc }
    }
  }

  return null
}

function parseDeleteIntent(text: string): { description: string; amount: number | null } | null {
  // "delete tea 20" or "remove petrol 500"
  const withAmount = text.match(/(?:delete|remove)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*$/i)
  if (withAmount) return { description: withAmount[1].trim(), amount: parseFloat(withAmount[2]) }
  // "delete tea" or "remove petrol"
  const noAmount = text.match(/(?:delete|remove)\s+(.+)/i)
  if (noAmount) return { description: noAmount[1].trim(), amount: null }
  return null
}

function findMatchingTransaction(transactions: Transaction[], description: string, oldAmount: number | null): Transaction | null {
  const words = description.toLowerCase().replace(/\bthe\b/g, '').trim().split(/\s+/).filter(w => w.length > 1)
  const scored = transactions
    .filter(t => t.transaction_type === 'expense' || t.transaction_type === 'income')
    .map(t => {
      const td = t.description.toLowerCase()
      let score = words.filter(w => td.includes(w)).length * 2
      if (td === description.toLowerCase()) score += 5
      if (oldAmount !== null && Math.abs(t.amount - oldAmount) < 0.01) score += 3
      const daysOld = (Date.now() - new Date(t.transaction_date).getTime()) / 86400000
      score += daysOld < 7 ? 2 : daysOld < 30 ? 1 : 0
      return { t, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.t ?? null
}

// ── Rich text renderer ──────────────────────────────────────────────────────

type Block =
  | { type: 'quick'; text: string }
  | { type: 'section'; kind: 'why' | 'recommend' | 'warn' | 'goodnews' }
  | { type: 'para'; text: string }
  | { type: 'bullets'; items: string[] }

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.split('\n')
  let firstContentDone = false
  let bulletAcc: string[] = []
  let paraAcc: string | null = null

  const flush = () => {
    if (bulletAcc.length) { blocks.push({ type: 'bullets', items: [...bulletAcc] }); bulletAcc = [] }
    if (paraAcc !== null) { blocks.push({ type: 'para', text: paraAcc }); paraAcc = null }
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t) { flush(); continue }

    if (/^\*\*Why:\*\*/.test(t)) { flush(); blocks.push({ type: 'section', kind: 'why' }); continue }
    if (/^\*\*Recommendations?:\*\*/.test(t)) { flush(); blocks.push({ type: 'section', kind: 'recommend' }); continue }
    if (/^\*\*Watch Out:\*\*/.test(t)) { flush(); blocks.push({ type: 'section', kind: 'warn' }); continue }
    if (/^\*\*Good News:\*\*/.test(t)) { flush(); blocks.push({ type: 'section', kind: 'goodnews' }); continue }

    if (t.startsWith('- ')) {
      if (paraAcc !== null) flush()
      bulletAcc.push(t.slice(2))
      continue
    }

    if (!firstContentDone) {
      flush()
      blocks.push({ type: 'quick', text: t })
      firstContentDone = true
      continue
    }

    if (bulletAcc.length) flush()
    paraAcc = paraAcc !== null ? paraAcc + ' ' + t : t
  }
  flush()
  return blocks
}

function renderInline(text: string, c: ColorTokens): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2)
      return (
        <strong key={i} style={{ fontWeight: 700, color: /[₹%]/.test(inner) ? c.accent : c.ink }}>
          {inner}
        </strong>
      )
    }
    return <span key={i}>{part}</span>
  })
}

// Bullet renderer: detects "Category: **₹amount**" → two-column spending row
function renderBullet(item: string, c: ColorTokens, bulletColor: string, isLast: boolean): ReactNode {
  const spendMatch = item.match(/^(.+?):\s*\*\*₹([\d,]+(?:\.\d+)?)\*\*(.*)$/)
  if (spendMatch) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isLast ? 0 : 7 }}>
        <span style={{ font: '500 13px Plus Jakarta Sans', color: c.sub, flex: 1 }}>{renderInline(spendMatch[1].trim(), c)}</span>
        <strong style={{ font: '700 14px Plus Jakarta Sans', color: c.accent, marginLeft: 8, flexShrink: 0 }}>₹{spendMatch[2]}</strong>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: isLast ? 0 : 5 }}>
      <span style={{ color: bulletColor, fontSize: 17, lineHeight: '21px', flexShrink: 0 }}>•</span>
      <span style={{ font: '500 14px Plus Jakarta Sans', color: c.ink, lineHeight: 1.6 }}>{renderInline(item, c)}</span>
    </div>
  )
}

type SectionedGroup =
  | { type: 'quick'; text: string }
  | { type: 'why'; paras: string[]; bullets: string[] }
  | { type: 'recommend'; bullets: string[] }
  | { type: 'warn'; paras: string[]; bullets: string[] }
  | { type: 'goodnews'; paras: string[]; bullets: string[] }
  | { type: 'loose'; paras: string[]; bullets: string[] }

function groupBlocks(blocks: Block[]): SectionedGroup[] {
  const groups: SectionedGroup[] = []
  let cur: SectionedGroup | null = null

  const flush = () => { if (cur) { groups.push(cur); cur = null } }

  for (const block of blocks) {
    if (block.type === 'quick') {
      flush(); groups.push({ type: 'quick', text: block.text }); continue
    }
    if (block.type === 'section') {
      flush()
      if (block.kind === 'why') cur = { type: 'why', paras: [], bullets: [] }
      else if (block.kind === 'recommend') cur = { type: 'recommend', bullets: [] }
      else if (block.kind === 'warn') cur = { type: 'warn', paras: [], bullets: [] }
      else cur = { type: 'goodnews', paras: [], bullets: [] }
      continue
    }
    if (!cur) cur = { type: 'loose', paras: [], bullets: [] }
    if (block.type === 'para' && 'paras' in cur) (cur as { paras: string[] }).paras.push(block.text)
    if (block.type === 'bullets' && 'bullets' in cur) (cur as { bullets: string[] }).bullets.push(...block.items)
  }
  flush()
  return groups
}

const Divider = ({ c }: { c: ColorTokens }) => (
  <div style={{ height: 1, background: c.faint, margin: '12px 0' }} />
)

function renderRichText(
  text: string,
  c: ColorTokens,
  expanded: boolean,
  onToggle: () => void,
  summaryCards?: SummaryCard[],
): ReactNode {
  if (!text) return null
  const groups = groupBlocks(parseBlocks(text))

  const detailLen = groups.reduce((s, g) => {
    if (g.type === 'quick') return s
    const paras = 'paras' in g ? (g as { paras: string[] }).paras.join(' ') : ''
    const buls = 'bullets' in g ? (g as { bullets: string[] }).bullets.join(' ') : ''
    return s + paras.length + buls.length
  }, 0)
  const canCollapse = detailLen > 400

  return (
    <>
      {groups.map((group, gi) => {
        if (group.type === 'quick') {
          // Emoji-based color: 🟢 good, 🟠 warn, 🔴 bad
          const color = group.text.startsWith('🟢') ? c.good
            : group.text.startsWith('🟠') ? '#F59713'
            : group.text.startsWith('🔴') ? '#EF4444'
            : c.ink
          return (
            <div key={gi}>
              <p style={{ font: '600 17px Plus Jakarta Sans', color, lineHeight: 1.5, margin: 0 }}>
                {renderInline(group.text, c)}
              </p>
              {/* Summary cards injected after quick answer, inside the bubble */}
              {summaryCards && summaryCards.length > 0 && (
                <>
                  <Divider c={c} />
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${summaryCards.length}, 1fr)`, gap: 6 }}>
                    {summaryCards.map((card, ci) => (
                      <div key={ci}>
                        <div style={{ font: '400 10px Plus Jakarta Sans', color: c.muted, marginBottom: 3 }}>{card.icon} {card.label}</div>
                        <div style={{
                          font: `700 ${card.value.length > 9 ? '14' : '16'}px Plus Jakarta Sans`,
                          color: card.tone === 'bad' ? '#EF4444' : card.tone === 'warn' ? '#F59713' : card.tone === 'good' ? c.good : c.ink,
                        }}>{card.value}</div>
                        {card.sub && <div style={{ font: '400 10px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{card.sub}</div>}
                      </div>
                    ))}
                  </div>
                  <Divider c={c} />
                </>
              )}
            </div>
          )
        }

        if (group.type === 'why') {
          const isCollapsed = canCollapse && !expanded
          return (
            <div key={gi} style={{ marginTop: summaryCards ? 0 : 10 }}>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>Why?</div>
              {!isCollapsed && (
                <>
                  {group.paras.map((para, pi) => (
                    <p key={pi} style={{ font: '500 14px Plus Jakarta Sans', color: c.sub, lineHeight: 1.6, margin: '0 0 7px 0' }}>
                      {renderInline(para, c)}
                    </p>
                  ))}
                  {group.bullets.map((item, bi) => (
                    <div key={bi}>{renderBullet(item, c, c.accent, bi === group.bullets.length - 1)}</div>
                  ))}
                </>
              )}
              {canCollapse && (
                <button onClick={onToggle} style={{
                  background: 'none', border: 'none', padding: '4px 0 2px', cursor: 'pointer',
                  font: '500 12px Plus Jakarta Sans', color: c.accent, display: 'block',
                }}>
                  {isCollapsed ? '▼ Show details' : '▲ Hide details'}
                </button>
              )}
            </div>
          )
        }

        if (group.type === 'recommend') {
          if (!group.bullets.length) return null
          return (
            <div key={gi} style={{ background: c.goodSoft, border: `1px solid ${c.good}33`, borderRadius: 12, padding: '11px 14px', marginTop: 10 }}>
              <div style={{ font: '700 13px Plus Jakarta Sans', color: c.good, marginBottom: 8 }}>💡 Recommendations</div>
              {group.bullets.map((item, bi) => (
                <div key={bi}>{renderBullet(item, c, c.good, bi === group.bullets.length - 1)}</div>
              ))}
            </div>
          )
        }

        if (group.type === 'warn') {
          if (!group.paras.length && !group.bullets.length) return null
          return (
            <div key={gi} style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 12, padding: '11px 14px', marginTop: 10 }}>
              <div style={{ font: '700 13px Plus Jakarta Sans', color: '#D97706', marginBottom: 6 }}>⚠ Watch Out</div>
              {group.paras.map((para, pi) => (
                <p key={pi} style={{ font: '500 13px Plus Jakarta Sans', color: '#92400E', lineHeight: 1.6, margin: pi < group.paras.length - 1 ? '0 0 5px 0' : 0 }}>
                  {renderInline(para, c)}
                </p>
              ))}
              {group.bullets.map((item, bi) => (
                <div key={bi}>{renderBullet(item, c, '#D97706', bi === group.bullets.length - 1)}</div>
              ))}
            </div>
          )
        }

        if (group.type === 'goodnews') {
          if (!group.paras.length && !group.bullets.length) return null
          return (
            <div key={gi} style={{ background: c.goodSoft, border: `1px solid ${c.good}33`, borderRadius: 12, padding: '11px 14px', marginTop: 10 }}>
              <div style={{ font: '700 13px Plus Jakarta Sans', color: c.good, marginBottom: 6 }}>🎉 Good News</div>
              {group.paras.map((para, pi) => (
                <p key={pi} style={{ font: '500 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.6, margin: pi < group.paras.length - 1 ? '0 0 5px 0' : 0 }}>
                  {renderInline(para, c)}
                </p>
              ))}
              {group.bullets.map((item, bi) => (
                <div key={bi}>{renderBullet(item, c, c.good, bi === group.bullets.length - 1)}</div>
              ))}
            </div>
          )
        }

        // loose — body content before any named section
        return (
          <div key={gi} style={{ marginTop: gi > 0 ? 6 : 0 }}>
            {group.paras.map((para, pi) => (
              <p key={pi} style={{ font: '500 14px Plus Jakarta Sans', color: c.sub, lineHeight: 1.6, margin: '0 0 7px 0' }}>
                {renderInline(para, c)}
              </p>
            ))}
            {group.bullets.map((item, bi) => (
              <div key={bi}>{renderBullet(item, c, c.accent, bi === group.bullets.length - 1)}</div>
            ))}
          </div>
        )
      })}
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────

async function streamChat(
  message: string,
  history: Message[],
  context: string,
  signal: AbortSignal,
  onToken: (token: string) => void,
): Promise<{ used: number | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('unauthenticated')

  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ mode: 'chat', message, history, context }),
    signal,
  })

  if (res.status === 429) throw new Error('quota_exceeded')
  if (!res.ok) throw new Error('ai_error')

  const used = res.headers.get('X-Used')
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const handleLine = (line: string): boolean => {
    if (!line.startsWith('data: ')) return false
    const data = line.slice(6).trim()
    if (data === '[DONE]') return true
    try {
      const token = JSON.parse(data).choices?.[0]?.delta?.content ?? ''
      if (token) onToken(token)
    } catch { /* malformed line, skip */ }
    return false
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? '' // keep the last, possibly-incomplete line for the next read
    for (const line of lines) {
      if (handleLine(line)) return { used: used ? Number(used) : null }
    }
  }
  // flush any trailing complete line that had no newline
  for (const line of buffer.split('\n')) {
    if (handleLine(line)) break
  }
  return { used: used ? Number(used) : null }
}

interface AIChatSheetProps {
  open: boolean
  onClose: () => void
  state: AppState
  d: DerivedMetrics
  onSave: (data: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>) => Promise<Transaction | undefined>
  onUpdate: (old: Transaction, form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>) => Promise<void>
  onDelete: (t: Transaction) => Promise<void>
  onUpdateSettings?: (patch: { ai_requests_used: number }) => void
  onBusyChange?: (busy: boolean) => void
  onAddCategory: (name: string, group_name: string) => Promise<string>
  onUploadReceipt?: (transactionId: string, receipt: PickedReceipt) => Promise<void>
  onReceiptFailed?: (transaction: Transaction, receipt: PickedReceipt, error: unknown) => void
}

export function AIChatSheet({ open, onClose, state, d, onSave, onUpdate, onDelete, onUpdateSettings, onBusyChange, onAddCategory, onUploadReceipt, onReceiptFailed }: AIChatSheetProps) {
  const c = useTheme()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatListening, setChatListening] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragStartY = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const chatRecognitionRef = useRef<any>(null)
  const [dragY, setDragY] = useState(0)
  const [keyboardH, setKeyboardH] = useState(0)
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set())
  const [extractingReceipt, setExtractingReceipt] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [savingReceiptIdx, setSavingReceiptIdx] = useState<number | null>(null)
  const receiptFileRef = useRef<HTMLInputElement | null>(null)
  const objectUrlsRef = useRef<Set<string>>(new Set())
  const SpeechRec = typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    : null

  // Revoke uploaded-photo preview object URLs once the sheet closes (it stays
  // mounted while autopilot is on, so `open` — not unmount — is the real signal).
  useEffect(() => {
    if (!open) { objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url)); objectUrlsRef.current.clear() }
  }, [open])

  useEffect(() => {
    const onResize = () => {
      if (window.visualViewport) {
        const kh = window.innerHeight - window.visualViewport.height
        setKeyboardH(kh > 150 ? kh : 0)
      }
    }
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', onResize)
      return () => vv.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    if (open) {
      if (messages.length === 0) {
        const weeklyBudget = d.weeklyBudget
        const weeklySpent = d.weeklySpent
        const pct = weeklyBudget > 0 ? Math.round((weeklySpent / weeklyBudget) * 100) : 0

        let greeting = "Hey! I'm Mint, your finance coach. Ask me anything — or tap a suggestion below to get started."
        if (pct >= 100) {
          greeting = `You've used ${pct}% of your weekly budget this week. That happens — let's look at what drove it and find a way forward. Try "help me recover my budget" or ask me anything.`
        } else if (pct >= 80) {
          greeting = `You've used ${pct}% of your weekly budget. You're still in control — ask me where you can ease up, or anything else about your finances.`
        }
        setMessages([{ role: 'ai', text: greeting }])
      }
      setTimeout(() => inputRef.current?.focus(), 300)
      // iOS-safe scroll lock: pinning the body with position:fixed actually stops
      // the page scrolling behind the sheet (overflow:hidden alone doesn't on iOS).
      const scrollY = window.scrollY
      const body = document.body
      const prev = {
        position: body.style.position, top: body.style.top, left: body.style.left,
        right: body.style.right, width: body.style.width, overflow: body.style.overflow,
      }
      body.style.position = 'fixed'
      body.style.top = `-${scrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
      body.style.overflow = 'hidden'
      return () => {
        body.style.position = prev.position
        body.style.top = prev.top
        body.style.left = prev.left
        body.style.right = prev.right
        body.style.width = prev.width
        body.style.overflow = prev.overflow
        window.scrollTo(0, scrollY)
      }
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const stopChatVoice = () => {
    chatRecognitionRef.current?.stop()
    chatRecognitionRef.current = null
    setChatListening(false)
  }

  const startChatVoice = () => {
    if (!SpeechRec || chatListening) return
    const recognition = new SpeechRec()
    recognition.lang = 'en-IN'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => setChatListening(true)
    recognition.onend = () => setChatListening(false)
    recognition.onerror = () => setChatListening(false)
    recognition.onresult = (e: any) => {
      const transcript: string = e.results[0]?.[0]?.transcript ?? ''
      if (transcript) send(transcript)
    }
    chatRecognitionRef.current = recognition
    recognition.start()
  }

  const handleReceiptFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) handleReceiptImage(file)
  }

  const handleChatPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) handleReceiptImage(file)
        return
      }
    }
    // no image on the clipboard — fall through to normal text paste
  }

  const handleReceiptImage = async (file: File) => {
    if (loading) return

    let receipt: PickedReceipt
    try {
      receipt = await compressImage(file)
    } catch (err) {
      setMessages(m => [...m, { role: 'ai', text: err instanceof Error ? err.message : 'Could not read that photo.' }])
      return
    }

    const previewUrl = URL.createObjectURL(receipt.blob)
    objectUrlsRef.current.add(previewUrl)
    setMessages(m => [...m, { role: 'user', text: '📎 Receipt photo', imagePreviewUrl: previewUrl }])
    setLoading(true)
    setExtractingReceipt(true)
    onBusyChange?.(true)

    const allAccObjs = [
      ...state.accounts.filter(a => a.is_active),
      ...(state.credit_cards ?? []),
    ]
    const catNames = state.categories.filter(cat => cat.group_name !== INCOME_GROUP).map(cat => cat.name)
    const groupNames = state.groups.map(g => g.name)

    const result: AIReceiptExtraction | null = await extractReceiptWithAI(
      receipt.blob, catNames, groupNames, n => onUpdateSettings?.({ ai_requests_used: n })
    )

    if (!result) {
      // extractReceiptWithAI returns null on a network/timeout/quota/API failure —
      // distinct from a successful call that genuinely found no receipt (below),
      // since "try a clearer shot" is bad advice when the real issue is technical.
      setMessages(m => [...m, { role: 'ai', text: "Something went wrong reading that photo — please try again." }])
    } else if (result.amount == null) {
      setMessages(m => [...m, { role: 'ai', text: "I couldn't find a receipt in that photo — try a clearer shot, or ask me something else." }])
    } else {
      const amount = result.amount
      const category = result.category
        ? state.categories.find(cat => cat.name.toLowerCase() === result.category!.toLowerCase())
        : null
      const leadIn = result.confidence === 'high'
        ? "🧾 Receipt detected — here's what I found:"
        : "🧾 I found a receipt, but I'm not fully confident — please review before saving:"
      setMessages(m => [...m, {
        role: 'ai',
        text: leadIn,
        receiptPrompt: {
          receipt,
          description: result.description ?? 'Receipt',
          amount,
          transactionDate: result.transaction_date ?? new Date().toISOString().split('T')[0],
          categoryId: category?.id ?? null,
          categorySuggestion: !category ? (result.suggestion ?? null) : null,
          accountId: allAccObjs[0]?.id ?? '',
          confidence: result.confidence,
        },
      }])
    }

    setLoading(false)
    setExtractingReceipt(false)
    onBusyChange?.(false)
  }

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || loading) return
    if (!textOverride) setInput('')
    const next: Message[] = [...messages, { role: 'user', text }]
    setMessages(next)
    setLoading(true)
    onBusyChange?.(true)

    const allAccObjs = [
      ...state.accounts.filter(a => a.is_active),
      ...(state.credit_cards ?? []),
    ]
    const allAccNames = allAccObjs.map(a => a.name)
    const intent = classifyIntent(text)
    const txType = guessTransactionType(text)
    const catNames = txType === 'income'
      ? state.categories.filter(c => c.group_name === INCOME_GROUP).map(c => c.name)
      : state.categories.filter(c => c.group_name !== INCOME_GROUP).map(c => c.name)

    const parsed = intent === 'transaction'
      ? await parseExpenseWithAI(text, catNames, allAccNames, state.groups.map(g => g.name), (n) => onUpdateSettings?.({ ai_requests_used: n }))
      : null

    if (parsed && parsed.amount && parsed.amount > 0) {
      const matchedAccount = parsed.account
        ? allAccObjs.find(a => a.name.toLowerCase() === parsed.account!.toLowerCase())
        : null

      // If account couldn't be identified and there are multiple accounts, ask user
      if (!matchedAccount && allAccObjs.length > 1) {
        setMessages(m => [...m, {
          role: 'ai',
          text: `Which account should I use? Your accounts: ${allAccObjs.map(a => a.name).join(', ')}.`,
        }])
        setLoading(false); onBusyChange?.(false)
        return
      }

      const account = matchedAccount ?? allAccObjs[0]
      const category = state.categories.find(c => c.name.toLowerCase() === (parsed.category ?? '').toLowerCase())
      const today = new Date().toISOString().split('T')[0]

      onSave({
        transaction_date: today,
        description: parsed.description ?? text,
        amount: parsed.amount,
        transaction_type: txType,
        category_id: category?.id ?? null,
        from_account_id: account.id,
      })

      const savedExpense: SavedExpense = {
        description: parsed.description ?? text,
        amount: parsed.amount,
        account: account.name,
        category: category?.name ?? (txType === 'income' ? 'Income' : 'Uncategorized'),
        date: today,
      }
      const verb = txType === 'income' ? 'income' : 'expense'
      setMessages(m => [...m, {
        role: 'ai',
        text: `Done! Recorded ${verb} "${savedExpense.description}" ₹${savedExpense.amount} under ${savedExpense.category} from ${savedExpense.account}.`,
        savedExpense,
      }])
      setLoading(false); onBusyChange?.(false)
      return
    }

    // Edit intent — find matching transaction and show confirmation card
    if (intent === 'edit') {
      const parsed = parseEditIntent(text, state.categories)
      const allAccs = [...state.accounts, ...(state.credit_cards ?? [])]

      if (parsed?.type === 'category_not_found') {
        const available = state.categories.slice(0, 8).map(c => c.name).join(', ')
        setMessages(m => [...m, {
          role: 'ai',
          text: `I couldn't find a category called "${parsed.attempted}". Available categories: ${available}.`,
        }])
      } else if (parsed?.type === 'amount') {
        const match = findMatchingTransaction(state.transactions, parsed.description, parsed.oldAmount)
        if (match) {
          const acc = allAccs.find(a => a.id === match.from_account_id)
          setMessages(m => [...m, {
            role: 'ai',
            text: `Found: "${match.description}" ₹${match.amount.toLocaleString()} · ${match.transaction_date} · ${acc?.name ?? 'Unknown'}. Update amount to ₹${parsed.newAmount.toLocaleString()}?`,
            editPrompt: { transaction: match, field: 'amount', newAmount: parsed.newAmount },
          }])
        } else {
          setMessages(m => [...m, { role: 'ai', text: `I couldn't find a matching "${parsed.description}" transaction.` }])
        }
      } else if (parsed?.type === 'description') {
        const match = findMatchingTransaction(state.transactions, parsed.oldDescription, null)
        if (match) {
          const acc = allAccs.find(a => a.id === match.from_account_id)
          setMessages(m => [...m, {
            role: 'ai',
            text: `Found: "${match.description}" ₹${match.amount.toLocaleString()} · ${match.transaction_date} · ${acc?.name ?? 'Unknown'}. Rename to "${parsed.newDescription}"?`,
            editPrompt: { transaction: match, field: 'description', newDescription: parsed.newDescription },
          }])
        } else {
          setMessages(m => [...m, { role: 'ai', text: `I couldn't find a matching "${parsed.oldDescription}" transaction.` }])
        }
      } else if (parsed?.type === 'category') {
        const match = findMatchingTransaction(state.transactions, parsed.description, null)
        if (match) {
          const acc = allAccs.find(a => a.id === match.from_account_id)
          const currentCat = state.categories.find(c => c.id === match.category_id)?.name ?? 'Uncategorized'
          setMessages(m => [...m, {
            role: 'ai',
            text: `Found: "${match.description}" ₹${match.amount.toLocaleString()} · ${match.transaction_date} · ${acc?.name ?? 'Unknown'} (${currentCat}). Move to ${parsed.newCategoryName}?`,
            editPrompt: { transaction: match, field: 'category', newCategoryId: parsed.newCategoryId, newCategoryName: parsed.newCategoryName },
          }])
        } else {
          setMessages(m => [...m, { role: 'ai', text: `I couldn't find a matching "${parsed.description}" transaction.` }])
        }
      } else {
        setMessages(m => [...m, {
          role: 'ai',
          text: 'To edit a transaction, try:\n• "change fuel 500 to 300" — update amount\n• "rename tea to Coffee Shop" — rename description\n• "recategorize petrol to Travel" — change category',
        }])
      }
      setLoading(false); onBusyChange?.(false)
      return
    }

    // Delete intent — find matching transaction and show confirmation card
    if (intent === 'delete') {
      const parsedDel = parseDeleteIntent(text)
      if (parsedDel) {
        const match = findMatchingTransaction(state.transactions, parsedDel.description, parsedDel.amount)
        if (match) {
          const acc = [...state.accounts, ...(state.credit_cards ?? [])].find(a => a.id === match.from_account_id)
          const cat = state.categories.find(c => c.id === match.category_id)?.name ?? 'Uncategorized'
          setMessages(m => [...m, {
            role: 'ai',
            text: `Found: "${match.description}" ₹${match.amount.toLocaleString()} · ${match.transaction_date} · ${acc?.name ?? 'Unknown'} · ${cat}. Delete this?`,
            deletePrompt: { transaction: match },
          }])
        } else {
          setMessages(m => [...m, {
            role: 'ai',
            text: `I couldn't find a matching "${parsedDel.description}" transaction. Check the transaction list and try again.`,
          }])
        }
      } else {
        setMessages(m => [...m, {
          role: 'ai',
          text: 'To delete a transaction, say something like: "delete tea 20" or "remove petrol 500".',
        }])
      }
      setLoading(false); onBusyChange?.(false)
      return
    }

    // No amount found — treat as Q&A (streamed)
    const contextIntent = classifyContextIntent(text)
    const context = buildContext(state, d, contextIntent)
    abortRef.current = new AbortController()

    // Insert empty placeholder that tokens will fill in (cards/chips generated immediately from local data)
    const summaryCards = buildSummaryCards(state, d, text) ?? undefined
    const actionChipsArr = buildActionChips(text)
    setMessages(m => [...m, {
      role: 'ai', text: '',
      summaryCards,
      actionChips: actionChipsArr.length ? actionChipsArr : undefined,
    }])

    try {
      const { used } = await streamChat(
        text,
        next.slice(-6),
        context,
        abortRef.current.signal,
        (token) => {
          setMessages(m => {
            const copy = [...m]
            copy[copy.length - 1] = { role: 'ai', text: (copy[copy.length - 1].text) + token }
            return copy
          })
        },
      )
      if (used != null) onUpdateSettings?.({ ai_requests_used: used })

      const chartType = shouldShowChart(text)
      if (chartType) {
        const chartData = chartType === 'categories' ? buildCategoryChart(state)
          : chartType === 'budget' ? buildBudgetChart(d)
          : buildMonthlyChart(state)
        setMessages(m => {
          const copy = [...m]
          copy[copy.length - 1] = { ...copy[copy.length - 1], chartData }
          return copy
        })
      }
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      if (!isAbort) {
        const msg = err instanceof Error && err.message === 'quota_exceeded'
          ? 'Mint has reached its daily limit (100 requests/day). Please try again tomorrow.'
          : 'Something went wrong. Please try again.'
        setMessages(m => {
          const copy = [...m]
          copy[copy.length - 1] = { role: 'ai', text: msg }
          return copy
        })
      }
    } finally {
      abortRef.current = null
      setLoading(false)
      onBusyChange?.(false)
    }
  }

  const handleEditConfirm = async (msgIndex: number, ep: EditPrompt) => {
    try {
      await onUpdate(ep.transaction, {
        transaction_date: ep.transaction.transaction_date,
        description: ep.field === 'description' ? ep.newDescription! : ep.transaction.description,
        amount: ep.field === 'amount' ? ep.newAmount! : ep.transaction.amount,
        transaction_type: ep.transaction.transaction_type,
        category_id: ep.field === 'category' ? ep.newCategoryId! : ep.transaction.category_id,
        from_account_id: ep.transaction.from_account_id,
      })

      let text = ''
      if (ep.field === 'amount') {
        text = `Done! Updated "${ep.transaction.description}" from ₹${ep.transaction.amount.toLocaleString()} to ₹${ep.newAmount!.toLocaleString()}.`
      } else if (ep.field === 'description') {
        text = `Done! Renamed "${ep.transaction.description}" to "${ep.newDescription}".`
      } else {
        const oldCat = state.categories.find(c => c.id === ep.transaction.category_id)?.name ?? 'Uncategorized'
        text = `Done! Moved "${ep.transaction.description}" from ${oldCat} to ${ep.newCategoryName}.`
      }
      setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : { role: 'ai', text }))
    } catch {
      setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : { role: 'ai', text: 'Something went wrong updating the transaction. Please try again.' }))
    }
  }

  const handleEditCancel = (msgIndex: number) => {
    setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : { role: 'ai', text: 'Cancelled. No changes made.' }))
  }

  const handleDeleteConfirm = async (msgIndex: number, dp: DeletePrompt) => {
    try {
      await onDelete(dp.transaction)
      const acc = [...state.accounts, ...(state.credit_cards ?? [])].find(a => a.id === dp.transaction.from_account_id)
      setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : {
        role: 'ai',
        text: `Done! Deleted "${dp.transaction.description}" ₹${dp.transaction.amount.toLocaleString()} from ${acc?.name ?? 'account'}.`,
      }))
    } catch {
      setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : { role: 'ai', text: 'Something went wrong deleting the transaction. Please try again.' }))
    }
  }

  const handleDeleteCancel = (msgIndex: number) => {
    setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : { role: 'ai', text: 'Cancelled. No changes made.' }))
  }

  const updateReceiptPrompt = (msgIndex: number, patch: Partial<ReceiptPrompt>) => {
    setMessages(m => m.map((msg, i) => i !== msgIndex || !msg.receiptPrompt ? msg : {
      ...msg,
      receiptPrompt: { ...msg.receiptPrompt, ...patch },
    }))
  }

  const handleCreateReceiptCategory = async (msgIndex: number, suggestion: { name: string; group: string }) => {
    const newId = await onAddCategory(suggestion.name, suggestion.group)
    updateReceiptPrompt(msgIndex, { categoryId: newId, categorySuggestion: null })
  }

  const handleReceiptSave = async (msgIndex: number, rp: ReceiptPrompt) => {
    setSavingReceiptIdx(msgIndex)
    try {
      const category = state.categories.find(cat => cat.id === rp.categoryId)
      const account = [...state.accounts, ...(state.credit_cards ?? [])].find(a => a.id === rp.accountId)
      const tx = await onSave({
        transaction_date: rp.transactionDate,
        description: rp.description,
        amount: rp.amount,
        transaction_type: 'expense',
        category_id: rp.categoryId,
        from_account_id: rp.accountId,
      })
      if (!tx) throw new Error('Save failed')
      onUploadReceipt?.(tx.id, rp.receipt)?.catch(err => onReceiptFailed?.(tx, rp.receipt, err))

      const savedExpense: SavedExpense = {
        description: rp.description, amount: rp.amount,
        account: account?.name ?? '', category: category?.name ?? 'Uncategorized', date: rp.transactionDate,
      }
      setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : {
        role: 'ai',
        text: `Done! Recorded expense "${rp.description}" ₹${rp.amount.toLocaleString()} under ${savedExpense.category} from ${savedExpense.account}. Receipt attached.`,
        savedExpense,
      }))
    } catch {
      setMessages(m => [...m, { role: 'ai', text: "I couldn't save that transaction. Please try again." }])
    }
    setSavingReceiptIdx(null)
  }

  const handleGrabStart = (e: React.TouchEvent) => { dragStartY.current = e.touches[0].clientY }
  const handleGrabMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const delta = e.touches[0].clientY - dragStartY.current
    if (delta > 0) setDragY(delta)
  }
  const handleGrabEnd = () => {
    if (dragY > 100) onClose()
    setDragY(0)
    dragStartY.current = null
  }

  return (
    <div inert={!open} style={{ position: 'fixed', inset: 0, zIndex: 95, pointerEvents: open ? 'auto' : 'none', touchAction: open ? 'none' : 'auto' }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', opacity: open ? 1 : 0, transition: 'opacity 0.3s' }}
      />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: open ? keyboardH : 0,
        background: c.surface,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        display: 'flex', flexDirection: 'column',
        height: '82svh',
        transform: open ? `translateY(${dragY}px)` : 'translateY(115%)',
        transition: dragY > 0 ? 'none' : 'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
      }}>
        {/* Drag handle */}
        <div
          onTouchStart={handleGrabStart}
          onTouchMove={handleGrabMove}
          onTouchEnd={handleGrabEnd}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 18px 0', touchAction: 'none', cursor: 'grab' }}
        >
          <div style={{ width: 40, height: 5, borderRadius: 999, background: c.faint, marginBottom: 14 }} />
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/mint-ai-logo.svg" width="30" height="30" alt="Mint" />
              </div>
              <span style={{ font: '800 17px Plus Jakarta Sans', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#16C98A' }}>Mint</span>
                <span style={{ font: '700 7px Plus Jakarta Sans', color: '#F97316', background: '#F9731622', borderRadius: 4, padding: '1px 4px', letterSpacing: '0.05em' }}>BETA</span>
                <span style={{ color: 'inherit' }}>Chat</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {messages.length > 1 && (
                <button
                  onClick={() => setMessages([{ role: 'ai', text: 'Hey! Ask me anything about your finances.' }])}
                  style={{ height: 32, borderRadius: 999, background: c.surface2, border: 'none', padding: '0 12px', font: '600 11px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}
                >
                  Clear
                </button>
              )}
              <button
                onClick={onClose}
                style={{ width: 32, height: 32, borderRadius: 999, background: c.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.sub} strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault()
            setDragOver(false)
            const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'))
            if (file) handleReceiptImage(file)
          }}
          style={{
            flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', touchAction: 'pan-y', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10,
            border: dragOver ? `2px dashed ${c.accent}` : '2px dashed transparent',
            transition: 'border-color 0.15s',
          }}
        >
          <div style={{ flex: 1 }} />
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
              {m.warning ? (
                <div style={{
                  maxWidth: '82%', display: 'flex', alignItems: 'flex-start', gap: 10,
                  background: '#FEF3C7', border: '1px solid #FCD34D',
                  borderRadius: '18px 18px 18px 4px', padding: '12px 16px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <span style={{ font: '500 13px Plus Jakarta Sans', color: '#92400E', lineHeight: 1.6 }}>{m.text}</span>
                </div>
              ) : (
              <div style={{
                maxWidth: m.role === 'user' ? '82%' : 'min(90%, 640px)',
                background: m.role === 'user' ? c.accent : c.surface2,
                color: m.role === 'user' ? '#fff' : c.ink,
                borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                padding: m.role === 'user' ? '10px 14px' : '14px 16px',
                border: m.role === 'ai' ? `1px solid ${c.faint}` : 'none',
              }}>
                {m.role === 'user' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {m.imagePreviewUrl && (
                      <img src={m.imagePreviewUrl} alt="Uploaded receipt" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <span style={{ font: '500 14px Plus Jakarta Sans', lineHeight: 1.5 }}>{m.text}</span>
                  </div>
                ) : (
                  renderRichText(
                    m.text, c,
                    expandedMessages.has(i),
                    () => setExpandedMessages(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n }),
                    m.summaryCards,
                  )
                )}
              </div>
              )}
              {/* Action chips — shown below the AI bubble */}
              {m.role === 'ai' && !m.warning && m.actionChips && m.actionChips.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 'min(92%, 640px)' }}>
                  {m.actionChips.map((chip, ci) => (
                    <div key={ci} style={{
                      height: 30, padding: '0 12px', borderRadius: 999,
                      background: c.surface2, border: `1px solid ${c.faint}`,
                      font: '500 12px Plus Jakarta Sans', color: c.sub,
                      display: 'flex', alignItems: 'center',
                    }}>{chip}</div>
                  ))}
                </div>
              )}
              {m.savedExpense && (
                <div style={{
                  background: c.goodSoft, border: `1.5px solid ${c.good}33`,
                  borderRadius: 14, padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 10, maxWidth: '82%',
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: 999, background: c.good, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{m.savedExpense.description} · ₹{m.savedExpense.amount.toLocaleString()}</div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{m.savedExpense.category} · {m.savedExpense.account}</div>
                  </div>
                </div>
              )}
              {m.editPrompt && (
                <div style={{ display: 'flex', gap: 8, maxWidth: '82%' }}>
                  <button
                    onClick={() => handleEditConfirm(i, m.editPrompt!)}
                    style={{ flex: 1, height: 36, borderRadius: 10, background: c.accent, border: 'none', font: '600 13px Plus Jakarta Sans', color: '#fff', cursor: 'pointer' }}
                  >
                    Yes, update
                  </button>
                  <button
                    onClick={() => handleEditCancel(i)}
                    style={{ flex: 1, height: 36, borderRadius: 10, background: c.surface2, border: 'none', font: '600 13px Plus Jakarta Sans', color: c.sub, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {m.deletePrompt && (
                <div style={{ display: 'flex', gap: 8, maxWidth: '82%' }}>
                  <button
                    onClick={() => handleDeleteConfirm(i, m.deletePrompt!)}
                    style={{ flex: 1, height: 36, borderRadius: 10, background: '#EF4444', border: 'none', font: '600 13px Plus Jakarta Sans', color: '#fff', cursor: 'pointer' }}
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => handleDeleteCancel(i)}
                    style={{ flex: 1, height: 36, borderRadius: 10, background: c.surface2, border: 'none', font: '600 13px Plus Jakarta Sans', color: c.sub, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {m.receiptPrompt && (() => {
                const rp = m.receiptPrompt
                const accs = state.accounts.filter(a => a.is_active)
                const ccs = state.credit_cards ?? []
                const allAccs = [...accs, ...ccs]
                const saving = savingReceiptIdx === i
                const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', gap: 10 }
                const labelStyle: React.CSSProperties = { font: '500 12px Plus Jakarta Sans', color: c.muted, flexShrink: 0 }
                const valueStyle: React.CSSProperties = { font: '700 13px Plus Jakarta Sans', color: c.ink }
                const editableStyle: React.CSSProperties = {
                  font: '700 12px Plus Jakarta Sans', color: c.ink, background: c.surface2,
                  border: `1px solid ${c.faint}`, borderRadius: 8, padding: '4px 6px', outline: 'none',
                  textAlign: 'right', minWidth: 0,
                }
                return (
                  <div style={{ maxWidth: '92%', width: '100%', background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 16, padding: '12px 14px' }}>
                    <div style={rowStyle}>
                      <span style={labelStyle}>Merchant</span>
                      <input
                        type="text"
                        value={rp.description}
                        onChange={e => updateReceiptPrompt(i, { description: e.target.value })}
                        style={{ ...editableStyle, flex: 1 }}
                      />
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>Amount</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={valueStyle}>₹</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={rp.amount}
                          onChange={e => updateReceiptPrompt(i, { amount: Math.max(0, Number(e.target.value) || 0) })}
                          style={{ ...editableStyle, width: 90 }}
                        />
                      </div>
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>Date</span>
                      <input
                        type="date"
                        value={rp.transactionDate}
                        onChange={e => updateReceiptPrompt(i, { transactionDate: e.target.value })}
                        style={editableStyle}
                      />
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>Category</span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 0 }}>
                        {rp.categorySuggestion && (
                          <button
                            type="button"
                            onClick={() => handleCreateReceiptCategory(i, rp.categorySuggestion!)}
                            style={{ border: `1.5px dashed ${c.accent}`, background: c.accentSoft, borderRadius: 8, padding: '3px 8px', font: '600 11px Plus Jakarta Sans', color: c.accent, cursor: 'pointer' }}
                          >
                            + Create "{rp.categorySuggestion.name}"
                          </button>
                        )}
                        <CategorySelect
                          value={rp.categoryId ?? ''}
                          onChange={v => updateReceiptPrompt(i, { categoryId: v || null, categorySuggestion: null })}
                          state={state}
                          onAddCategory={onAddCategory}
                          includeEmpty
                          emptyLabel="Uncategorized"
                          style={editableStyle}
                        />
                      </div>
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>Account</span>
                      {allAccs.length > 1 ? (
                        <select
                          value={rp.accountId}
                          onChange={e => updateReceiptPrompt(i, { accountId: e.target.value })}
                          style={editableStyle}
                        >
                          <optgroup label="Bank / Cash">
                            {accs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </optgroup>
                          {ccs.length > 0 && (
                            <optgroup label="Credit Cards">
                              {ccs.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                            </optgroup>
                          )}
                        </select>
                      ) : (
                        <span style={valueStyle}>{allAccs[0]?.name ?? '—'}</span>
                      )}
                    </div>
                    {rp.confidence === 'low' && (
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: '#D97706', marginTop: 6 }}>
                        ⚠️ Low confidence — please review before saving.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleReceiptSave(i, rp)}
                      disabled={saving || !rp.accountId}
                      style={{
                        width: '100%', height: 36, borderRadius: 10, border: 'none', marginTop: 10,
                        background: (saving || !rp.accountId) ? c.faint : c.accent,
                        font: '700 13px Plus Jakarta Sans', color: '#fff',
                        cursor: (saving || !rp.accountId) ? 'default' : 'pointer',
                      }}
                    >
                      {saving ? 'Saving…' : !rp.accountId ? 'Add an account first' : 'Save Transaction'}
                    </button>
                  </div>
                )
              })()}
              {m.chartData && (
                <div style={{ maxWidth: '92%', background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 16, padding: '12px 14px' }}>
                  {m.chartData.type === 'categories' && (() => {
                    const cd = m.chartData as Extract<ChartData, { type: 'categories' }>
                    return (
                    <>
                      <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Spending this month · ₹{cd.total.toLocaleString()}
                      </div>
                      {cd.items.map((item, idx) => (
                        <div key={idx} style={{ marginBottom: idx < cd.items.length - 1 ? 9 : 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ font: '500 12px Plus Jakarta Sans', color: c.sub }}>{item.name}</span>
                            <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>₹{item.amount.toLocaleString()}</span>
                          </div>
                          <div style={{ height: 5, background: c.faint, borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${item.pct}%`, background: item.color, borderRadius: 3 }} />
                          </div>
                        </div>
                      ))}
                    </>
                    )
                  })()}
                  {m.chartData.type === 'budget' && (() => {
                    const pct = m.chartData.budget > 0 ? Math.round((m.chartData.spent / m.chartData.budget) * 100) : 0
                    const over = m.chartData.spent > m.chartData.budget
                    return (
                      <>
                        <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Weekly Budget</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ font: '500 12px Plus Jakarta Sans', color: c.sub }}>Spent</span>
                          <span style={{ font: '700 12px Plus Jakarta Sans', color: over ? '#EF4444' : c.ink }}>₹{m.chartData.spent.toLocaleString()} / ₹{m.chartData.budget.toLocaleString()}</span>
                        </div>
                        <div style={{ height: 8, background: c.faint, borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: over ? '#EF4444' : '#16C98A', borderRadius: 4, transition: 'width 0.4s ease' }} />
                        </div>
                        <div style={{ font: '500 11px Plus Jakarta Sans', color: over ? '#EF4444' : c.muted, marginTop: 5, textAlign: 'right' }}>
                          {pct}% used{over ? ` · ₹${(m.chartData.spent - m.chartData.budget).toLocaleString()} over` : ''}
                        </div>
                      </>
                    )
                  })()}
                  {m.chartData.type === 'monthly' && (() => {
                    const max = Math.max(m.chartData.thisMonth, m.chartData.lastMonth, m.chartData.income, 1)
                    const diff = m.chartData.lastMonth > 0 ? Math.round(((m.chartData.thisMonth - m.chartData.lastMonth) / m.chartData.lastMonth) * 100) : null
                    const rows = [
                      { label: 'This month', amount: m.chartData.thisMonth, color: '#3B82F6' },
                      { label: 'Last month', amount: m.chartData.lastMonth, color: '#94A3B8' },
                      ...(m.chartData.income > 0 ? [{ label: 'Income (this month)', amount: m.chartData.income, color: '#16C98A' }] : []),
                    ]
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Monthly Comparison</span>
                          {diff !== null && (
                            <span style={{ font: '600 11px Plus Jakarta Sans', color: diff > 0 ? '#EF4444' : '#16C98A' }}>
                              {diff > 0 ? '+' : ''}{diff}% vs last month
                            </span>
                          )}
                        </div>
                        {rows.map((row, idx) => (
                          <div key={idx} style={{ marginBottom: idx < rows.length - 1 ? 9 : 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ font: '500 12px Plus Jakarta Sans', color: c.sub }}>{row.label}</span>
                              <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>₹{row.amount.toLocaleString()}</span>
                            </div>
                            <div style={{ height: 5, background: c.faint, borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.round((row.amount / max) * 100)}%`, background: row.color, borderRadius: 3 }} />
                            </div>
                          </div>
                        ))}
                      </>
                    )
                  })()}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MintAnimation variant="thinking" size={38} style={{ borderRadius: 9, flexShrink: 0 }} />
              <div style={{
                background: c.surface2, borderRadius: '18px 18px 18px 4px',
                padding: '10px 14px', font: '500 14px Plus Jakarta Sans', color: c.muted,
              }}>
                {extractingReceipt ? 'Reading receipt…' : 'Mint is thinking…'}
              </div>
            </div>
          )}
          <div ref={bottomRef} style={{ height: 8 }} />
        </div>

        {/* Suggestion chips */}
        {messages.length <= 1 && (
          <div style={{ padding: '8px 14px 4px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'Why is balance low?', q: 'My balance feels low this month. Help me understand what happened — what was real spending vs transfers vs money I lent out?' },
              { label: 'My financial story', q: "Give me my financial story this month — where did my money go, what's recoverable, and how am I actually doing?" },
              { label: 'Quick savings wins', q: 'Based on my actual spending, what are 3 quick ways I can save money this week without feeling it too much?' },
              { label: 'Budget recovery', q: "I've been over my weekly budget. Give me a realistic recovery plan with specific steps." },
              { label: 'Monthly summary', q: 'Give me a full summary of my spending this month — categories, totals, and how I compare to last month.' },
              { label: 'Am I on track?', q: 'Am I really overspending, or does it just feel that way? Give me an honest assessment.' },
              { label: 'Save ₹5,000', q: 'Create a personalized plan for me to save ₹5,000 in the next 3 months based on my actual spending.' },
              { label: 'Free money', q: "What's my real free money right now after emergency fund and bills?" },
              { label: 'Who owes me?', q: 'Who owes me money and how much in total? When might I get it back?' },
              { label: 'My investments', q: 'Show me a summary of my savings and investments and how they are progressing.' },
            ].map(({ label, q }) => (
              <button
                key={q}
                onClick={() => { setInput(q); setTimeout(() => { inputRef.current?.focus(); }, 50) }}
                style={{
                  border: `1.5px solid ${c.faint}`, background: c.surface2,
                  borderRadius: 999, padding: '7px 13px',
                  font: '500 12px Plus Jakarta Sans', color: c.sub,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: `12px 14px ${keyboardH > 0 ? '12px' : 'calc(18px + env(safe-area-inset-bottom, 0px))'}`,
          borderTop: `1px solid ${c.faint}`,
          display: 'flex', gap: 8, alignItems: 'center', background: c.surface,
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            onPaste={handleChatPaste}
            placeholder={chatListening ? 'Listening…' : 'Ask about your finances…'}
            enterKeyHint="send"
            style={{
              flex: 1, border: `1.5px solid ${chatListening ? '#EF4444' : c.faint}`,
              background: c.surface2, borderRadius: 22, padding: '11px 16px',
              font: '500 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
              transition: 'border-color 0.2s',
            }}
          />
          <input
            ref={receiptFileRef}
            type="file"
            accept="image/*"
            onChange={handleReceiptFileInput}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => receiptFileRef.current?.click()}
            disabled={loading}
            aria-label="Attach receipt photo"
            style={{
              width: 42, height: 42, borderRadius: 999, border: 'none',
              background: c.surface2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: loading ? 'default' : 'pointer', flexShrink: 0,
              opacity: loading ? 0.5 : 1,
            }}
          >
            <Camera size={17} color={c.sub} />
          </button>
          {SpeechRec && (
            <button
              onPointerDown={e => { e.preventDefault(); chatListening ? stopChatVoice() : startChatVoice() }}
              aria-label={chatListening ? 'Stop recording' : 'Speak'}
              style={{
                width: 42, height: 42, borderRadius: 999, border: 'none',
                background: chatListening ? '#EF4444' : c.surface2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
                boxShadow: chatListening ? '0 0 0 5px #EF444430, 0 0 0 10px #EF444415' : 'none',
                transition: 'background 0.15s, box-shadow 0.2s',
              }}
            >
              {chatListening ? (
                <div style={{ display: 'flex', gap: 2.5, alignItems: 'center' }}>
                  {[0, 0.14, 0.28, 0.42].map((delay, i) => (
                    <div key={i} style={{
                      width: 3, height: 14, borderRadius: 2, background: '#fff',
                      transformOrigin: 'center',
                      animation: 'voiceBar 0.7s ease-in-out infinite',
                      animationDelay: `${delay}s`,
                    }} />
                  ))}
                </div>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="11" rx="3"/>
                  <path d="M5 10a7 7 0 0 0 14 0"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="8" y1="22" x2="16" y2="22"/>
                </svg>
              )}
            </button>
          )}
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              width: 42, height: 42, borderRadius: 999, border: 'none',
              background: input.trim() && !loading ? c.accent : c.faint,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              flexShrink: 0, transition: 'background 0.2s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

    </div>
  )
}
