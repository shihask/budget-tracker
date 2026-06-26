import { supabase } from '@/lib/supabase'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-categorize`

export type AIParsedExpense = {
  description: string | null
  amount: number | null
  account: string | null
  category: string | null
}

export async function parseExpenseWithAI(
  text: string,
  categoryNames: string[],
  accountNames: string[],
  groupNames: string[],
  onUsed?: (n: number) => void
): Promise<AIParsedExpense | null> {
  if (!text.trim()) return null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ mode: 'parse', text, categoryNames, accountNames, groupNames }),
    })

    if (res.status === 429) { console.warn('Mint daily limit reached (100/day)'); return null }
    if (!res.ok) return null

    const data = await res.json()
    if (data.used != null) onUsed?.(data.used)
    return {
      description: data.description ?? null,
      amount: data.amount ?? null,
      account: data.account ?? null,
      category: data.category ?? null,
    }
  } catch (e) {
    console.error('[AI] parse failed:', e)
    return null
  }
}

export type AICategorizationResult =
  | { type: 'category'; name: string }
  | { type: 'suggestion'; name: string; group: string }

export interface AffordabilityContext {
  freeMoney: number
  safePurchasingPower: number
  daysUntilSalary: number | null
  incomePatternLabel?: string
  weeklyBudget: number
  weeklySpent: number
  spendingByGroup: Record<string, number>
  totalSpent30d: number
  forecastVerdict?: string
  forecastLowest?: number
  forecastLowestDate?: string
  forecastRecoveryDate?: string
  forecastDrivers?: { title: string; amount: number }[]
}

export async function affordabilityInsightWithAI(
  item: string,
  amount: number,
  ctx: AffordabilityContext,
  onUsed?: (n: number) => void
): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const groupLines = Object.entries(ctx.spendingByGroup)
      .sort((a, b) => b[1] - a[1])
      .map(([g, v]) => `  ${g}: ₹${Math.round(v).toLocaleString('en-IN')}`)
      .join('\n')

    const forecastLines = [
      ctx.forecastVerdict ? `Forecast verdict: ${ctx.forecastVerdict}` : null,
      ctx.forecastLowest != null ? `Projected lowest balance after purchase: ₹${Math.round(ctx.forecastLowest).toLocaleString('en-IN')}${ctx.forecastLowestDate ? ` on ${ctx.forecastLowestDate}` : ''}` : null,
      ctx.forecastRecoveryDate ? `Balance recovers on ${ctx.forecastRecoveryDate}` : null,
      ctx.forecastDrivers?.length ? `Main upcoming obligations:\n${ctx.forecastDrivers.map(d => `  ${d.title}: ₹${Math.round(d.amount).toLocaleString('en-IN')}`).join('\n')}` : null,
    ].filter(Boolean)

    const context = [
      `Real Free Money: ₹${Math.round(ctx.freeMoney).toLocaleString('en-IN')}`,
      `Safe Purchasing Power: ₹${Math.round(ctx.safePurchasingPower).toLocaleString('en-IN')}`,
      ctx.daysUntilSalary != null ? `Days until next ${ctx.incomePatternLabel ?? 'salary'}: ${ctx.daysUntilSalary}` : null,
      `Weekly budget: ₹${Math.round(ctx.weeklyBudget).toLocaleString('en-IN')}, this week spent: ₹${Math.round(ctx.weeklySpent).toLocaleString('en-IN')}`,
      `Last 30-day expense breakdown:\n${groupLines || '  (no data)'}`,
      `Total 30-day spend: ₹${Math.round(ctx.totalSpent30d).toLocaleString('en-IN')}`,
      ...forecastLines,
    ].filter(Boolean).join('\n')

    const itemLabel = item.trim() || 'this item'
    const incomeWord = ctx.incomePatternLabel ?? 'income'
    const message = `Should I buy ${itemLabel} for ₹${amount.toLocaleString('en-IN')}? Give me a direct, honest opinion based on my spending patterns, free money, and days until next ${incomeWord}. 2-3 sentences max.`

    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ mode: 'chat', once: true, message, context, history: [] }),
    })

    if (res.status === 429) return 'Mint daily limit reached (100/day). Try again next month.'
    if (!res.ok) return null

    const data = await res.json()
    if (data.used != null) onUsed?.(data.used)
    return data.reply ?? null
  } catch (e) {
    console.error('[AI] affordability insight failed:', e)
    return null
  }
}

export interface AnalyticsInsightContext {
  totalLast7Days: number
  peakDay: { label: string; value: number }
  weekBars: { label: string; value: number }[]
  topCategories: { name: string; value: number }[]
  totalThisMonth: number
  weeklyBudget: number
  weeklySpent: number
}

export async function analyticsInsightWithAI(ctx: AnalyticsInsightContext, onUsed?: (n: number) => void): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const prev = ctx.weekBars[ctx.weekBars.length - 2]?.value ?? 0
    const curr = ctx.weekBars[ctx.weekBars.length - 1]?.value ?? 0
    const weekChange = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null

    const catLines = ctx.topCategories
      .map(c => `${c.name}: ₹${Math.round(c.value).toLocaleString('en-IN')} (${ctx.totalThisMonth > 0 ? Math.round((c.value / ctx.totalThisMonth) * 100) : 0}%)`)
      .join(', ')

    const context = [
      `Last 7 days total: ₹${Math.round(ctx.totalLast7Days).toLocaleString('en-IN')}`,
      `Peak day: ${ctx.peakDay.label} at ₹${Math.round(ctx.peakDay.value).toLocaleString('en-IN')}`,
      weekChange != null ? `Week-over-week: ${weekChange > 0 ? '+' : ''}${weekChange}%` : null,
      `This week — budget: ₹${Math.round(ctx.weeklyBudget).toLocaleString('en-IN')}, spent: ₹${Math.round(ctx.weeklySpent).toLocaleString('en-IN')}`,
      `Top categories this month: ${catLines}`,
      `Total this month: ₹${Math.round(ctx.totalThisMonth).toLocaleString('en-IN')}`,
    ].filter(Boolean).join('\n')

    const message = `Analyse my spending and give me a concise, actionable insight. Highlight what's notable — peaks, trends, where my money is going. 2-3 sentences only.`

    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ mode: 'chat', once: true, message, context, history: [] }),
    })

    if (res.status === 429) return 'Mint daily limit reached (100/day). Try again next month.'
    if (!res.ok) return null

    const data = await res.json()
    if (data.used != null) onUsed?.(data.used)
    return data.reply ?? null
  } catch {
    return null
  }
}

export interface GoalPlanContext {
  item: string
  goalAmount: number
  currentSavings: number
  required: number
  monthlyCapacity: number
  monthsNeeded: number
  targetDate: string        // e.g. "December 2026"
  reductions: { group: string; suggestion: number }[]
}

export async function goalPlanAdviceWithAI(
  ctx: GoalPlanContext,
  onUsed?: (n: number) => void
): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const reductionLines = ctx.reductions
      .map(r => `${r.group}: reduce by ₹${r.suggestion.toLocaleString('en-IN')}/month`)
      .join(', ')

    const context = [
      `Goal: ${ctx.item || 'purchase'} worth ₹${ctx.goalAmount.toLocaleString('en-IN')}`,
      `Currently available: ₹${ctx.currentSavings.toLocaleString('en-IN')}`,
      `Still needed: ₹${ctx.required.toLocaleString('en-IN')}`,
      `Monthly saving capacity: ₹${ctx.monthlyCapacity.toLocaleString('en-IN')}`,
      `Months to goal: ${ctx.monthsNeeded}`,
      `Target date: ${ctx.targetDate}`,
      reductionLines ? `Spending reduction opportunities: ${reductionLines}` : null,
    ].filter(Boolean).join('\n')

    const message = `Give me a 2-3 sentence coaching message as Mint (a personal finance coach). Reference the target date and one specific action they can take. Be direct and encouraging. No emojis.`

    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ mode: 'chat', once: true, message, context, history: [] }),
    })

    if (res.status === 429) return 'Mint daily limit reached (100/day). Try again tomorrow.'
    if (!res.ok) return null

    const data = await res.json()
    if (data.used != null) onUsed?.(data.used)
    return data.reply ?? null
  } catch {
    return null
  }
}

export interface GoalProgressContext {
  name: string
  goalType: 'purchase' | 'savings' | 'event'
  goalAmount: number
  currentSaved: number
  monthlyTarget: number
  targetDate: string
  pct: number
  daysAhead?: number
  daysBehind?: number
  extraNeeded?: number
}

export async function goalProgressInsightWithAI(
  ctx: GoalProgressContext,
  onUsed?: (n: number) => void
): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const status = ctx.daysAhead != null
      ? `ahead of schedule by ${ctx.daysAhead} days`
      : ctx.daysBehind != null
      ? `behind schedule by ${ctx.daysBehind} days — needs ₹${(ctx.extraNeeded ?? 0).toLocaleString('en-IN')}/month extra to catch up`
      : 'on track'

    const context = [
      `Goal: "${ctx.name}" (${ctx.goalType})`,
      `Target: ₹${ctx.goalAmount.toLocaleString('en-IN')} by ${ctx.targetDate}`,
      `Saved so far: ₹${ctx.currentSaved.toLocaleString('en-IN')} (${ctx.pct}%)`,
      `Monthly target: ₹${ctx.monthlyTarget.toLocaleString('en-IN')}`,
      `Progress status: ${status}`,
    ].join('\n')

    const message = ctx.daysAhead != null
      ? `Give me a 1-2 sentence motivational coaching message as Mint. Acknowledge I'm ahead of schedule. No emojis.`
      : `Give me a 1-2 sentence honest coaching message as Mint. Acknowledge I'm behind and suggest a specific action to get back on track. No emojis.`

    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ mode: 'chat', once: true, message, context, history: [] }),
    })

    if (res.status === 429) return 'Mint daily limit reached. Try again next month.'
    if (!res.ok) return null

    const data = await res.json()
    if (data.used != null) onUsed?.(data.used)
    return data.reply ?? null
  } catch {
    return null
  }
}

export async function categorizeWithAI(
  description: string,
  categoryNames: string[],
  groupNames: string[]
): Promise<AICategorizationResult | null> {
  if (!description.trim()) return null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ description, categoryNames, groupNames }),
    })

    if (res.status === 429) { console.warn('Mint daily limit reached (100/day)'); return null }
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[AI] edge function error', res.status, errText)
      return null
    }

    const data = await res.json()
    console.log('[AI] raw response:', data)

    if (data.suggestion?.name) {
      return { type: 'suggestion', name: data.suggestion.name, group: data.suggestion.group }
    }
    if (data.result) {
      const match = categoryNames.find(c => c.toLowerCase() === data.result.toLowerCase())
      if (match) return { type: 'category', name: match }
      console.warn('[AI] returned unknown category:', data.result)
    }
    return null
  } catch (e) {
    console.error('[AI] fetch failed:', e)
    return null
  }
}
