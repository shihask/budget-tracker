import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { computeChallenge } from '@/lib/challenge'
import type { AppState, DerivedMetrics } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  d: DerivedMetrics
  onGoalContribution: (goalId: string, amount: number) => Promise<void>
}

function localToday(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export function DailyReflectionSheet({ open, onClose, state, d, onGoalContribution }: Props) {
  const c = useTheme()
  const todayStr = localToday()

  const todaySpend = useMemo(() => {
    return state.transactions
      .filter(t => t.transaction_date === todayStr && t.transaction_type === 'expense')
      .reduce((s, t) => s + t.amount, 0)
  }, [state.transactions, todayStr])

  const challengeOn = state.settings.challenge_enabled ?? false
  const safeLimit = useMemo(() => {
    if (!challengeOn) return 0
    return computeChallenge(state, state.settings.challenge_difficulty ?? 'medium', d.financialCycle).safeDailyLimit
  }, [state, challengeOn, d.financialCycle])

  const surplus = challengeOn ? Math.max(0, Math.round(safeLimit - todaySpend)) : 0
  const underLimit = challengeOn && todaySpend <= safeLimit

  const goals = useMemo(() => state.goals.filter(g => g.is_active), [state.goals])

  const [amount, setAmount] = useState('')
  const [goalId, setGoalId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  // prefill amount with surplus the first time we have one
  const effAmount = amount === '' && surplus > 0 ? String(surplus) : amount
  const effGoal = goalId ?? (goals[0]?.id ?? null)

  const contribute = async () => {
    const amt = parseFloat(effAmount)
    if (!effGoal || !(amt > 0) || saving) return
    setSaving(true)
    try {
      await onGoalContribution(effGoal, Math.round(amt))
      setDone(true)
    } catch (_) { /* surface nothing destructive; let them retry */ }
    setSaving(false)
  }

  const lbl: React.CSSProperties = {
    font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.04em',
    textTransform: 'uppercase', marginBottom: 6, display: 'block',
  }

  return (
    <BottomSheet open={open} onClose={onClose} zIndex={400} showHelpButton={false}>
      <div style={{ padding: '4px 20px 24px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
          Today's reflection
        </div>
        <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, marginBottom: 18 }}>
          A quick look at your day — no judgment, just the picture.
        </div>

        {/* Today summary */}
        <div style={{ background: c.surface2, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ font: '700 13px Plus Jakarta Sans', color: c.muted }}>Spent today</span>
            <span style={{ font: '800 20px Plus Jakarta Sans', color: c.ink }}>{fmt(Math.round(todaySpend))}</span>
          </div>
          {challengeOn && (
            <div style={{ marginTop: 10, font: '600 13px Plus Jakarta Sans', color: underLimit ? c.good : c.muted, lineHeight: 1.5 }}>
              {underLimit
                ? `Nicely under your ₹${Math.round(safeLimit)} limit — ${fmt(surplus)} to spare. That's a win.`
                : `A bit over your ₹${Math.round(safeLimit)} limit today. No drama — fresh start tomorrow.`}
            </div>
          )}
        </div>

        {/* Move surplus into a goal */}
        {goals.length > 0 && !done && (
          <div style={{ background: c.goodSoft, borderRadius: 14, padding: 16 }}>
            <div style={{ font: '800 14px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
              {surplus > 0 ? 'Turn today’s surplus into progress' : 'Add to a goal'}
            </div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 14, lineHeight: 1.5 }}>
              {surplus > 0
                ? `Move your ${fmt(surplus)} leftover toward something you’re saving for.`
                : 'Put a little toward a goal — every bit counts.'}
            </div>

            <label style={lbl}>Goal</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {goals.map(g => {
                const sel = effGoal === g.id
                return (
                  <button key={g.id} onClick={() => setGoalId(g.id)}
                    style={{
                      border: `1.5px solid ${sel ? c.accent : c.faint}`,
                      background: sel ? c.accent : 'transparent',
                      color: sel ? '#fff' : c.ink,
                      borderRadius: 999, padding: '7px 13px',
                      font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
                    }}>
                    {g.name}
                  </button>
                )
              })}
            </div>

            <label style={lbl}>Amount</label>
            <input
              value={effAmount}
              onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="numeric"
              onFocus={e => e.target.select()}
              placeholder="0"
              style={{
                width: '100%', boxSizing: 'border-box', background: c.bg,
                border: `1.5px solid ${c.faint}`, borderRadius: 12, padding: '12px 14px',
                font: '700 16px Plus Jakarta Sans', color: c.ink, outline: 'none', marginBottom: 14,
              }}
            />

            <button onClick={contribute} disabled={!effGoal || !(parseFloat(effAmount) > 0) || saving}
              style={{
                width: '100%', background: c.accent, color: '#fff', border: 'none',
                borderRadius: 13, padding: '14px', font: '800 14px Plus Jakarta Sans',
                cursor: saving ? 'default' : 'pointer',
                opacity: (!effGoal || !(parseFloat(effAmount) > 0) || saving) ? 0.5 : 1,
              }}>
              {saving ? 'Adding…' : 'Add to goal'}
            </button>
          </div>
        )}

        {done && (
          <div style={{ background: c.goodSoft, borderRadius: 14, padding: 18, textAlign: 'center' }}>
            <div style={{ font: '800 15px Plus Jakarta Sans', color: c.good, marginBottom: 4 }}>Added <Check size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /></div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>
              That’s real progress. See you tomorrow.
            </div>
          </div>
        )}

        {goals.length === 0 && (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, textAlign: 'center', padding: '8px 0 4px' }}>
            Set up a savings goal to turn good days into progress.
          </div>
        )}

        <button onClick={onClose}
          style={{
            width: '100%', background: 'none', border: 'none', color: c.muted,
            font: '600 13px Plus Jakarta Sans', padding: '14px 0 0', cursor: 'pointer',
          }}>
          {done ? 'Done' : 'Close'}
        </button>
      </div>
    </BottomSheet>
  )
}
