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

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const { subscription, device_hint } = await req.json()

    if (subscription === null) {
      // Unsubscribe: delete this user's subscriptions
      await supabase.from('push_subscriptions').delete().eq('user_id', user.id)
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Upsert by endpoint so each device gets its own row
    const { error } = await supabase.from('push_subscriptions').upsert(
      { user_id: user.id, subscription, device_hint: device_hint ?? null, endpoint: subscription.endpoint },
      { onConflict: 'endpoint' }
    )
    if (error) throw error

    // Mark notifications as enabled in settings
    await supabase.from('settings').update({ notifications_enabled: true }).eq('user_id', user.id)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('push-subscribe error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
