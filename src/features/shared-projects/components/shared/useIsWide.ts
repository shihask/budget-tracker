import { useSyncExternalStore } from 'react'

// Project pages are full-screen with content capped at 960px, so the viewport
// width is a fair stand-in for the list's width. Used only where a list switches
// to a column layout.
const WIDE_QUERY = '(min-width: 760px)'

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(WIDE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export const useIsWide = () => useSyncExternalStore(subscribe, () => window.matchMedia(WIDE_QUERY).matches)
