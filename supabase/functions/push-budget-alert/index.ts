// Called from the frontend when a transaction pushes weekly spend past 90%.
// Verifies the user's JWT, does an authoritative spend check, then sends.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import webpush from 'npm:web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

webpush.setVapidDetails(
  'mailto:hello@moneyplant.online',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    // Check user prefs
    const { data: settings } = await supabase
      .from('settings')
      .select('notify_budget_alert, notifications_enabled, weekly_budget, budget_period')
      .eq('user_id', user.id)
      .single()

    if (!settings?.notifications_enabled || settings?.notify_budget_alert === false) {
      return new Response(JSON.stringify({ skipped: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Authoritative spend check
    const now = new Date()
    const period = settings.budget_period ?? 'weekly'
    let periodStart: string
    if (period === 'daily') {
      periodStart = now.toISOString().slice(0, 10)
    } else if (period === 'monthly') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    } else {
      const day = now.getDay()
      const diff = now.getDate() - day + (day === 0 ? -6 : 1)
      periodStart = new Date(now.getFullYear(), now.getMonth(), diff).toISOString().slice(0, 10)
    }

    const { data: txns } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('transaction_type', 'expense')
      .gte('transaction_date', periodStart)

    const spent = (txns ?? []).reduce((s: number, t: any) => s + t.amount, 0)
    const budget = settings.weekly_budget ?? 5000
    const pct = budget > 0 ? (spent / budget) * 100 : 0

    if (pct < 90) {
      return new Response(JSON.stringify({ skipped: true, pct }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Get subscription and send
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', user.id)

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no_sub' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const isOver = pct >= 100
    const payload = JSON.stringify({
      title: isOver ? 'Budget Exceeded' : 'Budget Alert',
      body: isOver
        ? `You've exceeded your ${period} budget. Spent ₹${Math.round(spent).toLocaleString('en-IN')} of ₹${budget.toLocaleString('en-IN')}.`
        : `You've used ${Math.round(pct)}% of your ${period} budget. ₹${Math.round(budget - spent).toLocaleString('en-IN')} remaining.`,
      url: '/',
      tag: 'budget-alert',
    })

    let sent = 0
    const stale: string[] = []
    await Promise.allSettled(
      subs.map(async (row: any) => {
        try {
          await webpush.sendNotification(row.subscription, payload)
          sent++
        } catch (err: any) {
          if (err?.statusCode === 410 || err?.statusCode === 404) stale.push(row.subscription.endpoint)
        }
      })
    )
    if (stale.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', stale)
    }

    return new Response(JSON.stringify({ sent, pct: Math.round(pct) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('push-budget-alert error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
