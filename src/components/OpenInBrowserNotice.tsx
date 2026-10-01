import { useState } from 'react'
import { Copy, ExternalLink, MoreHorizontal, X } from 'lucide-react'
import { getDevice, openInBrowserIntentUrl } from '@/lib/browser-env'

// Shown when MoneyPlant is opened inside a social app's built-in browser
// (see browser-env.ts for why that breaks Google sign-in and installing).
// `variant="card"` floats at the bottom of the landing page and can be closed;
// `variant="inline"` sits inside the sign-in box in place of the Google button.

const INK = '#1C1410'
const MUTED = '#9C938A'
const ACCENT_DARK = '#0A7A56'

export function OpenInBrowserNotice({ appName, variant, onClose }: {
  appName: string
  variant: 'card' | 'inline'
  onClose?: () => void
}) {
  const device = getDevice()
  const browser = device === 'ios' ? 'Safari' : 'your browser'

  if (variant === 'inline') {
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

  return (
    <div
      role="dialog"
      aria-label={`Open MoneyPlant outside ${appName}`}
      style={{
        position: 'fixed', left: 12, right: 12, zIndex: 50,
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        maxWidth: 440, margin: '0 auto',
        background: '#FDFAF7', borderRadius: 18, padding: '16px 16px 14px',
        boxShadow: '0 8px 32px rgba(28,20,16,0.18)', border: '1px solid #E5DDD5',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ font: '800 15px Plus Jakarta Sans', color: INK }}>You're in {appName}'s browser</div>
          <div style={{ font: '500 13px Plus Jakarta Sans', color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
            To sign in with Google or install MoneyPlant on your home screen, open it in {browser}.
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: MUTED, display: 'flex' }}>
            <X size={18} />
          </button>
        )}
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
