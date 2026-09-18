import { useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'

/** How long the Undo stays reachable. Long enough to notice a mis-tap, short
 *  enough not to sit over the FAB. */
const UNDO_VISIBLE_MS = 5000

interface Props {
  open: boolean
  message: string
  onUndo: () => void
  onClose: () => void
}

/** A one-line "done — Undo" bar, positioned like UpdateToast. Auto-closes. */
export function UndoSnackbar({ open, message, onUndo, onClose }: Props) {
  const c = useTheme()

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(onClose, UNDO_VISIBLE_MS)
    return () => window.clearTimeout(id)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 'calc(100px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9998,
        width: 'calc(100% - 32px)',
        maxWidth: 340,
        background: c.ink,
        borderRadius: 16,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
        animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1) both',
      }}
    >
      <span style={{ flex: 1, font: '600 13px Plus Jakarta Sans', color: c.surface }}>{message}</span>
      <button
        onClick={() => { onUndo(); onClose() }}
        style={{
          background: 'transparent', border: 'none', padding: '4px 6px',
          color: c.accent, font: '800 13px Plus Jakarta Sans', cursor: 'pointer', flexShrink: 0,
        }}
      >
        Undo
      </button>
    </div>
  )
}
