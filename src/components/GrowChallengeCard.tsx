import { Star } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { getIncomePattern } from '@/lib/income-pattern'
import type { AppState, DerivedMetrics } from '@/types'
import type { ChallengeCalc } from '@/lib/challenge'

interface Props {
  state: AppState
  d: DerivedMetrics
  calc: ChallengeCalc
  difficulty: 'easy' | 'medium' | 'hard'
  streak: number
  remaining: number
  progressPct: number
  isOverTarget: boolean
  onUpdateSettings: (patch: Partial<AppState['settings']>) => Promise<void>
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

function CheckIcon({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function AlertIcon({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}

// Today's Mission — the trimmed, page-native rendering of the Daily Challenge system.
// Lives inside GrowPage's "Today's Growth" section. Streak/success-rate and the
// plant-growth teaser used to render here too; they now live in GrowPage's own
// "Growth" section so the same numbers don't appear twice on one page.
export function GrowChallengeCard({ state, d, calc, difficulty, streak, remaining, progressPct, isOverTarget, onUpdateSettings, onOpenSalaryDateEdit }: Props) {
  const c = useTheme()
  const settings = state.settings

  const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
  const barColor = progressPct <= 60 ? c.good : progressPct <= 85 ? c.warn : c.bad
  const statusColor = isOverTarget ? c.bad : remaining / calc.target < 0.2 ? c.warn : c.good

  const survivalColor = calc.survivalStatus === 'on_track' ? c.good : calc.survivalStatus === 'watch' ? c.warn : c.bad
  const survivalLabel = calc.survivalStatus === 'on_track' ? 'On Track' : calc.survivalStatus === 'watch' ? 'Watch Pace' : 'At Risk'

  const cardStyle: React.CSSProperties = {
    borderRadius: 18,
    padding: 14,
    background: c.surface,
    border: `1px solid ${c.faint}`,
    boxShadow: c.cardShadow,
  }

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <SeedlingIcon color={c.accent} size={17} />
        <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Today's Mission</span>
        {streak >= 2 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: c.warnSoft, borderRadius: 99, padding: '2px 7px' }}>
            <FlameIcon color={c.warn} size={11} />
            <span style={{ font: '700 11px Plus Jakarta Sans', color: c.warn }}>{streak}</span>
          </div>
        )}
      </div>

      {/* Hero stats */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
        <div style={{
          flex: 1, background: c.accent + '12', borderRadius: 12, padding: '8px 11px',
          border: `1px solid ${c.accent}30`,
        }}>
          <div style={{ font: '600 9px Plus Jakarta Sans', color: c.accent, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Safe Today
          </div>
          <div style={{ font: '800 20px Plus Jakarta Sans', color: c.accent, lineHeight: 1 }}>
            {fmt(Math.round(calc.safeDailyLimit))}
          </div>
        </div>
        <div style={{
          flex: 1, background: c.surface2, borderRadius: 12, padding: '8px 11px',
          border: `1px solid ${c.faint}`,
        }}>
          <div style={{ font: '600 9px Plus Jakarta Sans', color: c.muted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Available
          </div>
          <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, lineHeight: 1 }}>
            {fmt(calc.availableSpendable)}
          </div>
        </div>
      </div>

      {/* Challenge target + status */}
      <div style={{ marginBottom: calc.spentToday > 0 ? 6 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ font: '600 12px Plus Jakarta Sans', color: c.sub }}>
            {diffLabel} Challenge{' '}
            <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(Math.round(calc.target))}</span>
          </span>
        </div>
        {calc.spentToday === 0 ? (
          <p style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, margin: 0 }}>
            Spend below {fmt(Math.round(calc.target))} today
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {isOverTarget
              ? <AlertIcon color={statusColor} size={13} />
              : <CheckIcon color={statusColor} size={13} />}
            <span style={{ font: '600 12px Plus Jakarta Sans', color: statusColor }}>
              {isOverTarget
                ? `Over challenge by ${fmt(Math.abs(remaining))}`
                : `${fmt(remaining)} under target`}
            </span>
          </div>
        )}
      </div>

      {/* Today's spending + progress bar */}
      {calc.spentToday > 0 && (
        <div style={{ marginTop: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Today's spending</span>
            <span style={{ font: '700 12px Plus Jakarta Sans', color: barColor }}>
              {fmt(calc.spentToday)}
              <span style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}> / Challenge {fmt(Math.round(calc.target))}</span>
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: c.surface2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              width: `${progressPct}%`,
              background: barColor,
              transition: 'width 0.4s ease, background 0.4s ease',
            }} />
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${c.faint}` }}>

        {/* Horizon row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ font: '500 12px Plus Jakarta Sans', color: c.sub }}>
            {d.isWaitingForIncome
              ? (getIncomePattern(settings) === 'monthly' ? 'Salary expected — waiting' : 'Income expected — waiting')
              : calc.planningMode === 'salary_cycle'
              ? (getIncomePattern(settings) === 'monthly' ? `${calc.daysRemaining} days until salary` : `${calc.daysRemaining} days until income`)
              : `${calc.daysRemaining} days until month end`}
          </span>
          {calc.planningMode === 'month_end' && getIncomePattern(settings) === 'monthly' && (
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
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {DIFFICULTY_OPTS.map(opt => {
            const selected = difficulty === opt.key
            const isRec = calc.recommendedDifficulty === opt.key
            return (
              <button
                key={opt.key}
                onClick={() => onUpdateSettings({ challenge_difficulty: opt.key })}
                style={{
                  flex: 1, padding: '6px 4px', borderRadius: 9,
                  background: selected ? c.accent : c.surface2,
                  border: `1.5px solid ${selected ? c.accent : isRec ? c.accent + '60' : c.faint}`,
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                }}
              >
                <span style={{ font: '700 10px Plus Jakarta Sans', color: selected ? '#fff' : c.sub }}>
                  {opt.label}{isRec && !selected ? <> <Star size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /></> : ''}
                </span>
                <span style={{ font: '800 12px Plus Jakarta Sans', color: selected ? '#fff' : c.ink }}>
                  {fmt(Math.round(calc.targets[opt.key]))}
                </span>
              </button>
            )
          })}
        </div>
        {calc.recommendedDifficulty !== difficulty && (
          <p style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, margin: '-6px 0 10px', textAlign: 'center' }}>
            <Star size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Recommended based on your 30-day average ({fmt(Math.round(calc.avgDailySpend30))}/day)
          </p>
        )}

        {/* Salary Survival */}
        <div style={{
          background: c.surface2, borderRadius: 11, padding: '8px 10px',
          marginBottom: calc.todaysWin ? 9 : 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 2 }}>{getIncomePattern(settings) === 'monthly' ? 'Salary Survival' : getIncomePattern(settings) === 'weekly' ? 'Income Survival' : 'Cash Runway'}</div>
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
              borderRadius: 10, padding: '7px 10px',
            }}>
              <SeedlingIcon color={missed ? c.muted : c.good} size={14} />
              <span style={{ font: '600 12px Plus Jakarta Sans', color: missed ? c.sub : c.good }}>
                Today's Win — {calc.todaysWin}
              </span>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
