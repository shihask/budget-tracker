import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { anySheetOpen } from '@/components/BottomSheet'

// Foregrounded after this long away → ask the server for a new build.
const UPDATE_CHECK_AFTER_HIDDEN_MS = 30_000
// A build that finishes installing this soon after the app was opened or
// foregrounded is applied at once: the user has only just arrived.
const JUST_ARRIVED_MS = 15_000

function isEditing() {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

/**
 * Applies a new build silently, never over something the user is doing.
 * A waiting update is applied only when nothing is open (`busy`, any
 * BottomSheet, a focused field) and either the app is being left (reload
 * happens out of sight) or the user has only just arrived. Otherwise it waits
 * for the next such moment — or the next cold start, which loads it anyway.
 */
export function AutoUpdater({ busy }: { busy: boolean }) {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const hiddenAtRef = useRef(0)
  const shownAtRef = useRef(Date.now())
  const busyRef = useRef(busy)
  busyRef.current = busy
  const waitingRef = useRef(false)
  const appliedRef = useRef(false)

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration
    },
  })
  waitingRef.current = needRefresh

  // The plugin reloads the page once the new worker takes control.
  const applyIfSafe = useRef(() => {})
  applyIfSafe.current = () => {
    if (appliedRef.current || !waitingRef.current) return
    if (busyRef.current || anySheetOpen() || isEditing()) return
    appliedRef.current = true
    updateServiceWorker()
  }

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
        applyIfSafe.current()
        return
      }
      shownAtRef.current = Date.now()
      // iOS suspends PWAs when backgrounded — setInterval never fires.
      // visibilitychange is reliable: check for updates whenever the user
      // foregrounds the app after it's been hidden for a while.
      const hiddenMs = Date.now() - hiddenAtRef.current
      if (hiddenMs > UPDATE_CHECK_AFTER_HIDDEN_MS && registrationRef.current) {
        registrationRef.current.update().catch(() => {})
      }
      applyIfSafe.current()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    if (needRefresh && Date.now() - shownAtRef.current < JUST_ARRIVED_MS) applyIfSafe.current()
  }, [needRefresh])

  return null
}
