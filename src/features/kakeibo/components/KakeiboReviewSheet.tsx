import { useMemo, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useAppDialog } from '@/components/AppDialog'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { AppState, KakeiboReflection } from '@/types'
import { computeCycleSummary, cycleLabel, kakeiboInsight, predecessorOf, NOTE_MAX, type ReviewAction } from '../lib/kakeibo'
import { useCycleLedger } from '../hooks/useCycleLedger'
import { KButton, Row, SectionLabel } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  record: KakeiboReflection | null
  records: KakeiboReflection[]
  state: AppState
  userId: string
  allTransactionsLoaded: boolean
  onReview: (r: KakeiboReflection, action: ReviewAction) => Promise<void>
}

const money = (n: number) => fmt(Math.round(n))

export function KakeiboReviewSheet({ open, onClose, record, records, state, userId, allTransactionsLoaded, onReview }: Props) {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset the draft once per opening (React's "adjust state on prop change"
  // pattern) — not on every record refresh, which would wipe a note mid-typing.
  const session = open && record ? record.id : null
  const [seen, setSeen] = useState<string | null>(null)
  if (session !== seen) {
    setSeen(session)
    if (session && record) { setNote(record.reflection_note ?? ''); setError(null) }
  }

  const prev = record ? predecessorOf(records, record) : null
  const ledger = useCycleLedger({
    userId,
    loaded: state.transactions,
    allLoaded: allTransactionsLoaded,
    from: record ? (prev?.cycle_start ?? record.cycle_start) : null,
    to: record?.cycle_end ?? null,
    enabled: open && !!record?.cycle_end,
  })

  const summary = useMemo(
    () => (record?.cycle_end ? computeCycleSummary(ledger.rows, state, record.cycle_start, record.cycle_end) : null),
    [ledger.rows, state, record],
  )
  const prevSummary = useMemo(
    () => (prev?.cycle_end ? computeCycleSummary(ledger.rows, state, prev.cycle_start, prev.cycle_end) : null),
    [ledger.rows, state, prev],
  )
  const goal = record?.savings_goal ?? null
  const insight = summary ? kakeiboInsight(summary, goal, prevSummary) : null

  const dirty = (note.trim() || null) !== (record?.reflection_note ?? null)

  const requestClose = async () => {
    if (busy) return
    if (dirty && !(await confirm('Discard your unsaved note?', { confirmLabel: 'Discard', cancelLabel: 'Keep writing' }))) return
    onClose()
  }

  const act = async (action: ReviewAction) => {
    if (!record) return
    setBusy(true); setError(null)
    try { await onReview(record, action); onClose() }
    catch (err) { console.error('Kakeibo review save failed', err); setError("Couldn't save — your note is still here. Check your connection and try again.") }
    finally { setBusy(false) }
  }

  const status = record?.review_status ?? null
  const saved = summary ? Math.max(0, summary.savedNet) : 0

  return (
    <>
      <BottomSheet open={open && !!record} onClose={requestClose} showHelpButton={false} dismissible={!busy} maxHeight="94svh">
        {record && (
          <div>
            <div style={{ font: '800 19px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Your money, this cycle.</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, margin: '3px 0 2px' }}>{cycleLabel(record)}</div>
            <div style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, marginBottom: 16, lineHeight: 1.5 }}>
              Review your spending. Celebrate your progress. Choose one improvement.
            </div>

            {ledger.status === 'loading' && (
              <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '24px 0', textAlign: 'center' }}>Loading this cycle's transactions…</div>
            )}
            {ledger.status === 'error' && (
              <div role="alert" style={{ background: c.surface2, borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>
                  Couldn't load this cycle's transactions, so the figures aren't shown. You can still write your note.
                </div>
                <KButton kind="quiet" onClick={ledger.retry}>Try again</KButton>
              </div>
            )}

            {summary && ledger.status === 'ready' && (
              summary.rowCount === 0 ? (
                <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '8px 0 16px' }}>
                  No transactions were recorded in this cycle.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 18 }}>
                  <section aria-label="How much money did I have?">
                    <SectionLabel>1 · How much money came in?</SectionLabel>
                    <Row label="Salary" value={money(summary.incomePrimary)} />
                    {summary.incomeOther > 0 && <Row label="Other income" value={money(summary.incomeOther)} />}
                    <Row label="Total income" value={money(summary.income)} strong
                      hint="Income recorded in this cycle — not your account balances or investments." />
                  </section>

                  <section aria-label="How much did I want to save?">
                    <SectionLabel>2 · How much did I want to save?</SectionLabel>
                    {goal != null && goal > 0 ? (
                      <>
                        <Row label="Goal set at the start" value={money(goal)} />
                        <Row label="Moved to savings & investments" value={money(saved)} strong
                          hint="Net of withdrawals: SIP, RD, gold and other savings entries." />
                        {saved < goal
                          ? <Row label="Still to reach the goal" value={money(goal - saved)} />
                          : <div style={{ font: '700 12px Plus Jakarta Sans', color: c.good, paddingTop: 4 }}>Goal reached</div>}
                      </>
                    ) : (
                      <>
                        <Row label="Moved to savings & investments" value={money(saved)} strong
                          hint="Net of withdrawals: SIP, RD, gold and other savings entries." />
                        <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, paddingTop: 4 }}>No savings goal was set for this cycle.</div>
                      </>
                    )}
                  </section>

                  <section aria-label="How much did I spend?">
                    <SectionLabel>3 · How much did I spend?</SectionLabel>
                    <Row label="Total spent" value={money(summary.spent)} strong />
                    <Row label="Needs" value={money(summary.needs)} />
                    <Row label="Wants" value={money(summary.wants)} />
                    {summary.events > 0 && <Row label="Life events" value={money(summary.events)} hint="Kept out of Needs/Wants" />}
                    {summary.unclassified > 0 && <Row label="Not classified" value={money(summary.unclassified)} hint="Categories without a Needs/Wants bucket" />}
                    {summary.topCategories.length > 0 && (
                      <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, paddingTop: 4 }}>
                        Biggest: {summary.topCategories.map(t => `${t.name} ${money(t.amount)}`).join(' · ')}
                      </div>
                    )}
                  </section>

                  {insight && (
                    <section aria-label="How can I improve?">
                      <SectionLabel>4 · How can I improve?</SectionLabel>
                      <div style={{ display: 'flex', gap: 10, background: c.accentSoft, borderRadius: 14, padding: '12px 14px' }}>
                        <Lightbulb size={16} color={c.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                        <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.5 }}>{insight}</div>
                      </div>
                    </section>
                  )}
                </div>
              )
            )}

            <label htmlFor="kakeibo-note" style={{ display: 'block', font: '800 15px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>
              What will you do differently next cycle?
            </label>
            <textarea
              id="kakeibo-note"
              value={note}
              maxLength={NOTE_MAX}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="One thing, in your own words"
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 12,
                padding: '12px 14px', font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none', lineHeight: 1.5,
              }}
            />
            <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, textAlign: 'right', marginTop: 4 }}>{note.length}/{NOTE_MAX}</div>
            {error && <div role="alert" style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, marginTop: 6 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
              {status == null
                ? <KButton kind="quiet" disabled={busy} onClick={() => act({ kind: 'skip' })}>Skip this review</KButton>
                : <KButton kind="quiet" disabled={busy} onClick={requestClose}>Close</KButton>}
              <KButton
                disabled={busy || (status === 'completed' && !dirty) || (status === 'skipped' && !note.trim())}
                onClick={() => act({ kind: 'save', note })}
              >{busy ? 'Saving…' : status == null ? 'Save reflection' : 'Save changes'}</KButton>
            </div>
          </div>
        )}
      </BottomSheet>
      {dialogNode}
    </>
  )
}
