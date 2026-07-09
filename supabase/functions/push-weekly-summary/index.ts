// Triggered by pg_cron every Monday at 9 AM.
// Sends a personalised weekly Mint summary to each subscribed user.
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

    // Last 7 days window
    const now = new Date()
    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const from = weekAgo.toISOString().slice(0, 10)
    const to = now.toISOString().slice(0, 10)

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('user_id')

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const allUserIds = subs.map((s: any) => s.user_id)

    const { data: settings } = await supabase
      .from('settings')
      .select('user_id, notifications_enabled, notify_weekly_summary, weekly_budget')
      .in('user_id', allUserIds)

    const enabledSettings = (settings ?? []).filter((s: any) => s.notifications_enabled && s.notify_weekly_summary !== false)
    if (enabledSettings.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const enabledUserIds = enabledSettings.map((s: any) => s.user_id)

    // Fetch expense transactions for the week
    const { data: txns } = await supabase
      .from('transactions')
      .select('user_id, amount, transaction_date, transaction_type')
      .in('user_id', enabledUserIds)
      .in('transaction_type', ['expense', 'commitment'])
      .gte('transaction_date', from)
      .lte('transaction_date', to)

    const spendByUser: Record<string, { total: number; days: Set<string> }> = {}
    for (const t of txns ?? []) {
      if (!spendByUser[t.user_id]) spendByUser[t.user_id] = { total: 0, days: new Set() }
      spendByUser[t.user_id].total += t.amount
      spendByUser[t.user_id].days.add(t.transaction_date)
    }

    let totalSent = 0

    await Promise.allSettled(
      enabledSettings.map(async (s: any) => {
        const spend = spendByUser[s.user_id]
        const daysTracked = spend?.days.size ?? 0
        const totalSpent = spend?.total ?? 0
        const budget = s.weekly_budget ?? 5000
        const pct = budget > 0 ? Math.round((totalSpent / budget) * 100) : 0

        let title = 'Mint Weekly Summary'
        let message: string

        if (daysTracked === 0) {
          message = "You didn't track any expenses last week. Start fresh this week!"
        } else if (daysTracked >= 5) {
          message = `You tracked expenses for ${daysTracked} days last week. Amazing streak — keep it going!`
        } else if (pct > 100) {
          message = `You spent ₹${totalSpent.toLocaleString('en-IN')} last week — ${pct - 100}% over budget. Let's aim lower this week.`
        } else if (pct > 80) {
          title = 'Mint Weekly Check-in'
          message = `You used ${pct}% of your weekly budget last week (₹${totalSpent.toLocaleString('en-IN')}). Finish strong this week.`
        } else {
          message = `Great week! You spent ₹${totalSpent.toLocaleString('en-IN')} — ${pct}% of your budget. Tracked ${daysTracked} of 7 days.`
        }

        const { data } = await supabase.functions.invoke('push-send', {
          body: { user_id: s.user_id, title, message, url: '/', tag: 'weekly-summary' },
        })
        if (data?.sent) totalSent += data.sent
      })
    )

    return new Response(JSON.stringify({ sent: totalSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('push-weekly-summary error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
