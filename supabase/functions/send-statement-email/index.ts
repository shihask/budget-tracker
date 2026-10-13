// Emails a transaction statement (CSV attachment) to the signed-in user.
//
// The CSV is built on the client by the same code as the download
// (buildTransactionsCsv), so filterAndSortTransactions stays the one
// definition of which rows match. The recipient is never taken from the
// request: it is always the caller's own confirmed email, which is what keeps
// this from being an open relay for arbitrary content.
//
// Sent through Brevo's transactional API from noreply@moneyplant.online — the
// same DKIM-authenticated sender as the auth emails.
// Secret: BREVO_API_KEY (an API key from Brevo → SMTP & API → API Keys; the
// SMTP key Supabase Auth uses is a different credential and won't work here).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SENDER = { name: 'MoneyPlant', email: 'noreply@moneyplant.online' }

const DAILY_SEND_LIMIT = 10
// Brevo caps a whole message at 10 MB after base64 (~4/3 growth); 5 MB of CSV
// is ~50k transactions, far beyond any real statement.
const MAX_CSV_BYTES = 5 * 1024 * 1024

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

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}

// Same layout, palette and hosted logo as the auth emails
// (scripts/build-email-templates.mjs) — keep the two in sync.
const SITE = 'https://moneyplant.online'
const LOGO = `${SITE}/email-logo.png`
const INK = '#1C1410'
const MUTED = '#6B5F57'
const BRAND_DARK = '#0A7A56'
const PAGE_BG = '#F6F1EA'
const CARD_BG = '#FFFFFF'
const RULE = '#EDE5DB'
const FONT = `'Plus Jakarta Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`

function emailHtml(summary: string, count: number): string {
  const s = escapeHtml(summary)
  const rows = `${count} transaction${count === 1 ? '' : 's'}`
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your MoneyPlant statement</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${s} · ${rows} · CSV attached</div>
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
              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:800;color:${INK};">Your transaction statement</h1>
              <div style="padding:16px 18px;background:${PAGE_BG};border-radius:14px;font-family:${FONT};">
                <div style="font-size:16px;font-weight:700;color:${INK};margin-bottom:4px;">${s}</div>
                <div style="font-size:14px;color:${MUTED};">${rows} · CSV attached</div>
              </div>
              <p style="margin:16px 0 0;font-family:${FONT};font-size:14px;line-height:1.6;color:${MUTED};">Open the attachment in Excel, Google Sheets or Numbers.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
              You asked MoneyPlant to email this statement to you. If that wasn't you, email <a href="mailto:hello@moneyplant.online" style="color:${BRAND_DARK};">hello@moneyplant.online</a> straight away.<br>
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
    if (!BREVO_API_KEY) return json({ error: 'email_not_configured' }, 503)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)

    const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'unauthorized' }, 401)
    if (!user.email || !user.email_confirmed_at) return json({ error: 'no_email' }, 400)

    const { csv, filename, count, summary } = await req.json()
    if (typeof csv !== 'string' || typeof filename !== 'string' || !/^[\w.-]+\.csv$/.test(filename)) {
      return json({ error: 'missing_fields' }, 400)
    }
    const bytes = new TextEncoder().encode(csv)
    if (bytes.length > MAX_CSV_BYTES) return json({ error: 'too_large' }, 413)

    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const dayStart = new Date()
    dayStart.setUTCHours(0, 0, 0, 0)
    const { count: sentToday, error: countError } = await admin
      .from('statement_email_sends')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', dayStart.toISOString())
    if (countError) throw countError
    if ((sentToday ?? 0) >= DAILY_SEND_LIMIT) return json({ error: 'daily_limit' }, 429)

    const rowCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
    const label = typeof summary === 'string' && summary.trim() ? summary.trim().slice(0, 200) : 'All transactions'

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email: user.email }],
        subject: `Your MoneyPlant statement — ${label}`,
        htmlContent: emailHtml(label, rowCount),
        attachment: [{ name: filename, content: toBase64(bytes) }],
      }),
    })
    if (!res.ok) {
      // Log status and Brevo's error code only — the body can echo the request.
      let code = ''
      try { code = (await res.json())?.code ?? '' } catch { /* not JSON */ }
      console.error('[send-statement-email] Brevo error:', res.status, code)
      return json({ error: 'email_send_failed' }, 502)
    }

    await admin.from('statement_email_sends').insert({ user_id: user.id })
    return json({ ok: true, to: user.email })
  } catch (e) {
    console.error('[send-statement-email] error:', e instanceof Error ? e.name : 'unknown')
    return json({ error: 'internal_error' }, 500)
  }
})
