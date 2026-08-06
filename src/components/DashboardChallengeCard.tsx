import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { AppState } from '@/types'
import type { ChallengeCalc } from '@/lib/challenge'
import { MoneyPlantWatermark } from './MoneyPlantWatermark'

interface Props {
  calc: ChallengeCalc | null
  enabled: boolean
  streak: number
  remaining: number
  progressPct: number
  onUpdateSettings: (patch: Partial<AppState['settings']>) => Promise<void>
  onOpenGrow: () => void
}

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

// Compact dashboard summary of Daily Challenge — the detail view (difficulty picker,
// survival pace, streak, plant growth) lives on the Grow page. This card is just
// enough to answer "am I on track today," with a tap-through into Grow for the rest.
export function DashboardChallengeCard({ calc, enabled, streak, remaining, progressPct, onUpdateSettings, onOpenGrow }: Props) {
  const c = useTheme()

  const cardStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 18,
    background: c.surface,
    border: `1px solid ${c.faint}`,
    boxShadow: c.cardShadow,
  }

  if (!enabled || !calc) {
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

  const isOverTarget = remaining < 0
  const barColor = progressPct <= 60 ? c.good : progressPct <= 85 ? c.warn : c.bad

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenGrow}
      onKeyDown={e => e.key === 'Enter' && onOpenGrow()}
      style={{ ...cardStyle, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
    >
      <div style={{ position: 'absolute', bottom: -24, right: -16, width: 130, pointerEvents: 'none', opacity: 0.07, zIndex: 0, color: c.ink }}>
        <MoneyPlantWatermark />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SeedlingIcon color={c.accent} size={18} />
          <span style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>Today's Mission</span>
          {streak >= 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: c.warnSoft, borderRadius: 99, padding: '2px 7px' }}>
              <FlameIcon color={c.warn} size={11} />
              <span style={{ font: '700 11px Plus Jakarta Sans', color: c.warn }}>{streak}</span>
            </div>
          )}
        </div>
        <span style={{ font: '700 12px Plus Jakarta Sans', color: c.accent }}>Continue →</span>
      </div>

      <div style={{
        background: c.accent + '12', borderRadius: 14, padding: '10px 14px',
        border: `1px solid ${c.accent}30`, marginBottom: 12,
      }}>
        <div style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Safe Today
        </div>
        <div style={{ font: '800 24px Plus Jakarta Sans', color: c.accent, lineHeight: 1 }}>
          {fmt(Math.round(calc.safeDailyLimit))}
        </div>
      </div>

      <p style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, margin: '0 0 8px' }}>
        {calc.spentToday === 0
          ? `Spend below ${fmt(Math.round(calc.target))} today`
          : isOverTarget
          ? `Over challenge by ${fmt(Math.abs(remaining))}`
          : `${fmt(remaining)} under target`}
      </p>

      {calc.spentToday > 0 && (
        <div style={{ height: 6, borderRadius: 99, background: c.surface2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${progressPct}%`,
            background: barColor,
            transition: 'width 0.4s ease, background 0.4s ease',
          }} />
        </div>
      )}
    </div>
  )
}
