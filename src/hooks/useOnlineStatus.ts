import { useEffect, useState } from 'react'
import { isOnline } from '@/lib/offline-queue'

/** Reactive navigator.onLine. `false` is reliable (no network at all); `true`
 *  only means "a network exists" — a failed request is still classified by
 *  isNetworkError, which is why addTransaction queues on either signal. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
