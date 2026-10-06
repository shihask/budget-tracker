// Builds the branded Supabase Auth email templates into supabase/templates/.
// Hosted Supabase doesn't read these files: paste each one into
// Dashboard → Authentication → Emails, with the subject from SUBJECTS below.
//
// Email clients ignore <style> and web fonts unevenly, so everything is
// inline styles on tables. The button is dark green (#0A7A56), not the app's
// #16C98A — white on the bright green is too low-contrast to read.
//
// Only template variables Supabase documents for that template are used
// (ConfirmationURL, Token, Email, NewEmail). A variable the template doesn't
// provide fails the send, so the security notices use none.
//
// Sign-in is passwordless OTP: Confirm signup (new/unconfirmed user) and
// Magic Link (existing user) both carry the 6-digit {{ .Token }} and no link —
// a button would mix magic-link sign-in back into the code flow.
//
// Run: node scripts/build-email-templates.mjs

import { mkdirSync, writeFileSync } from 'node:fs'

const OUT_DIR = new URL('../supabase/templates/', import.meta.url)
const SITE = 'https://moneyplant.online'
const LOGO = `${SITE}/email-logo.png`

const INK = '#1C1410'
const MUTED = '#6B5F57'
const BRAND_DARK = '#0A7A56'
const PAGE_BG = '#F6F1EA'
const CARD_BG = '#FFFFFF'
const RULE = '#EDE5DB'
const FONT = `'Plus Jakarta Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`

function button(href, label) {
  return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
            <tr>
              <td style="border-radius:12px;background:${BRAND_DARK};">
                <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;">${label}</a>
              </td>
            </tr>
          </table>`
}

function fallbackLink(href) {
  return `
          <p style="margin:20px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">
            Button not working? Paste this link into your browser:<br>
            <a href="${href}" style="color:${BRAND_DARK};word-break:break-all;">${href}</a>
          </p>`
}

function codeBlock(token) {
  return `
          <div style="margin:24px 0 20px;padding:18px 12px;background:${PAGE_BG};border-radius:14px;text-align:center;font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${BRAND_DARK};">${token}</div>`
}

function paragraph(html) {
  return `
          <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">${html}</p>`
}

function layout({ preheader, heading, body, footer }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
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
          <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:800;color:${INK};">${heading}</h1>${body}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
              ${footer}<br>
              MoneyPlant · <a href="${SITE}" style="color:${MUTED};">moneyplant.online</a> · Questions? <a href="mailto:hello@moneyplant.online" style="color:${MUTED};">hello@moneyplant.online</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

const securityFooter = 'This is a security notice about your MoneyPlant account. You can\'t turn these off.'
const notYouSecurity = paragraph(`If this wasn't you, email <a href="mailto:hello@moneyplant.online" style="color:${BRAND_DARK};">hello@moneyplant.online</a> straight away.`)

const TEMPLATES = {
  'confirm-signup': {
    subject: 'Your MoneyPlant verification code',
    html: layout({
      preheader: 'Your 6-digit code to create your account.',
      heading: 'Welcome to MoneyPlant',
      body:
        paragraph('Your MoneyPlant code is') +
        codeBlock('{{ .Token }}') +
        paragraph('Enter this code in MoneyPlant to continue. This code expires in 1 hour.'),
      footer: 'You\'re getting this because {{ .Email }} was used to sign up for MoneyPlant. If that wasn\'t you, ignore this email and no account will be created.',
    }),
  },
  'magic-link': {
    subject: 'Your MoneyPlant sign-in code',
    html: layout({
      preheader: 'Your 6-digit code to sign in.',
      heading: 'Your sign-in code',
      body:
        paragraph('Your MoneyPlant code is') +
        codeBlock('{{ .Token }}') +
        paragraph('Enter this code in MoneyPlant to continue. This code expires in 1 hour.'),
      footer: 'Sent to {{ .Email }}. If you didn\'t try to sign in, ignore this email; no one can get in without this code.',
    }),
  },
  'reset-password': {
    subject: 'Reset your MoneyPlant password',
    html: layout({
      preheader: 'Choose a new password for your account.',
      heading: 'Reset your password',
      body:
        paragraph('We got a request to reset the password for your MoneyPlant account. Tap the button to choose a new one.') +
        button('{{ .ConfirmationURL }}', 'Choose a new password') +
        fallbackLink('{{ .ConfirmationURL }}'),
      footer: 'Sent to {{ .Email }}. If you didn\'t ask for this, ignore this email; your password stays the same.',
    }),
  },
  // Sent when Profile → Sign-in methods adds an email to an account. A
  // mobile-only account has no current address, so the copy never names
  // {{ .Email }}; the code is verified with type 'email_change'.
  'change-email': {
    subject: 'Your MoneyPlant verification code',
    html: layout({
      preheader: 'Your 6-digit code to add this email.',
      heading: 'Add this email to MoneyPlant',
      body:
        paragraph('Use this code to add <strong>{{ .NewEmail }}</strong> to your MoneyPlant account:') +
        codeBlock('{{ .Token }}') +
        paragraph('Enter it in MoneyPlant to finish. This code expires in 1 hour.'),
      footer: 'If you didn\'t ask for this, ignore this email; nothing on your account will change.',
    }),
  },
  'notice-password-changed': {
    subject: 'Your MoneyPlant password was changed',
    html: layout({
      preheader: 'Your password was just changed.',
      heading: 'Your password was changed',
      body:
        paragraph('The password for your MoneyPlant account was just changed. If you did this, there\'s nothing else to do.') +
        notYouSecurity,
      footer: securityFooter,
    }),
  },
  'notice-email-changed': {
    subject: 'Your MoneyPlant sign-in email was changed',
    html: layout({
      preheader: 'The email on your account was just changed.',
      heading: 'Your sign-in email was changed',
      body:
        paragraph('The email address you use to sign in to MoneyPlant was just changed. If you did this, there\'s nothing else to do.') +
        notYouSecurity,
      footer: securityFooter,
    }),
  },
  'notice-identity-linked': {
    subject: 'A new sign-in method was added to MoneyPlant',
    html: layout({
      preheader: 'A new way to sign in was linked to your account.',
      heading: 'New sign-in method added',
      body:
        paragraph('A new sign-in method, such as Google, was just linked to your MoneyPlant account. You can now use it to sign in.') +
        notYouSecurity,
      footer: securityFooter,
    }),
  },
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [name, { subject, html }] of Object.entries(TEMPLATES)) {
  writeFileSync(new URL(`${name}.html`, OUT_DIR), html)
  console.log(`${name}.html  —  subject: ${subject}`)
}
