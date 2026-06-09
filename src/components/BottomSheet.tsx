import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  maxHeight?: string
  zIndex?: number
}

export function BottomSheet({ open, onClose, children, maxHeight = '90svh', zIndex = 200 }: BottomSheetProps) {
  const c = useTheme()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const dragging = useRef(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      document.body.style.overflow = 'hidden'
      document.body.style.touchAction = 'none'
      return () => cancelAnimationFrame(id)
    } else {
      setVisible(false)
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
      const t = setTimeout(() => setMounted(false), 340)
      return () => clearTimeout(t)
    }
  }, [open])

  const finishDrag = (endY: number) => {
    dragging.current = false
    const dy = endY - dragStartY.current
    if (dy > 100) {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.28s ease-in'
        sheetRef.current.style.transform = 'translateY(110%)'
      }
      setTimeout(onClose, 260)
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)'
        sheetRef.current.style.transform = 'translateY(0)'
      }
    }
  }

  // Touch handlers
  const onHandleTouchStart = (e: React.TouchEvent) => {
    dragging.current = true
    dragStartY.current = e.touches[0].clientY
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }

  const onHandleTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return
    const dy = Math.max(0, e.touches[0].clientY - dragStartY.current)
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`
  }

  const onHandleTouchEnd = (e: React.TouchEvent) => {
    if (!dragging.current) return
    finishDrag(e.changedTouches[0].clientY)
  }

  // Mouse handlers (attached to document so dragging outside handle still works)
  const onHandleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    dragStartY.current = e.clientY
    if (sheetRef.current) sheetRef.current.style.transition = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const dy = Math.max(0, ev.clientY - dragStartY.current)
      if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`
    }
    const onMouseUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (dragging.current) finishDrag(ev.clientY)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  if (!mounted) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: visible ? 'rgba(0,0,0,0.6)' : 'transparent',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        transition: 'background 0.3s ease',
      }}
    >
      <div
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
        style={{
          background: c.surface,
          borderRadius: '28px 28px 0 0',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          maxWidth: 600,
          width: '100%',
          margin: '0 auto',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          maxHeight,
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
        }}
      >
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          onMouseDown={onHandleMouseDown}
          style={{ padding: '12px 0 18px', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
        >
          <div style={{ width: 40, height: 4, background: c.faint, borderRadius: 999, margin: '0 auto' }} />
        </div>
        <div style={{ padding: '0 16px calc(40px + env(safe-area-inset-bottom, 0px))' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
