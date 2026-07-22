import { useRef, useState, useEffect, useCallback } from 'react'
import { useTheme } from '@/lib/theme-context'
import { MintAnimation } from './MintAnimation'

const SIZE = 50
const EDGE_PAD = 14
// Real taps almost always jitter a pixel or two (touchscreen digitizer noise,
// mouse hand tremor) — without this, every tap looked like a drag and never
// opened the chat.
const DRAG_THRESHOLD = 6

interface AIAssistFABProps {
  onOpen: () => void
  containerWidth: number
  windowWidth: number
  busy?: boolean
  tourHighlight?: boolean
}

export function AIAssistFAB({ onOpen, containerWidth, windowWidth, busy = false, tourHighlight }: AIAssistFABProps) {
  const c = useTheme()

  // Uses the same windowWidth the parent derived containerWidth from, rather than
  // reading window.innerWidth independently — the two can otherwise briefly disagree
  // during an orientation change and snap the button into the gutter beside the app.
  const getBounds = () => {
    const margin = (windowWidth - containerWidth) / 2
    return {
      left: margin + EDGE_PAD,
      right: margin + containerWidth - SIZE - EDGE_PAD,
      mid: windowWidth / 2,
    }
  }

  const getInitialPos = () => {
    try {
      const saved = localStorage.getItem('ai-fab-pos')
      if (saved) {
        const parsed = JSON.parse(saved)
        const b = getBounds()
        // Re-clamp saved position in case container width changed (e.g. mobile→desktop)
        return { x: Math.min(Math.max(parsed.x, b.left), b.right), y: parsed.y }
      }
    } catch {}
    const b = getBounds()
    return { x: b.right, y: window.innerHeight * 0.62 }
  }

  const [pos, setPos] = useState(getInitialPos)
  const [isSnapping, setIsSnapping] = useState(true)
  const posRef = useRef(pos)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragStartClientRef = useRef({ x: 0, y: 0 })

  const snapToEdge = (x: number, y: number) => {
    const b = getBounds()
    const clampedY = Math.max(80, Math.min(y, window.innerHeight - SIZE - 60))
    const snapX = x + SIZE / 2 < b.mid ? b.left : b.right
    return { x: snapX, y: clampedY }
  }

  useEffect(() => {
    if (draggingRef.current) return
    const snapped = snapToEdge(posRef.current.x, posRef.current.y)
    posRef.current = snapped
    setPos(snapped)
  }, [containerWidth, windowWidth])

  // Pointer Events give one unified stream for mouse/touch/pen — no separate
  // touch vs. mouse handlers to keep in sync, and no risk of a browser's
  // delayed synthesized "ghost" mouse event (fired ~300ms after a real touch
  // tap) starting a second, conflicting gesture. setPointerCapture routes all
  // subsequent events for this gesture straight to this element regardless of
  // where the pointer travels, so no window-level listeners are needed either.
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    movedRef.current = false
    setIsSnapping(false)
    dragStartClientRef.current = { x: e.clientX, y: e.clientY }
    dragOffsetRef.current = {
      x: e.clientX - posRef.current.x,
      y: e.clientY - posRef.current.y,
    }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    if (!movedRef.current) {
      const dx = e.clientX - dragStartClientRef.current.x
      const dy = e.clientY - dragStartClientRef.current.y
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      movedRef.current = true
    }
    const newPos = {
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    }
    posRef.current = newPos
    setPos({ ...newPos })
  }, [])

  const endGesture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}

    if (!movedRef.current) {
      setIsSnapping(true)
      onOpen()
      return
    }

    const snapped = snapToEdge(posRef.current.x, posRef.current.y)
    posRef.current = snapped
    setPos(snapped)
    setIsSnapping(true)
    try { localStorage.setItem('ai-fab-pos', JSON.stringify(snapped)) } catch {}
  }, [onOpen])

  return (
    <div
      data-tour="ai-fab"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: SIZE,
        height: SIZE,
        zIndex: tourHighlight ? 602 : 90,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        transition: isSnapping ? 'left 0.38s cubic-bezier(0.34,1.56,0.64,1), top 0.18s ease' : 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      <div style={{
        width: SIZE, height: SIZE, borderRadius: 999,
        background: '#111111',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 0 1.5px rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'grab',
      }}>
        {busy
          ? <MintAnimation variant="thinking" size={38} style={{ borderRadius: 10 }} />
          : <img src="/mint-ai-logo.svg" width="32" height="32" alt="Mint AI" style={{ borderRadius: 8, display: 'block' }} />
        }
      </div>
    </div>
  )
}
