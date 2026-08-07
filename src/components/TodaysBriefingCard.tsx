import { useTheme } from '@/lib/theme-context'
import { BriefingItemRow } from './BriefingItemRow'
import type { BriefingItem } from '@/lib/briefing'

interface Props {
  items: BriefingItem[]
}

// The "Smart Prioritization" card — a single ranked list merging notifications and
// the active Mint suggestion (see src/lib/briefing.ts), instead of a notifications
// sheet, a suggestion card, and a forecast the user had to mentally reconcile
// themselves. Facts only — Mint Coach (rendered alongside, never merged in here)
// supplies the synthesis/meaning.
export function TodaysBriefingCard({ items }: Props) {
  const c = useTheme()
  if (items.length === 0) return null

  const cardStyle: React.CSSProperties = {
    borderRadius: 18,
    padding: 16,
    background: c.surface,
    border: `1px solid ${c.faint}`,
    boxShadow: c.cardShadow,
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>🌤️</span>
        <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Today's Briefing</span>
      </div>
      <div>
        {items.map((item, i) => (
          <BriefingItemRow key={item.id} item={item} last={i === items.length - 1} />
        ))}
      </div>
    </div>
  )
}
