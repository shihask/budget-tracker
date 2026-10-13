import { useState } from 'react'
import { NotebookPen, ChevronRight } from 'lucide-react'
import { Card } from '@/components/Card'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { AppState, KakeiboReflection } from '@/types'
import type { Kakeibo } from '../hooks/useKakeibo'
import { cycleLabel } from '../lib/kakeibo'
import { KakeiboGoalSheet } from './KakeiboGoalSheet'
import { KakeiboReviewSheet } from './KakeiboReviewSheet'
import { KButton, SectionLabel } from './ui'

interface Props {
  kakeibo: Kakeibo
  state: AppState
  userId: string
  allTransactionsLoaded: boolean
  suggestedGoal: number | null
}

const STATUS_LABEL: Record<'completed' | 'skipped' | 'pending', string> = {
  completed: 'Reflected', skipped: 'Skipped', pending: 'Ready to review',
}

/** Analytics → Kakeibo. The feature's home: this cycle's goal, every finished
 *  cycle (re-openable and editable), and the ritual explained when it can't run. */
export function KakeiboTab({ kakeibo, state, userId, allTransactionsLoaded, suggestedGoal }: Props) {
  const c = useTheme()
  const [reviewing, setReviewing] = useState<KakeiboReflection | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)

  const intro = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: c.accentSoft, color: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <NotebookPen size={18} />
      </div>
      <div>
        <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>Kakeibo</div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
          Monthly Money Reflection. Set a savings goal on payday, look back when the cycle ends, and carry one lesson forward.
        </div>
      </div>
    </div>
  )

  if (kakeibo.status === 'off') {
    return (
      <Card>
        {intro}
        <div style={{ font: '600 13px Plus Jakarta Sans', color: c.sub, lineHeight: 1.5 }}>
          Kakeibo follows your salary cycle. It starts the next time you record your salary.
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        {intro}
        <SectionLabel>This cycle{cycle ? ` · day ${cycle.currentDay} of ${cycle.totalDays}` : ''}</SectionLabel>
        {cur ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>
                {cur.savings_goal != null ? `Savings goal ${fmt(Math.round(cur.savings_goal))}` : cur.goal_decided_at ? 'No goal this cycle' : 'No goal set yet'}
              </div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Review opens after your next salary</div>
            </div>
            <KButton kind={cur.savings_goal != null ? 'quiet' : 'primary'} onClick={() => setGoalOpen(true)}>
              {cur.savings_goal != null ? 'Edit' : 'Set goal'}
            </KButton>
          </div>
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

      <Card>
        <SectionLabel>Past cycles</SectionLabel>
        {kakeibo.reviewable.length === 0 ? (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
            Your first review appears when this cycle ends — on your next salary.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {kakeibo.reviewable.map((r, i) => {
              const st = r.review_status ?? 'pending'
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReviewing(r)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '11px 0',
                    borderTop: i ? `1px solid ${c.faint}` : 'none',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{cycleLabel(r)}</div>
                    <div style={{ font: '600 12px Plus Jakarta Sans', color: st === 'pending' ? c.accent : c.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {STATUS_LABEL[st]}{r.reflection_note ? ` · ${r.reflection_note}` : ''}
                    </div>
                  </div>
                  <ChevronRight size={16} color={c.muted} />
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <KakeiboReviewSheet
        open={reviewing != null}
        onClose={() => setReviewing(null)}
        record={reviewing ? (kakeibo.records.find(r => r.id === reviewing.id) ?? reviewing) : null}
        records={kakeibo.records}
        state={state}
        userId={userId}
        allTransactionsLoaded={allTransactionsLoaded}
        onReview={kakeibo.review}
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
