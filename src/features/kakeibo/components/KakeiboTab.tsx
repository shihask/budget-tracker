import { useMemo, useState } from 'react'
import { NotebookPen } from 'lucide-react'
import { Card } from '@/components/Card'
import { useTheme } from '@/lib/theme-context'
import { fmt, localIso } from '@/lib/utils'
import type { AppState } from '@/types'
import type { OnAiUsed } from '@/lib/gemini'
import type { Kakeibo } from '../hooks/useKakeibo'
import { useCycleLedger } from '../hooks/useCycleLedger'
import { computeCycleSummary, GOAL_PROMPT_DAYS } from '../lib/kakeibo'
import { KakeiboGoalSheet } from './KakeiboGoalSheet'
import { KakeiboWorkspace } from './KakeiboWorkspace'
import { KakeiboIntro } from './KakeiboIntro'
import { introSeen, markIntroSeen } from '../lib/intro'
import { KButton } from './ui'

interface Props {
  kakeibo: Kakeibo
  state: AppState
  userId: string
  allTransactionsLoaded: boolean
  suggestedGoal: number | null
  autopilotEnabled: boolean
  onAiUsed?: OnAiUsed
  /** From the dashboard's Review button — open the workspace on this cycle. */
  initialCycleStart?: string | null
}

/** "1 Nov" — the day after a calendar month's last day. */
const nextMonthLabel = (end: Date) =>
  new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** Analytics → Kakeibo. This cycle's goal (the payday ritual) on top, then the
 *  analysis workspace for any cycle; explains itself when it can't run. */
export function KakeiboTab({ kakeibo, state, userId, allTransactionsLoaded, suggestedGoal, autopilotEnabled, onAiUsed, initialCycleStart }: Props) {
  const c = useTheme()
  const [goalOpen, setGoalOpen] = useState(false)
  // First open on this device → the intro story; afterwards only on request.
  const [introOpen, setIntroOpen] = useState(() => !introSeen(userId))
  const closeIntro = () => { markIntroSeen(userId); setIntroOpen(false) }
  const introNode = <KakeiboIntro open={introOpen} onClose={closeIntro} />

  // Savings so far this cycle — the same figure and the same full-range read as
  // the review, so the bar never disagrees with it. Only fetched when there is a goal.
  const cur0 = kakeibo.status === 'ready' ? kakeibo.current : null
  const today = localIso(new Date())
  const progress = useCycleLedger({
    userId,
    loaded: state.transactions,
    allLoaded: allTransactionsLoaded,
    from: cur0?.cycle_start ?? null,
    to: today,
    enabled: cur0?.savings_goal != null,
  })
  const savedSoFar = useMemo(
    () => (cur0 && cur0.savings_goal != null ? computeCycleSummary(progress.rows, state, cur0.cycle_start, today).savedNet : null),
    [cur0, progress.rows, state, today],
  )

  const intro = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: c.accentSoft, color: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <NotebookPen size={18} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>Kakeibo <span style={{ font: '700 13px Plus Jakarta Sans', color: c.muted }}>· Spending & Savings Review</span></div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
          Understand your spending. Build better money habits.
        </div>
        <button
          type="button" onClick={() => setIntroOpen(true)}
          style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, color: c.accent, font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}
        >What is Kakeibo?</button>
        {introNode}
      </div>
    </div>
  )

  if (kakeibo.status === 'off') {
    return (
      <Card>
        {intro}
        <div style={{ font: '600 13px Plus Jakarta Sans', color: c.sub, lineHeight: 1.5 }}>
          With a monthly salary, Kakeibo follows your salary cycle. It starts the next time you record your salary.
        </div>
      </Card>
    )
  }
  if (kakeibo.status === 'loading') {
    return <Card>{intro}<div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>Loading…</div></Card>
  }
  if (kakeibo.status === 'unavailable') {
    return (
      <Card>
        {intro}
        <div role="alert" style={{ font: '600 13px Plus Jakarta Sans', color: c.sub, lineHeight: 1.5 }}>
          Kakeibo isn't available right now. Your other analytics aren't affected — try again later.
        </div>
      </Card>
    )
  }

  const cur = kakeibo.current
  const cycle = kakeibo.cycle
  const lessonForGoal = kakeibo.previous?.reflection_note && !kakeibo.previous.lesson_acknowledged_at ? kakeibo.previous : null
  const goal = cur?.savings_goal ?? null
  const saved = progress.status === 'ready' && savedSoFar != null ? Math.max(0, savedSoFar) : null
  const pct = goal != null && goal > 0 && saved != null ? Math.min(100, (saved / goal) * 100) : null
  const goalWindowOpen = !!cycle && cycle.currentDay <= GOAL_PROMPT_DAYS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        {intro}
        {cycle && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>
              Day {cycle.currentDay} of {cycle.totalDays}
            </div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
              {cycle.daysRemaining <= 1 ? 'Last day of this cycle' : `About ${cycle.daysRemaining} days left`} · {cycle.kind === 'month' ? `your review opens on ${nextMonthLabel(cycle.cycleEnd)}` : 'the full review opens on your next salary'}
            </div>
          </div>
        )}

        {cur ? (
          goal != null ? (
            <div style={{ background: c.goodSoft, borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ font: '700 12px Plus Jakarta Sans', color: c.sub }}>This cycle's savings goal</div>
                  <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{fmt(Math.round(goal))}</div>
                </div>
                <KButton kind="quiet" onClick={() => setGoalOpen(true)}>Edit</KButton>
              </div>
              {pct != null && saved != null && (
                <div style={{ marginTop: 10 }}>
                  <div
                    role="progressbar" aria-label="Savings goal progress"
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
                    style={{ height: 6, borderRadius: 999, background: c.faint, overflow: 'hidden' }}
                  >
                    <div style={{ width: `${pct}%`, height: '100%', background: c.good, borderRadius: 999 }} />
                  </div>
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.sub, marginTop: 6 }}>
                    {saved >= goal
                      ? `${fmt(Math.round(saved))} moved to savings so far — goal reached`
                      : `${fmt(Math.round(saved))} moved to savings so far · ${fmt(Math.round(goal - saved))} to go`}
                  </div>
                </div>
              )}
            </div>
          ) : goalWindowOpen ? (
            <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>
                {cur.goal_decided_at ? 'No savings goal this cycle' : "Set this cycle's savings goal"}
              </div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, margin: '2px 0 10px', lineHeight: 1.5 }}>
                {suggestedGoal != null && suggestedGoal > 0
                  ? `Suggested from your Budget Strategy: ${fmt(Math.round(suggestedGoal))}`
                  : cycle?.kind === 'month' ? 'Decide what you want to put aside by the end of the month.' : 'Decide what you want to put aside before your next salary.'}
              </div>
              <KButton onClick={() => setGoalOpen(true)}>Set a savings goal</KButton>
            </div>
          ) : (
            // Past the first week the goal is no longer pushed — same window as the
            // dashboard row. Still settable, just quietly.
            <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>No savings goal this cycle</div>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>The start of a cycle is the best time to set the next one.</div>
              </div>
              <KButton kind="quiet" onClick={() => setGoalOpen(true)}>Set one now</KButton>
            </div>
          )
        ) : (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>Getting this cycle ready…</div>
        )}

        {kakeibo.previous?.reflection_note && (
          <div style={{ background: c.surface2, borderRadius: 12, padding: '10px 12px', marginTop: 12 }}>
            <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, marginBottom: 4 }}>Your lesson from last cycle</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{kakeibo.previous.reflection_note}</div>
          </div>
        )}
      </Card>

      <KakeiboWorkspace
        kakeibo={kakeibo}
        state={state}
        userId={userId}
        allTransactionsLoaded={allTransactionsLoaded}
        autopilotEnabled={autopilotEnabled}
        onAiUsed={onAiUsed}
        initialCycleStart={initialCycleStart}
      />
      <KakeiboGoalSheet
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        record={cur}
        suggested={suggestedGoal}
        lesson={lessonForGoal}
        onSetGoal={kakeibo.setGoal}
        onAcknowledge={r => kakeibo.review(r, { kind: 'acknowledge' })}
      />
    </div>
  )
}
