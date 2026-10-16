import { NotebookPen, Target } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import type { KakeiboBellItem } from '../lib/kakeibo'

interface Props {
  items: KakeiboBellItem[]
  firstReview: boolean
  onOpen: (item: KakeiboBellItem) => void
}

/** Kakeibo's items in the notification bell. No ✕ on purpose: a review item
 *  leaves only when that review is completed or explicitly skipped, a goal item
 *  when the goal is set or skipped (or its 7-day window ends). */
export function KakeiboBellItems({ items, firstReview, onOpen }: Props) {
  const c = useTheme()
  if (items.length === 0) return null
  return (
    <>
      {items.map(it => {
        const review = it.type === 'review'
        const title = review
          ? (firstReview ? 'Your first Kakeibo review is ready' : `Your ${it.month} money review is ready`)
          : `Set your ${it.month} savings goal`
        const body = review
          ? 'Review your spending, savings progress and what you can improve next cycle.'
          : 'Choose a savings target for your new cycle.'
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onOpen(it)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
              background: c.accentSoft, border: `1.5px solid ${c.accent}30`, borderRadius: 16, padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: c.accent, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {review ? <NotebookPen size={17} /> : <Target size={17} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{title}</div>
                <div style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, marginTop: 2, lineHeight: 1.45 }}>{body}</div>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.accent, marginTop: 6 }}>{review ? 'Review now →' : 'Set goal →'}</div>
              </div>
            </div>
          </button>
        )
      })}
    </>
  )
}
