import { supabase } from '@/lib/supabase'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr.buffer as ArrayBuffer
}

export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestAndSubscribe(): Promise<'subscribed' | 'denied' | 'unsupported' | 'error'> {
  if (!isPushSupported()) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  try {
    const reg = await navigator.serviceWorker.ready
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!vapidKey) throw new Error('VAPID public key not configured')

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    const { error } = await supabase.functions.invoke('push-subscribe', {
      body: {
        subscription: sub.toJSON(),
        device_hint: getDeviceHint(),
      },
    })
    if (error) throw error

    return 'subscribed'
  } catch (err) {
    console.error('Push subscribe failed:', err)
    return 'error'
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.functions.invoke('push-subscribe', {
        body: { subscription: null },
      })
      await sub.unsubscribe()
    }
  } catch (err) {
    console.error('Push unsubscribe failed:', err)
  }
}

function getDeviceHint(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'macOS'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Unknown'
}
