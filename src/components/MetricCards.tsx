import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { toneColor, toneSoft } from '@/lib/tokens'
import { fmt, fmtDate } from '@/lib/utils'
import { Glyph, type GlyphName } from './Glyph'
import type { DerivedMetrics, IncomePattern, Layout } from '@/types'
import type { ToneKey } from '@/lib/tokens'
import type { RemainingObligations } from '@/lib/obligations'

interface Metric {
  key: string
  label: string
  value: number
  hint: string
  tone: ToneKey
  icon: GlyphName
  suffix?: string
}

type FormulaRow =
  | { label: string; value: number; muted?: boolean }
  | { separator: true }

type CommitmentItem = { name: string; remaining: number }
type AccountItem = { name: string; balance: number }

function buildFormula(key: string, d: DerivedMetrics, commitmentItems?: CommitmentItem[], accountItems?: AccountItem[]): FormulaRow[] {
  switch (key) {
    case 'actual': {
      const accs = accountItems?.filter(a => a.balance !== 0) ?? []
      if (accs.length === 0) return [{ label: 'Sum of active accounts', value: d.actualBalance }]
      return [
        ...accs.map(a => ({ label: a.name, value: a.balance })),
        { separator: true },
        { label: 'Actual balance', value: d.actualBalance },
      ]
    }
    case 'avail': return [
      { label: 'Actual balance', value: d.actualBalance },
      { label: 'Emergency fund', value: -d.emergencyFund, muted: true },
      { separator: true },
      { label: 'Spendable balance', value: d.availableBalance },
    ]
    case 'free': {
      const timeline = d.cashFlowSummary?.timelineEvents ?? []
      return [
        { label: 'Balance today', value: d.availableBalance },
        ...timeline.map(p => ({
          label: `${p.event.title} (${fmtDate(p.event.date)})`,
          value: p.event.type === 'income' ? p.event.amount : -p.event.amount,
          muted: true,
        })),
        { separator: true },
        { label: 'Real free money', value: d.realFreeMoney },
      ]
    }
    case 'emerg': return [
      { label: 'Reserved, not for daily use', value: d.emergencyFund },
    ]
    case 'commit': {
      const items = commitmentItems?.filter(c => c.remaining > 0) ?? []
      if (items.length === 0) return [{ label: 'Total unpaid bills & EMIs', value: d.remainingCommitments }]
      return [
        ...items.map(c => ({ label: c.name, value: c.remaining })),
        { separator: true },
        { label: 'Total unpaid', value: d.remainingCommitments },
      ]
    }
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
    case 'safe': return [
      { label: 'Real free money', value: d.realFreeMoney },
      { label: 'Avg daily spending (30d)', value: d.avgDailySpending ?? 0, muted: true },
      { separator: true },
      { label: 'Safe for (days)', value: d.safeUntilDays ?? 0 },
    ]
    default: return []
  }
}

const LEAF_METRIC_KEYS = new Set(['free', 'emerg'])

function LeafHint({ text, color, metricKey }: { text: string; color: string; metricKey: string }) {
  if (!LEAF_METRIC_KEYS.has(metricKey)) return <>{text}</>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ width: 10, height: 10, flexShrink: 0 }}>
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
      </svg>
      {text}
    </span>
  )
}

function buildMetrics(d: DerivedMetrics, incomePattern?: IncomePattern): Metric[] {
  const metrics: Metric[] = [
    { key: 'actual',  label: 'Actual Balance',      value: d.actualBalance,       hint: 'All active accounts',       tone: 'ink',    icon: 'wallet' },
    { key: 'avail',   label: 'Spendable Balance',   value: d.availableBalance,    hint: 'Emergency fund protected',  tone: 'accent', icon: 'shield' },
    { key: 'free',    label: 'Real Free Money',     value: d.realFreeMoney,       hint: 'After bills & obligations', tone: 'good',   icon: 'spark'  },
  ]
  if ((incomePattern === 'variable' || incomePattern === 'business') && d.safeUntilDays != null) {
    const days = d.safeUntilDays
    const tone: ToneKey = days > 14 ? 'good' : days > 7 ? 'warn' : 'bad'
    const hint = days > 14 ? 'Comfortable runway' : days > 7 ? 'Watch spending' : 'Low runway'
    metrics.push({ key: 'safe', label: 'Safe For', value: days, hint, tone, icon: 'shield', suffix: ' days' })
  }
  metrics.push(
    { key: 'emerg',   label: 'Emergency Fund',      value: d.emergencyFund,       hint: 'Reserved',                  tone: 'warn',   icon: 'lock'   },
    { key: 'commit',  label: 'Bills & Obligations', value: d.remainingCommitments, hint: 'Outstanding obligations',  tone: 'bad',    icon: 'doc'    },
  )
  return metrics
}

interface MetricCardsProps {
  d: DerivedMetrics
  layout: Layout
  incomePattern?: IncomePattern
  onEditBudget?: () => void
  onEditEmergencyFund?: () => void
  commitmentItems?: CommitmentItem[]
  accountItems?: AccountItem[]
  obligationBreakdown?: RemainingObligations
  infoOpen?: boolean
  onInfoClose?: () => void
}

export function MetricCards({ d, layout, incomePattern, onEditBudget, onEditEmergencyFund, commitmentItems, accountItems, obligationBreakdown, infoOpen = false, onInfoClose }: MetricCardsProps) {
  const c = useTheme()
  const metrics = buildMetrics(d, incomePattern)
  const [activePopup, setActivePopup] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  function toggleSection(key: string) {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  const activeMetric = activePopup ? metrics.find(m => m.key === activePopup) : null
  const formula = activePopup ? buildFormula(activePopup, d, commitmentItems, accountItems) : []
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
              <div style={{ font: '800 21px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginTop: 3 }}>{m.suffix ? `${m.value}${m.suffix}` : fmt(m.value)}</div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: col, marginTop: 5 }}><LeafHint text={m.hint} color={col} metricKey={m.key} /></div>
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
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}><LeafHint text={m.hint} color={col} metricKey={m.key} /></div>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>{m.suffix ? `${m.value}${m.suffix}` : fmt(m.value)}</div>
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
                {(m.key === 'wbudget' && onEditBudget) || (m.key === 'emerg' && onEditEmergencyFund) ? (
                  <button
                    onClick={e => { e.stopPropagation(); m.key === 'wbudget' ? onEditBudget!() : onEditEmergencyFund!() }}
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
              <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginTop: 2 }}>{m.suffix ? `${m.value}${m.suffix}` : fmt(m.value)}</div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: col, marginTop: 4 }}><LeafHint text={m.hint} color={col} metricKey={m.key} /></div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      {content}

      {infoOpen && (
        <div onClick={() => onInfoClose?.()} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Your Money</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>,
                  title: 'Actual Balance',
                  desc: 'Sum of all your active accounts — your true total wealth at a glance.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
                  title: 'Spendable Balance',
                  desc: 'Actual balance minus your emergency fund reserve — money you can safely use day to day.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg>,
                  title: 'Real Free Money',
                  desc: 'Spendable balance after deducting all unpaid bills and obligations. This is what you can truly spend freely.',
                },
              ] as const).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    {item.svg}
                  </div>
                  <div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{item.title}</div>
                    <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 2, lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: '12px', background: c.surface2, borderRadius: 12 }}>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6 }}>
                Tap any card to see the <strong style={{ color: c.ink }}>exact calculation</strong> behind that number.
              </div>
            </div>
            <button onClick={() => onInfoClose?.()} style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}

      {activeMetric && (
        <div
          onClick={() => { setActivePopup(null); setExpandedSections(new Set()) }}
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
              width: 'calc(100vw - 48px)', maxWidth: 340,
              boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
              maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: toneSoft(c, activeMetric.tone), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={activeMetric.icon} color={toneColor(c, activeMetric.tone)} />
              </div>
              <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>{activeMetric.label}</div>
            </div>

            {activeMetric.key === 'avail' && accountItems && accountItems.filter(a => a.balance !== 0).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* Expandable actual balance row */}
                {(() => {
                  const accs = accountItems.filter(a => a.balance !== 0)
                  const isOpen = expandedSections.has('accounts')
                  return (
                    <div style={{ marginBottom: 4 }}>
                      <div
                        onClick={() => toggleSection('accounts')}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 10px', borderRadius: 10,
                          background: isOpen ? c.surface2 : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 13px Plus Jakarta Sans', color: c.ink }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                            <path d="M3 2l4 3-4 3" fill="none" stroke={c.ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Actual balance
                        </span>
                        <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(d.actualBalance)}</span>
                      </div>
                      {isOpen && (
                        <div style={{ paddingLeft: 16, paddingBottom: 4 }}>
                          {accs.map((acc, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px' }}>
                              <span style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, flex: 1, minWidth: 0, marginRight: 8 }}>{acc.name}</span>
                              <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>{fmt(acc.balance)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {d.emergencyFund > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px' }}>
                    <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>Emergency fund</span>
                    <span style={{ font: '700 13px Plus Jakarta Sans', color: c.muted }}>{fmt(-d.emergencyFund)}</span>
                  </div>
                )}

                <div style={{ height: 1, background: c.faint, margin: '8px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Spendable balance</span>
                  <span style={{ font: '800 18px Plus Jakarta Sans', color: toneColor(c, 'accent'), letterSpacing: '-0.01em' }}>{fmt(d.availableBalance)}</span>
                </div>
              </div>
            ) : activeMetric.key === 'free' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px' }}>
                  <span style={{ font: '600 13px Plus Jakarta Sans', color: c.ink }}>Balance today</span>
                  <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(d.availableBalance)}</span>
                </div>
                {(d.cashFlowSummary?.timelineEvents ?? []).map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px' }}>
                    <span style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, flex: 1, minWidth: 0, marginRight: 8 }}>
                      {p.event.title} · {fmtDate(p.event.date)}
                    </span>
                    <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>
                      {fmt(p.event.type === 'income' ? p.event.amount : -p.event.amount)}
                    </span>
                  </div>
                ))}
                <div style={{ height: 1, background: c.faint, margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Real free money</span>
                  <span style={{ font: '800 18px Plus Jakarta Sans', color: toneColor(c, 'good'), letterSpacing: '-0.01em' }}>{fmt(d.realFreeMoney)}</span>
                </div>
                <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 10, lineHeight: 1.4 }}>
                  Lowest projected balance over your planning horizon, accounting for expected income and dated bills — not just what's owed this cycle.
                </div>
              </div>
            ) : activeMetric.key === 'commit' && obligationBreakdown ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {([
                  { key: 'commitments', label: 'Bills & obligations', total: obligationBreakdown.commitments, items: obligationBreakdown.commitmentItems },
                  { key: 'creditCards', label: 'Credit cards', total: obligationBreakdown.creditCardBills, items: obligationBreakdown.creditCardItems },
                  { key: 'savings', label: 'Savings & investments', total: obligationBreakdown.savings, items: obligationBreakdown.savingsItems },
                  { key: 'borrowings', label: 'Borrowings to repay', total: obligationBreakdown.borrowRepayments, items: obligationBreakdown.borrowingItems },
                  { key: 'planned', label: 'Planned expenses', total: obligationBreakdown.plannedExpenses, items: obligationBreakdown.plannedExpenseItems },
                ] as const).filter(s => s.total > 0).map(section => {
                  const isOpen = expandedSections.has(section.key)
                  return (
                    <div key={section.key} style={{ marginBottom: 4 }}>
                      <div
                        onClick={() => section.items.length > 0 && toggleSection(section.key)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 10px', borderRadius: 10,
                          background: isOpen ? c.surface2 : 'transparent',
                          cursor: section.items.length > 0 ? 'pointer' : 'default',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 13px Plus Jakarta Sans', color: c.muted }}>
                          {section.items.length > 0 && (
                            <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                              <path d="M3 2l4 3-4 3" fill="none" stroke={c.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                          {section.label}
                        </span>
                        <span style={{ font: '700 13px Plus Jakarta Sans', color: c.muted }}>{fmt(-section.total)}</span>
                      </div>
                      {isOpen && (
                        <div style={{ paddingLeft: 16, paddingBottom: 4 }}>
                          {section.items.map((item, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px' }}>
                              <span style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, flex: 1, minWidth: 0, marginRight: 8 }}>{item.name}</span>
                              <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>{fmt(-item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                <div style={{ height: 1, background: c.faint, margin: '8px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Total</span>
                  <span style={{ font: '800 18px Plus Jakarta Sans', color: toneColor(c, 'bad'), letterSpacing: '-0.01em' }}>{fmt(d.remainingCommitments)}</span>
                </div>
                <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 10, lineHeight: 1.4 }}>
                  This shows everything you still owe. Real Free Money only reserves the obligations expected to affect your money during your current planning horizon.
                </div>
              </div>
            ) : (
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
            )}

            <button
              onClick={() => { setActivePopup(null); setExpandedSections(new Set()) }}
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
