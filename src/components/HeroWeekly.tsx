import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { ProgressRing } from './ProgressRing'
import type { DerivedMetrics } from '@/types'

interface HeroWeeklyProps {
  d: DerivedMetrics
}

export function HeroWeekly({ d }: HeroWeeklyProps) {
  const c = useTheme()
  const pct = d.weeklyPct
  const status = pct > 100
    ? { t: 'Over budget',    col: c.bad }
    : pct >= 75
    ? { t: 'Watch spending', col: c.warn }
    : { t: 'On track',       col: c.good }

  return (
    <div style={{
      borderRadius: 26, padding: 20, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(145deg, ${c.heroA} 0%, ${c.heroB} 100%)`,
      boxShadow: c.heroShadow,
    }}>
      {/* decorative circle */}
      <div style={{
        position: 'absolute', right: -40, top: -50,
        width: 180, height: 180, borderRadius: 999,
        background: 'rgba(255,255,255,0.10)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, position: 'relative' }}>
        <div style={{ flex: 1 }}>
          <div style={{ font: '600 13px Plus Jakarta Sans', color: 'rgba(255,255,255,0.82)', letterSpacing: '0.02em' }}>
            Weekly Remaining
          </div>
          <div style={{ font: '800 40px Plus Jakarta Sans', color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 6 }}>
            {fmt(d.weeklyRemaining)}
          </div>
          {/* status pill */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12,
            background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '5px 11px',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: '#fff' }} />
            <span style={{ font: '700 12px Plus Jakarta Sans', color: '#fff' }}>{status.t}</span>
          </div>
        </div>

        <ProgressRing pct={pct} color="#fff" track="rgba(255,255,255,0.28)" size={104} stroke={10}>
          <div style={{ font: '800 22px Plus Jakarta Sans', color: '#fff', lineHeight: 1 }}>
            {Math.round(pct)}%
          </div>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
            used
          </div>
        </ProgressRing>
      </div>

      {/* budget / spent tiles */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, position: 'relative' }}>
        {([['Budget', d.weeklyBudget], ['Spent', d.weeklySpent]] as [string, number][]).map(([label, value]) => (
          <div key={label} style={{
            flex: 1, background: 'rgba(255,255,255,0.14)',
            borderRadius: 14, padding: '10px 12px',
          }}>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)' }}>{label}</div>
            <div style={{ font: '800 16px Plus Jakarta Sans', color: '#fff', marginTop: 2 }}>{fmt(value)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
