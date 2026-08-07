import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { toneColor, type ToneKey } from '@/lib/tokens'
import { ExplainPanel } from './ExplainPanel'
import type { BriefingItem } from '@/lib/briefing'
import type { NotificationTone } from '@/types'

const TONE_KEY: Record<NotificationTone, ToneKey> = {
  critical: 'bad', warning: 'warn', info: 'accent', positive: 'good',
}

interface Props {
  item: BriefingItem
  last?: boolean   // last row in its list skips the divider
}

// Shared row renderer for a single BriefingItem — used by both TodaysBriefingCard
// (mapping over the day's ranked set) and MintSuggestionCard (wrapping its one
// MintSuggestion through mapSuggestionToBriefingItem), so both share the exact same
// visual and "Why?" treatment instead of two diverging implementations.
export function BriefingItemRow({ item, last = false }: Props) {
  const c = useTheme()
  const [expanded, setExpanded] = useState(false)
  const dotColor = toneColor(c, TONE_KEY[item.tone])

  return (
    <div style={{ padding: '12px 0', borderBottom: last ? 'none' : `1px solid ${c.faint}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: dotColor, marginTop: 5, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{item.title}</div>
          <p style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, margin: '2px 0 0', lineHeight: 1.5 }}>{item.body}</p>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              font: '700 11px Plus Jakarta Sans', color: c.accent,
            }}
          >
            {expanded ? 'Hide why ↑' : 'Why? ↓'}
          </button>
          {expanded && <ExplainPanel info={item.explain} />}
        </div>
      </div>
    </div>
  )
}
