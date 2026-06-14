// Triggered by pg_cron every Wednesday and Saturday at 9 AM.
// Sends proactive financial coaching notifications: budget pace, category spikes, good progress.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
    // Same day of month last month (for apples-to-apples comparison)
    const lastMonthSameDayDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    const lastMonthSameDay = lastMonthSameDayDate.toISOString().slice(0, 10)

    // Week start (Monday)
    const weekDay = now.getDay() || 7
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - weekDay + 1)
    const weekStartStr = weekStart.toISOString().slice(0, 10)

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('user_id')

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const userIds = [...new Set(subs.map((s: any) => s.user_id))]

    const { data: settings } = await supabase
      .from('settings')
      .select('user_id, notify_weekly_summary, weekly_budget')
      .in('user_id', userIds)

    const enabledUsers = (settings ?? []).filter((s: any) => s.notify_weekly_summary !== false)
    if (enabledUsers.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const enabledIds = enabledUsers.map((s: any) => s.user_id)

    const { data: txns } = await supabase
      .from('transactions')
      .select('user_id, amount, transaction_date, category_id, transaction_type')
      .in('user_id', enabledIds)
      .eq('transaction_type', 'expense')
      .gte('transaction_date', lastMonthStart)
      .lte('transaction_date', todayStr)

    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, user_id')
      .in('user_id', enabledIds)

    let totalSent = 0

    await Promise.allSettled(
      enabledUsers.map(async (s: any) => {
        const userTxns: any[] = (txns ?? []).filter((t: any) => t.user_id === s.user_id)
        const userCats: any[] = (categories ?? []).filter((c: any) => c.user_id === s.user_id)

        const catName = (id: string | null) =>
          userCats.find((c: any) => c.id === id)?.name ?? 'Uncategorized'

        const thisMonthTxns = userTxns.filter(t => t.transaction_date >= thisMonthStart)
        const lastMonthTxns = userTxns.filter(t =>
          t.transaction_date >= lastMonthStart && t.transaction_date <= lastMonthSameDay
        )
        const weekTxns = userTxns.filter(t => t.transaction_date >= weekStartStr)

        const thisMonthSpend = thisMonthTxns.reduce((s: number, t: any) => s + t.amount, 0)
        const lastMonthSpend = lastMonthTxns.reduce((s: number, t: any) => s + t.amount, 0)
        const weeklySpend = weekTxns.reduce((s: number, t: any) => s + t.amount, 0)

        const budget = s.weekly_budget ?? 5000
        const weekPct = budget > 0 ? (weeklySpend / budget) * 100 : 0
        const weekProgress = (weekDay / 7) * 100

        let title = ''
        let message = ''

        // Priority 1: Budget pace (spending significantly ahead of weekly budget pace)
        if (weekPct > weekProgress * 1.25 && weekPct < 90 && weeklySpend > 200) {
          const projectedEnd = (weeklySpend / weekDay) * 7
          const overshoot = Math.round(projectedEnd - budget)
          if (overshoot > 0) {
            title = 'Budget Pace Alert'
            message = `At this pace, you'll overspend by ₹${overshoot.toLocaleString('en-IN')} this week. ₹${Math.round(weeklySpend).toLocaleString('en-IN')} spent in ${weekDay} day${weekDay > 1 ? 's' : ''}.`
          }
        }

        // Priority 2: Category spike vs same period last month
        if (!title && lastMonthSpend > 0) {
          const catTotalsThis: Record<string, number> = {}
          const catTotalsLast: Record<string, number> = {}

          thisMonthTxns.forEach((t: any) => {
            const n = catName(t.category_id)
            catTotalsThis[n] = (catTotalsThis[n] ?? 0) + t.amount
          })
          lastMonthTxns.forEach((t: any) => {
            const n = catName(t.category_id)
            catTotalsLast[n] = (catTotalsLast[n] ?? 0) + t.amount
          })

          let topSpike = { category: '', pct: 0, amount: 0 }
          for (const [cat, amount] of Object.entries(catTotalsThis)) {
            if (cat === 'Uncategorized' || cat === 'Transfer') continue
            const last = catTotalsLast[cat] ?? 0
            if (last > 300 && amount > 500) {
              const pct = ((amount - last) / last) * 100
              if (pct > 40 && pct > topSpike.pct) topSpike = { category: cat, pct, amount }
            }
          }

          if (topSpike.category) {
            title = 'Spending Spike'
            message = `Your ${topSpike.category} spending is ${Math.round(topSpike.pct)}% higher than last month (₹${Math.round(topSpike.amount).toLocaleString('en-IN')}). Worth keeping an eye on.`
          }
        }

        // Priority 3: Great progress vs same period last month
        if (!title && lastMonthSpend > 1000 && thisMonthSpend < lastMonthSpend * 0.8) {
          const savings = Math.round(lastMonthSpend - thisMonthSpend)
          title = 'Great Progress!'
          message = `You're spending ₹${savings.toLocaleString('en-IN')} less than this time last month. Keep it up!`
        }

        if (!title) return

        const { data } = await supabase.functions.invoke('push-send', {
          body: { user_id: s.user_id, title, message, url: '/', tag: 'coaching' },
        })
        if (data?.sent) totalSent += data.sent
      })
    )

    return new Response(JSON.stringify({ sent: totalSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('push-financial-coach error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
