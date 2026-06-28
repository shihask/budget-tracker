import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'mp_pwa_banner_v2'
const DISMISS_DAYS = 30

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true
}

function getDevice(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

function wasDismissed() {
  try {
    const ts = localStorage.getItem(DISMISS_KEY)
    if (!ts) return false
    return Date.now() - Number(ts) < DISMISS_DAYS * 86400000
  } catch { return false }
}

function dismiss() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
}

export function PWAPrompt() {
  const c = useTheme()
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [showBanner, setShowBanner] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const device = getDevice()

  useEffect(() => {
    const handleInstall = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const handleOffline = () => setOffline(true)
    const handleOnline  = () => setOffline(false)

    window.addEventListener('beforeinstallprompt', handleInstall)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online',  handleOnline)

    if (!isStandalone() && !wasDismissed() && device !== 'desktop') {
      setTimeout(() => setShowBanner(true), 2000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstall)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online',  handleOnline)
    }
  }, [])

  const handleDismiss = () => {
    setShowBanner(false)
    setShowSteps(false)
    dismiss()
  }

  const handleInstall = async () => {
    if (installEvent) {
      await installEvent.prompt()
      const { outcome } = await installEvent.userChoice
      if (outcome === 'accepted') { setShowBanner(false); setInstallEvent(null) }
    } else {
      setShowSteps(true)
    }
  }

  if (offline) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: '#F59E0B', color: '#fff',
        padding: '10px 16px', paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))',
        font: '700 13px Plus Jakarta Sans',
        display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
        </svg>
        You're offline — showing cached data
      </div>
    )
  }

  if (!showBanner) return null

  return (
    <>
      {/* Install Banner */}
      <div style={{
        background: c.ink,
        margin: '0 -16px',
        padding: '0 16px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 0',
        }}>
          <img
            src="/pwa-64x64.png" alt=""
            style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '700 13px Plus Jakarta Sans', color: '#fff' }}>
              Get the MoneyPlant app
            </div>
            <div style={{ font: '500 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.6)' }}>
              Install for quick access &amp; offline use
            </div>
          </div>
          <button
            onClick={handleInstall}
            style={{
              background: '#16C98A', color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 14px',
              font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
              flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)', padding: 4, flexShrink: 0,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Install Steps Modal — portal to body so it escapes the fixed header */}
      {showSteps && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(28,20,16,0.55)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            animation: 'pwaFadeIn 0.2s ease',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowSteps(false) }}
        >
          <div style={{
            width: '100%', maxWidth: 420,
            background: c.surface, borderRadius: '20px 20px 0 0',
            padding: '24px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
            animation: 'pwaSlideUp 0.3s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink }}>
                Install MoneyPlant
              </div>
              <button
                onClick={() => setShowSteps(false)}
                style={{ background: c.bg, border: 'none', borderRadius: 50, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: c.muted }}
              >
                <X size={18} />
              </button>
            </div>

            {device === 'ios' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ font: '700 11px Plus Jakarta Sans', color: '#16C98A', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  In Safari
                </div>
                <Step num="1" title='Tap ··· at the bottom right of Safari'>
                  <DotsIcon color={c.muted} />
                </Step>
                <Step num="2" title='Tap "Add to Home Screen"'>
                  <PlusBoxIcon color={c.muted} />
                </Step>
                <Step num="3" title='Tap "Add" to confirm' />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ font: '700 11px Plus Jakarta Sans', color: '#16C98A', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  In Chrome
                </div>
                <Step num="1" title="Tap the menu button (⋮)" hint="top right corner">
                  <DotsIcon color={c.muted} />
                </Step>
                <Step num="2" title='Tap "Install App" or "Add to Home Screen"'>
                  <PlusBoxIcon color={c.muted} />
                </Step>
                <Step num="3" title='Tap "Install" to confirm' />
              </div>
            )}

            <button
              onClick={handleDismiss}
              style={{
                width: '100%', marginTop: 24, padding: '14px',
                background: c.bg, color: c.muted, border: 'none',
                borderRadius: 12, font: '600 13px Plus Jakarta Sans',
                cursor: 'pointer',
              }}
            >
              Maybe later
            </button>
          </div>
        </div>,
        document.body,
      )}

      <style>{`
        @keyframes pwaSlideDown { from { transform: translateY(-100%) } to { transform: translateY(0) } }
        @keyframes pwaSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes pwaFadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </>
  )
}

function Step({ num, title, hint, children }: { num: string; title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9,
        background: 'rgba(22,201,138,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, font: '800 14px Plus Jakarta Sans', color: '#16C98A',
      }}>
        {num}
      </div>
      <div style={{ flex: 1, paddingTop: 3 }}>
        <div style={{ font: '600 14px Plus Jakarta Sans', color: '#1C1410', lineHeight: 1.35 }}>{title}</div>
        {(hint || children) && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, font: '600 11px Plus Jakarta Sans', color: '#9C938A' }}>
            {children}
            {hint}
          </div>
        )}
      </div>
    </div>
  )
}

function ShareIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

function PlusBoxIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

function DotsIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="5" r="1" fill={color} />
      <circle cx="12" cy="12" r="1" fill={color} />
      <circle cx="12" cy="19" r="1" fill={color} />
    </svg>
  )
}
