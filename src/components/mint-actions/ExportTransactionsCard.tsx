import { useState } from 'react'
import { FileDown, Check } from 'lucide-react'
import type { ExportTransactionsAction, MintAction } from '@/lib/mintActions'
import type { ColorTokens } from '@/lib/tokens'

interface Props {
  action: ExportTransactionsAction
  onAction: (action: MintAction) => Promise<void>
  c: ColorTokens
}

export function ExportTransactionsCard({ action, onAction, c }: Props) {
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const handleClick = async () => {
    setErr(false)
    setBusy(true)
    try {
      await onAction(action)
      setDone(true)
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      maxWidth: 'min(88%, 360px)',
      background: c.surface2,
      borderRadius: '18px 18px 18px 4px',
      padding: '14px 16px',
      border: `1px solid ${c.faint}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <FileDown size={16} color={c.accent} strokeWidth={2.2} />
        <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Export Transactions</span>
      </div>
      <div style={{ font: '600 13px Plus Jakarta Sans', color: c.sub, marginBottom: 2 }}>
        {action.periodLabel}
      </div>
      <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginBottom: 10 }}>
        {action.estimatedCount === 0
          ? 'No transactions found'
          : `About ${action.estimatedCount} transaction${action.estimatedCount !== 1 ? 's' : ''}`}
      </div>
      {action.estimatedCount > 0 && (
        <>
          <div style={{ font: '400 11px Plus Jakarta Sans', color: c.muted, marginBottom: 14, lineHeight: 1.6 }}>
            CSV includes: Date · Description · Amount · Category · Account · Notes
          </div>
          {err && (
            <div style={{ font: '500 12px Plus Jakarta Sans', color: c.bad, marginBottom: 10 }}>
              Export failed — please try again.
            </div>
          )}
          <button
            onClick={handleClick}
            disabled={busy || done}
            style={{
              height: 36, paddingInline: 16, borderRadius: 10, border: 'none',
              background: done ? c.good : err ? c.bad : c.accent,
              color: '#fff', opacity: busy ? 0.7 : 1,
              font: '600 13px Plus Jakarta Sans', cursor: busy || done ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              transition: 'background 0.2s',
            }}
          >
            {done
              ? <><Check size={13} strokeWidth={2.5} /> Downloaded</>
              : err
              ? <><FileDown size={13} strokeWidth={2.5} /> Retry</>
              : <><FileDown size={13} strokeWidth={2.5} /> Download CSV</>}
          </button>
        </>
      )}
    </div>
  )
}
