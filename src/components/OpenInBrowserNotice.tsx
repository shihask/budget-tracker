import { useState } from 'react'
import { Copy, ExternalLink, MoreHorizontal } from 'lucide-react'
import { getDevice, openInBrowserIntentUrl } from '@/lib/browser-env'

// Shown when MoneyPlant is opened inside a social app's built-in browser
// (see browser-env.ts for why that breaks Google sign-in and installing).
// OpenInBrowserNotice sits inside the sign-in box in place of the Google button;
// PWAPrompt's sheet uses OpenInBrowserActions. There is deliberately no banner on
// arrival: it greeted ad visitors with "leave" before they saw the product.

const INK = '#1C1410'
const MUTED = '#9C938A'
const ACCENT_DARK = '#0A7A56'

export function OpenInBrowserNotice({ appName }: { appName: string }) {
  const browser = getDevice() === 'ios' ? 'Safari' : 'your browser'
  return (
    <div style={{ background: '#F5F0EA', border: '1.5px solid #E5DDD5', borderRadius: 13, padding: '14px 16px' }}>
      <div style={{ font: '700 14px Plus Jakarta Sans', color: INK }}>Google sign-in doesn't work inside {appName}</div>
      <div style={{ font: '500 13px Plus Jakarta Sans', color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
        Google blocks it in app browsers. Use email above, or open MoneyPlant in {browser}.
      </div>
      <OpenInBrowserActions />
    </div>
  )
}

/** The "get me out of here" controls: Android hands off to the default browser,
 *  iOS gets the in-app menu step; both get a copy-link fallback. */
export function OpenInBrowserActions() {
  const device = getDevice()
  const browser = device === 'ios' ? 'Safari' : 'your browser'
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked: the steps above still work */ }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      {device === 'android' ? (
        <a
          href={openInBrowserIntentUrl()}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: ACCENT_DARK, color: '#fff', borderRadius: 12, padding: '12px 14px',
            font: '700 14px Plus Jakarta Sans', textDecoration: 'none',
          }}
        >
          <ExternalLink size={16} /> Open in browser
        </a>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '600 13px Plus Jakarta Sans', color: INK, lineHeight: 1.45 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: '#EDE7DD', flexShrink: 0 }}>
            <MoreHorizontal size={16} />
          </span>
          <span>Tap <strong>⋯</strong> at the top right, then <strong>Open in external browser</strong></span>
        </div>
      )}
      <button
        onClick={copyLink}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: 'transparent', color: ACCENT_DARK, border: `1.5px solid #E5DDD5`,
          borderRadius: 12, padding: '10px 14px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
        }}
      >
        <Copy size={14} /> {copied ? 'Link copied' : `Copy link to paste in ${browser}`}
      </button>
    </div>
  )
}
