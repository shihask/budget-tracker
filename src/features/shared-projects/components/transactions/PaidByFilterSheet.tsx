import { Check } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import { FONT } from '../overview/styles'
import type { PaidByFilter } from '../../lib/transactions'

export interface PaidByOption {
  id: PaidByFilter
  label: string
  hint?: string
  count: number
}

interface Props {
  open: boolean
  options: PaidByOption[]
  value: PaidByFilter
  onChange: (v: PaidByFilter) => void
  onClose: () => void
}

export function PaidByFilterSheet({ open, options, value, onChange, onClose }: Props) {
  const c = useTheme()
  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 12px' }}>
        <div style={{ font: `800 18px ${FONT}`, color: c.ink }}>Paid by</div>
        <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 2, marginBottom: 12 }}>
          Kitty shows expenses paid from the group fund. A member shows what they paid or contributed.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {options.map(o => {
            const selected = o.id === value
            return (
              <button
                key={o.id}
                onClick={() => { onChange(o.id); onClose() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '8px 4px',
                  border: 'none', borderBottom: `1px solid ${c.faint}`, background: 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ flex: 1, minWidth: 0, font: `${selected ? 700 : 600} 14px ${FONT}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.label}
                  {o.hint && <span style={{ font: `500 12px ${FONT}`, color: c.muted }}> · {o.hint}</span>}
                </span>
                <span style={{ font: `600 12px ${FONT}`, color: c.muted, flexShrink: 0 }}>{o.count}</span>
                <span style={{ width: 18, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                  {selected && <Check size={16} color={c.accent} strokeWidth={2.5} />}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}
