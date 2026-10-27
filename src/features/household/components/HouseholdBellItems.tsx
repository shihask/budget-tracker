import { Users, X } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import type { JoinBellItem } from '../lib/bell'

/** Bell entries for "your partner joined" — same card shape as Kakeibo's. */
export function HouseholdBellItems({ items, householdName, onOpen, onDismiss }: {
  items: JoinBellItem[]
  householdName: string
  onOpen: () => void
  onDismiss: (memberId: string) => void
}) {
  const c = useTheme()
  if (items.length === 0) return null
  return (
    <>
      {items.map(it => (
        <div key={it.memberId} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={onOpen}
            style={{
              display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
              background: c.accentSoft, border: `1.5px solid ${c.accent}30`, borderRadius: 16, padding: '14px 44px 14px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: c.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Users size={17} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{it.name} joined {householdName || 'your household'}</div>
                <div style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, marginTop: 2, lineHeight: 1.45 }}>
                  You can now track shared expenses and budgets together.
                </div>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.accent, marginTop: 6 }}>Open Household →</div>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onDismiss(it.memberId)}
            aria-label="Dismiss"
            style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 10, border: 'none', background: 'transparent', color: c.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </>
  )
}
