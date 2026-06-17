import { useMemo, useEffect, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt, iso, addDays, TODAY } from '@/lib/utils'
import { computeChallenge } from '@/lib/challenge'
import { STAGE_THRESHOLDS } from './PlantSVG'
import { MoneyPlantWatermark } from './MoneyPlantWatermark'
import type { AppState, DerivedMetrics } from '@/types'

const STAGE_LABELS = ['Seed', 'Sprout', 'First Leaves', 'Young Plant', 'Growing', 'Mature', 'Blooming']

interface Props {
  state: AppState
  d: DerivedMetrics
  onUpdateSettings: (patch: Partial<AppState['settings']>) => Promise<void>
  updateChallengeResult: (result: 'success' | 'miss', savedAmount: number, target: number, date: string) => Promise<void>
  onOpenSalaryDateEdit: () => void
  onOpenPlant: () => void
  onSuccessDay?: (savedAmount: number) => void
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

function ChevronDownIcon({ color, flipped }: { color: string; flipped?: boolean }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: flipped ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s ease' }}
    >
      <path d="M6 9l6 6 6-6"/>
    </svg>
  )
}

export function DailyChallengeCard({ state, d, onUpdateSettings, updateChallengeResult, onOpenSalaryDateEdit, onOpenPlant, onSuccessDay }: Props) {
  const c = useTheme()
  const settings = state.settings
  const enabled = settings.challenge_enabled ?? false
  const difficulty = settings.challenge_difficulty ?? 'medium'
  const streak = settings.challenge_streak ?? 0
  const evaluatingRef = useRef(false)
  const [expanded, setExpanded] = useState(false)

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

      let cursor = new Date(lastDate)
      cursor.setDate(cursor.getDate() + 1)
      const yesterday = new Date(yesterdayStr)

      while (cursor <= yesterday) {
        const dateStr = iso(cursor)
        const dayDifficulty = settings.challenge_difficulty ?? 'medium'
        const excluded = settings.challenge_excluded_txn_ids ?? []
        const daySpent = state.transactions
          .filter(t => t.transaction_type === 'expense' && t.transaction_date === dateStr && !excluded.includes(t.id))
          .reduce((s, t) => s + t.amount, 0)
        const dayTarget = calc.targets[dayDifficulty]
        const savedAmt = dayTarget - daySpent
        const result = daySpent <= dayTarget ? 'success' : 'miss'
        await updateChallengeResult(result, savedAmt, dayTarget, dateStr)
        if (result === 'success' && savedAmt > 0 && dateStr === yesterdayStr) {
          onSuccessDay?.(savedAmt)
        }
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

  // ── Derived display values ─────────────────────────────────────────────────
  const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1)

  // Use calc.target (unadjusted challenge amount) for all display — clearer than adjustedTarget
  const barPct = Math.min(100, calc.target > 0
    ? (calc.spentToday / calc.target) * 100
    : (calc.spentToday > 0 ? 110 : 0))
  const barColor = barPct <= 60 ? c.good : barPct <= 85 ? c.warn : c.bad

  const remaining = Math.round(calc.target - calc.spentToday)
  const isOver = remaining < 0
  const statusColor = isOver ? c.bad : remaining / calc.target < 0.2 ? c.warn : c.good

  const survivalColor = calc.survivalStatus === 'on_track' ? c.good : calc.survivalStatus === 'watch' ? c.warn : c.bad
  const survivalLabel = calc.survivalStatus === 'on_track' ? 'On Track' : calc.survivalStatus === 'watch' ? 'Watch Pace' : 'At Risk'

  const plantColor = calc.plantGrowth.milestone === 'blooming' ? '#E879F9'
    : calc.plantGrowth.milestone === 'mature'  ? '#34D399'
    : calc.plantGrowth.milestone === 'growing' ? '#34D399'
    : calc.plantGrowth.milestone === 'young'   ? c.good
    : calc.plantGrowth.milestone === 'first_leaf' ? c.good
    : calc.plantGrowth.milestone === 'sprout'  ? c.accent
    : c.muted

  return (
    <div style={{ ...cardStyle, position: 'relative', overflow: 'hidden' }}>
      {/* Watermark */}
      <div style={{ position: 'absolute', bottom: -24, right: -16, width: 130, pointerEvents: 'none', opacity: 0.07, zIndex: 0, color: c.ink }}>
        <MoneyPlantWatermark />
      </div>

      {/* Header — tapping toggles expanded */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(e => !e)}
        onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SeedlingIcon color={c.accent} size={18} />
          <span style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>Daily Challenge</span>
          {streak >= 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: c.warnSoft, borderRadius: 99, padding: '2px 7px' }}>
              <FlameIcon color={c.warn} size={11} />
              <span style={{ font: '700 11px Plus Jakarta Sans', color: c.warn }}>{streak}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 99, background: c.surface2 }}>
          <span style={{ font: '600 11px Plus Jakarta Sans', color: c.sub }}>Details</span>
          <ChevronDownIcon color={c.sub} flipped={expanded} />
        </div>
      </div>

      {/* Hero stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{
          flex: 1, background: c.accent + '12', borderRadius: 14, padding: '10px 14px',
          border: `1px solid ${c.accent}30`,
        }}>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Safe Today
          </div>
          <div style={{ font: '800 24px Plus Jakarta Sans', color: c.accent, lineHeight: 1 }}>
            {fmt(Math.round(calc.safeDailyLimit))}
          </div>
        </div>
        <div style={{
          flex: 1, background: c.surface2, borderRadius: 14, padding: '10px 14px',
          border: `1px solid ${c.faint}`,
        }}>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Available
          </div>
          <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, lineHeight: 1 }}>
            {fmt(calc.availableSpendable)}
          </div>
        </div>
      </div>

      {/* Challenge target + status */}
      <div style={{ marginBottom: calc.spentToday > 0 ? 8 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ font: '600 13px Plus Jakarta Sans', color: c.sub }}>
            {diffLabel} Challenge{' '}
            <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(Math.round(calc.target))}</span>
          </span>
        </div>
        {calc.spentToday === 0 ? (
          <p style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, margin: 0 }}>
            Spend below {fmt(Math.round(calc.target))} today
          </p>
        ) : (
          <p style={{ font: '600 12px Plus Jakarta Sans', color: statusColor, margin: 0 }}>
            {isOver
              ? `Over challenge by ${fmt(Math.abs(remaining))}`
              : `${fmt(remaining)} under target`}
          </p>
        )}
      </div>

      {/* Today's spending + progress bar */}
      {calc.spentToday > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
            <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Today's spending</span>
            <span style={{ font: '700 13px Plus Jakarta Sans', color: barColor }}>
              {fmt(calc.spentToday)}
              <span style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}> / Challenge {fmt(Math.round(calc.target))}</span>
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: c.surface2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              width: `${barPct}%`,
              background: barColor,
              transition: 'width 0.4s ease, background 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {/* ── Expanded details ─────────────────────────────────────────────────── */}
      {expanded && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${c.faint}` }}>

          {/* Horizon row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={{ font: '500 12px Plus Jakarta Sans', color: c.sub }}>
              {calc.planningMode === 'salary_cycle'
                ? `${calc.daysRemaining} days until salary`
                : `${calc.daysRemaining} days until month end`}
            </span>
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

          {/* Difficulty chips */}
          <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
            {DIFFICULTY_OPTS.map(opt => {
              const selected = difficulty === opt.key
              const isRec = calc.recommendedDifficulty === opt.key
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
                  <span style={{ font: '700 11px Plus Jakarta Sans', color: selected ? '#fff' : c.sub }}>
                    {opt.label}{isRec && !selected ? ' ★' : ''}
                  </span>
                  <span style={{ font: '800 13px Plus Jakarta Sans', color: selected ? '#fff' : c.ink }}>
                    {fmt(Math.round(calc.targets[opt.key]))}
                  </span>
                </button>
              )
            })}
          </div>
          {calc.recommendedDifficulty !== difficulty && (
            <p style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, margin: '-8px 0 14px', textAlign: 'center' }}>
              ★ Recommended based on your 30-day average ({fmt(Math.round(calc.avgDailySpend30))}/day)
            </p>
          )}

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
              flexShrink: 0, marginLeft: 8,
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

          {/* Streak + success rate */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
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

          {/* Growth teaser */}
          {calc.plantGrowth.nextGoal > 0 && (() => {
            const nextGoal = calc.plantGrowth.nextGoal
            const nextStageName = calc.plantGrowth.stageIdx < STAGE_LABELS.length - 1
              ? STAGE_LABELS[calc.plantGrowth.stageIdx + 1] : null
            if (!nextStageName) return null
            const isClose = nextGoal === 1
            const teaserColor = isClose ? c.accent : c.good
            return (
              <div style={{
                background: teaserColor + '10', border: `1px solid ${teaserColor}30`,
                borderRadius: 12, padding: '9px 12px', marginBottom: 12,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <SeedlingIcon color={teaserColor} size={14} />
                <div>
                  <div style={{ font: '700 12px Plus Jakarta Sans', color: teaserColor, marginBottom: 2 }}>
                    {isClose ? 'Growth Opportunity' : 'Growth Progress'}
                  </div>
                  <div style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, lineHeight: 1.4 }}>
                    {isClose
                      ? `Complete tomorrow's challenge to unlock ${nextStageName}.`
                      : `${nextGoal} ${nextGoal === 1 ? 'leaf' : 'leaves'} away from ${nextStageName}.`}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Plant stage + View My Plant */}
          <div style={{ background: c.surface2, borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SeedlingIcon color={plantColor} size={15} />
                <div>
                  <div style={{ font: '700 12px Plus Jakarta Sans', color: plantColor }}>
                    {STAGE_LABELS[calc.plantGrowth.stageIdx]}
                  </div>
                  <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>
                    {calc.plantGrowth.leaves} {calc.plantGrowth.leaves === 1 ? 'leaf' : 'leaves'}
                  </div>
                </div>
              </div>
              {calc.plantGrowth.nextGoal > 0 && calc.plantGrowth.stageIdx < STAGE_LABELS.length - 1 && (
                <>
                  <span style={{ font: '500 14px Plus Jakarta Sans', color: c.muted, margin: '0 4px' }}>→</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 1 }}>Next</div>
                      <div style={{ font: '700 12px Plus Jakarta Sans', color: c.sub }}>
                        {STAGE_LABELS[calc.plantGrowth.stageIdx + 1]}
                      </div>
                      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>
                        {calc.plantGrowth.nextGoal} {calc.plantGrowth.nextGoal === 1 ? 'leaf' : 'leaves'} needed
                      </div>
                    </div>
                    <SeedlingIcon color={c.muted} size={15} />
                  </div>
                </>
              )}
              {calc.plantGrowth.nextGoal === 0 && (
                <div style={{ font: '700 11px Plus Jakarta Sans', color: plantColor, background: plantColor + '18', padding: '3px 8px', borderRadius: 99 }}>
                  Max Stage
                </div>
              )}
            </div>
            <button
              onClick={onOpenPlant}
              style={{
                width: '100%', background: c.accent + '18', border: `1px solid ${c.accent}40`,
                borderRadius: 10, padding: '7px 12px', cursor: 'pointer',
                font: '700 12px Plus Jakarta Sans', color: c.accent,
              }}
            >
              View My Plant
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
