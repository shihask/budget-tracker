import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'

interface DialogState {
  open: boolean
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  alertOnly: boolean
}

const CLOSED: DialogState = {
  open: false, message: '',
  confirmLabel: 'Delete', cancelLabel: 'Cancel',
  danger: true, alertOnly: false,
}

export function useAppDialog() {
  const [state, setState] = useState<DialogState>(CLOSED)
  const resolveRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((
    message: string,
    opts?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean }
  ): Promise<boolean> => {
    return new Promise(resolve => {
      resolveRef.current = resolve
      setState({
        open: true, message,
        confirmLabel: opts?.confirmLabel ?? 'Delete',
        cancelLabel: opts?.cancelLabel ?? 'Cancel',
        danger: opts?.danger ?? true,
        alertOnly: false,
      })
    })
  }, [])

  const alert = useCallback((message: string): Promise<void> => {
    return new Promise(resolve => {
      resolveRef.current = () => resolve()
      setState({
        open: true, message,
        confirmLabel: 'OK',
        cancelLabel: '',
        danger: false,
        alertOnly: true,
      })
    })
  }, [])

  const handle = useCallback((result: boolean) => {
    setState(CLOSED)
    resolveRef.current?.(result)
    resolveRef.current = null
  }, [])

  const dialogNode = <DialogRenderer state={state} onResult={handle} />

  return { confirm, alert, dialogNode }
}

function DialogRenderer({ state, onResult }: {
  state: DialogState
  onResult: (v: boolean) => void
}) {
  const c = useTheme()
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (state.open) {
      setMounted(true)
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(id)
    } else {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 220)
      return () => clearTimeout(t)
    }
  }, [state.open])

  if (!mounted) return null

  return createPortal(
    <div
      onClick={() => onResult(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: visible ? 'rgba(0,0,0,0.55)' : 'transparent',
        transition: 'background 0.2s ease',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: c.surface,
          borderRadius: 20,
          padding: '24px 20px 20px',
          width: '100%',
          maxWidth: 340,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(10px)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease',
        }}
      >
        <div style={{
          font: '500 14px Plus Jakarta Sans',
          color: c.sub,
          lineHeight: 1.55,
          marginBottom: 20,
        }}>
          {state.message}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!state.alertOnly && (
            <button
              onClick={() => onResult(false)}
              style={{
                flex: 1, padding: '12px 0',
                background: c.surface2, border: 'none',
                borderRadius: 12, font: '600 14px Plus Jakarta Sans',
                color: c.sub, cursor: 'pointer',
              }}
            >
              {state.cancelLabel}
            </button>
          )}
          <button
            onClick={() => onResult(true)}
            style={{
              flex: 1, padding: '12px 0',
              background: state.danger ? c.bad : c.accent,
              border: 'none', borderRadius: 12,
              font: '600 14px Plus Jakarta Sans',
              color: '#fff', cursor: 'pointer',
            }}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
