// Tells the rest of a household that someone just joined: a push (via push-send)
// and an email (Brevo), to each OTHER active member.
//
// Called by the joiner's app right after mp_household_accept_invite succeeds.
// Nothing about the recipients comes from the request: the caller is identified
// by their JWT, their own active membership is looked up, and the recipients are
// that household's other active members, emailed only at their own confirmed
// address. So this can't be used to message arbitrary people.
//
// Once-only: household_members.join_notified_at is claimed with
// `WHERE join_notified_at IS NULL` before anything is sent, and a membership
// older than JOIN_WINDOW_MINUTES is ignored — repeated calls send nothing.
//
// Secrets: BREVO_API_KEY (same key as send-statement-email). Push goes through
// push-send with the service role key.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { refuseGuest } from '../_shared/guest.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')
const SENDER = { name: 'MoneyPlant', email: 'noreply@moneyplant.online' }
/** A join is announced only shortly after it happened. */
const JOIN_WINDOW_MINUTES = 15

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}

// Same layout, palette and hosted logo as send-statement-email and the auth
// emails (scripts/build-email-templates.mjs) — keep them in sync.
const SITE = 'https://moneyplant.online'
const LOGO = `${SITE}/email-logo.png`
const INK = '#1C1410'
const MUTED = '#6B5F57'
const BRAND_DARK = '#0A7A56'
const PAGE_BG = '#F6F1EA'
const CARD_BG = '#FFFFFF'
const RULE = '#EDE5DB'
const FONT = `'Plus Jakarta Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`

function emailHtml(joiner: string, household: string): string {
  const j = escapeHtml(joiner)
  const h = escapeHtml(household)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${j} joined ${h}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${j} joined your household on MoneyPlant</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
          <tr>
            <td style="padding:0 4px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;"><img src="${LOGO}" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px;"></td>
                  <td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:19px;font-weight:800;color:${INK};letter-spacing:-0.2px;">MoneyPlant</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:${CARD_BG};border:1px solid ${RULE};border-radius:20px;padding:32px 28px;">
              <h1 style="margin:0 0 12px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:800;color:${INK};">${j} joined ${h}</h1>
              <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;line-height:1.6;color:${MUTED};">
                You can now track shared income, expenses and budgets together. Your personal accounts and transactions stay private.
              </p>
              <a href="${SITE}/?open=household" style="display:inline-block;background:${BRAND_DARK};color:#ffffff;text-decoration:none;font-family:${FONT};font-size:15px;font-weight:700;padding:12px 22px;border-radius:12px;">Open Household</a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
              You're getting this because you invited someone to your MoneyPlant household. If you don't know ${j}, open Household → Members and remove them.<br>
              MoneyPlant · <a href="${SITE}" style="color:${MUTED};">moneyplant.online</a> · Questions? <a href="mailto:hello@moneyplant.online" style="color:${MUTED};">hello@moneyplant.online</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)
    const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'unauthorized' }, 401)
    const guest = refuseGuest(user, cors)
    if (guest) return guest

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: me, error: meError } = await admin
      .from('household_members')
      .select('id, household_id, display_name, joined_at')
      .eq('user_id', user.id).eq('status', 'active')
      .maybeSingle()
    if (meError) throw meError
    if (!me) return json({ error: 'not_member' }, 404)
    if (Date.now() - new Date(me.joined_at).getTime() > JOIN_WINDOW_MINUTES * 60_000) return json({ skipped: 'stale' })

    // Claim first: only the call that flips NULL → now() goes on to send.
    const { data: claimed, error: claimError } = await admin
      .from('household_members')
      .update({ join_notified_at: new Date().toISOString() })
      .eq('id', me.id).is('join_notified_at', null)
      .select('id')
    if (claimError) throw claimError
    if (!claimed || claimed.length === 0) return json({ skipped: 'already_notified' })

    const [{ data: household, error: hError }, { data: others, error: oError }] = await Promise.all([
      admin.from('households').select('name, status').eq('id', me.household_id).single(),
      admin.from('household_members').select('user_id')
        .eq('household_id', me.household_id).eq('status', 'active').neq('id', me.id).not('user_id', 'is', null),
    ])
    if (hError) throw hError
    if (oError) throw oError
    if (household.status !== 'active') return json({ skipped: 'inactive' })

    const title = `${me.display_name} joined ${household.name}`
    let pushed = 0
    let emailed = 0

    for (const other of others ?? []) {
      // Push — best effort; push-send drops expired subscriptions itself.
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/push-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({
            user_id: other.user_id,
            title,
            message: 'You can now track shared expenses together.',
            url: '/?open=household',
            tag: 'household-join',
          }),
        })
        if (res.ok) pushed += Number((await res.json())?.sent ?? 0)
        else console.error('[household-member-joined] push-send status', res.status)
      } catch (e) {
        console.error('[household-member-joined] push failed:', e instanceof Error ? e.name : 'unknown')
      }

      // Email — only to the recipient's own confirmed address.
      if (!BREVO_API_KEY) continue
      try {
        const { data: { user: recipient } } = await admin.auth.admin.getUserById(other.user_id)
        if (!recipient?.email || !recipient.email_confirmed_at) continue
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
          body: JSON.stringify({
            sender: SENDER,
            to: [{ email: recipient.email }],
            subject: title,
            htmlContent: emailHtml(me.display_name, household.name),
          }),
        })
        if (res.ok) emailed++
        else {
          // Status and Brevo's error code only — the body can echo the request.
          let code = ''
          try { code = (await res.json())?.code ?? '' } catch { /* not JSON */ }
          console.error('[household-member-joined] Brevo error:', res.status, code)
        }
      } catch (e) {
        console.error('[household-member-joined] email failed:', e instanceof Error ? e.name : 'unknown')
      }
    }

    return json({ ok: true, pushed, emailed })
  } catch (e) {
    console.error('[household-member-joined] error:', e instanceof Error ? e.name : 'unknown')
    return json({ error: 'internal_error' }, 500)
  }
})
