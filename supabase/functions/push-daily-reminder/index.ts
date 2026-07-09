// Triggered by pg_cron at 8 PM daily (or via Supabase scheduled invocation).
// Sends a Mint reminder to users who have no expense transaction today.
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

    const today = new Date().toISOString().slice(0, 10)

    // Users who have push subscriptions with daily_reminder enabled
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('user_id')

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const allUserIds = subs.map((s: any) => s.user_id)

    // Filter: only users with notifications enabled and notify_daily_reminder not disabled
    const { data: settings } = await supabase
      .from('settings')
      .select('user_id, notifications_enabled, notify_daily_reminder')
      .in('user_id', allUserIds)

    const enabledUserIds = (settings ?? [])
      .filter((s: any) => s.notifications_enabled && s.notify_daily_reminder !== false)
      .map((s: any) => s.user_id)

    if (enabledUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Find users who already have a transaction today
    const { data: todayTxns } = await supabase
      .from('transactions')
      .select('user_id')
      .in('user_id', enabledUserIds)
      .eq('transaction_date', today)
      .in('transaction_type', ['expense', 'commitment'])

    const activeToday = new Set((todayTxns ?? []).map((t: any) => t.user_id))
    const needsReminder = enabledUserIds.filter((id: string) => !activeToday.has(id))

    if (needsReminder.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'all_active' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Send via push-send
    const { data: result } = await supabase.functions.invoke('push-send', {
      body: {
        user_id: needsReminder.length === 1 ? needsReminder[0] : undefined,
        title: 'Mint Reminder',
        message: "You haven't recorded any expenses today.\nIt only takes a few seconds to stay on track.",
        url: '/',
        tag: 'daily-reminder',
      },
    })

    // If multiple users, send individually (push-send only targets one user_id at a time)
    let totalSent = 0
    if (needsReminder.length > 1) {
      await Promise.allSettled(
        needsReminder.map(async (uid: string) => {
          const { data } = await supabase.functions.invoke('push-send', {
            body: {
              user_id: uid,
              title: 'Mint Reminder',
              message: "You haven't recorded any expenses today.\nIt only takes a few seconds to stay on track.",
              url: '/',
              tag: 'daily-reminder',
            },
          })
          if (data?.sent) totalSent += data.sent
        })
      )
    } else {
      totalSent = result?.sent ?? 0
    }

    return new Response(JSON.stringify({ sent: totalSent, reminded: needsReminder.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('push-daily-reminder error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
