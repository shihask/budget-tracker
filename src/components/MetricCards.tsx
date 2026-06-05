import { useState } from 'react'
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

type FormulaRow =
  | { label: string; value: number; muted?: boolean }
  | { separator: true }

function buildFormula(key: string, d: DerivedMetrics): FormulaRow[] {
  switch (key) {
    case 'actual': return [
      { label: 'Sum of active accounts', value: d.actualBalance },
    ]
    case 'avail': return [
      { label: 'Actual balance', value: d.actualBalance },
      { label: 'Emergency fund', value: -d.emergencyFund, muted: true },
      { separator: true },
      { label: 'Available balance', value: d.availableBalance },
    ]
    case 'free': return [
      { label: 'Available balance', value: d.availableBalance },
      { label: 'Remaining commitments', value: -d.remainingCommitments, muted: true },
      { separator: true },
      { label: 'Real free money', value: d.realFreeMoney },
    ]
    case 'emerg': return [
      { label: 'Reserved, not for daily use', value: d.emergencyFund },
    ]
    case 'commit': return [
      { label: 'Unpaid commitments', value: d.remainingCommitments },
    ]
    case 'wbudget': return [
      { label: 'Set weekly spending limit', value: d.weeklyBudget },
    ]
    case 'wspent': return [
      { label: 'Total expenses Mon–Sun', value: d.weeklySpent },
    ]
    case 'wrem': return [
      { label: 'Weekly budget', value: d.weeklyBudget },
      { label: 'Weekly spent', value: -d.weeklySpent, muted: true },
      { separator: true },
      { label: 'Weekly remaining', value: d.weeklyRemaining },
    ]
    default: return []
  }
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
  const [activePopup, setActivePopup] = useState<string | null>(null)

  const activeMetric = activePopup ? metrics.find(m => m.key === activePopup) : null
  const formula = activePopup ? buildFormula(activePopup, d) : []
  const hasBreakdown = formula.some(r => 'separator' in r)

  let content: React.ReactNode

  if (layout === 'carousel') {
    content = (
      <div style={{
        display: 'flex', gap: 12, overflowX: 'auto',
        padding: '2px 4px 8px', margin: '0 -4px',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
      }}>
        {metrics.map(m => {
          const col = toneColor(c, m.tone)
          return (
            <div key={m.key} onClick={() => setActivePopup(m.key)} style={{
              scrollSnapAlign: 'start', flex: '0 0 158px',
              background: c.surface, borderRadius: 20, padding: 16,
              border: `1px solid ${c.faint}`, boxShadow: c.cardShadow,
              cursor: 'pointer',
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
  } else if (layout === 'list') {
    content = (
      <div style={{ background: c.surface, borderRadius: 22, boxShadow: c.cardShadow, border: `1px solid ${c.faint}`, overflow: 'hidden' }}>
        {metrics.map((m, i) => {
          const col = toneColor(c, m.tone)
          return (
            <div key={m.key} onClick={() => setActivePopup(m.key)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px',
              borderBottom: i < metrics.length - 1 ? `1px solid ${c.faint}` : 'none',
              cursor: 'pointer',
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
  } else {
    // default: grid 2-col
    content = (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {metrics.map(m => {
          const col = toneColor(c, m.tone)
          return (
            <div key={m.key} onClick={() => setActivePopup(m.key)} style={{
              background: c.surface, borderRadius: 20, padding: 15,
              border: `1px solid ${c.faint}`, boxShadow: c.cardShadow,
              position: 'relative', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ width: 34, height: 34, borderRadius: 11, background: toneSoft(c, m.tone), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Glyph name={m.icon} color={col} />
                </div>
                {m.key === 'wbudget' && onEditBudget ? (
                  <button
                    onClick={e => { e.stopPropagation(); onEditBudget() }}
                    style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: toneSoft(c, m.tone), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  >
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

  return (
    <>
      {content}

      {activeMetric && (
        <div
          onClick={() => setActivePopup(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: c.bg, borderRadius: 22, padding: 20,
              width: 'calc(100vw - 48px)', maxWidth: 320,
              boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: toneSoft(c, activeMetric.tone), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={activeMetric.icon} color={toneColor(c, activeMetric.tone)} />
              </div>
              <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>{activeMetric.label}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {formula.map((row, i) => {
                if ('separator' in row) {
                  return <div key={i} style={{ height: 1, background: c.faint }} />
                }
                const isResult = hasBreakdown && i === formula.length - 1
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      font: `${isResult ? '700' : '600'} 13px Plus Jakarta Sans`,
                      color: row.muted ? c.muted : c.ink,
                    }}>
                      {row.label}
                    </span>
                    <span style={{
                      font: `800 ${isResult ? '18px' : '13px'} Plus Jakarta Sans`,
                      color: row.muted ? c.muted : c.ink,
                      letterSpacing: isResult ? '-0.01em' : undefined,
                    }}>
                      {fmt(row.value)}
                    </span>
                  </div>
                )
              })}
            </div>

            <button
              onClick={() => setActivePopup(null)}
              style={{
                marginTop: 18, width: '100%',
                background: c.surface2, border: 'none', borderRadius: 12,
                padding: 11, font: '700 13px Plus Jakarta Sans',
                color: c.muted, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
