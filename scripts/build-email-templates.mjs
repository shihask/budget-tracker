// Builds the branded Supabase Auth email templates into supabase/templates/.
// Hosted Supabase doesn't read these files: paste each one into
// Dashboard → Authentication → Emails, with the subject from SUBJECTS below.
//
// Email clients ignore <style> and web fonts unevenly, so everything is
// inline styles on tables. The button is dark green (#0A7A56), not the app's
// #16C98A — white on the bright green is too low-contrast to read.
//
// Only template variables Supabase documents for that template are used
// (ConfirmationURL, Email, NewEmail). A variable the template doesn't
// provide fails the send, so the security notices use none.
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
const notYouSecurity = paragraph(`If this wasn't you, reset your password straight away from the sign-in screen at <a href="${SITE}" style="color:${BRAND_DARK};">moneyplant.online</a>, then email <a href="mailto:hello@moneyplant.online" style="color:${BRAND_DARK};">hello@moneyplant.online</a>.`)

const TEMPLATES = {
  'confirm-signup': {
    subject: 'Confirm your MoneyPlant account',
    html: layout({
      preheader: 'One tap to activate your account.',
      heading: 'Welcome to MoneyPlant',
      body:
        paragraph('Confirm your email address to activate your account and start tracking where your money goes.') +
        button('{{ .ConfirmationURL }}', 'Confirm my email') +
        fallbackLink('{{ .ConfirmationURL }}'),
      footer: 'You\'re getting this because {{ .Email }} was used to sign up for MoneyPlant. If that wasn\'t you, ignore this email and no account will be created.',
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
  'change-email': {
    subject: 'Confirm your new email for MoneyPlant',
    html: layout({
      preheader: 'Confirm the change to your sign-in email.',
      heading: 'Confirm your new email',
      body:
        paragraph('You asked to change your MoneyPlant sign-in email from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>. Confirm to finish the change.') +
        button('{{ .ConfirmationURL }}', 'Confirm new email') +
        fallbackLink('{{ .ConfirmationURL }}'),
      footer: 'If you didn\'t ask for this, ignore this email; your sign-in email won\'t change.',
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
