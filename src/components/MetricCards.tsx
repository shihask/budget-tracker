import { useTheme } from '@/lib/theme-context'
import { toneColor, toneSoft } from '@/lib/tokens'
import { fmt } from '@/lib/utils'
import { Glyph, type GlyphName } from './Glyph'
import type { DerivedMetrics, Layout } from '@/types'
import type { ToneKey } from '@/lib/tokens'

interface Metric {
  key: string
  label: string
  value: number
  hint: string
  tone: ToneKey
  icon: GlyphName
}

function buildMetrics(d: DerivedMetrics): Metric[] {
  return [
    { key: 'actual',  label: 'Actual Balance',          value: d.actualBalance,          hint: 'All active accounts',       tone: 'ink',    icon: 'wallet' },
    { key: 'avail',   label: 'Available Balance',        value: d.availableBalance,        hint: 'After emergency fund',      tone: 'accent', icon: 'shield' },
    { key: 'free',    label: 'Real Free Money',          value: d.realFreeMoney,           hint: 'After commitments',         tone: 'good',   icon: 'spark'  },
    { key: 'emerg',   label: 'Emergency Fund',           value: d.emergencyFund,           hint: 'Reserved',                  tone: 'warn',   icon: 'lock'   },
    { key: 'commit',  label: 'Remaining Commitments',    value: d.remainingCommitments,    hint: 'Still owed',                tone: 'bad',    icon: 'doc'    },
    { key: 'wbudget', label: 'Weekly Budget',            value: d.weeklyBudget,            hint: 'Mon–Sun',                   tone: 'ink',    icon: 'cal'    },
    { key: 'wspent',  label: 'Weekly Spent',             value: d.weeklySpent,             hint: Math.round(d.weeklyPct) + '% used', tone: 'warn', icon: 'cart' },
    { key: 'wrem',    label: 'Weekly Remaining',         value: d.weeklyRemaining,         hint: 'Left this week',            tone: 'good',   icon: 'check'  },
  ]
}

interface MetricCardsProps {
  d: DerivedMetrics
  layout: Layout
  onEditBudget?: () => void
}

export function MetricCards({ d, layout, onEditBudget }: MetricCardsProps) {
  const c = useTheme()
  const metrics = buildMetrics(d)

  if (layout === 'carousel') {
    return (
      <div style={{
        display: 'flex', gap: 12, overflowX: 'auto',
        padding: '2px 4px 8px', margin: '0 -4px',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
      }}>
        {metrics.map(m => {
          const col = toneColor(c, m.tone)
          return (
            <div key={m.key} style={{
              scrollSnapAlign: 'start', flex: '0 0 158px',
              background: c.surface, borderRadius: 20, padding: 16,
              border: `1px solid ${c.faint}`, boxShadow: c.cardShadow,
            }}>
              <div style={{ width: 34, height: 34, borderRadius: 11, background: toneSoft(c, m.tone), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={m.icon} color={col} />
              </div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 14 }}>{m.label}</div>
              <div style={{ font: '800 21px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginTop: 3 }}>{fmt(m.value)}</div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: col, marginTop: 5 }}>{m.hint}</div>
            </div>
          )
        })}
      </div>
    )
  }

  if (layout === 'list') {
    return (
      <div style={{ background: c.surface, borderRadius: 22, padding: '0 0', boxShadow: c.cardShadow, border: `1px solid ${c.faint}`, overflow: 'hidden' }}>
        {metrics.map((m, i) => {
          const col = toneColor(c, m.tone)
          return (
            <div key={m.key} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px',
              borderBottom: i < metrics.length - 1 ? `1px solid ${c.faint}` : 'none',
            }}>
              <span style={{ width: 4, height: 30, borderRadius: 4, background: col, flexShrink: 0 }} />
              <div style={{ width: 32, height: 32, borderRadius: 9, background: toneSoft(c, m.tone), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={m.icon} color={col} size={15} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '600 14px Plus Jakarta Sans', color: c.ink }}>{m.label}</div>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>{m.hint}</div>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>{fmt(m.value)}</div>
            </div>
          )
        })}
      </div>
    )
  }

  // default: grid 2-col
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {metrics.map(m => {
        const col = toneColor(c, m.tone)
        return (
          <div key={m.key} style={{
            background: c.surface, borderRadius: 20, padding: 15,
            border: `1px solid ${c.faint}`, boxShadow: c.cardShadow, position: 'relative',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ width: 34, height: 34, borderRadius: 11, background: toneSoft(c, m.tone), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={m.icon} color={col} />
              </div>
              {m.key === 'wbudget' && onEditBudget ? (
                <button onClick={onEditBudget} style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: toneSoft(c, m.tone), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              ) : (
                <span style={{ width: 8, height: 8, borderRadius: 999, background: col, marginTop: 4 }} />
              )}
            </div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 12 }}>{m.label}</div>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginTop: 2 }}>{fmt(m.value)}</div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: col, marginTop: 4 }}>{m.hint}</div>
          </div>
        )
      })}
    </div>
  )
}
