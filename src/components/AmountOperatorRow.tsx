import type { RefObject } from 'react'
import { useTheme } from '@/lib/theme-context'

// Mobile numeric keypads (inputMode="decimal") have no operator keys, so
// expression entry (see amountExpression.ts) needs an on-screen affordance.
// `insert` is the character actually spliced into the field — decoupled from
// `label` only for the minus sign, since U+2212 isn't one of the ASCII
// operators the parser accepts (× and ÷ are normalized by the parser as-is).
const OPERATORS: { label: string; insert: string }[] = [
  { label: '+', insert: '+' },
  { label: '−', insert: '-' },
  { label: '×', insert: '×' },
  { label: '÷', insert: '÷' },
]

interface AmountOperatorRowProps {
  inputRef: RefObject<HTMLInputElement | null>
  onChange: (next: string) => void
}

export function AmountOperatorRow({ inputRef, onChange }: AmountOperatorRowProps) {
  const c = useTheme()

  const insert = (op: string) => {
    const el = inputRef.current
    if (!el) return
    const current = el.value
    const start = el.selectionStart ?? current.length
    const end = el.selectionEnd ?? current.length
    onChange(current.slice(0, start) + op + current.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + op.length, start + op.length)
    })
  }

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      {OPERATORS.map(({ label, insert: op }) => (
        <button
          key={label}
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => insert(op)}
          style={{
            flex: 1,
            background: c.surface2,
            color: c.ink,
            border: `1.5px solid ${c.faint}`,
            borderRadius: 8,
            padding: '6px 0',
            font: '700 15px Plus Jakarta Sans',
            cursor: 'pointer',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
