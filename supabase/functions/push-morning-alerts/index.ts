// Triggered by pg_cron at 8 AM daily.
// Sends a consolidated morning alert covering CC due dates, commitment reminders,
// budget status, and spending spikes for each user.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getDaysUntil(day: number): number {
  const today = new Date()
  const target = new Date(today.getFullYear(), today.getMonth(), day)
  if (target <= today) target.setMonth(target.getMonth() + 1)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
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

    // Get all users with push subscriptions
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('user_id')

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const userIds = [...new Set(subs.map((s: any) => s.user_id))]

    // Filter by notification preferences
    const { data: allSettings } = await supabase
      .from('settings')
      .select('user_id, notifications_enabled, notify_budget_alert, notify_commitments, weekly_budget, budget_period')
      .in('user_id', userIds)

    const settingsMap = new Map((allSettings ?? []).map((s: any) => [s.user_id, s]))
    const enabledUserIds = userIds.filter(uid => {
      const s = settingsMap.get(uid)
      return s?.notifications_enabled
    })

    if (enabledUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Fetch credit cards for all users
    const { data: allCards } = await supabase
      .from('credit_cards')
      .select('id, name, due_day, bill_day, current_balance, is_active, user_id')
      .in('user_id', enabledUserIds)
      .eq('is_active', true)

    // Fetch commitments for all users
    const { data: allCommitments } = await supabase
      .from('commitments')
      .select('id, name, amount, due_day, last_paid_date, is_active, is_recurring, user_id')
      .in('user_id', enabledUserIds)
      .eq('is_active', true)
      .eq('is_recurring', true)

    // Fetch this month's expenses for spending spike detection
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)

    const { data: recentTxns } = await supabase
      .from('transactions')
      .select('user_id, amount, transaction_date, transaction_type, category_id')
      .in('user_id', enabledUserIds)
      .eq('transaction_type', 'expense')
      .gte('transaction_date', lastMonthStart)

    // Fetch categories for naming
    const { data: allCategories } = await supabase
      .from('categories')
      .select('id, name, user_id')
      .in('user_id', enabledUserIds)

    const catMap = new Map((allCategories ?? []).map((c: any) => [c.id, c.name]))

    // Compute budget spend
    const period = (uid: string) => settingsMap.get(uid)?.budget_period ?? 'weekly'
    function getPeriodStart(uid: string): string {
      const p = period(uid)
      if (p === 'daily') return now.toISOString().slice(0, 10)
      if (p === 'monthly') return thisMonthStart
      const day = now.getDay()
      const diff = now.getDate() - day + (day === 0 ? -6 : 1)
      return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().slice(0, 10)
    }

    let totalSent = 0

    for (const uid of enabledUserIds) {
      const settings = settingsMap.get(uid)
      const alerts: string[] = []

      // 1. Credit card due dates
      if (settings?.notify_commitments !== false) {
        const cards = (allCards ?? []).filter((c: any) => c.user_id === uid && c.current_balance > 0)
        for (const card of cards) {
          const daysLeft = getDaysUntil(card.due_day)
          if (daysLeft <= 7) {
            alerts.push(`${card.name} payment due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`)
          }
        }
      }

      // 2. Commitment reminders
      if (settings?.notify_commitments !== false) {
        const cms = (allCommitments ?? []).filter((c: any) => c.user_id === uid && c.due_day)
        for (const cm of cms) {
          if (cm.last_paid_date) {
            const paid = new Date(cm.last_paid_date)
            if (paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear()) continue
          }
          const daysLeft = getDaysUntil(cm.due_day)
          if (daysLeft <= 5) {
            alerts.push(`${cm.name} (${fmt(cm.amount)}) due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`)
          }
        }
      }

      // 3. Budget status
      if (settings?.notify_budget_alert !== false) {
        const budget = settings?.weekly_budget ?? 5000
        const periodStart = getPeriodStart(uid)
        const userTxns = (recentTxns ?? []).filter((t: any) =>
          t.user_id === uid && t.transaction_date >= periodStart
        )
        const spent = userTxns.reduce((s: number, t: any) => s + t.amount, 0)
        const pct = budget > 0 ? (spent / budget) * 100 : 0
        if (pct >= 90) {
          const remaining = Math.max(0, budget - spent)
          alerts.push(pct >= 100
            ? `Budget exceeded — spent ${fmt(spent)} of ${fmt(budget)}`
            : `Budget ${Math.round(pct)}% used — ${fmt(remaining)} remaining`)
        }
      }

      // 4. Spending spike (category vs last month)
      const userExpenses = (recentTxns ?? []).filter((t: any) => t.user_id === uid)
      const thisMonthExp = userExpenses.filter((t: any) => t.transaction_date >= thisMonthStart)
      const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10)
      const lastMonthExp = userExpenses.filter((t: any) =>
        t.transaction_date >= lastMonthStart && t.transaction_date <= lastMonthSameDay
      )

      if (lastMonthExp.length > 0) {
        const catThis: Record<string, number> = {}
        const catLast: Record<string, number> = {}
        thisMonthExp.forEach((t: any) => { const n = catMap.get(t.category_id) ?? 'Other'; catThis[n] = (catThis[n] ?? 0) + t.amount })
        lastMonthExp.forEach((t: any) => { const n = catMap.get(t.category_id) ?? 'Other'; catLast[n] = (catLast[n] ?? 0) + t.amount })

        let topSpike: { cat: string; pct: number } | null = null
        for (const [cat, amount] of Object.entries(catThis)) {
          if (cat === 'Other' || cat === 'Transfer') continue
          const last = catLast[cat] ?? 0
          if (last > 200 && amount > 300) {
            const pct = ((amount - last) / last) * 100
            if (pct > 50 && (!topSpike || pct > topSpike.pct)) topSpike = { cat, pct }
          }
        }
        if (topSpike) {
          alerts.push(`${topSpike.cat} spending up ${Math.round(topSpike.pct)}% vs last month`)
        }
      }

      if (alerts.length === 0) continue

      const title = alerts.length === 1 ? 'Morning Alert' : `${alerts.length} Morning Alerts`
      const message = alerts.join('\n')

      const { data } = await supabase.functions.invoke('push-send', {
        body: { user_id: uid, title, message, url: '/', tag: 'morning-alerts' },
      })
      if (data?.sent) totalSent += data.sent
    }

    return new Response(JSON.stringify({ sent: totalSent, users: enabledUserIds.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('push-morning-alerts error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
