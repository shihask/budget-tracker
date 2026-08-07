import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { mapSuggestionToBriefingItem } from '@/lib/briefing'
import { BriefingItemRow } from './BriefingItemRow'
import type { MintSuggestion } from '@/lib/mint-suggestions'

interface Props {
  suggestion: MintSuggestion
  yesterdaySucceeded: boolean
  streak: number
}

// Standalone single-suggestion card — kept as a reusable presentation component (not
// folded away when Today's Briefing shipped) for any surface that wants to show one
// MintSuggestion on its own, e.g. a future Dashboard teaser. Its own call site inside
// GrowPage's inline layout was superseded by TodaysBriefingCard, which renders this
// same suggestion merged into the day's ranked list instead.
//
// Purely presentational — no button, nothing to accept or dismiss. Mint narrates, it
// doesn't ask permission to coach; the retrospective line is informational only and
// never awards anything (leaves only ever come from the existing Daily Challenge
// success flow — see src/lib/mint-suggestions.ts for the full reasoning).
export function MintSuggestionCard({ suggestion, yesterdaySucceeded, streak }: Props) {
  const c = useTheme()

  const cardStyle: React.CSSProperties = {
    borderRadius: 18,
    padding: 16,
    background: c.surface,
    border: `1px solid ${c.faint}`,
    boxShadow: c.cardShadow,
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: yesterdaySucceeded ? 10 : 0 }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>🧠</span>
        <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Mint</span>
      </div>

      {yesterdaySucceeded && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
          background: c.goodSoft, borderRadius: 10, padding: '7px 10px',
        }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>🌱</span>
          <span style={{ font: '600 12px Plus Jakarta Sans', color: c.good }}>
            Nice work yesterday. {streak >= 2 ? `You're on a ${streak}-day streak.` : 'Keep the momentum going.'}
          </span>
        </div>
      )}

      <BriefingItemRow item={mapSuggestionToBriefingItem(suggestion)} last={suggestion.savingAmount == null || suggestion.savingAmount <= 0} />

      {suggestion.savingAmount != null && suggestion.savingAmount > 0 && (
        <div style={{
          marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
          background: c.accent + '18', borderRadius: 8, padding: '4px 10px',
        }}>
          <span style={{ font: '700 11px Plus Jakarta Sans', color: c.accent }}>
            Potential saving: {fmt(suggestion.savingAmount)}/month
          </span>
        </div>
      )}
    </div>
  )
}
