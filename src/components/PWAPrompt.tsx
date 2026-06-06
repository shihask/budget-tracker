import { useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAPrompt() {
  const c = useTheme()
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [updateReady, setUpdateReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)

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

    // Listen for SW update ready
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        setUpdateReady(true)
      })
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstall)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online',  handleOnline)
    }
  }, [])

  const handleInstall = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    if (outcome === 'accepted') setInstallEvent(null)
  }

  // Offline banner
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

  // Update ready banner
  if (updateReady) {
    return (
      <div style={{
        position: 'fixed', bottom: 'calc(110px + env(safe-area-inset-bottom, 0px))',
        left: 16, right: 16, zIndex: 9999,
        background: c.ink, color: c.bg,
        borderRadius: 14, padding: '12px 16px',
        font: '700 13px Plus Jakarta Sans',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      }}>
        <span>New version available!</span>
        <button
          onClick={() => window.location.reload()}
          style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}
        >
          Update
        </button>
      </div>
    )
  }

  // Install prompt banner
  if (installEvent && !dismissed) {
    return (
      <div style={{
        position: 'fixed', bottom: 'calc(110px + env(safe-area-inset-bottom, 0px))',
        left: 16, right: 16, zIndex: 9999,
        background: c.surface, borderRadius: 16, padding: '14px 16px',
        border: `1px solid ${c.faint}`,
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      }}>
        <img src="/pwa-64x64.png" alt="MoneyPilot" style={{ width: 44, height: 44, borderRadius: 11, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Install App</div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Add to home screen for quick access</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setDismissed(true)}
            style={{ background: c.surface2, color: c.muted, border: 'none', borderRadius: 8, padding: '7px 12px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}
          >
            Later
          </button>
          <button
            onClick={handleInstall}
            style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}
          >
            Install
          </button>
        </div>
      </div>
    )
  }

  return null
}
