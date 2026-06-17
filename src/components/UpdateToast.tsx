import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useTheme } from '@/lib/theme-context'

export function UpdateToast() {
  const c = useTheme()
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const hiddenAtRef = useRef<number>(0)

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration
    },
  })

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
        return
      }
      // iOS suspends PWAs when backgrounded — setInterval never fires.
      // visibilitychange is reliable: check for updates whenever the user
      // foregrounds the app after it's been hidden for more than 30 seconds.
      const hiddenMs = Date.now() - hiddenAtRef.current
      if (hiddenMs > 30_000 && registrationRef.current) {
        registrationRef.current.update().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  if (!needRefresh) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(100px + env(safe-area-inset-bottom, 0px))',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      width: 'calc(100% - 32px)',
      maxWidth: 340,
      background: c.ink,
      borderRadius: 16,
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
      animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1) both',
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16C98A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      <span style={{ flex: 1, font: '600 13px Plus Jakarta Sans', color: '#fff' }}>
        New version available
      </span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: '#16C98A',
          color: '#fff',
          border: 'none',
          borderRadius: 9,
          padding: '7px 13px',
          font: '700 13px Plus Jakarta Sans',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Update
      </button>
      <button
        onClick={() => updateServiceWorker(false)}
        style={{
          background: 'transparent',
          color: 'rgba(255,255,255,0.45)',
          border: 'none',
          padding: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}
