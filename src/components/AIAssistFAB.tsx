import { useRef, useState, useEffect, useCallback } from 'react'
import { useTheme } from '@/lib/theme-context'

const SIZE = 50
const EDGE_PAD = 14

interface AIAssistFABProps {
  onOpen: () => void
}

export function AIAssistFAB({ onOpen }: AIAssistFABProps) {
  const c = useTheme()

  const getInitialPos = () => {
    try {
      const saved = localStorage.getItem('ai-fab-pos')
      if (saved) return JSON.parse(saved)
    } catch {}
    return { x: window.innerWidth - SIZE - EDGE_PAD, y: window.innerHeight * 0.62 }
  }

  const [pos, setPos] = useState(getInitialPos)
  const [isSnapping, setIsSnapping] = useState(true)
  const posRef = useRef(pos)
  const isDraggingRef = useRef(false)
  const hasDraggedRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const snapToEdge = (x: number, y: number) => {
    const clampedY = Math.max(80, Math.min(y, window.innerHeight - SIZE - 60))
    const snapX = x + SIZE / 2 < window.innerWidth / 2
      ? EDGE_PAD
      : window.innerWidth - SIZE - EDGE_PAD
    return { x: snapX, y: clampedY }
  }

  const onStart = useCallback((clientX: number, clientY: number) => {
    hasDraggedRef.current = false
    isDraggingRef.current = true
    setIsSnapping(false)
    dragOffsetRef.current = {
      x: clientX - posRef.current.x,
      y: clientY - posRef.current.y,
    }
  }, [])

  const onMove = useCallback((clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return
    hasDraggedRef.current = true
    const newPos = {
      x: clientX - dragOffsetRef.current.x,
      y: clientY - dragOffsetRef.current.y,
    }
    posRef.current = newPos
    setPos({ ...newPos })
  }, [])

  const onEnd = useCallback(() => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false

    if (!hasDraggedRef.current) {
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

  useEffect(() => {
    const move = (e: MouseEvent) => onMove(e.clientX, e.clientY)
    const touchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return
      e.preventDefault()
      onMove(e.touches[0].clientX, e.touches[0].clientY)
    }
    const up = () => onEnd()

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('touchmove', touchMove, { passive: false })
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchmove', touchMove)
      window.removeEventListener('touchend', up)
    }
  }, [onMove, onEnd])

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: SIZE,
        height: SIZE,
        zIndex: 90,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        transition: isSnapping ? 'left 0.38s cubic-bezier(0.34,1.56,0.64,1), top 0.18s ease' : 'none',
      }}
      onMouseDown={e => { e.preventDefault(); onStart(e.clientX, e.clientY) }}
      onTouchStart={e => { e.preventDefault(); onStart(e.touches[0].clientX, e.touches[0].clientY) }}
    >
      <div style={{
        width: SIZE, height: SIZE, borderRadius: 999,
        background: c.ink,
        boxShadow: '0 4px 18px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'grab',
      }}>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L13.8 9.2L21 12L13.8 14.8L12 22L10.2 14.8L3 12L10.2 9.2L12 2Z" fill={c.good} />
        </svg>
      </div>
    </div>
  )
}
