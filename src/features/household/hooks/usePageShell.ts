import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme-context'

// ── Swipe-back page shell ─────────────────────────────────────────────────────
// Same gesture as EventsListPage / SavingsPage: start within 28px of the left
// edge, close past 38% of the width or on a flick, report progress to App's scrim.
export function useSwipeBack({ onClose, onSwipeProgress, disabled }: {
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  /** true while a sheet is open over the page */
  disabled?: boolean
}) {
  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400

  useEffect(() => {
    const t = setTimeout(() => setEntryPlayed(true), 360)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  const triggerClose = () => {
    setClosing(true)
    onSwipeProgress?.(1)
    setTimeout(() => { onSwipeProgress?.(0); onClose() }, 290)
  }
  const snapBack = () => {
    setSnapping(true); setDragX(0); onSwipeProgress?.(0)
    setTimeout(() => setSnapping(false), 300)
  }

  const handlers = {
    onTouchStart: (e: React.TouchEvent) => {
      if (closing || disabled) return
      const t = e.touches[0]
      if (t.clientX > 28) return
      gestureRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: Date.now() }
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!gestureRef.current) return
      const t = e.touches[0]
      const dx = t.clientX - gestureRef.current.startX
      const dy = Math.abs(t.clientY - gestureRef.current.startY)
      if (dy > Math.abs(dx) + 5 && Math.abs(dx) < 15) {
        gestureRef.current = null; setDragX(0); onSwipeProgress?.(0); return
      }
      gestureRef.current = { ...gestureRef.current, lastX: t.clientX, lastT: Date.now() }
      const x = Math.max(0, dx)
      setDragX(x)
      onSwipeProgress?.(x / W)
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!gestureRef.current) return
      const t = e.changedTouches[0]
      const dx = t.clientX - gestureRef.current.startX
      const dt = Date.now() - gestureRef.current.lastT
      const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
      gestureRef.current = null
      if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) triggerClose()
      else snapBack()
    },
    onTouchCancel: () => {
      if (!gestureRef.current) return
      gestureRef.current = null
      snapBack()
    },
  }

  const style: React.CSSProperties = closing
    ? { transform: 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
    : dragX > 0
    ? { transform: `translateX(${dragX}px)`, animation: 'none', boxShadow: '-8px 0 24px rgba(0,0,0,0.18)' }
    : snapping
    ? { transform: 'translateX(0)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
    : entryPlayed
    ? {}
    : { animation: 'slideInFromRight 0.32s cubic-bezier(0.32,0.72,0,1)' }

  return { handlers, style, dragging: dragX > 0, triggerClose }
}

export function useFieldStyle(): React.CSSProperties {
  const c = useTheme()
  return {
    width: '100%', boxSizing: 'border-box', border: `1.5px solid ${c.faint}`, background: c.surface2,
    borderRadius: 13, padding: '12px 14px', font: '600 15px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
}

