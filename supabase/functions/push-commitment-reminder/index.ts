// Runs daily at 9 AM via pg_cron.
// Finds active recurring commitments due in exactly 2 days (by due_day),
// skips ones already paid this month, then sends a push per user.
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
    const target = new Date(now)
    target.setDate(target.getDate() + 2)
    const targetDay = target.getDate()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // Get all active recurring commitments due on the target day
    const { data: commitments, error } = await supabase
      .from('commitments')
      .select('id, name, amount, due_day, last_paid_date, user_id')
      .eq('is_active', true)
      .eq('is_recurring', true)
      .eq('due_day', targetDay)

    if (error) throw error
    if (!commitments || commitments.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_due_commitments' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Filter out commitments already paid this month
    const unpaid = commitments.filter((cm: any) => {
      if (!cm.last_paid_date) return true
      const paid = new Date(cm.last_paid_date)
      return !(paid.getMonth() === currentMonth && paid.getFullYear() === currentYear)
    })

    if (unpaid.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'all_paid_this_month' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Group commitments by user
    const byUser: Record<string, { name: string; amount: number }[]> = {}
    for (const cm of unpaid) {
      if (!byUser[cm.user_id]) byUser[cm.user_id] = []
      byUser[cm.user_id].push({ name: cm.name, amount: cm.amount })
    }

    const userIds = Object.keys(byUser)

    // Check which users have notify_commitments enabled
    const { data: settings } = await supabase
      .from('settings')
      .select('user_id, notify_commitments, notifications_enabled')
      .in('user_id', userIds)

    const enabledUsers = new Set(
      (settings ?? [])
        .filter((s: any) => s.notifications_enabled && s.notify_commitments !== false)
        .map((s: any) => s.user_id)
    )

    let totalSent = 0

    await Promise.allSettled(
      userIds
        .filter(uid => enabledUsers.has(uid))
        .map(async (uid) => {
          const items = byUser[uid]
          const title = items.length === 1
            ? 'Payment Due Soon'
            : `${items.length} Payments Due Soon`
          const message = items.length === 1
            ? `${items[0].name} — ₹${items[0].amount.toLocaleString('en-IN')} is due in 2 days.`
            : items.map(i => `${i.name} ₹${i.amount.toLocaleString('en-IN')}`).join(', ') + ' — due in 2 days.'

          const { data } = await supabase.functions.invoke('push-send', {
            body: { user_id: uid, title, message, url: '/', tag: 'commitment-reminder' },
          })
          if (data?.sent) totalSent += data.sent
        })
    )

    return new Response(JSON.stringify({ sent: totalSent, commitments: unpaid.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('push-commitment-reminder error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
