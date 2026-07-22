import { useEffect, useRef, useState } from 'react'

export const PULL_CONFIG = { threshold: 70, resistance: 0.5, max: 100 }
const DIRECTION_LOCK_PX = 10

export function usePullToRefresh(onRefresh: () => Promise<unknown>, enabled: boolean) {
  const [pullDistance, setPullDistance] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const startX = useRef(0)
  const startY = useRef(0)
  const pulling = useRef(false)
  const directionLocked = useRef<'vertical' | 'rejected' | null>(null)
  const pullDistanceRef = useRef(0)
  const refreshingRef = useRef(false)
  const enabledRef = useRef(enabled)
  const onRefreshRef = useRef(onRefresh)

  useEffect(() => {
    enabledRef.current = enabled
    onRefreshRef.current = onRefresh
  })

  useEffect(() => {
    const reset = () => {
      pulling.current = false
      directionLocked.current = null
      pullDistanceRef.current = 0
      setPullDistance(0)
      setDragging(false)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current || refreshingRef.current) return
      if (e.touches.length !== 1 || window.scrollY > 0) return
      const target = e.target as HTMLElement
      if (target.closest('button, input, textarea, select, a, [role="button"]')) return
      startX.current = e.touches[0].clientX
      startY.current = e.touches[0].clientY
      pulling.current = true
      directionLocked.current = null
      setDragging(true)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current) return
      const dx = e.touches[0].clientX - startX.current
      const dy = e.touches[0].clientY - startY.current

      if (directionLocked.current === null) {
        if (Math.abs(dx) + Math.abs(dy) < DIRECTION_LOCK_PX) return
        if (Math.abs(dx) > Math.abs(dy) || dy <= 0) {
          directionLocked.current = 'rejected'
          reset()
          return
        }
        directionLocked.current = 'vertical'
      }

      if (directionLocked.current === 'rejected') return

      if (window.scrollY > 0) {
        reset()
        return
      }

      e.preventDefault()
      const next = Math.min(PULL_CONFIG.max, dy * PULL_CONFIG.resistance)
      pullDistanceRef.current = next
      setPullDistance(next)
    }

    const onTouchEnd = async () => {
      if (!pulling.current) return
      pulling.current = false
      setDragging(false)

      if (pullDistanceRef.current >= PULL_CONFIG.threshold) {
        refreshingRef.current = true
        setRefreshing(true)
        pullDistanceRef.current = PULL_CONFIG.threshold
        setPullDistance(PULL_CONFIG.threshold)
        try {
          await onRefreshRef.current()
        } finally {
          refreshingRef.current = false
          setRefreshing(false)
          pullDistanceRef.current = 0
          setPullDistance(0)
        }
      } else {
        pullDistanceRef.current = 0
        setPullDistance(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  return { pullDistance, dragging, refreshing }
}
