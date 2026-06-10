import { useRef, useState, useEffect, useCallback } from 'react'
import { useTheme } from '@/lib/theme-context'

const SIZE = 50
const EDGE_PAD = 14

interface AIAssistFABProps {
  onOpen: () => void
  containerWidth: number
}

export function AIAssistFAB({ onOpen, containerWidth }: AIAssistFABProps) {
  const c = useTheme()

  const getBounds = () => {
    const margin = (window.innerWidth - containerWidth) / 2
    return {
      left: margin + EDGE_PAD,
      right: margin + containerWidth - SIZE - EDGE_PAD,
      mid: window.innerWidth / 2,
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
  const isDraggingRef = useRef(false)
  const hasDraggedRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const snapToEdge = (x: number, y: number) => {
    const b = getBounds()
    const clampedY = Math.max(80, Math.min(y, window.innerHeight - SIZE - 60))
    const snapX = x + SIZE / 2 < b.mid ? b.left : b.right
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
    if (isDraggingRef.current) return
    const snapped = snapToEdge(posRef.current.x, posRef.current.y)
    posRef.current = snapped
    setPos(snapped)
  }, [containerWidth])

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

  const fabRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = fabRef.current
    if (!el) return
    const handler = (e: TouchEvent) => {
      e.preventDefault()
      onStart(e.touches[0].clientX, e.touches[0].clientY)
    }
    el.addEventListener('touchstart', handler, { passive: false })
    return () => el.removeEventListener('touchstart', handler)
  }, [onStart])

  return (
    <div
      ref={fabRef}
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
    >
      <div style={{
        width: SIZE, height: SIZE, borderRadius: 999,
        background: '#111111',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 0 1.5px rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'grab',
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="28" height="28">
          <path d="M 50 24 C 36 24 27 34 27 47 C 27 61 38 70 50 76 L 50 24 Z" fill="#16C98A"/>
          <path d="M 50 24 C 64 24 73 34 73 47 C 73 61 62 70 50 76 L 50 24 Z" fill="#16C98A" fillOpacity="0.5"/>
          <path d="M 50 30 L 50 73" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  )
}
