import { useMemo, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt, iso, addDays, TODAY } from '@/lib/utils'
import { computeChallenge } from '@/lib/challenge'
import type { AppState, DerivedMetrics } from '@/types'

interface Props {
  state: AppState
  d: DerivedMetrics
  onUpdateSettings: (patch: Partial<AppState['settings']>) => Promise<void>
  updateChallengeResult: (result: 'success' | 'miss', savedAmount: number, target: number, date: string) => Promise<void>
  onOpenSalaryDateEdit: () => void
}

const DIFFICULTY_OPTS: Array<{ key: 'easy' | 'medium' | 'hard'; label: string }> = [
  { key: 'easy',   label: 'Easy'   },
  { key: 'medium', label: 'Medium' },
  { key: 'hard',   label: 'Hard'   },
]

function SeedlingIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V12"/>
      <path d="M12 12C12 12 6 11 6 5s6-1 6 5z"/>
      <path d="M12 12c0 0 6 1 6-5s-6-1-6 5z"/>
    </svg>
  )
}

function FlameIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="0">
      <path d="M12 2c0 0-5 4-5 9a5 5 0 0 0 10 0c0-3-2-5-3-6-0.5 1.5-2 3-2 3z"/>
    </svg>
  )
}

function ChevronRightIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  )
}

export function DailyChallengeCard({ state, d, onUpdateSettings, updateChallengeResult, onOpenSalaryDateEdit }: Props) {
  const c = useTheme()
  const settings = state.settings
  const enabled = settings.challenge_enabled ?? false
  const difficulty = settings.challenge_difficulty ?? 'medium'
  const streak = settings.challenge_streak ?? 0
  const evaluatingRef = useRef(false)

  const calc = useMemo(
    () => computeChallenge(state, difficulty),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.transactions, state.accounts, state.commitments, settings]
  )

  // Day-change detection: evaluate past days lazily on mount
  useEffect(() => {
    if (!enabled || evaluatingRef.current) return

    async function evaluatePastDays() {
      evaluatingRef.current = true
      const lastDate = settings.challenge_last_date
      const todayStr = iso(TODAY)
      const yesterdayStr = iso(addDays(TODAY, -1))

      if (!lastDate || lastDate === todayStr) {
        evaluatingRef.current = false
        return
      }

      // Walk from day after last_date through yesterday
      let cursor = new Date(lastDate)
      cursor.setDate(cursor.getDate() + 1)
      const yesterday = new Date(yesterdayStr)

      while (cursor <= yesterday) {
        const dateStr = iso(cursor)
        const dayDifficulty = settings.challenge_difficulty ?? 'medium'
        // Compute that day's result from stored transactions
        const excluded = settings.challenge_excluded_txn_ids ?? []
        const daySpent = state.transactions
          .filter(t => t.transaction_type === 'expense' && t.transaction_date === dateStr && !excluded.includes(t.id))
          .reduce((s, t) => s + t.amount, 0)
        // We need safeDailyLimit for that day — use the current calc as approximation
        const dayTarget = calc.targets[dayDifficulty]
        const savedAmt = dayTarget - daySpent
        const result = daySpent <= dayTarget ? 'success' : 'miss'
        await updateChallengeResult(result, savedAmt, dayTarget, dateStr)
        cursor.setDate(cursor.getDate() + 1)
      }
      evaluatingRef.current = false
    }

    evaluatePastDays()
  }, [enabled, settings.challenge_last_date]) // eslint-disable-line react-hooks/exhaustive-deps

  const cardStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 18,
    background: c.surface,
    border: `1px solid ${c.faint}`,
    boxShadow: c.cardShadow,
  }

  // ── Disabled state ─────────────────────────────────────────────────────────
  if (!enabled) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <SeedlingIcon color={c.accent} size={20} />
          <span style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Daily Challenge</span>
        </div>
        <p style={{ font: '500 13px Plus Jakarta Sans', color: c.sub, margin: '0 0 16px', lineHeight: 1.5 }}>
          Get a daily spending target based on your available money. Know before you spend.
        </p>
        <button
          onClick={() => onUpdateSettings({ challenge_enabled: true })}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 12,
            background: c.accent, border: 'none', cursor: 'pointer',
            font: '700 14px Plus Jakarta Sans', color: '#fff',
          }}
        >
          Enable Daily Challenge
        </button>
      </div>
    )
  }

  // ── Progress bar color ─────────────────────────────────────────────────────
  const barColor = calc.pctUsed <= 60 ? c.good : calc.pctUsed <= 85 ? c.warn : c.bad
  const barPct = Math.min(100, calc.pctUsed)

  // ── Survival status label ──────────────────────────────────────────────────
  const survivalColor = calc.survivalStatus === 'on_track' ? c.good : calc.survivalStatus === 'watch' ? c.warn : c.bad
  const survivalLabel = calc.survivalStatus === 'on_track' ? 'On Track' : calc.survivalStatus === 'watch' ? 'Watch Pace' : 'At Risk'

  // ── Plant milestone color ──────────────────────────────────────────────────
  const plantColor = calc.plantGrowth.milestone === 'blooming' ? '#E879F9'
    : calc.plantGrowth.milestone === 'tree' ? '#34D399'
    : calc.plantGrowth.milestone === 'sapling' ? c.good
    : calc.plantGrowth.milestone === 'sprout' ? c.accent
    : c.muted

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SeedlingIcon color={c.accent} size={18} />
          <span style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>Daily Challenge</span>
        </div>
        {streak >= 2 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: c.warnSoft, borderRadius: 99, padding: '3px 8px' }}>
            <FlameIcon color={c.warn} size={12} />
            <span style={{ font: '700 12px Plus Jakarta Sans', color: c.warn }}>{streak} day streak</span>
          </div>
        )}
      </div>

      {/* Horizon & planning mode */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ font: '500 12px Plus Jakarta Sans', color: c.sub }}>
            {calc.planningMode === 'salary_cycle'
              ? `${calc.daysRemaining} days until salary`
              : `${calc.daysRemaining} days until month end`}
          </span>
          <span style={{ font: '500 12px Plus Jakarta Sans', color: c.muted }}>·</span>
          <span style={{ font: '500 12px Plus Jakarta Sans', color: c.sub }}>{fmt(calc.availableSpendable)} available</span>
          {calc.planningMode === 'month_end' && (
            <>
              <span style={{ font: '500 12px Plus Jakarta Sans', color: c.muted }}>·</span>
              <button
                onClick={onOpenSalaryDateEdit}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  font: '600 12px Plus Jakarta Sans', color: c.accent,
                  display: 'flex', alignItems: 'center', gap: 2,
                }}
              >
                Set salary date <ChevronRightIcon color={c.accent} />
              </button>
            </>
          )}
        </div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.ink }}>
          To reach salary day: {fmt(Math.round(calc.safeDailyLimit))}/day
        </div>
      </div>

      {/* Difficulty chips */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
        {DIFFICULTY_OPTS.map(opt => {
          const selected = difficulty === opt.key
          const isRec = calc.recommendedDifficulty === opt.key
          const chipAmt = calc.targets[opt.key]
          return (
            <button
              key={opt.key}
              onClick={() => onUpdateSettings({ challenge_difficulty: opt.key })}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 10,
                background: selected ? c.accent : c.surface2,
                border: `1.5px solid ${selected ? c.accent : isRec ? c.accent + '60' : c.faint}`,
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span style={{ font: `700 11px Plus Jakarta Sans`, color: selected ? '#fff' : c.sub }}>
                {opt.label}{isRec && !selected ? ' ★' : ''}
              </span>
              <span style={{ font: '800 13px Plus Jakarta Sans', color: selected ? '#fff' : c.ink }}>
                {fmt(Math.round(chipAmt))}
              </span>
            </button>
          )
        })}
      </div>
      {calc.recommendedDifficulty !== difficulty && (
        <p style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, margin: '-8px 0 12px', textAlign: 'center' }}>
          ★ Recommended based on your 30-day average ({fmt(Math.round(calc.avgDailySpend30))}/day)
        </p>
      )}

      {/* Progress bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline' }}>
          <span style={{ font: '800 20px Plus Jakarta Sans', color: barColor }}>
            {fmt(calc.spentToday)}
          </span>
          <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>
            of {fmt(Math.round(calc.adjustedTarget))}
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: c.surface2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${barPct}%`,
            background: barColor,
            transition: 'width 0.4s ease, background 0.4s ease',
          }} />
        </div>
      </div>

      {/* Status message */}
      <p style={{ font: '500 13px Plus Jakarta Sans', color: c.sub, margin: '0 0 14px', lineHeight: 1.45 }}>
        {calc.message}
      </p>

      {/* Salary Survival */}
      <div style={{
        background: c.surface2, borderRadius: 12, padding: '10px 12px',
        marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 2 }}>Salary Survival</div>
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.sub }}>
            Your pace {fmt(Math.round(calc.currentPace))}/day
            <span style={{ font: '400 11px Plus Jakarta Sans', color: c.muted }}> (last 7 days)</span>
            {' · '}Safe {fmt(Math.round(calc.safeDailyLimit))}/day
          </div>
        </div>
        <span style={{
          font: '700 12px Plus Jakarta Sans', color: survivalColor,
          background: survivalColor + '22', padding: '3px 8px', borderRadius: 99,
        }}>
          {survivalLabel}
        </span>
      </div>

      {/* Today's Win */}
      {calc.todaysWin && (() => {
        const missed = calc.status === 'exceeded'
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: missed ? c.surface2 : c.goodSoft,
            borderRadius: 10, padding: '8px 12px', marginBottom: 12,
          }}>
            <SeedlingIcon color={missed ? c.muted : c.good} size={14} />
            <span style={{ font: '600 12px Plus Jakarta Sans', color: missed ? c.sub : c.good }}>
              Today's Win — {calc.todaysWin}
            </span>
          </div>
        )
      })()}

      {/* Footer row: streak + success rate */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 2 }}>Streak</div>
          <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>
            {streak} {streak === 1 ? 'day' : 'days'}
          </div>
        </div>
        {calc.successRate !== null && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 2 }}>Success Rate</div>
            <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>
              {calc.successRate}%
              <span style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>
                {' '}({settings.challenge_success_days ?? 0}/{settings.challenge_total_days ?? 0})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Plant Growth */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: c.surface2, borderRadius: 12, padding: '9px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <SeedlingIcon color={plantColor} size={15} />
          <span style={{ font: '700 13px Plus Jakarta Sans', color: plantColor }}>
            {calc.plantGrowth.milestoneLabel}
          </span>
          {calc.plantGrowth.streakBonus && (
            <span style={{
              font: '600 11px Plus Jakarta Sans', color: '#E879F9',
              background: '#E879F922', padding: '2px 6px', borderRadius: 99,
            }}>
              7-day bloom
            </span>
          )}
        </div>
        {calc.plantGrowth.nextGoal > 0 && (
          <span style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>
            {calc.plantGrowth.nextGoal} more to next
          </span>
        )}
      </div>
    </div>
  )
}
