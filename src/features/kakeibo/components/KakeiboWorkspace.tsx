import { useEffect, useMemo, useRef, useState } from 'react'
import { Lightbulb, Sparkles } from 'lucide-react'
import { Card } from '@/components/Card'
import { useAppDialog } from '@/components/AppDialog'
import { useTheme } from '@/lib/theme-context'
import { fmt, localIso, parseIso, addDays } from '@/lib/utils'
import { getCurrentBalance } from '@/lib/account-balance'
import { classifyKakeiboPillarsWithAI, kakeiboInsightWithAI, type OnAiUsed } from '@/lib/gemini'
import type { AppState, KakeiboReflection } from '@/types'
import type { Kakeibo } from '../hooks/useKakeibo'
import { useCycleLedger } from '../hooks/useCycleLedger'
import { useIncomeHistory } from '../hooks/useIncomeHistory'
import { useKakeiboPillars } from '../hooks/useKakeiboPillars'
import { computeCycleSummary, cycleLabel, kakeiboInsight, NOTE_MAX, type ReviewAction } from '../lib/kakeibo'
import { buildCycleOptions, historyFrom, type CycleOption } from '../lib/cycles'
import {
  PILLARS, PILLAR_LABEL, PILLAR_HINT, computePillarTotals, categoriesNeedingAi, validatePillarSuggestions,
  buildInsightFacts, insightNumbersAreGrounded, factsFingerprint,
} from '../lib/pillars'
import { PillarReview } from './PillarReview'
import { KButton, Row, SectionLabel } from './ui'

interface Props {
  kakeibo: Kakeibo
  state: AppState
  userId: string
  allTransactionsLoaded: boolean
  autopilotEnabled: boolean
  onAiUsed?: OnAiUsed
  /** Opened from the dashboard's Review button: select this cycle and generate. */
  initialCycleStart?: string | null
}

const money = (n: number) => fmt(Math.round(n))
const dayBefore = (iso: string) => localIso(addDays(parseIso(iso), -1))
const STATUS: Record<'completed' | 'skipped' | 'pending', string> = { completed: 'Reflected', skipped: 'Skipped', pending: 'Ready to review' }

// ── Insight cache (per device; an AI answer is reused while its facts are unchanged) ──
const CACHE_MAX = 20
const cacheKey = (uid: string) => `mp_kakeibo_insight_${uid}`
function readInsight(uid: string, fp: string): string | null {
  try { const m = JSON.parse(localStorage.getItem(cacheKey(uid)) || '{}'); return typeof m[fp] === 'string' ? m[fp] : null } catch { return null }
}
function writeInsight(uid: string, fp: string, text: string) {
  try {
    const m = JSON.parse(localStorage.getItem(cacheKey(uid)) || '{}') as Record<string, string>
    m[fp] = text
    const keys = Object.keys(m)
    for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete m[k]
    localStorage.setItem(cacheKey(uid), JSON.stringify(m))
  } catch { /* storage unavailable — not cached */ }
}

/** Analytics → Kakeibo workspace: pick a cycle → Generate → the four answers with
 *  the four pillars. Every number is computed here from transactions; AI (only
 *  with Autopilot) suggests category pillars and explains the computed numbers. */
export function KakeiboWorkspace({ kakeibo, state, userId, allTransactionsLoaded, autopilotEnabled, onAiUsed, initialCycleStart }: Props) {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()
  const today = useMemo(() => new Date(), [])
  const ready = kakeibo.status === 'ready' && kakeibo.cycle != null

  // ── Cycle options ─────────────────────────────────────────────────────────
  const income = useIncomeHistory({ userId, loaded: state.transactions, allLoaded: allTransactionsLoaded, from: historyFrom(today), enabled: ready })
  const options = useMemo<CycleOption[]>(
    () => (ready ? buildCycleOptions({ state, incomeTxns: income.rows, current: kakeibo.cycle!, records: kakeibo.records, today, historyComplete: income.complete }) : []),
    [ready, state, income.rows, income.complete, kakeibo.cycle, kakeibo.records, today],
  )
  const [selectedStart, setSelectedStart] = useState<string | null>(initialCycleStart ?? null)
  const selected = options.find(o => o.start === selectedStart) ?? options[0] ?? null
  // Only the contiguous previous cycle is ever compared with.
  const prevOption = selected ? options.find(o => o.status === 'completed' && o.end === dayBefore(selected.start)) ?? null : null
  const record = selected?.record ?? null

  // ── Generate ──────────────────────────────────────────────────────────────
  const [runId, setRunId] = useState(initialCycleStart ? 1 : 0)
  const [generatedFor, setGeneratedFor] = useState<string | null>(initialCycleStart ?? null)
  const generated = selected != null && generatedFor === selected.start && runId > 0

  const ledger = useCycleLedger({
    userId, loaded: state.transactions, allLoaded: allTransactionsLoaded,
    from: selected ? (prevOption?.start ?? selected.start) : null,
    to: selected?.end ?? null,
    enabled: generated,
  })
  const pillars = useKakeiboPillars(userId, ready)

  const summary = useMemo(() => (selected ? computeCycleSummary(ledger.rows, state, selected.start, selected.end) : null), [ledger.rows, state, selected])
  const totals = useMemo(
    () => (selected ? computePillarTotals(ledger.rows, state, selected.start, selected.end, pillars.catPillars, pillars.txnPillars) : null),
    [ledger.rows, state, selected, pillars.catPillars, pillars.txnPillars],
  )
  const prevTotals = useMemo(
    () => (prevOption ? computePillarTotals(ledger.rows, state, prevOption.start, prevOption.end, pillars.catPillars, pillars.txnPillars) : null),
    [ledger.rows, state, prevOption, pillars.catPillars, pillars.txnPillars],
  )
  const prevSummary = useMemo(() => (prevOption ? computeCycleSummary(ledger.rows, state, prevOption.start, prevOption.end) : null), [ledger.rows, state, prevOption])
  const goal = record?.savings_goal ?? null
  const facts = useMemo(
    () => (summary && totals ? buildInsightFacts({ summary, pillars: totals, goal, inProgress: selected?.status === 'current', prevPillars: prevTotals }) : null),
    [summary, totals, goal, selected, prevTotals],
  )
  const fp = selected && facts ? factsFingerprint(selected.start, facts) : null

  // ── AI: classify new categories once, then explain the verified numbers ───
  const [ai, setAi] = useState<{ run: number; phase: 'classifying' | 'explaining' | 'done' } | null>(null)
  const [insight, setInsight] = useState<{ fp: string; text: string } | null>(null)
  const handled = useRef(0)
  const useAi = autopilotEnabled && pillars.status === 'ready'

  useEffect(() => {
    if (!generated || !useAi || ledger.status !== 'ready' || !totals || handled.current === runId) return
    handled.current = runId
    const myRun = runId
    void (async () => {
      setAi({ run: myRun, phase: 'classifying' })
      const { request, ids } = categoriesNeedingAi(totals, state, pillars.catPillars)
      if (request.length > 0) {
        const raw = await classifyKakeiboPillarsWithAI(request, onAiUsed)
        const items = validatePillarSuggestions(raw, ids)
        try { await pillars.saveAiSuggestions(items) } catch (err) { console.error('Kakeibo: saving AI pillars failed', err) }
      }
      setAi({ run: myRun, phase: 'explaining' })
    })()
  }, [generated, useAi, ledger.status, totals, runId, state, pillars, onAiUsed])

  // A cached answer for exactly these facts is read during render — no request.
  const cachedInsight = generated && useAi && fp ? readInsight(userId, fp) : null
  // One insight request per Generate: facts change once AI pillars land, and
  // without this guard that would fire a second request mid-flight.
  const explainedRun = useRef(0)
  useEffect(() => {
    if (!ai || ai.phase !== 'explaining' || !facts || !fp || explainedRun.current === ai.run) return
    if (readInsight(userId, fp)) return
    explainedRun.current = ai.run
    const myRun = ai.run
    void (async () => {
      const text = await kakeiboInsightWithAI(facts, onAiUsed)
      if (text && insightNumbersAreGrounded(text, facts)) {
        writeInsight(userId, fp, text)
        setInsight({ fp, text })
      } else if (text) {
        console.warn('Kakeibo: AI insight dropped — it used a number not in the facts')
      }
      setAi(prev => (prev && prev.run === myRun ? { run: myRun, phase: 'done' } : prev))
    })()
  }, [ai, facts, fp, userId, onAiUsed])

  // ── Reflection note ───────────────────────────────────────────────────────
  const [note, setNote] = useState('')
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const noteKey = selected ? `${selected.start}|${record?.id ?? ''}` : null
  if (noteKey !== noteFor) {
    setNoteFor(noteKey)
    setNote(record?.reflection_note ?? '')
    setNoteError(null)
  }
  const dirty = (note.trim() || null) !== (record?.reflection_note ?? null)

  const choose = async (start: string) => {
    if (dirty && !(await confirm('Discard your unsaved note?', { confirmLabel: 'Discard', cancelLabel: 'Keep writing' }))) return
    setSelectedStart(start)
  }

  const act = async (action: ReviewAction) => {
    if (!selected) return
    setSaving(true); setNoteError(null)
    try {
      let r: KakeiboReflection | null = record
      if (!r) {
        r = await kakeibo.recordPastCycle(selected.start, selected.end)
        if (!r) { setNoteError("This cycle overlaps one Kakeibo already has, so a note can't be saved on it."); return }
      }
      await kakeibo.review(r, action)
    } catch (err) {
      console.error('Kakeibo note save failed', err)
      setNoteError("Couldn't save — your note is still here. Check your connection and try again.")
    } finally { setSaving(false) }
  }

  if (!ready || !selected) return null

  const isCurrent = selected.status === 'current'
  const generate = () => { setGeneratedFor(selected.start); setRunId(n => n + 1) }
  const statusOf = (o: CycleOption) => o.record?.review_status ?? 'pending'
  const optionLabel = (o: CycleOption) => o.status === 'current'
    ? `${cycleLabel({ cycle_start: o.start, cycle_end: null })} · in progress`
    : `${cycleLabel({ cycle_start: o.start, cycle_end: o.end })} · ${STATUS[statusOf(o)]}`
  const saved = summary ? Math.max(0, summary.savedNet) : 0
  const showInsight = (insight && fp && insight.fp === fp ? insight.text : null) ?? cachedInsight
  const staleInsight = insight && fp && insight.fp !== fp && !cachedInsight
  const aiBusy = generated && ai != null && ai.run === runId
    && (ai.phase === 'classifying' || (ai.phase === 'explaining' && !cachedInsight))
  const status = record?.review_status ?? null

  return (
    <Card>
      <SectionLabel>Select financial cycle</SectionLabel>
      <select
        aria-label="Financial cycle"
        value={selected.start}
        onChange={e => { void choose(e.target.value) }}
        style={{
          width: '100%', boxSizing: 'border-box', background: c.surface2, color: c.ink,
          border: `1.5px solid ${c.faint}`, borderRadius: 12, padding: '11px 12px', font: '700 14px Plus Jakarta Sans',
        }}
      >
        {options.map(o => <option key={o.start} value={o.start}>{optionLabel(o)}</option>)}
      </select>
      {income.complete && !options.some(o => o.status === 'completed') && (
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.sub, marginTop: 8, lineHeight: 1.55 }}>
          Your first full Kakeibo reflection will appear at the end of this cycle. Review your spending, see how much you saved, and choose one improvement for next cycle. You can already analyse this cycle so far.
        </div>
      )}
      {!income.complete && !allTransactionsLoaded && (
        <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 6 }}>Looking further back in your salary history…</div>
      )}

      {!generated ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>Generate Kakeibo Analysis</div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, margin: '2px 0 12px', lineHeight: 1.5 }}>
            Sorts this cycle's spending into the four pillars and answers the four Kakeibo questions.
            {autopilotEnabled ? ' Mint AI suggests pillars for new categories and explains the numbers.' : ' Turn on Autopilot for AI suggestions — everything works without it.'}
          </div>
          <button
            type="button" onClick={generate}
            style={{
              width: '100%', background: c.accent, color: '#fff', border: 'none', borderRadius: 12,
              padding: '13px 14px', font: '800 14px Plus Jakarta Sans', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          ><Sparkles size={16} /> Generate Analysis</button>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Your Kakeibo report</div>
              {isCurrent && <div style={{ font: '700 12px Plus Jakarta Sans', color: c.warn }}>In progress — figures will change</div>}
            </div>
            <KButton kind="quiet" onClick={generate} disabled={aiBusy}>Regenerate</KButton>
          </div>

          {ledger.status === 'loading' && <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '16px 0' }}>Loading this cycle's transactions…</div>}
          {ledger.status === 'error' && (
            <div role="alert" style={{ background: c.surface2, borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Couldn't load this cycle's transactions, so no figures are shown.</div>
              <KButton kind="quiet" onClick={ledger.retry}>Try again</KButton>
            </div>
          )}
          {pillars.status === 'unavailable' && (
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.warn, marginBottom: 10 }}>Your saved pillar choices couldn't load — showing defaults for now.</div>
          )}

          {ledger.status === 'ready' && summary && totals && (summary.rowCount === 0 ? (
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '8px 0 12px' }}>No transactions were recorded in this cycle.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <section aria-label="How much money do I have?">
                <SectionLabel>1 · How much money do I have?</SectionLabel>
                <Row label="Income received this cycle" value={money(summary.income)} strong />
                <Row label="Salary" value={money(summary.incomePrimary)} />
                {summary.incomeOther > 0 && <Row label="Other income" value={money(summary.incomeOther)} />}
                <Row label="Available in your accounts today" value={money(getCurrentBalance(state))}
                  hint="Today's balance, not the balance at cycle end" />
              </section>

              <section aria-label="How much did I want to save?">
                <SectionLabel>2 · How much did I want to save?</SectionLabel>
                {goal != null && goal > 0
                  ? <Row label="This cycle's savings goal" value={money(goal)} />
                  : <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, padding: '2px 0 4px' }}>No savings goal was set.</div>}
                <Row label="Moved to savings & investments (net of withdrawals)" value={money(saved)} strong
                  hint="Contributions you recorded — not the change in your investments' value" />
                {goal != null && goal > 0 && (saved < goal
                  ? <Row label="Still to reach the goal" value={money(goal - saved)} />
                  : <div style={{ font: '700 12px Plus Jakarta Sans', color: c.good }}>Goal reached</div>)}
              </section>

              <section aria-label="How much did I spend?">
                <SectionLabel>3 · How much did I spend?</SectionLabel>
                {totals.needsReview > 0 && (
                  <div style={{ background: c.warnSoft, borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
                    <div style={{ font: '800 13px Plus Jakarta Sans', color: c.ink }}>Needs review · {money(totals.needsReview)}</div>
                    <div style={{ font: '600 12px Plus Jakarta Sans', color: c.sub }}>Not yet classified — choose a pillar for the highlighted categories below.</div>
                  </div>
                )}
                {PILLARS.map(p => {
                  const v = totals.totals[p]
                  const share = totals.spent > 0 ? (v / totals.spent) * 100 : 0
                  return (
                    <div key={p} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div>
                          <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{PILLAR_LABEL[p]}</span>
                          <span style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}> · {PILLAR_HINT[p]}</span>
                        </div>
                        <span style={{ font: '800 13px Plus Jakarta Sans', color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{money(v)}</span>
                      </div>
                      <div role="img" aria-label={`${PILLAR_LABEL[p]} ${Math.round(share)}% of spending`}
                        style={{ height: 6, borderRadius: 999, background: c.faint, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${share}%`, height: '100%', background: c.good, borderRadius: 999 }} />
                      </div>
                    </div>
                  )
                })}
                <Row label="Total spent" value={money(totals.spent)} strong
                  hint={`Savings are counted in question 2, not here.${totals.lifeEvents > 0 ? ` Includes ${money(totals.lifeEvents)} of life-event spending.` : ''}`} />
                <div style={{ marginTop: 12 }}>
                  <SectionLabel>Review transactions</SectionLabel>
                  <PillarReview
                    totals={totals}
                    disabled={pillars.status !== 'ready'}
                    onCategory={pillars.setCategoryPillar}
                    onTxn={pillars.setTxnPillar}
                  />
                </div>
              </section>

              <section aria-label="How can I improve?">
                <SectionLabel>4 · How can I improve?</SectionLabel>
                {(() => {
                  const line = kakeiboInsight(summary, goal, prevSummary)
                  return line ? <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.5, marginBottom: 8 }}>{line}</div> : null
                })()}
                {aiBusy && <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Mint is reading this cycle…</div>}
                {showInsight && (
                  <div style={{ display: 'flex', gap: 10, background: c.accentSoft, borderRadius: 12, padding: '10px 12px' }}>
                    <Lightbulb size={16} color={c.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.5 }}>{showInsight}</div>
                      <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted, marginTop: 4 }}>Mint AI · explains the figures above</div>
                    </div>
                  </div>
                )}
                {!showInsight && staleInsight && !aiBusy && (
                  <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>You changed some pillars — tap Regenerate to refresh Mint's explanation.</div>
                )}
              </section>
            </div>
          ))}

          {!isCurrent && ledger.status !== 'loading' && (
            <div style={{ marginTop: 18 }}>
              <label htmlFor="kakeibo-note" style={{ display: 'block', font: '800 15px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>
                What will you do differently next cycle?
              </label>
              <textarea
                id="kakeibo-note" value={note} maxLength={NOTE_MAX} rows={3}
                onChange={e => setNote(e.target.value)} placeholder="One thing, in your own words"
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical', background: c.surface2,
                  border: `1.5px solid ${c.faint}`, borderRadius: 12, padding: '12px 14px',
                  font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none', lineHeight: 1.5,
                }}
              />
              <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, textAlign: 'right', marginTop: 4 }}>{note.length}/{NOTE_MAX}</div>
              {noteError && <div role="alert" style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, marginTop: 6 }}>{noteError}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                {status == null && <KButton kind="quiet" disabled={saving} onClick={() => act({ kind: 'skip' })}>Skip this review</KButton>}
                <KButton
                  disabled={saving || (status === 'completed' && !dirty) || (status === 'skipped' && !note.trim())}
                  onClick={() => act({ kind: 'save', note })}
                >{saving ? 'Saving…' : status == null ? 'Save reflection' : 'Save changes'}</KButton>
              </div>
            </div>
          )}
        </div>
      )}
      {dialogNode}
    </Card>
  )
}
