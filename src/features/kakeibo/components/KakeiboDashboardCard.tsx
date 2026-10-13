import { useState } from 'react'
import { NotebookPen, Quote } from 'lucide-react'
import { Card } from '@/components/Card'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { AppState } from '@/types'
import type { Kakeibo } from '../hooks/useKakeibo'
import { cycleLabel } from '../lib/kakeibo'
import { KakeiboGoalSheet } from './KakeiboGoalSheet'
import { KakeiboReviewSheet } from './KakeiboReviewSheet'
import { KButton } from './ui'

interface Props {
  kakeibo: Kakeibo
  state: AppState
  userId: string
  allTransactionsLoaded: boolean
  suggestedGoal: number | null
}

/** The in-app reminder. Renders nothing unless something is asked of the user,
 *  so on most days the dashboard looks exactly as it did before Kakeibo. Review
 *  and goal are independent rows — on payday both show, in either order. */
export function KakeiboDashboardCard({ kakeibo, state, userId, allTransactionsLoaded, suggestedGoal }: Props) {
  const c = useTheme()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { review, goal, lesson } = kakeibo.actions

  // Keep the sheets mounted while open even after their row resolves.
  const showCard = kakeibo.status === 'ready' && (review || goal || lesson)
  if (!showCard && !reviewOpen && !goalOpen) return null

  const quick = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (err) { console.error('Kakeibo action failed', err) } finally { setBusy(false) }
  }

  const lessonForGoal = kakeibo.previous?.reflection_note && !kakeibo.previous.lesson_acknowledged_at ? kakeibo.previous : null

  return (
    <>
      {showCard && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: c.accentSoft, color: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <NotebookPen size={17} />
            </div>
            <div>
              <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Kakeibo</div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Monthly Money Reflection</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {review && (
              <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Your Kakeibo review is ready</div>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, margin: '2px 0 10px' }}>
                  {cycleLabel(review)} · about two minutes
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <KButton onClick={() => setReviewOpen(true)}>Review</KButton>
                  <KButton kind="quiet" disabled={busy} onClick={() => quick(() => kakeibo.review(review, { kind: 'skip' }))}>Skip</KButton>
                </div>
              </div>
            )}

            {goal && (
              <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Set your savings goal</div>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, margin: '2px 0 10px' }}>
                  {suggestedGoal != null && suggestedGoal > 0 ? `Suggested: ${fmt(Math.round(suggestedGoal))}` : 'What do you want to save this cycle?'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <KButton onClick={() => setGoalOpen(true)}>Set goal</KButton>
                  <KButton kind="quiet" disabled={busy} onClick={() => quick(() => kakeibo.setGoal(goal, null))}>Skip for now</KButton>
                </div>
              </div>
            )}

            {lesson && (
              <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '700 11px Plus Jakarta Sans', color: c.muted, marginBottom: 6 }}>
                  <Quote size={13} /> Your last lesson
                </div>
                <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 10 }}>
                  {lesson.reflection_note}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <KButton kind="quiet" disabled={busy} onClick={() => quick(() => kakeibo.review(lesson, { kind: 'acknowledge' }))}>Got it</KButton>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <KakeiboReviewSheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        record={review ?? (reviewOpen ? kakeibo.previous : null)}
        records={kakeibo.records}
        state={state}
        userId={userId}
        allTransactionsLoaded={allTransactionsLoaded}
        onReview={kakeibo.review}
      />
      <KakeiboGoalSheet
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        record={kakeibo.current}
        suggested={suggestedGoal}
        lesson={lessonForGoal}
        onSetGoal={kakeibo.setGoal}
        onAcknowledge={r => kakeibo.review(r, { kind: 'acknowledge' })}
      />
    </>
  )
}
