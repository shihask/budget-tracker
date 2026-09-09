import { useState, useRef, useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { sortMasters, searchMasters, normalizeMasterName, findDuplicateMaster } from '@/lib/masters'
import { MasterAvatar } from '@/features/masters/components/MasterAvatar'
import { MASTER_TYPES } from '@/types'
import type { AppState } from '@/types'

/** How many suggestions the list shows at once. A directory of a few dozen
 *  people would otherwise cover the whole sheet; typing narrows it. */
const MAX_SUGGESTIONS = 6

interface Props {
  value: string
  onChange: (v: string) => void
  state: AppState
  placeholder?: string
  style?: React.CSSProperties
}

/** A name field that is also a picker over the people in Masters.
 *
 *  Deliberately NOT `MasterSelect`: a borrowing stores `person_name` text, not a
 *  `master_id`, and every reader (search, sort, the AI context, the payment
 *  confirmations) reads that text. So this keeps the free-typed string as the
 *  value and uses the directory only to suggest — anything typed is valid, and
 *  the caller turns a genuinely new name into a person via `ensurePersonMaster`.
 *
 *  A native <select> can't do that: it has no "or type something else" state. */
export function MasterNameInput({ value, onChange, state, placeholder, style }: Props) {
  const c = useTheme()
  const [open, setOpen] = useState(false)
  // Set by the option's onMouseDown, which fires before the input's onBlur —
  // without it, blur closes the list and the click lands on nothing.
  const picking = useRef(false)

  const people = useMemo(
    () => sortMasters(state.masters.filter(m => m.type === MASTER_TYPES.PERSON)),
    [state.masters],
  )
  const suggestions = useMemo(
    () => searchMasters(people, value).slice(0, MAX_SUGGESTIONS),
    [people, value],
  )
  const exact = useMemo(
    () => findDuplicateMaster(state.masters, value, MASTER_TYPES.PERSON),
    [state.masters, value],
  )
  const isNew = normalizeMasterName(value).length > 0 && !exact

  const pick = (name: string) => {
    onChange(name)
    setOpen(false)
    picking.current = false
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!picking.current) setOpen(false) }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-autocomplete="list"
        style={style}
      />

      {open && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
            background: c.bg, border: `1.5px solid ${c.faint}`, borderRadius: 11,
            overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
          }}
        >
          {suggestions.map(m => (
            <button
              key={m.id}
              type="button"
              onMouseDown={() => { picking.current = true }}
              onClick={() => pick(m.name)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                background: 'none', border: 'none', padding: '9px 12px', cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <MasterAvatar name={m.name} type={m.type} size={26} />
              <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{m.name}</span>
            </button>
          ))}
        </div>
      )}

      {isNew && people.length > 0 && (
        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 5 }}>
          New person — will be added to Masters
        </div>
      )}
    </div>
  )
}
