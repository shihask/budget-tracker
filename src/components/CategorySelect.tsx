import { useState, useRef, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import type { AppState } from '@/types'
import { BORROWING_GROUP } from '@/lib/constants'
import { Plus } from 'lucide-react'

/** Same list height as MasterSelect: six rows, then it scrolls. */
const VISIBLE_ROWS = 6
const ROW_HEIGHT = 44

interface Props {
  value: string
  onChange: (value: string) => void
  state: AppState
  onAddCategory: (name: string, group_name: string) => Promise<string>
  style?: React.CSSProperties
  includeEmpty?: boolean
  emptyLabel?: string
  filterGroup?: string
  excludeGroups?: string[]
  trackBorrowings?: boolean
  /** false hides "+ Add category" (e.g. offline, where creating one needs the server). */
  allowAdd?: boolean
}

export function CategorySelect({ value, onChange, state, onAddCategory, style, includeEmpty, emptyLabel = 'No category', filterGroup, excludeGroups, trackBorrowings = true, allowAdd = true }: Props) {
  const c = useTheme()
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Set by a row's onMouseDown, which fires before the input's onBlur —
  // without it, blur closes the list and the click lands on nothing.
  const picking = useRef(false)
  // What was typed when "Add category" was tapped — usually the name being looked for.
  const addPrefill = useRef('')

  const isGroupVisible = (g: { name: string; is_visible?: boolean }) =>
    g.is_visible !== false && (trackBorrowings || g.name !== BORROWING_GROUP)

  const allGroups = filterGroup
    ? state.groups.filter(g => g.name === filterGroup)
    : excludeGroups
      ? state.groups.filter(g => !excludeGroups.includes(g.name))
      : state.groups
  const allCategories = filterGroup
    ? state.categories.filter(c => c.group_name === filterGroup)
    : excludeGroups
      ? state.categories.filter(c => !excludeGroups.includes(c.group_name))
      : state.categories

  const groups = allGroups.filter(isGroupVisible)
  const categories = allCategories.filter(cat => {
    if (cat.is_visible === false) return false
    const grp = state.groups.find(g => g.name === cat.group_name)
    return grp ? isGroupVisible(grp) : true
  })

  // Wait for the new category to appear in the options, then select it
  useEffect(() => {
    if (!pendingId) return
    const exists = categories.some(c => c.id === pendingId)
    if (exists) {
      onChange(pendingId)
      setPendingId(null)
    }
  }, [categories, pendingId, onChange])

  useEffect(() => {
    if (showAddModal) {
      setNewName(addPrefill.current)
      addPrefill.current = ''
      setNewGroup(groups[0]?.name || '')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [showAddModal])

  // Typing filters by category or group name ("transport" lists the whole group).
  // Groups keep their order and headers, so an empty search reads like the old dropdown.
  const q = query.trim().toLowerCase()
  const matches = (cat: { name: string; group_name: string }) =>
    !q || cat.name.toLowerCase().includes(q) || cat.group_name.toLowerCase().includes(q)
  const sections = [
    ...groups.map(g => ({ key: g.id, label: g.name as string | null, cats: categories.filter(cat => cat.group_name === g.name && matches(cat)) })),
    { key: '__ungrouped', label: null, cats: categories.filter(cat => !groups.some(g => g.name === cat.group_name) && matches(cat)) },
  ].filter(s => s.cats.length > 0)
  const firstMatch = sections[0]?.cats[0]
  const selected = state.categories.find(cat => cat.id === value)

  const close = () => { setOpen(false); setQuery(''); picking.current = false }
  const pick = (id: string) => { onChange(id); close() }

  // Opened near the bottom of a sheet, the list would hang off-screen.
  useEffect(() => {
    if (open) listRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const handleAdd = async () => {
    if (!newName.trim() || !newGroup) return
    setSaving(true)
    const newId = await onAddCategory(newName.trim(), newGroup)
    setPendingId(newId)
    setShowAddModal(false)
    setSaving(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: c.surface2, border: `1.5px solid ${c.faint}`,
    borderRadius: 11, padding: '10px 12px',
    font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const rowStyle: React.CSSProperties = {
    width: '100%', minHeight: ROW_HEIGHT, display: 'flex', alignItems: 'center',
    background: 'none', border: 'none', padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
  }
  const groupLabel: React.CSSProperties = {
    font: '700 10px Plus Jakarta Sans', color: c.muted,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '10px 12px 2px',
  }

  return (
    <>
      {filterGroup && categories.length === 0 ? (
        <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => allowAdd && setShowAddModal(true)}>
          <span style={{ color: c.muted, font: '500 14px Plus Jakarta Sans' }}>No {filterGroup} categories</span>
          {allowAdd && <span style={{ color: c.accent, font: '700 13px Plus Jakarta Sans' }}>+ Add</span>}
        </div>
      ) : (
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={open ? query : selected?.name ?? ''}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => { if (!picking.current) close() }}
          onKeyDown={e => {
            if (e.key === 'Escape') { close(); e.currentTarget.blur() }
            else if (e.key === 'Enter' && q && firstMatch) { e.preventDefault(); pick(firstMatch.id); e.currentTarget.blur() }
          }}
          placeholder={open && selected ? selected.name : includeEmpty ? emptyLabel : 'Search categories'}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          style={{ ...style, cursor: 'text' }}
        />

        {open && (
          <div
            ref={listRef}
            role="listbox"
            style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
              background: c.bg, border: `1.5px solid ${c.faint}`, borderRadius: 11,
              overflowY: 'auto', maxHeight: ROW_HEIGHT * VISIBLE_ROWS,
              boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            }}
          >
            {includeEmpty && value && !q && (
              <button type="button" style={rowStyle}
                onMouseDown={() => { picking.current = true }} onClick={() => pick('')}>
                <span style={{ font: '700 13px Plus Jakarta Sans', color: c.muted }}>{emptyLabel}</span>
              </button>
            )}

            {sections.map(s => (
              <div key={s.key} role="group" aria-label={s.label ?? undefined}>
                {s.label && <div style={groupLabel}>{s.label}</div>}
                {s.cats.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    role="option"
                    aria-selected={cat.id === value}
                    onMouseDown={() => { picking.current = true }}
                    onClick={() => pick(cat.id)}
                    style={{ ...rowStyle, background: cat.id === value ? c.faint : 'none' }}
                  >
                    <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{cat.name}</span>
                  </button>
                ))}
              </div>
            ))}

            {sections.length === 0 && (
              <div style={{ padding: '11px 12px', font: '600 12px Plus Jakarta Sans', color: c.muted }}>
                No match
              </div>
            )}

            {allowAdd && (
              <button
                type="button"
                onMouseDown={() => { picking.current = true }}
                onClick={() => { addPrefill.current = query.trim(); close(); setShowAddModal(true) }}
                style={{ ...rowStyle, borderTop: `1px solid ${c.faint}`, gap: 10 }}
              >
                <Plus size={14} color={c.ink} />
                <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Add category</span>
              </button>
            )}
          </div>
        )}
      </div>
      )}

      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setShowAddModal(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>New Category</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Category Name</div>
              <input ref={inputRef} value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="e.g. Entertainment" style={inp} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Group</div>
              <select value={newGroup} onChange={e => setNewGroup(e.target.value)} style={inp}>
                {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAddModal(false)} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '12px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAdd} disabled={saving || !newName.trim() || !newGroup} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer', opacity: saving || !newName.trim() ? 0.6 : 1 }}>
                {saving ? 'Adding...' : 'Add Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
