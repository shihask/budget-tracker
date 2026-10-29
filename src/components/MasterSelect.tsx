import { useState, useRef, useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { sortMasters, searchMasters } from '@/lib/masters'
import { MasterAvatar } from '@/features/masters/components/MasterAvatar'
import { MasterFormSheet, type MasterFormValues } from '@/features/masters/components/MasterFormSheet'
import type { AppState, Master } from '@/types'

/** Rows visible before the list scrolls — same height as MasterNameInput's
 *  six suggestions, but scrolling instead of slicing: here the list is the only
 *  way to pick, so every master must stay reachable without typing. */
const VISIBLE_ROWS = 6
const ROW_HEIGHT = 44

interface Props {
  value: string
  onChange: (v: string) => void
  state: AppState
  onAddMaster: (form: MasterFormValues) => Promise<Master | undefined>
  style?: React.CSSProperties
  includeEmpty?: boolean
  emptyLabel?: string
  /** false hides "+ Add master" (e.g. offline, where creating one needs the server). */
  allowAdd?: boolean
}

/** Pick a person or merchant, or create one inline.
 *
 *  The same searchable list as Borrowings' MasterNameInput, but the value is a
 *  `master_id`, not free text: typing only filters, and leaving the field without
 *  picking restores the current selection. */
export function MasterSelect({
  value, onChange, state, onAddMaster, style, includeEmpty, emptyLabel = 'None', allowAdd = true,
}: Props) {
  const c = useTheme()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  // Set by a row's onMouseDown, which fires before the input's onBlur —
  // without it, blur closes the list and the click lands on nothing.
  const picking = useRef(false)

  const sorted = useMemo(() => sortMasters(state.masters), [state.masters])
  const matches = useMemo(() => searchMasters(sorted, query), [sorted, query])
  const selected = state.masters.find(m => m.id === value)

  const close = () => { setOpen(false); setQuery(''); picking.current = false }
  const pick = (id: string) => { onChange(id); close() }

  const rowStyle: React.CSSProperties = {
    width: '100%', minHeight: ROW_HEIGHT, display: 'flex', alignItems: 'center', gap: 10,
    background: 'none', border: 'none', padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={open ? query : selected?.name ?? ''}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!picking.current) close() }}
        placeholder={open && selected ? selected.name : includeEmpty ? emptyLabel : 'Search people or places'}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        style={{ ...style, cursor: 'text' }}
      />

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
            background: c.bg, border: `1.5px solid ${c.faint}`, borderRadius: 11,
            overflowY: 'auto', maxHeight: ROW_HEIGHT * VISIBLE_ROWS,
            boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
          }}
        >
          {includeEmpty && value && !query && (
            <button type="button" style={rowStyle}
              onMouseDown={() => { picking.current = true }} onClick={() => pick('')}>
              <span style={{ width: 26, height: 26, borderRadius: 13, display: 'grid', placeItems: 'center', background: c.faint, color: c.muted }}>
                <X size={14} />
              </span>
              <span style={{ font: '700 13px Plus Jakarta Sans', color: c.muted }}>{emptyLabel}</span>
            </button>
          )}

          {matches.map(m => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={m.id === value}
              onMouseDown={() => { picking.current = true }}
              onClick={() => pick(m.id)}
              style={{ ...rowStyle, background: m.id === value ? c.faint : 'none' }}
            >
              <MasterAvatar name={m.name} type={m.type} size={26} />
              <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{m.name}</span>
            </button>
          ))}

          {matches.length === 0 && (
            <div style={{ padding: '11px 12px', font: '600 12px Plus Jakarta Sans', color: c.muted }}>
              No match
            </div>
          )}

          {allowAdd && (
            <button
              type="button"
              onMouseDown={() => { picking.current = true }}
              onClick={() => { close(); setShowAdd(true) }}
              style={{ ...rowStyle, borderTop: `1px solid ${c.faint}` }}
            >
              <span style={{ width: 26, height: 26, borderRadius: 13, display: 'grid', placeItems: 'center', background: c.faint, color: c.ink }}>
                <Plus size={14} />
              </span>
              <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Add master</span>
            </button>
          )}
        </div>
      )}

      <MasterFormSheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        state={state}
        onSave={async form => {
          const created = await onAddMaster(form)
          // Select what was just created — the whole point of creating from here.
          if (created) onChange(created.id)
        }}
      />
    </div>
  )
}
