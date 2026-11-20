import { Info } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { ColorTokens } from '@/lib/tokens'
import type { ProjectSummary } from '../../types'
import type { KittyBreakdown } from '../../lib/overview'
import { rs, rsSigned, type PerPersonShare } from '../../lib/settlementCopy'
import { FONT, cardStyle } from './styles'
import { LinkButton } from './ui'

interface Props {
  summary: ProjectSummary
  kitty: KittyBreakdown
  /** From the settlement engine; null hides the line (unverified, nothing spent, < 2 members). */
  perPerson?: PerPersonShare | null
  /** Settlement tab exists (≥ 2 members). */
  onSettle?: () => void
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

export function KittySummaryCard({ summary, kitty, perPerson, onSettle }: Props) {
  const c = useTheme()
  const { state, fundRemaining, fundSpent, paidPersonally, kittyFunds, sources } = kitty
  const hasKitty = state !== 'none'

  const headline = (() => {
    switch (state) {
      case 'remaining': return { label: 'Kitty remaining', amount: fundRemaining, color: c.good, note: null }
      case 'used': return { label: 'Kitty remaining', amount: 0, color: c.ink, note: 'Fully used' }
      case 'overspent': return { label: 'Kitty overspent by', amount: Math.abs(fundRemaining), color: c.bad, note: null }
      case 'none': return {
        label: 'Total trip expenses', amount: summary.totalExpenses, color: c.ink,
        note: summary.totalExpenses > 0 ? 'No kitty, members paid directly' : 'Nothing recorded yet',
      }
    }
  })()

  // remainingBudget is the existing Collected − Spent figure. It is explained
  // in words here rather than shown as a bare negative.
  const beyondKitty = summary.remainingBudget < 0 ? Math.abs(summary.remainingBudget) : 0
  const explanation = paidPersonally > 0.01
    ? (hasKitty && beyondKitty > 0.01
        ? `Trip expenses were ${fmt(beyondKitty)} more than the kitty had. Members covered the rest from their own pockets.`
        : `Members paid ${fmt(paidPersonally)} from their own pockets.`)
    : null

  return (
    <div style={{ ...cardStyle(c), padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ font: `700 11px ${FONT}`, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {headline.label}
        </div>
        <div style={{ font: `600 11px ${FONT}`, color: c.muted }}>
          {plural(summary.memberCount, 'member')} · {plural(summary.expenseCount, 'expense')} · {plural(summary.contributionCount, 'contribution')}
        </div>
      </div>

      {/* Headline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        <div style={{ font: `800 30px ${FONT}`, color: headline.color, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
          {fmt(headline.amount)}
        </div>
        {headline.note && (
          <span style={{
            font: `700 11px ${FONT}`, color: c.sub, background: c.surface2,
            padding: '3px 8px', borderRadius: 999,
          }}>
            {headline.note}
          </span>
        )}
      </div>

      {/* Breakdown: kitty in/out | where the trip's money came from. Without a
          kitty it would only repeat the headline total. */}
      {hasKitty && <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
        columnGap: 24, rowGap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.faint}`,
      }}>
        <div>
          <Row c={c} label="Kitty funds" amount={kittyFunds} strong />
          {sources.map(s => <Row key={s.key} c={c} label={s.label} amount={s.amount} indent />)}
          <Row c={c} label="Spent from kitty" amount={fundSpent} />
          {kitty.settledOut > 0 && <Row c={c} label="Paid out in settlement" amount={kitty.settledOut} />}
          {kitty.settledIn > 0 && <Row c={c} label="Topped up in settlement" amount={kitty.settledIn} />}
        </div>
        <div>
          <Row c={c} label="Total trip expenses" amount={summary.totalExpenses} strong />
          <Row c={c} label="Spent from kitty" amount={fundSpent} indent />
          <Row c={c} label="Paid personally by members" amount={paidPersonally} indent />
        </div>
      </div>}

      {perPerson && <PerPersonLine c={c} p={perPerson} />}

      {(explanation || (onSettle && summary.totalExpenses > 0)) && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12,
          padding: '10px 12px', borderRadius: 12, background: c.surface2,
        }}>
          <Info size={14} color={c.muted} style={{ flexShrink: 0, marginTop: 2 }} />
          {/* The link drops below the text when the box is too narrow for both. */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 12 }}>
            <div style={{ flex: '1 1 260px', minWidth: 0, font: `500 12px ${FONT}`, color: c.sub, lineHeight: 1.5 }}>
              {explanation}{explanation && onSettle ? ' ' : ''}
              {onSettle && 'Settlement shows who owes whom.'}
            </div>
            {onSettle && <LinkButton c={c} label="Settle up" onClick={onSettle} />}
          </div>
        </div>
      )}
    </div>
  )
}

// "Each person's share" — the engine's per-member share, never total ÷ members.
function PerPersonLine({ c, p }: { c: ColorTokens; p: PerPersonShare }) {
  const after = p.groupMoney > 0 ? `after ${rs(p.groupMoney)} group money` : null
  let label = "Each person's share"
  let amount: string
  let detail: string
  if (p.kind === 'equal') {
    if (p.amount < 0) { label = 'Each person gets back'; amount = rs(-p.amount) } else amount = rs(p.amount)
    const people = p.sharers === p.members ? `${p.members} people` : `${p.sharers} of ${p.members} people`
    detail = [people, p.amount < 0 && 'from the surplus', after, p.rounded && 'rounded to the paisa'].filter(Boolean).join(' · ')
  } else {
    amount = `${rsSigned(p.min)} – ${rsSigned(p.max)}`
    detail = ['Shares differ', after, 'see Settlement for each person'].filter(Boolean).join(' · ')
  }
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.faint}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ font: `700 13px ${FONT}`, color: c.ink }}>{label}</div>
        <div style={{ font: `800 15px ${FONT}`, color: c.ink, whiteSpace: 'nowrap' }}>{amount}</div>
      </div>
      <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 2 }}>{detail}</div>
    </div>
  )
}

function Row({ c, label, amount, strong, indent }: {
  c: ColorTokens; label: string; amount: number; strong?: boolean; indent?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
      padding: '3px 0', paddingLeft: indent ? 12 : 0,
    }}>
      <div style={{ minWidth: 0, font: `${strong ? 700 : 500} 13px ${FONT}`, color: strong ? c.ink : c.sub }}>{label}</div>
      <div style={{ flexShrink: 0, font: `${strong ? 800 : 600} 13px ${FONT}`, color: strong ? c.ink : c.sub, whiteSpace: 'nowrap' }}>
        {fmt(amount)}
      </div>
    </div>
  )
}
