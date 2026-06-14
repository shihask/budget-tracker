import { useState, useRef, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import type { AppState } from '@/types'
import { BORROWING_GROUP } from '@/lib/constants'

interface Props {
  value: string
  onChange: (value: string) => void
  state: AppState
  onAddCategory: (name: string, group_name: string) => Promise<string>
  style?: React.CSSProperties
  includeEmpty?: boolean
  emptyLabel?: string
  filterGroup?: string
  trackBorrowings?: boolean
}

export function CategorySelect({ value, onChange, state, onAddCategory, style, includeEmpty, emptyLabel = 'No category', filterGroup, trackBorrowings = true }: Props) {
  const c = useTheme()
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isGroupVisible = (g: { name: string; is_visible?: boolean }) =>
    g.is_visible !== false && (trackBorrowings || g.name !== BORROWING_GROUP)

  const allGroups = filterGroup ? state.groups.filter(g => g.name === filterGroup) : state.groups
  const allCategories = filterGroup ? state.categories.filter(c => c.group_name === filterGroup) : state.categories

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
      setNewName('')
      setNewGroup(groups[0]?.name || '')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [showAddModal])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '__add__') {
      setShowAddModal(true)
      return
    }
    onChange(e.target.value)
  }

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

  return (
    <>
      {filterGroup && categories.length === 0 ? (
        <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setShowAddModal(true)}>
          <span style={{ color: c.muted, font: '500 14px Plus Jakarta Sans' }}>No {filterGroup} categories</span>
          <span style={{ color: c.accent, font: '700 13px Plus Jakarta Sans' }}>+ Add</span>
        </div>
      ) : (
      <select value={value} onChange={handleChange} style={style}>
        {includeEmpty && <option value="">{emptyLabel}</option>}
        {groups.map(g => (
          <optgroup key={g.id} label={g.name}>
            {categories.filter(cat => cat.group_name === g.name).map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </optgroup>
        ))}
        {categories.filter(cat => !groups.find(g => g.name === cat.group_name)).map(cat => (
          <option key={cat.id} value={cat.id}>{cat.name}</option>
        ))}
        <option value="__add__">+ Add category</option>
      </select>
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
