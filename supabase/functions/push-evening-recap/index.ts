// Triggered by pg_cron at 8:30 PM daily.
// Sends a personalised daily spending recap to each subscribed user.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function fmt(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const today = new Date().toISOString().slice(0, 10)

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('user_id')

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const userIds = [...new Set(subs.map((s: any) => s.user_id))]

    // Check notification preferences
    const { data: allSettings } = await supabase
      .from('settings')
      .select('user_id, notifications_enabled, notify_daily_reminder, weekly_budget, budget_period')
      .in('user_id', userIds)

    const settingsMap = new Map((allSettings ?? []).map((s: any) => [s.user_id, s]))
    const enabledUserIds = userIds.filter(uid => {
      const s = settingsMap.get(uid)
      return s?.notifications_enabled && s?.notify_daily_reminder !== false
    })

    if (enabledUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Fetch today's transactions
    const { data: todayTxns } = await supabase
      .from('transactions')
      .select('user_id, amount, transaction_type, category_id')
      .in('user_id', enabledUserIds)
      .eq('transaction_date', today)

    // Fetch categories for naming
    const { data: allCategories } = await supabase
      .from('categories')
      .select('id, name, user_id')
      .in('user_id', enabledUserIds)

    const catMap = new Map((allCategories ?? []).map((c: any) => [c.id, c.name]))

    // Compute period spend for budget remaining
    const now = new Date()
    function getPeriodStart(uid: string): string {
      const s = settingsMap.get(uid)
      const p = s?.budget_period ?? 'weekly'
      if (p === 'daily') return today
      if (p === 'monthly') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const day = now.getDay()
      const diff = now.getDate() - day + (day === 0 ? -6 : 1)
      return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().slice(0, 10)
    }

    // Fetch period expenses for budget context
    const weekStart = new Date(now)
    const weekDay = now.getDay()
    weekStart.setDate(now.getDate() - weekDay + (weekDay === 0 ? -6 : 1))
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

    const { data: periodTxns } = await supabase
      .from('transactions')
      .select('user_id, amount, transaction_date, transaction_type')
      .in('user_id', enabledUserIds)
      .eq('transaction_type', 'expense')
      .gte('transaction_date', monthStart)

    let totalSent = 0

    for (const uid of enabledUserIds) {
      const settings = settingsMap.get(uid)
      const userTodayTxns = (todayTxns ?? []).filter((t: any) => t.user_id === uid)
      const expenses = userTodayTxns.filter((t: any) => t.transaction_type === 'expense' || t.transaction_type === 'commitment')
      const income = userTodayTxns.filter((t: any) => t.transaction_type === 'income')

      const totalSpent = expenses.reduce((s: number, t: any) => s + t.amount, 0)
      const totalIncome = income.reduce((s: number, t: any) => s + t.amount, 0)
      const txCount = expenses.length

      // Top categories today
      const catSpend: Record<string, number> = {}
      expenses.forEach((t: any) => {
        const name = catMap.get(t.category_id) ?? 'Other'
        catSpend[name] = (catSpend[name] ?? 0) + t.amount
      })
      const topCats = Object.entries(catSpend)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)

      // Budget remaining
      const budget = settings?.weekly_budget ?? 5000
      const periodStart = getPeriodStart(uid)
      const periodSpend = (periodTxns ?? [])
        .filter((t: any) => t.user_id === uid && t.transaction_date >= periodStart)
        .reduce((s: number, t: any) => s + t.amount, 0)
      const remaining = Math.max(0, budget - periodSpend)
      const periodLabel = (settings?.budget_period ?? 'weekly') === 'daily' ? 'today' :
        (settings?.budget_period ?? 'weekly') === 'monthly' ? 'this month' : 'this week'

      let title: string
      let message: string

      if (txCount === 0 && totalIncome === 0) {
        title = 'Daily Recap'
        message = `No transactions recorded today.\n${fmt(remaining)} remaining ${periodLabel}.`
      } else {
        title = 'Daily Recap'
        const lines: string[] = []

        if (totalSpent > 0) {
          lines.push(`Spent ${fmt(totalSpent)} across ${txCount} transaction${txCount === 1 ? '' : 's'}`)
          if (topCats.length > 0) {
            lines.push(topCats.map(([cat, amt]) => `${cat}: ${fmt(amt)}`).join(', '))
          }
        }
        if (totalIncome > 0) {
          lines.push(`Income: ${fmt(totalIncome)}`)
        }
        lines.push(`${fmt(remaining)} remaining ${periodLabel}`)

        message = lines.join('\n')
      }

      const { data } = await supabase.functions.invoke('push-send', {
        body: { user_id: uid, title, message, url: '/', tag: 'evening-recap' },
      })
      if (data?.sent) totalSent += data.sent
    }

    return new Response(JSON.stringify({ sent: totalSent, users: enabledUserIds.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('push-evening-recap error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
