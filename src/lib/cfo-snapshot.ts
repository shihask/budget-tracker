import type { AppState, DerivedMetrics } from '@/types'
import { buildCashFlowForecast, daysUntil, type CashFlowEvent } from '@/lib/cashflow'
import { getIncomePattern } from '@/lib/income-pattern'
import { forSpendAnalytics, spendAmount } from '@/lib/reimbursements'
import { ringFencedEventIds, countsTowardBudget } from '@/lib/events'
import { catById, isSystemTx, makeScopeFilter, budgetPeriodStart } from '@/lib/data'
import { getMovementClass } from '@/lib/money-movement'

/* ============================================================================
   Mint CFO snapshot — the numbers behind Mint's eight core answers.

   Mint shows ONE equation, everywhere:

     Free Money = Liquid Cash − Emergency Fund − Mandatory bills due before next income
     Funding Gap = max(0, −Free Money)
     After savings = Free Money − Flexible savings due before next income

   This is deliberately NOT d.realFreeMoney. That is the forecast's lowest point
   over 30 days — correct, but a bare "−₹1,09,123" with no visible arithmetic,
   which the model then misread as a weekly overspend. Here the forecast is read
   only for its dated events and, internally, for risk after income
   (postIncomeRisk). The dashboard, challenge and safe-daily keep realFreeMoney.

   Code owns every number and the decision; the AI only explains them.
   ============================================================================ */

export type ObligationTier = 'card' | 'fixed' | 'flexible'

// The ONE home of the mandatory-vs-flexible rule.
// Mandatory: a card bill (interest), a commitment (EMI, rent, bills), a repayment
// you owe, and a PRIZED chit — once the pot is taken, the remaining installments
// are a debt. Flexible: SIP / gold / RD / unprized chit contributions and planned
// purchases — a choice the user can pause, never a bill.
export function obligationTier(e: Pick<CashFlowEvent, 'source' | 'is_prized'>): ObligationTier {
  switch (e.source) {
    case 'card':       return 'card'
    case 'commitment':
    case 'borrowing':  return 'fixed'
    case 'saving':     return e.is_prized ? 'fixed' : 'flexible'
    default:           return 'flexible'   // 'planned' (salary/lifestyle never reach here)
  }
}

export interface CfoObligation {
  title: string
  amount: number
  date: string
  source: CashFlowEvent['source']
  tier: ObligationTier
}

export interface CfoRunway {
  // First mandatory bill the cash can't cover, walking bills in due order.
  // null = every scheduled mandatory bill before income is covered.
  runsShortOn: string | null
  obligation: CfoObligation | null
  missing: number          // how much is missing for THAT bill (not the whole bill)
}

export interface CfoCategoryAmount { name: string; amount: number }

export interface CfoWeekly {
  budget: number
  spent: number
  over: number             // > 0 only when spent exceeds budget
  left: number             // > 0 only when under budget
  periodLabel: string      // 'this week' | 'this month' | 'today'
  topCats: CfoCategoryAmount[]
}

export interface CfoSnapshot {
  liquidCash: number
  accounts: { name: string; balance: number }[]
  emergencyFund: number
  nextIncomeDate: string | null
  incomeLabel: 'salary' | 'income'
  obligations: CfoObligation[]          // every tier, due order
  cardTotal: number
  fixedTotal: number
  mandatoryTotal: number
  flexibleTotal: number
  freeMoney: number
  fundingGap: number
  afterSavings: number
  runway: CfoRunway
  // The forecast's deepest point falls AFTER income and below the pre-income
  // position — i.e. post-income bills are bigger than the income. null otherwise.
  postIncomeRisk: { balance: number; date: string } | null
  weekly: CfoWeekly
  cardDebt: number
  confidence: 'exact' | 'estimated'
}

// Card bills first on a shared due date (interest and late fees), then money
// owed to people, then commitments. Used by the runway AND the decision so the
// two can never disagree about which bill comes first.
const SOURCE_RANK: Partial<Record<CashFlowEvent['source'], number>> = { card: 0, borrowing: 1, commitment: 2, saving: 3 }

export function byDueThenRank(a: CfoObligation, b: CfoObligation): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  return (SOURCE_RANK[a.source] ?? 9) - (SOURCE_RANK[b.source] ?? 9)
}

export function billRunway(startCash: number, mandatory: CfoObligation[]): CfoRunway {
  let running = startCash
  for (const ob of [...mandatory].sort(byDueThenRank)) {
    if (running < ob.amount) {
      return { runsShortOn: ob.date, obligation: ob, missing: Math.round(ob.amount - Math.max(0, running)) }
    }
    running -= ob.amount
  }
  return { runsShortOn: null, obligation: null, missing: 0 }
}

function weeklyOf(state: AppState, d: DerivedMetrics): CfoWeekly {
  const catMap = catById(state.categories)
  const matches = makeScopeFilter(state)
  const start = budgetPeriodStart(state)
  const totals: Record<string, number> = {}
  for (const t of forSpendAnalytics(state.transactions)) {
    if (!matches(t, catMap) || new Date(t.transaction_date) < start) continue
    const name = catMap[t.category_id ?? '']?.name ?? 'Uncategorized'
    totals[name] = (totals[name] ?? 0) + spendAmount(t)
  }
  const topCats = Object.entries(totals)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
  const period = state.settings.budget_period ?? 'weekly'
  const budget = Math.round(d.weeklyBudget)
  const spent = Math.round(d.weeklySpent)
  return {
    budget, spent,
    over: Math.max(0, spent - budget),
    left: Math.max(0, budget - spent),
    periodLabel: period === 'daily' ? 'today' : period === 'monthly' ? 'this month' : 'this week',
    topCats,
  }
}

export function buildCfoSnapshot(state: AppState, d: DerivedMetrics): CfoSnapshot {
  const active = state.accounts.filter(a => a.is_active)
  const liquidCash = Math.round(active.reduce((s, a) => s + a.current_balance, 0))
  const emergencyFund = Math.round(d.emergencyFund ?? 0)

  // Same default options derive() uses, so the dated events match the dashboard's.
  const forecast = buildCashFlowForecast(state, d)
  const nextIncomeDate = forecast.nextSalaryDate ?? null

  const obligations: CfoObligation[] = forecast.projections
    .map(p => p.event)
    // Lifestyle entries are synthetic per-day spend, not named bills (never in the
    // default forecast today — guarded so an opt-in later can't flood the list).
    .filter(e => e.type === 'expense' && e.source !== 'lifestyle')
    .filter(e => nextIncomeDate == null || e.date < nextIncomeDate)
    .map(e => ({ title: e.title, amount: Math.round(e.amount), date: e.date, source: e.source, tier: obligationTier(e) }))
    .sort(byDueThenRank)

  const sum = (tier: ObligationTier) => obligations.filter(o => o.tier === tier).reduce((s, o) => s + o.amount, 0)
  const cardTotal = sum('card')
  const fixedTotal = sum('fixed')
  const flexibleTotal = sum('flexible')
  const mandatoryTotal = cardTotal + fixedTotal

  const freeMoney = liquidCash - emergencyFund - mandatoryTotal
  const afterSavings = freeMoney - flexibleTotal
  const runway = billRunway(liquidCash - emergencyFund, obligations.filter(o => o.tier !== 'flexible'))

  // afterSavings is exactly the forecast balance on the eve of income (no income
  // event precedes the first one), so a lower forecast minimum can only come from
  // bills after income.
  const postIncomeRisk = forecast.lowestBalance < Math.min(0, afterSavings) && forecast.lowestBalanceDate
    ? { balance: forecast.lowestBalance, date: forecast.lowestBalanceDate }
    : null

  const cardDebt = Math.round((state.credit_cards ?? [])
    .filter(cc => cc.is_active)
    .reduce((s, cc) => s + Math.max(0, cc.current_balance), 0))

  return {
    liquidCash,
    accounts: active.map(a => ({ name: a.name, balance: a.current_balance })),
    emergencyFund,
    nextIncomeDate,
    incomeLabel: getIncomePattern(state.settings) === 'monthly' ? 'salary' : 'income',
    obligations,
    cardTotal, fixedTotal, mandatoryTotal, flexibleTotal,
    freeMoney,
    fundingGap: Math.max(0, -freeMoney),
    afterSavings,
    runway,
    postIncomeRisk,
    weekly: weeklyOf(state, d),
    cardDebt,
    confidence: nextIncomeDate ? 'exact' : 'estimated',
  }
}

/* ── Formatting ─────────────────────────────────────────────────────────── */

// ₹1,34,440 — Indian grouping. Negatives use a real minus before the symbol
// (−₹57,018), never "₹-57,018".
export function inr(n: number): string {
  const r = Math.round(n)
  return `${r < 0 ? '−' : ''}₹${Math.abs(r).toLocaleString('en-IN')}`
}

export function shortDate(iso: string): string {
  const [y, m, dd] = iso.split('-').map(Number)
  return new Date(y, m - 1, dd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// "Axis Visa bill" / "the repayment to Munshid" / "Home Loan EMI"
export function obligationNoun(ob: CfoObligation): string {
  if (ob.source === 'borrowing') return `the repayment to ${ob.title.replace(/^Repay\s+/i, '')}`
  return ob.title
}

/* ── Today's Decision — deterministic, never AI ──────────────────────────── */

export interface CfoDecision {
  kind: 'pay' | 'need' | 'pause-savings' | 'clear'
  title: string
  reason: string
  obligation: CfoObligation | null
}

function payPhrase(ob: CfoObligation): string {
  if (ob.source === 'borrowing') return `repay ${ob.title.replace(/^Repay\s+/i, '')}`
  if (ob.source === 'card') return `pay your ${ob.title}`
  return `pay ${ob.title}`
}

function reasonFor(ob: CfoObligation): string {
  if (ob.source === 'card') return 'Prevents interest and late fees — your earliest bill.'
  if (ob.source === 'borrowing') return `A repayment you owe to ${ob.title.replace(/^Repay\s+/i, '')}.`
  if (ob.source === 'saving') return 'Your chit is prized, so these installments are now a debt.'
  return 'Fixed commitment due first.'
}

export function pickDecision(s: CfoSnapshot): CfoDecision {
  const mandatory = s.obligations.filter(o => o.tier !== 'flexible')
  const incomeWord = s.incomeLabel

  if (s.runway.obligation) {
    const ob = s.runway.obligation
    return {
      kind: 'need',
      title: `You need ${inr(s.runway.missing)} before ${shortDate(ob.date)} to ${payPhrase(ob)}.`,
      reason: reasonFor(ob),
      obligation: ob,
    }
  }
  if (mandatory.length > 0) {
    const ob = mandatory[0]   // already in due-then-rank order
    const verb = payPhrase(ob)
    const title = ob.source === 'card'
      ? `Pay your ${ob.title} of ${inr(ob.amount)} before ${shortDate(ob.date)}.`
      : `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${inr(ob.amount)} before ${shortDate(ob.date)}.`
    return { kind: 'pay', title, reason: reasonFor(ob), obligation: ob }
  }
  if (s.afterSavings < 0) {
    const largest = [...s.obligations].filter(o => o.tier === 'flexible').sort((a, b) => b.amount - a.amount)[0]
    return {
      kind: 'pause-savings',
      title: 'Your planned savings are more than your free cash.',
      reason: largest
        ? `Consider pausing ${largest.title} (${inr(largest.amount)}) until your ${incomeWord}.`
        : `Consider pausing a contribution until your ${incomeWord}.`,
      obligation: largest ?? null,
    }
  }
  const days = s.nextIncomeDate ? Math.max(1, daysUntil(s.nextIncomeDate)) : null
  const perDay = days ? Math.floor(Math.max(0, s.afterSavings) / days) : null
  return {
    kind: 'clear',
    title: `No bills before your ${incomeWord}.`,
    reason: perDay != null
      ? `You have ${inr(s.afterSavings)} free — about ${inr(perDay)}/day for ${days} days.`
      : `You have ${inr(s.afterSavings)} free.`,
    obligation: null,
  }
}

/* ── One-line headlines ──────────────────────────────────────────────────── */

export function positionHeadline(s: CfoSnapshot): string {
  const when = s.nextIncomeDate ? `before your ${s.incomeLabel}` : 'over the next 30 days'
  if (s.fundingGap > 0) return `You're short by ${inr(s.fundingGap)} ${when}.`
  if (s.nextIncomeDate) return `You're covered until your ${s.incomeLabel} on ${shortDate(s.nextIncomeDate)}, with ${inr(s.freeMoney)} free.`
  return `Your scheduled bills are covered, with ${inr(s.freeMoney)} free.`
}

/* ── Affordability ───────────────────────────────────────────────────────── */

export const AFFORD_MIN_BUFFER = 2000
export const AFFORD_BUFFER_SHARE = 0.10

export interface AffordVerdict {
  verdict: 'yes' | 'tight' | 'no'
  after: number
  buffer: number
  pausesSavings: boolean   // affordable only by skipping flexible savings
}

// The cushion scales with the user's free money — a flat ₹2,000 is huge for
// someone with ₹8,000 free and nothing for someone with ₹1.5 lakh.
export function affordVerdict(s: CfoSnapshot, amount: number): AffordVerdict {
  const after = s.freeMoney - amount
  const buffer = Math.max(AFFORD_MIN_BUFFER, Math.round(AFFORD_BUFFER_SHARE * Math.max(0, s.freeMoney)))
  const pausesSavings = after >= 0 && after - s.flexibleTotal < 0
  const verdict = after < 0 ? 'no' : (after < buffer || pausesSavings) ? 'tight' : 'yes'
  return { verdict, after, buffer, pausesSavings }
}

/* ── This month's story — facts only, never causes ───────────────────────── */

// Code can see that money was borrowed and that a fee was paid; it cannot know
// the one funded the other. The story states facts; the AI insight (which has
// the MoneyMovement timeline) may connect them.
export const STORY_MIN_FACTS = 2

export function buildMonthStory(state: AppState, d: DerivedMetrics, decision: CfoDecision): string[] {
  const now = new Date()
  const periodStart = d.financialCycle?.cycleStart ?? new Date(now.getFullYear(), now.getMonth(), 1)
  const periodWord = d.financialCycle ? 'this cycle' : 'this month'
  const inPeriod = (date: string) => new Date(date) >= periodStart
  const facts: string[] = []

  const borrowed = state.transactions
    .filter(t => inPeriod(t.transaction_date) && getMovementClass(t) === 'temporary-cash')
    .reduce((s, t) => s + t.amount, 0)
  if (borrowed > 0) facts.push(`You borrowed ${inr(borrowed)} ${periodWord}.`)

  const catMap = catById(state.categories)
  const ringFenced = ringFencedEventIds(state.events)
  const totals: Record<string, number> = {}
  for (const t of forSpendAnalytics(state.transactions)) {
    if (t.transaction_type !== 'expense' || !inPeriod(t.transaction_date) || isSystemTx(t, catMap)) continue
    // A ring-fenced event reads as itself ("Ooty Trip"), not as scattered categories.
    const eventName = !countsTowardBudget(t, ringFenced)
      ? state.events.find(e => e.id === t.event_id)?.name
      : undefined
    const key = eventName ?? catMap[t.category_id ?? '']?.name ?? 'Uncategorized'
    totals[key] = (totals[key] ?? 0) + spendAmount(t)
  }
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0]
  if (top && top[1] > 0) facts.push(`Your biggest outgoing was ${inr(top[1])} for ${top[0]}.`)

  const ob = decision.kind === 'need' || decision.kind === 'pay' ? decision.obligation : null
  if (ob) facts.push(`Your earliest pressure is ${ob.source === 'card' ? 'the ' : ''}${obligationNoun(ob)} due on ${shortDate(ob.date)}.`)

  return facts.length >= STORY_MIN_FACTS ? facts : []
}

/* ── Compact facts for the AI insight call ───────────────────────────────── */

// The equation as the model sees it — also sent with every free-form question,
// replacing the old bare "FreeMoney:₹-1,09,123" the model misread as a weekly rate.
export function equationFacts(s: CfoSnapshot): string {
  return [
    `CashFlow: liquid ${inr(s.liquidCash)} − emergency ${inr(s.emergencyFund)} − cards ${inr(s.cardTotal)} − fixed ${inr(s.fixedTotal)} = free ${inr(s.freeMoney)}`,
    `FundingGap: ${inr(s.fundingGap)}${s.nextIncomeDate ? ` before ${s.incomeLabel} on ${shortDate(s.nextIncomeDate)}` : ' (next income date unknown — next 30 days)'} — a one-time amount needed, NOT a weekly or monthly rate`,
    s.runway.runsShortOn ? `BillRunway: runs short on ${shortDate(s.runway.runsShortOn)} (scheduled bills only, excludes day-to-day spending)` : 'BillRunway: all scheduled bills before income are covered',
    s.flexibleTotal > 0 ? `FlexibleSavings: ${inr(s.flexibleTotal)} (pause-able, NOT in free money) → after-savings ${inr(s.afterSavings)}` : '',
    s.postIncomeRisk ? `PostIncomeRisk: even after income, balance reaches ${inr(s.postIncomeRisk.balance)} around ${shortDate(s.postIncomeRisk.date)}` : '',
  ].filter(Boolean).join('\n')
}

export function snapshotFacts(s: CfoSnapshot, decision: CfoDecision): string {
  const lines = [
    equationFacts(s),
    `Bills: ${s.obligations.slice(0, 6).map(o => `${shortDate(o.date)} ${o.title} ${inr(o.amount)} [${o.tier}]`).join(' | ') || 'none'}`,
    `Spending ${s.weekly.periodLabel}: ${inr(s.weekly.spent)} of ${inr(s.weekly.budget)} budget${s.weekly.over > 0 ? ` (${inr(s.weekly.over)} over)` : ` (${inr(s.weekly.left)} left)`}` +
      (s.weekly.topCats.length ? ` | top: ${s.weekly.topCats.map(c => `${c.name} ${inr(c.amount)}`).join(', ')}` : ''),
    `Decision (already shown to the user — support it, never replace it): ${decision.title} ${decision.reason}`,
  ]
  return lines.filter(Boolean).join('\n')
}
