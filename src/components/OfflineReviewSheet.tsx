import { useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, CloudOff, Trash2 } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt, fmtTxTime } from '@/lib/utils'
import { describeQueueError, type QueuedTransaction } from '@/lib/offline-queue'
import type { SaveOfflineResult } from '@/hooks/useSupabaseData'
import type { AppState } from '@/types'
import { BottomSheet } from './BottomSheet'

interface Props {
  open: boolean
  onClose: () => void
  queue: QueuedTransaction[]
  state: AppState
  online: boolean
  onSaveAll: (onProgress: (done: number, total: number) => void) => Promise<SaveOfflineResult>
  onDiscard: (id: string) => Promise<{ ok: boolean; message?: string }>
}

/** Review-first: offline entries reach the server only when the user taps
 *  Save all here. Nothing uploads on reconnect by itself. */
export function OfflineReviewSheet({ open, onClose, queue, state, online, onSaveAll, onDiscard }: Props) {
  const c = useTheme()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [finished, setFinished] = useState<number | null>(null)   // "N saved", when the queue emptied

  const saving = progress !== null
  const busy = saving || removingId !== null

  const present = {
    accountIds: new Set(state.accounts.map(a => a.id)),
    cardIds: new Set(state.credit_cards.map(cc => cc.id)),
    categoryIds: new Set(state.categories.map(cat => cat.id)),
  }

  const close = () => {
    if (busy) return
    setNotice(null)
    setFinished(null)
    onClose()
  }

  const saveAll = async () => {
    if (busy || !online || queue.length === 0) return
    setNotice(null)
    setProgress({ done: 0, total: queue.length })
    try {
      const r = await onSaveAll((done, total) => setProgress({ done, total }))
      if (r.skipped) return
      if (r.networkStopped) {
        setNotice(r.saved > 0
          ? `${r.saved} saved. The connection dropped. The rest are still waiting to sync.`
          : 'Couldn’t save the transactions. They’re still waiting to sync.')
      } else if (r.failed > 0) {
        setNotice(`${r.saved} saved · ${r.failed} couldn’t be saved`)
      } else {
        setFinished(r.saved)
      }
    } finally {
      setProgress(null)
    }
  }

  const remove = async (id: string) => {
    if (busy) return
    setRemovingId(id)
    setNotice(null)
    try {
      const r = await onDiscard(id)
      if (r.message) setNotice(r.message)
    } finally {
      setRemovingId(null)
    }
  }

  const accountLine = (q: QueuedTransaction) =>
    q.form.transaction_type === 'transfer' && q.labels.toAccount
      ? <>{q.labels.account} <ArrowRight size={11} style={{ verticalAlign: -1 }} /> {q.labels.toAccount}</>
      : <>{q.labels.account}{q.labels.category ? ` · ${q.labels.category}` : ''}</>

  const dateLine = (q: QueuedTransaction) => {
    const [y, m, d] = q.form.transaction_date.split('-').map(Number)
    const day = new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    return `${day} · ${fmtTxTime({ transaction_time: q.form.transaction_time, created_at: q.queuedAt })}`
  }

  const amountColor = (q: QueuedTransaction) =>
    q.form.transaction_type === 'income' ? c.good : q.form.transaction_type === 'transfer' ? c.ink : c.bad
  const amountSign = (q: QueuedTransaction) =>
    q.form.transaction_type === 'income' ? '+' : q.form.transaction_type === 'transfer' ? '' : '−'

  return (
    <BottomSheet open={open} onClose={close} dismissible={!busy} showHelpButton={false}>
      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink }}>Offline transactions</div>

      {finished !== null && queue.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '28px 0 8px' }}>
          <CheckCircle2 size={36} color={c.good} />
          <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>
            {finished} transaction{finished === 1 ? '' : 's'} saved
          </div>
          <button onClick={close} style={primaryBtn(c.accent)}>Done</button>
        </div>
      ) : (
        <>
          <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, margin: '4px 0 14px' }}>
            {queue.length} transaction{queue.length === 1 ? '' : 's'} waiting to sync. Remove any you don’t want, then save.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {queue.map(q => {
              const err = describeQueueError(q, present)
              return (
                <div key={q.id} style={{
                  background: c.surface2, borderRadius: 14, padding: '12px 12px',
                  border: `1px solid ${err ? c.bad + '55' : c.faint}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q.form.description || 'Transfer'}
                      </div>
                      <div style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, marginTop: 2 }}>{accountLine(q)}</div>
                      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                        {dateLine(q)} · <CloudOff size={11} /> Waiting to sync
                      </div>
                    </div>
                    <div style={{ font: '800 14px Plus Jakarta Sans', color: amountColor(q), whiteSpace: 'nowrap' }}>
                      {amountSign(q)}{fmt(q.form.amount)}
                    </div>
                  </div>

                  {err && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, font: '600 12px/1.5 Plus Jakarta Sans', color: c.bad }}>
                      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 800 }}>Could not save.</div>
                        <div>{err.reason}</div>
                        <div style={{ color: c.sub }}>{err.consequence}</div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                      onClick={() => remove(q.id)}
                      disabled={busy}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        border: 'none', background: 'transparent', padding: '4px 2px',
                        font: '700 12px Plus Jakarta Sans', color: busy ? c.muted : c.bad,
                        cursor: busy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Trash2 size={13} /> {removingId === q.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {notice && (
            <div style={{ font: '600 12px/1.5 Plus Jakarta Sans', color: c.sub, textAlign: 'center', marginTop: 14 }}>
              {notice}
            </div>
          )}

          <button
            onClick={saveAll}
            disabled={busy || !online || queue.length === 0}
            style={{ ...primaryBtn(busy || !online || queue.length === 0 ? c.faint : c.accent), marginTop: 18, width: '100%' }}
          >
            {saving
              ? `Saving ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
              : !online ? 'You’re offline' : 'Save all'}
          </button>
          {!saving && (
            <button onClick={close} disabled={busy} style={{
              width: '100%', marginTop: 8, border: 'none', background: 'transparent',
              font: '700 13px Plus Jakarta Sans', color: c.muted, padding: 10, cursor: busy ? 'not-allowed' : 'pointer',
            }}>
              Not now
            </button>
          )}
        </>
      )}
    </BottomSheet>
  )
}

const primaryBtn = (bg: string): React.CSSProperties => ({
  border: 'none', borderRadius: 14, padding: '14px 28px', background: bg, color: '#fff',
  font: '800 15px Plus Jakarta Sans', cursor: 'pointer',
})
