// Internal helper — sends a push notification to one or all users
// Called by other Edge Functions; not exposed to the client directly.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore — web-push has no Deno types
import webpush from 'npm:web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

webpush.setVapidDetails(
  'mailto:mshihask007@gmail.com',
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

    const body = await req.json() as {
      user_id?: string      // omit to send to all users
      title: string
      message: string
      url?: string
      tag?: string
      setting_flag?: string // e.g. 'notify_daily_reminder' — skip users who have it off
    }

    let query = supabase.from('push_subscriptions').select('subscription, user_id')
    if (body.user_id) query = query.eq('user_id', body.user_id)

    const { data: rows, error } = await query
    if (error) throw error
    if (!rows || rows.length === 0) return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Filter by per-user setting flag if provided
    let userIds = rows.map((r: any) => r.user_id)
    if (body.setting_flag) {
      const { data: settings } = await supabase
        .from('settings')
        .select(`user_id, ${body.setting_flag}`)
        .in('user_id', userIds)
      if (settings) {
        const allowed = new Set(
          settings.filter((s: any) => s[body.setting_flag!] !== false).map((s: any) => s.user_id)
        )
        userIds = userIds.filter((id: string) => allowed.has(id))
      }
    }

    const payload = JSON.stringify({
      title: body.title,
      body: body.message,
      url: body.url ?? '/',
      tag: body.tag ?? 'moneyplant',
    })

    let sent = 0
    const stale: string[] = []

    await Promise.allSettled(
      rows
        .filter((r: any) => userIds.includes(r.user_id))
        .map(async (row: any) => {
          try {
            await webpush.sendNotification(row.subscription, payload)
            sent++
          } catch (err: any) {
            // 410 Gone = subscription expired/unsubscribed
            if (err?.statusCode === 410 || err?.statusCode === 404) {
              stale.push(row.subscription.endpoint)
            } else {
              console.error('send error for', row.user_id, err?.message)
            }
          }
        })
    )

    // Clean up expired subscriptions
    if (stale.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', stale)
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('push-send error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
