import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const APP_URL = Deno.env.get('APP_URL') || 'https://moneyplant.app'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'email_not_configured' }),
        { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors })
    }

    const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors })
    }

    const { to_email, project_name, role } = await req.json()
    if (!to_email || !project_name) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: cors })
    }

    const inviterEmail = user.email || 'Someone'

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'MoneyPlant <noreply@moneyplant.app>',
        to: [to_email],
        subject: `You're invited to "${project_name}" on MoneyPlant`,
        html: `
          <div style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 32px;">🌱</span>
              <h2 style="margin: 8px 0 0; color: #111; font-size: 20px;">MoneyPlant</h2>
            </div>
            <div style="background: #f8f9fa; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
              <p style="margin: 0 0 8px; color: #666; font-size: 14px;">You've been invited to collaborate</p>
              <h3 style="margin: 0 0 12px; color: #111; font-size: 18px;">${project_name}</h3>
              <p style="margin: 0 0 4px; color: #666; font-size: 14px;">
                <strong>${inviterEmail}</strong> invited you as <strong style="color: #6366F1;">${role || 'editor'}</strong>
              </p>
            </div>
            <div style="text-align: center;">
              <a href="${APP_URL}" style="display: inline-block; background: #10B981; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-weight: 700; font-size: 14px;">
                Open MoneyPlant
              </a>
              <p style="margin: 16px 0 0; color: #999; font-size: 12px;">
                Open MoneyPlant to accept or decline this invitation.
              </p>
            </div>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('[send-invite-email] Resend error:', res.status, errBody)
      return new Response(
        JSON.stringify({ error: 'email_send_failed' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('[send-invite-email] error:', e)
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
