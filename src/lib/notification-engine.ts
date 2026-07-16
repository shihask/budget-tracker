import type {
  AppState,
  DerivedMetrics,
  AppNotification,
  NotificationPriority,
  NotificationTone,
} from '@/types'
import type { Reminder } from '@/components/RemindersBar'
import { getExpectedNextPrimaryIncome, isPrimaryIncomeTransaction } from '@/lib/financial-cycle'
import { buildCashFlowForecast } from '@/lib/cashflow'
import { getNextRecurringDueDate } from '@/lib/recurring'
import { calcGoalStatus, calcGoalForecast } from '@/lib/goals'
import { computeChallenge } from '@/lib/challenge'
import { getWeekStart, localIso } from '@/lib/utils'

/*
 * Notifications are derived state, not persisted application data. Every notification
 * returned below is recomputed from the current AppState/DerivedMetrics on every call.
 * A notification's lifecycle is entirely driven by whether its generator's condition is
 * currently true — once the underlying condition resolves (bill paid, balance recovers,
 * goal contribution logged), the generator simply stops emitting that id next call.
 * There is no "resolved" flag to set or clear.
 *
 * The one deliberate exception is milestone-driven notifications (goal reached, goal
 * 25/50/75% milestone, savings target reached): their triggering condition stays true
 * forever once crossed, so they rely on user-dismissal (see snoozeNotification) rather
 * than condition-clearing to disappear. Challenge streak milestones are the opposite —
 * time-driven, not milestone-driven — see generateChallengeNotifications for why.
 *
 * Generator purity invariant: every generate*Notifications function below is pure — it
 * reads only its arguments and calls other pure src/lib functions. None of them read
 * localStorage, mutate state, call a React hook, or perform any other side effect.
 * Snoozing/dismissal and all localStorage access happen exclusively in the snooze
 * helpers and the orchestration pipeline (applySnooze), so every generator is trivially
 * testable with a plain AppState fixture.
 */

const PRIORITY_WEIGHT: Record<NotificationPriority, number> = {
  critical: 100, high: 80, medium: 60, info: 40, positive: 20,
}

// ────────────────────────────────────────────────────────────────────────────
// Recommendation builder — centralizes "what to do now" copy so a future
// AI-generated-recommendation feature can replace this one function without
// touching any of the 7 generators.
// ────────────────────────────────────────────────────────────────────────────

type RecommendationKind =
  | 'reduce_daily_spend'
  | 'delay_discretionary'
  | 'pay_bill'
  | 'increase_savings_pace'
  | 'review_category'

export function buildRecommendation(kind: RecommendationKind, params: Record<string, number | string> = {}): string {
  switch (kind) {
    case 'reduce_daily_spend':
      return `Spend below ₹${Math.round(Number(params.amount)).toLocaleString('en-IN')}/day for the remaining days this week.`
    case 'delay_discretionary':
      return 'Delay discretionary purchases until your next income arrives.'
    case 'pay_bill':
      return `Pay ${params.name} before it's overdue to avoid a late fee.`
    case 'increase_savings_pace':
      return `Increase your monthly contribution by ₹${Math.round(Number(params.amount)).toLocaleString('en-IN')} to stay on track.`
    case 'review_category':
      return `Review recent ${params.category} transactions to spot one-off purchases.`
  }
}

function catName(state: AppState, id: string | null): string {
  return state.categories.find(c => c.id === id)?.name ?? 'Uncategorized'
}

// ────────────────────────────────────────────────────────────────────────────
// Domain: budget — owns weekly/period spending pace, category spikes,
// overall spend-vs-last-month comparison. Never emits salary/forecast/goal/bill content.
// ────────────────────────────────────────────────────────────────────────────

export function generateBudgetNotifications(state: AppState, d: DerivedMetrics): AppNotification[] {
  const now = new Date()
  const nowIso = localIso(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())

  const expenses = state.transactions.filter(t => t.transaction_type === 'expense')
  const thisMonth = expenses.filter(t => new Date(t.transaction_date) >= thisMonthStart)
  const lastToSameDay = expenses.filter(t => {
    const dt = new Date(t.transaction_date)
    return dt >= lastMonthStart && dt <= lastMonthSameDay
  })

  const thisMonthSpend = thisMonth.reduce((s, t) => s + t.amount, 0)
  const lastMonthSpend = lastToSameDay.reduce((s, t) => s + t.amount, 0)

  const notifications: AppNotification[] = []
  // Warning-tier (pace/spike) suppresses positive-tier rules within this same call —
  // preserves computeInsight's original waterfall for the warning/positive boundary
  // (see notification-engine plan §4: "budget exceeded vs you're doing great").
  let warningFired = false
  const budget = d.weeklyBudget

  // 0. Period budget threshold — independent of the pace prediction below (the old
  // NotificationsSheet showed both simultaneously), fires on actual %-used crossing
  // 90/100%, not on a projected trajectory.
  {
    const weekStartIso0 = localIso(getWeekStart(now))
    if (budget > 0 && d.weeklySpent > 0) {
      const pct = (d.weeklySpent / budget) * 100
      if (pct >= 100) {
        notifications.push({
          id: `budget_period_alert_${weekStartIso0}`,
          domain: 'budget',
          priority: 'critical',
          tone: 'critical',
          title: 'Budget exceeded!',
          message: `You've spent ₹${Math.round(d.weeklySpent).toLocaleString('en-IN')} of your ₹${Math.round(budget).toLocaleString('en-IN')} budget (${Math.round(pct)}%).`,
          createdAt: nowIso,
          dismissible: false,
        })
      } else if (pct >= 90) {
        notifications.push({
          id: `budget_period_alert_${weekStartIso0}`,
          domain: 'budget',
          priority: 'high',
          tone: 'warning',
          title: 'Budget almost spent',
          message: `You've spent ₹${Math.round(d.weeklySpent).toLocaleString('en-IN')} of your ₹${Math.round(budget).toLocaleString('en-IN')} budget (${Math.round(pct)}%).`,
          createdAt: nowIso,
          dismissible: true,
        })
      }
    }
  }

  // 1. Weekly budget pace
  const weekDay = now.getDay() || 7
  const weekStart = getWeekStart(now)
  const weekStartIso = localIso(weekStart)
  const weeklySpend = expenses
    .filter(t => t.transaction_date >= weekStartIso)
    .reduce((s, t) => s + t.amount, 0)
  const weekPct = budget > 0 ? (weeklySpend / budget) * 100 : 0
  const weekProgress = (weekDay / 7) * 100

  if (weekPct > weekProgress * 1.25 && weekPct < 90 && weeklySpend > 100) {
    const projected = Math.round((weeklySpend / weekDay) * 7)
    const overshoot = projected - budget
    if (overshoot > 0) {
      warningFired = true
      const pctFaster = weekProgress > 0 ? Math.round((weekPct / weekProgress - 1) * 100) : 0
      const daysLeft = Math.max(1, 7 - weekDay)
      const safeDaily = Math.max(0, Math.round((budget - weeklySpend) / daysLeft))

      const catThisWeek: Record<string, number> = {}
      expenses
        .filter(t => t.transaction_date >= weekStartIso)
        .forEach(t => {
          const n = catName(state, t.category_id)
          if (n === 'Uncategorized' || n === 'Transfer') return
          catThisWeek[n] = (catThisWeek[n] ?? 0) + t.amount
        })
      const reasons = Object.entries(catThisWeek)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, amount]) => ({ label, amount: Math.round(amount) }))

      notifications.push({
        id: `budget_pace_${weekStartIso}`,
        domain: 'budget',
        priority: 'high',
        tone: 'warning',
        title: 'Slow down this week',
        message: `You're spending ${pctFaster}% faster than planned. At your current pace you'll exceed your weekly budget by ₹${overshoot.toLocaleString('en-IN')}.`,
        recommendation: buildRecommendation('reduce_daily_spend', { amount: safeDaily }),
        reasons,
        projectedAmount: overshoot,
        remainingBudget: Math.max(0, Math.round(budget - weeklySpend)),
        safeDailySpend: safeDaily,
        progress: [
          { label: 'Week Progress', pct: Math.round(Math.min(100, weekProgress)) },
          { label: 'Budget Used', pct: Math.round(Math.min(100, weekPct)) },
        ],
        actions: [
          { label: 'View Spending', target: { screen: 'spending' } },
          { label: 'View Weekly Budget', target: { screen: 'budget' } },
        ],
        createdAt: nowIso,
        dismissible: true,
      })
    }
  }

  // 2. Category spike vs last month same point
  if (lastMonthSpend > 0) {
    const catThis: Record<string, number> = {}
    const catLast: Record<string, number> = {}
    thisMonth.forEach(t => { const n = catName(state, t.category_id); catThis[n] = (catThis[n] ?? 0) + t.amount })
    lastToSameDay.forEach(t => { const n = catName(state, t.category_id); catLast[n] = (catLast[n] ?? 0) + t.amount })

    let topSpike: { cat: string; pct: number; amount: number } | null = null
    for (const [cat, amount] of Object.entries(catThis)) {
      if (cat === 'Uncategorized' || cat === 'Transfer') continue
      const last = catLast[cat] ?? 0
      if (last > 200 && amount > 300) {
        const pct = ((amount - last) / last) * 100
        if (pct > 30 && (!topSpike || pct > topSpike.pct)) topSpike = { cat, pct, amount }
      }
    }
    if (topSpike) {
      warningFired = true
      const slug = topSpike.cat.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      notifications.push({
        id: `budget_spike_${slug}_${monthKey}`,
        domain: 'budget',
        priority: 'medium',
        tone: 'warning',
        title: `${topSpike.cat} spend jumped`,
        message: `${topSpike.cat} is up ${Math.round(topSpike.pct)}% vs last month — ₹${Math.round(topSpike.amount).toLocaleString('en-IN')} so far.`,
        recommendation: buildRecommendation('review_category', { category: topSpike.cat }),
        createdAt: nowIso,
        dismissible: true,
      })
    }
  }

  if (!warningFired) {
    // 3. Good progress vs last month same point
    if (lastMonthSpend > 500 && thisMonthSpend < lastMonthSpend * 0.8) {
      const saved = Math.round(lastMonthSpend - thisMonthSpend)
      notifications.push({
        id: `budget_progress_${monthKey}`,
        domain: 'budget',
        priority: 'positive',
        tone: 'positive',
        title: 'Ahead of last month',
        message: `You're spending ₹${saved.toLocaleString('en-IN')} less than this time last month. Nice work!`,
        createdAt: nowIso,
        dismissible: true,
      })
    } else {
      // 4. Tracking discipline — celebrate consistent logging when on track
      const txCount = thisMonth.length
      const daysTracked = new Set(thisMonth.map(t => t.transaction_date.slice(0, 10))).size
      const onTrack = weekPct <= weekProgress * 1.15
      if (txCount >= 6 && daysTracked >= 4 && onTrack) {
        const isEndOfMonth = now.getDate() >= 25
        notifications.push({
          id: `budget_discipline_${monthKey}`,
          domain: 'budget',
          priority: 'positive',
          tone: 'positive',
          title: isEndOfMonth ? 'Strong month!' : 'Great tracking discipline',
          message: isEndOfMonth
            ? `You logged ${txCount} transactions across ${daysTracked} days. That kind of consistency is how you stay in control.`
            : `${txCount} transactions logged across ${daysTracked} days this month — great tracking discipline.`,
          createdAt: nowIso,
          dismissible: true,
        })
      } else {
        // 5. Top category this month (neutral fallback)
        const catTotals: Record<string, number> = {}
        thisMonth.forEach(t => {
          const n = catName(state, t.category_id)
          if (n === 'Uncategorized' || n === 'Transfer') return
          catTotals[n] = (catTotals[n] ?? 0) + t.amount
        })
        const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]
        if (topCat && topCat[1] > 200) {
          notifications.push({
            id: `budget_top_category_${monthKey}`,
            domain: 'budget',
            priority: 'info',
            tone: 'info',
            title: 'Biggest spend this month',
            message: `${topCat[0]} is your biggest spend this month — ₹${Math.round(topCat[1]).toLocaleString('en-IN')}.`,
            createdAt: nowIso,
            dismissible: true,
          })
        }
      }
    }
  }

  return notifications
}

// ────────────────────────────────────────────────────────────────────────────
// Domain: cash_health — owns live cash-shortfall status and forecasted
// negative-balance/recovery. Never emits budget pace or bill due-dates.
// ────────────────────────────────────────────────────────────────────────────

export function generateCashHealthNotifications(state: AppState, d: DerivedMetrics): AppNotification[] {
  const now = new Date()
  const nowIso = localIso(now)
  const cycleKey = d.financialCycle ? localIso(d.financialCycle.cycleStart) : nowIso

  if (!d.cashHealth) return []

  // Structurally exclusive: cashHealth.status is a single value, so exactly one
  // of shortfall/healthy branches below can ever fire — "Cash Healthy AND Cash
  // Shortfall" can never both appear.
  if (d.cashHealth.status === 'shortfall') {
    return [{
      id: `cash_shortfall_${cycleKey}`,
      domain: 'cash_health',
      priority: 'critical',
      tone: 'critical',
      title: d.cashHealth.message,
      message: d.cashHealth.description,
      recommendation: buildRecommendation('delay_discretionary'),
      createdAt: nowIso,
      dismissible: false,
    }]
  }

  const forecast = buildCashFlowForecast(state, d)
  if (forecast.lowestBalance < 0 && forecast.lowestBalanceDate) {
    const dateLabel = new Date(forecast.lowestBalanceDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
    return [{
      id: `cash_forecast_negative_${forecast.lowestBalanceDate}`,
      domain: 'cash_health',
      priority: 'high',
      tone: 'warning',
      title: 'Balance may go negative',
      message: `If spending continues, your balance could become negative on ${dateLabel}.`,
      recommendation: buildRecommendation('delay_discretionary'),
      projectedAmount: forecast.lowestBalance,
      createdAt: nowIso,
      dismissible: true,
    }]
  }

  return [{
    id: `cash_sufficient_${cycleKey}`,
    domain: 'cash_health',
    priority: 'positive',
    tone: 'positive',
    title: "You're covered",
    message: 'Your current balance is sufficient to cover all upcoming commitments this cycle.',
    createdAt: nowIso,
    dismissible: true,
  }]
}

// ────────────────────────────────────────────────────────────────────────────
// Domain: bills — owns commitment/EMI and credit-card due/overdue. Never emits
// savings due-dates or borrowing repayment heuristics.
// Takes the already-computed Reminder[] (buildReminders) as input rather than
// recomputing due dates a fourth time — see App.tsx wiring.
// ────────────────────────────────────────────────────────────────────────────

export function generateBillNotifications(_state: AppState, _d: DerivedMetrics, reminders: Reminder[]): AppNotification[] {
  const nowIso = localIso(new Date())

  return reminders.map(r => {
    // Reminder.daysLeft is computed by buildReminders' getDaysUntil, which — for a
    // bill due exactly today — currently rolls forward to next month rather than
    // returning 0 (a pre-existing quirk shared by 3 call sites, out of this plan's
    // scope to fix). The `<= 0` critical branch is intentionally kept for when that
    // due-date math is eventually corrected.
    const priority: NotificationPriority = r.daysLeft <= 0 ? 'critical' : r.urgent ? 'high' : 'medium'
    const tone: NotificationTone = priority === 'critical' ? 'critical' : 'warning'
    const dueLabel = r.daysLeft <= 0 ? 'today' : r.daysLeft === 1 ? 'tomorrow' : `in ${r.daysLeft} days`

    return {
      // Reuses the Reminder's own id verbatim (not prefixed) so dismissing a bill
      // from RemindersBar's compact dashboard widget and from the Notifications
      // sheet share the same snooze-map entry instead of drifting out of sync.
      id: r.id,
      domain: 'bills',
      priority,
      tone,
      title: r.title,
      message: `${r.subtitle} — due ${dueLabel}.`,
      recommendation: buildRecommendation('pay_bill', { name: r.commitment?.name ?? r.title }),
      actions: [{ label: 'View Bills', target: { screen: 'bills' } }],
      createdAt: nowIso,
      dismissible: priority !== 'critical',
      meta: r.commitment ? { entityId: r.commitment.id, entityType: 'commitment' } : undefined,
    }
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Domain: income — owns salary expected/received. Never emits forecast balance
// or obligations content.
// ────────────────────────────────────────────────────────────────────────────

export function generateIncomeNotifications(state: AppState, d: DerivedMetrics): AppNotification[] {
  void d
  const now = new Date()
  const nowIso = localIso(now)

  // Received-today check first, with an early return — this is the suppression
  // that prevents "salary expected" and "salary received" ever firing together.
  const receivedToday = state.transactions.find(t => t.transaction_date === nowIso && isPrimaryIncomeTransaction(t, state))
  if (receivedToday) {
    return [{
      id: `income_salary_received_${receivedToday.transaction_date}`,
      domain: 'income',
      priority: 'info',
      tone: 'info',
      title: 'Salary received',
      message: `₹${Math.round(receivedToday.amount).toLocaleString('en-IN')} credited today.`,
      createdAt: nowIso,
      dismissible: true,
    }]
  }

  const next = getExpectedNextPrimaryIncome(state, now)
  if (next.expectedDate) {
    const midnightNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const daysUntil = Math.round((next.expectedDate.getTime() - midnightNow.getTime()) / 86400000)
    if (daysUntil >= 0 && daysUntil <= 3) {
      return [{
        id: `income_salary_expected_${localIso(next.expectedDate)}`,
        domain: 'income',
        priority: 'medium',
        tone: 'info',
        title: 'Salary expected soon',
        message: daysUntil === 0 ? 'Salary expected today.' : `Next salary arrives in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`,
        confidence: next.confidence,
        createdAt: nowIso,
        dismissible: true,
      }]
    }
  }

  return []
}

// ────────────────────────────────────────────────────────────────────────────
// Domain: goals — owns per-goal progress/reached/behind-pace. Never emits
// savings-target content (separate table/feature).
// ────────────────────────────────────────────────────────────────────────────

const GOAL_MILESTONES = [25, 50, 75]

export function generateGoalNotifications(state: AppState, _d: DerivedMetrics): AppNotification[] {
  const now = new Date()
  const nowIso = localIso(now)
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const notifications: AppNotification[] = []

  for (const goal of state.goals) {
    if (!goal.is_active) continue
    // calcGoalStatus returns exactly one health value per goal, so "reached" and
    // "behind" can never both fire for the same goal (they can for different goals).
    const status = calcGoalStatus(goal)

    if (status.isComplete) {
      notifications.push({
        id: `goal_${goal.id}_reached`,
        domain: 'goals',
        priority: 'positive',
        tone: 'positive',
        title: 'Goal reached!',
        message: `Your ${goal.name} goal hit 100% — ₹${Math.round(goal.current_saved).toLocaleString('en-IN')} saved.`,
        createdAt: nowIso,
        dismissible: true,
        meta: { entityId: goal.id, entityType: 'goal' },
      })
      continue
    }

    const crossed = GOAL_MILESTONES.filter(m => status.pct >= m).pop()
    if (crossed) {
      notifications.push({
        id: `goal_${goal.id}_milestone_${crossed}`,
        domain: 'goals',
        priority: 'positive',
        tone: 'positive',
        title: `${crossed}% there`,
        message: `${goal.name} is ${crossed}% complete.`,
        createdAt: nowIso,
        dismissible: true,
        meta: { entityId: goal.id, entityType: 'goal' },
      })
    }

    if (status.health === 'needs_attention') {
      const forecast = calcGoalForecast(goal)
      notifications.push({
        id: `goal_${goal.id}_behind_${monthKey}`,
        domain: 'goals',
        priority: 'medium',
        tone: 'warning',
        title: 'Behind pace',
        message: forecast.requiredPace != null
          ? `${goal.name} needs ₹${forecast.requiredPace.toLocaleString('en-IN')}/month to hit its date — you're currently averaging ₹${forecast.currentPace.toLocaleString('en-IN')}.`
          : `${goal.name} is behind its target pace.`,
        recommendation: forecast.monthlyGap != null && forecast.monthlyGap > 0
          ? buildRecommendation('increase_savings_pace', { amount: forecast.monthlyGap })
          : undefined,
        createdAt: nowIso,
        dismissible: true,
        meta: { entityId: goal.id, entityType: 'goal' },
      })
    }
  }

  return notifications
}

// ────────────────────────────────────────────────────────────────────────────
// Domain: savings — owns recurring contribution due dates and target-reached.
// Never emits goal progress content.
// ────────────────────────────────────────────────────────────────────────────

export function generateSavingsNotifications(state: AppState, _d: DerivedMetrics): AppNotification[] {
  const now = new Date()
  const nowIso = localIso(now)
  const midnightNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const notifications: AppNotification[] = []

  for (const sv of state.savings) {
    if (sv.is_active === false) continue

    const isComplete = sv.total_target != null && sv.total_target > 0 && sv.current_value >= sv.total_target
    if (isComplete) {
      notifications.push({
        id: `savings_${sv.id}_target_reached`,
        domain: 'savings',
        priority: 'positive',
        tone: 'positive',
        title: 'Target reached',
        message: `Your ${sv.name} scheme reached its ₹${Math.round(sv.total_target!).toLocaleString('en-IN')} target.`,
        createdAt: nowIso,
        dismissible: true,
        meta: { entityId: sv.id, entityType: 'savings' },
      })
      continue
    }

    if (!sv.is_recurring) continue
    if (sv.total_installments != null && sv.current_installment >= sv.total_installments) continue

    const nextDue = getNextRecurringDueDate(sv, now)
    if (!nextDue) continue
    const daysUntil = Math.round((nextDue.getTime() - midnightNow.getTime()) / 86400000)
    if (daysUntil >= 0 && daysUntil <= 3) {
      notifications.push({
        id: `savings_${sv.id}_due_${localIso(nextDue)}`,
        domain: 'savings',
        priority: 'medium',
        tone: 'warning',
        title: daysUntil === 0 ? `${sv.name} due today` : `${sv.name} due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
        message: `₹${Math.round(sv.amount).toLocaleString('en-IN')} ${sv.name} contribution due ${daysUntil === 0 ? 'today' : nextDue.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}.`,
        createdAt: nowIso,
        dismissible: true,
        meta: { entityId: sv.id, entityType: 'savings' },
      })
    }
  }

  return notifications
}

// ────────────────────────────────────────────────────────────────────────────
// Domain: challenge — owns daily-challenge streak milestones and
// under-budget-today. Never emits goal/savings content.
// ────────────────────────────────────────────────────────────────────────────

const STREAK_MILESTONES = [3, 7, 14, 30]

export function generateChallengeNotifications(state: AppState, d: DerivedMetrics): AppNotification[] {
  if (!(state.settings.challenge_enabled ?? false)) return []
  const nowIso = localIso(new Date())
  const notifications: AppNotification[] = []

  // challenge_streak increments by exactly 1 per successful day, so it equals any
  // given milestone value on exactly one calendar day — embedding that day in the
  // id means a later re-achievement (after breaking the streak) gets a fresh id
  // instead of being blocked by a stale dismissal from the first time.
  const streak = state.settings.challenge_streak ?? 0
  if (STREAK_MILESTONES.includes(streak)) {
    notifications.push({
      id: `challenge_streak_${streak}_${nowIso}`,
      domain: 'challenge',
      priority: 'positive',
      tone: 'positive',
      title: `${streak}-day streak!`,
      message: `You've hit your daily challenge target ${streak} days running.`,
      createdAt: nowIso,
      dismissible: true,
    })
  }

  const challenge = computeChallenge(state, state.settings.challenge_difficulty ?? 'medium', d.realFreeMoney, d.financialCycle)
  if (challenge.status === 'on_track' && challenge.remaining > 0 && challenge.spentToday > 0) {
    notifications.push({
      id: `challenge_under_budget_${nowIso}`,
      domain: 'challenge',
      priority: 'positive',
      tone: 'positive',
      title: 'Stayed under budget',
      message: `You're ₹${Math.round(challenge.remaining).toLocaleString('en-IN')} under today's challenge target so far.`,
      createdAt: nowIso,
      dismissible: true,
    })
  }

  return notifications
}

// ────────────────────────────────────────────────────────────────────────────
// Snooze / dismissal — client-side only (localStorage), consistent with the
// pre-existing dismissedAlerts precedent. Key bumped to _v2 since the value
// shape changed from a permanent id array to a { id: hideUntilTimestamp } map
// (same _v2-on-semantics-change convention already used by PWAPrompt.tsx).
// ────────────────────────────────────────────────────────────────────────────

export type SnoozeDuration = 'permanent' | 'tomorrow' | 'next_week'

function snoozeStorageKey(userId: string): string {
  return `mp_dismissed_alerts_v2_${userId}`
}

export function getSnoozeMap(userId: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(snoozeStorageKey(userId)) || '{}')
  } catch {
    return {}
  }
}

export function snoozeNotification(userId: string, id: string, duration: SnoozeDuration): Record<string, number> {
  const map = getSnoozeMap(userId)
  const now = new Date()
  let hideUntil: number
  if (duration === 'permanent') {
    hideUntil = Number.MAX_SAFE_INTEGER
  } else if (duration === 'tomorrow') {
    hideUntil = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  } else {
    const weekStart = getWeekStart(now)
    hideUntil = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7).getTime()
  }
  const next = { ...map, [id]: hideUntil }
  try { localStorage.setItem(snoozeStorageKey(userId), JSON.stringify(next)) } catch {}
  return next
}

export function isSnoozed(id: string, map: Record<string, number>): boolean {
  return map[id] != null && Date.now() < map[id]
}

// ────────────────────────────────────────────────────────────────────────────
// Orchestration pipeline
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 8

export function dedupe(list: AppNotification[]): AppNotification[] {
  const seen = new Set<string>()
  const out: AppNotification[] = []
  for (const n of list) {
    if (seen.has(n.id)) continue
    seen.add(n.id)
    out.push(n)
  }
  return out
}

// Cross-domain conflict suppression. Today's four example contradictions (cash
// healthy/shortfall, salary expected/received, budget exceeded/doing-great, goal
// reached/behind) are all intra-domain and already handled inside their own
// generator (see each generator's comments above). This stage is kept as an
// explicit, named step — currently a no-op — so a future generator that
// introduces a genuine cross-domain conflict has an obvious place to add a rule.
function suppressConflicts(list: AppNotification[]): AppNotification[] {
  return list
}

export function sortByPriority(list: AppNotification[]): AppNotification[] {
  return [...list].sort((a, b) => {
    const w = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
    if (w !== 0) return w
    return b.createdAt.localeCompare(a.createdAt)
  })
}

function applySnooze(list: AppNotification[], snoozeMap: Record<string, number>): AppNotification[] {
  return list.filter(n => n.priority === 'critical' || !isSnoozed(n.id, snoozeMap))
}

// Refined, conditional positive-guarantee rule:
//  - a Critical notification present  -> never force a positive slot
//  - only High/Medium/Info present    -> guarantee exactly one positive slot
//  - nothing else present             -> positives already sort to the top naturally
export function applyPositiveGuarantee(sorted: AppNotification[]): AppNotification[] {
  if (sorted.some(n => n.priority === 'critical')) return sorted

  const hasWarning = sorted.some(n => n.priority === 'high' || n.priority === 'medium' || n.priority === 'info')
  if (!hasWarning) return sorted

  const positives = sorted.filter(n => n.priority === 'positive')
  if (positives.length === 0) return sorted

  const visible = sorted.slice(0, DEFAULT_LIMIT)
  if (visible.some(n => n.priority === 'positive')) return sorted

  const guaranteed = [...visible]
  guaranteed[guaranteed.length - 1] = positives[0]
  const guaranteedIds = new Set(guaranteed.map(n => n.id))
  const rest = sorted.filter(n => !guaranteedIds.has(n.id))
  return [...guaranteed, ...rest]
}

function limitTopN(list: AppNotification[], n: number = DEFAULT_LIMIT): AppNotification[] {
  return list.slice(0, n)
}

export function getAppNotifications(
  state: AppState,
  d: DerivedMetrics,
  reminders: Reminder[],
  snoozeMap: Record<string, number>,
): AppNotification[] {
  const generated = [
    ...generateBudgetNotifications(state, d),
    ...generateCashHealthNotifications(state, d),
    ...generateBillNotifications(state, d, reminders),
    ...generateIncomeNotifications(state, d),
    ...generateGoalNotifications(state, d),
    ...generateSavingsNotifications(state, d),
    ...generateChallengeNotifications(state, d),
  ]
  const deduped = dedupe(generated)
  const suppressed = suppressConflicts(deduped)
  const snoozed = applySnooze(suppressed, snoozeMap)
  const sorted = sortByPriority(snoozed)
  const guaranteed = applyPositiveGuarantee(sorted)
  return limitTopN(guaranteed)
}
