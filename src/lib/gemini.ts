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
  groupNames: string[]
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

    if (res.status === 429) { console.warn('AI quota reached (100/month)'); return null }
    if (!res.ok) return null

    const data = await res.json()
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
  weeklyBudget: number
  weeklySpent: number
  spendingByGroup: Record<string, number>
  totalSpent30d: number
}

export async function affordabilityInsightWithAI(
  item: string,
  amount: number,
  ctx: AffordabilityContext
): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const groupLines = Object.entries(ctx.spendingByGroup)
      .sort((a, b) => b[1] - a[1])
      .map(([g, v]) => `  ${g}: ₹${Math.round(v).toLocaleString('en-IN')}`)
      .join('\n')

    const context = [
      `Real Free Money: ₹${Math.round(ctx.freeMoney).toLocaleString('en-IN')}`,
      `Safe Purchasing Power: ₹${Math.round(ctx.safePurchasingPower).toLocaleString('en-IN')}`,
      ctx.daysUntilSalary != null ? `Days until next salary: ${ctx.daysUntilSalary}` : null,
      `Weekly budget: ₹${Math.round(ctx.weeklyBudget).toLocaleString('en-IN')}, this week spent: ₹${Math.round(ctx.weeklySpent).toLocaleString('en-IN')}`,
      `Last 30-day expense breakdown:\n${groupLines || '  (no data)'}`,
      `Total 30-day spend: ₹${Math.round(ctx.totalSpent30d).toLocaleString('en-IN')}`,
    ].filter(Boolean).join('\n')

    const itemLabel = item.trim() || 'this item'
    const message = `Should I buy ${itemLabel} for ₹${amount.toLocaleString('en-IN')}? Give me a direct, honest opinion based on my spending patterns, free money, and days until salary. 2-3 sentences max.`

    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ mode: 'chat', message, context, history: [] }),
    })

    if (res.status === 429) return 'AI quota reached (100/month). Try again next month.'
    if (!res.ok) return null

    const data = await res.json()
    return data.reply ?? null
  } catch (e) {
    console.error('[AI] affordability insight failed:', e)
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

    if (res.status === 429) { console.warn('AI quota reached (100/month)'); return null }
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
