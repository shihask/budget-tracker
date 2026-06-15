import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { BORROWING_GROUP } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import type { AppState, Group, Category } from '@/types'


interface Props {
  state: AppState
  onClose: () => void
  onAddGroup: (name: string) => Promise<void>
  onUpdateGroup: (id: string, name: string) => Promise<void>
  onDeleteGroup: (id: string, groupName: string) => Promise<void>
  onToggleGroupVisibility: (id: string, visible: boolean) => Promise<void>
  onAddCategory: (name: string, group_name: string) => Promise<string>
  onUpdateCategory: (id: string, name: string, group_name: string) => Promise<void>
  onDeleteCategory: (id: string) => Promise<void>
  onToggleCategoryVisibility: (id: string, visible: boolean) => Promise<void>
}

export function CategoriesPage({
  state, onClose,
  onAddGroup, onUpdateGroup, onDeleteGroup, onToggleGroupVisibility,
  onAddCategory, onUpdateCategory, onDeleteCategory, onToggleCategoryVisibility,
}: Props) {
  const c = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)

  // Swipe-back from left edge
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let startX = 0, startY = 0, tracking = false

    const onStart = (e: TouchEvent) => {
      if (e.touches[0].clientX < 40) {
        startX = e.touches[0].clientX
        startY = e.touches[0].clientY
        tracking = true
      }
    }
    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      const dx = e.touches[0].clientX - startX
      const dy = Math.abs(e.touches[0].clientY - startY)
      if (dy > dx * 1.5) { tracking = false; return }
      if (dx > 0) {
        e.preventDefault()
        el.style.transform = `translateX(${dx}px)`
      }
    }
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      const dx = e.changedTouches[0].clientX - startX
      if (dx > 100) {
        el.style.transition = 'transform 0.25s ease-in'
        el.style.transform = 'translateX(100%)'
        setTimeout(onClose, 240)
      } else {
        el.style.transition = 'transform 0.3s ease-out'
        el.style.transform = 'translateX(0)'
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [onClose])

  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editingCategoryGroup, setEditingCategoryGroup] = useState<string>('')
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState<string | null>(null) // group_name
  const [inputVal, setInputVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [catInUse, setCatInUse] = useState<{ cat: Category; txnCount: number } | null>(null)

  // Lock the dashboard behind this full-screen overlay (no ghost scrollbar / background scroll).
  useEffect(() => {
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: c.surface2, border: `1.5px solid ${c.faint}`,
    borderRadius: 11, padding: '10px 12px',
    font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }

  const groups = state.groups
  const categoriesByGroup = (groupName: string) =>
    state.categories.filter(cat => cat.group_name === groupName)

  // ── Add Group ────────────────────────────────────────────────────────────────
  const handleAddGroup = async () => {
    if (!inputVal.trim()) return
    setSaving(true)
    await onAddGroup(inputVal.trim())
    setInputVal(''); setShowAddGroup(false); setSaving(false)
  }

  // ── Edit Group ───────────────────────────────────────────────────────────────
  const handleUpdateGroup = async () => {
    if (!editingGroup || !inputVal.trim()) return
    setSaving(true)
    await onUpdateGroup(editingGroup.id, inputVal.trim())
    setEditingGroup(null); setInputVal(''); setSaving(false)
  }

  // ── Delete Group ─────────────────────────────────────────────────────────────
  const handleDeleteGroup = async (g: Group) => {
    const cats = categoriesByGroup(g.name)
    const catIds = cats.map(c => c.id)
    const txnCount = state.transactions.filter(t => t.category_id && catIds.includes(t.category_id)).length
    if (txnCount > 0) {
      alert(`Cannot delete "${g.name}" — ${txnCount} transaction(s) use categories in this group. Reassign them first.`)
      return
    }
    const catCount = cats.length
    if (!confirm(`Delete group "${g.name}"?${catCount > 0 ? ` This will also delete ${catCount} categories.` : ''}`)) return
    setSaving(true)
    await onDeleteGroup(g.id, g.name)
    if (activeGroup === g.name) setActiveGroup(null)
    setSaving(false)
  }

  // ── Add Category ─────────────────────────────────────────────────────────────
  const handleAddCategory = async (groupName: string) => {
    if (!inputVal.trim()) return
    setSaving(true)
    await onAddCategory(inputVal.trim(), groupName)
    setInputVal(''); setShowAddCategory(null); setSaving(false)
  }

  // ── Edit Category ────────────────────────────────────────────────────────────
  const handleUpdateCategory = async () => {
    if (!editingCategory || !inputVal.trim()) return
    setSaving(true)
    await onUpdateCategory(editingCategory.id, inputVal.trim(), editingCategoryGroup || editingCategory.group_name)
    setEditingCategory(null); setInputVal(''); setEditingCategoryGroup(''); setSaving(false)
  }

  // ── Delete Category ──────────────────────────────────────────────────────────
  const handleDeleteCategory = async (cat: Category) => {
    setSaving(true)

    // Query actual transaction count from DB (state only holds last 200)
    const { count: txnCount } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', cat.id)

    setSaving(false)

    if (txnCount && txnCount > 0) {
      setCatInUse({ cat, txnCount })
      return
    }

    const commitmentCount = state.commitments.filter(c => c.category_id === cat.id).length
    if (commitmentCount > 0) {
      alert(`Cannot delete "${cat.name}" — ${commitmentCount} commitment${commitmentCount > 1 ? 's' : ''} use this category. Reassign them first.`)
      return
    }

    if (!confirm(`Delete category "${cat.name}"?`)) return
    setSaving(true)
    await onDeleteCategory(cat.id)
    setSaving(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, background: c.bg, zIndex: 300, overflowY: 'auto', overscrollBehavior: 'contain', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}`, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Categories</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{groups.length} groups · {state.categories.length} categories</div>
          </div>
          <button
            onClick={() => { setShowAddGroup(true); setInputVal(''); setEditingGroup(null); setEditingCategory(null); setShowAddCategory(null) }}
            style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Group
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '12px 16px calc(60px + env(safe-area-inset-bottom, 0px))' }}>

        {/* Add group inline form */}
        {showAddGroup && (
          <div style={{ background: c.surface, borderRadius: 16, padding: 14, marginBottom: 12, border: `1px solid ${c.faint}` }}>
            <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>New Group</div>
            <input value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddGroup()} placeholder="Group name" style={inp} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => setShowAddGroup(false)} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 10, padding: '10px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddGroup} disabled={saving || !inputVal.trim()} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '10px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>Add Group</button>
            </div>
          </div>
        )}

        {groups.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', font: '600 14px Plus Jakarta Sans', color: c.muted }}>No groups yet. Add one above.</div>
        )}

        {/* Groups list */}
        {groups.map(group => {
          const cats = categoriesByGroup(group.name)
          const isOpen = activeGroup === group.name
          const groupCatIds = cats.map(c => c.id)
          const groupTxnCount = state.transactions.filter(t => t.category_id && groupCatIds.includes(t.category_id)).length
          const groupRestricted = groupTxnCount > 0
          return (
            <div key={group.id} style={{ background: c.surface, borderRadius: 16, marginBottom: 10, border: `1px solid ${c.faint}`, overflow: 'hidden' }}>

              {/* Group header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 14px 16px' }}>
                <button onClick={() => setActiveGroup(isOpen ? null : group.name)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <span style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>{group.name}</span>
                  <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 999, padding: '2px 8px' }}>{cats.length}</span>
                </button>
                {/* Edit group — locked for system groups */}
                {group.is_system ? (
                  <div title="System group — cannot be renamed" style={{ width: 30, height: 30, borderRadius: 8, background: c.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  </div>
                ) : (
                  <button onClick={() => { setEditingGroup(group); setInputVal(group.name); setShowAddGroup(false); setShowAddCategory(null); setEditingCategory(null) }}
                    style={{ width: 30, height: 30, borderRadius: 8, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                )}
                {/* Show/hide toggle */}
                <button
                  onClick={() => onToggleGroupVisibility(group.id, group.is_visible === false)}
                  title={group.is_visible === false ? 'Show in dropdowns' : 'Hide from dropdowns'}
                  style={{ width: 30, height: 30, borderRadius: 8, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: group.is_visible === false ? 0.4 : 1 }}>
                  {group.is_visible === false
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
                {/* Delete — replaced with lock badge for system groups */}
                {group.is_system ? (
                  <div title="System group — cannot be deleted" style={{ width: 30, height: 30, borderRadius: 8, background: c.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  </div>
                ) : (
                  <button
                    onClick={() => handleDeleteGroup(group)}
                    title={groupRestricted ? `${groupTxnCount} transaction(s) use this group` : 'Delete group'}
                    style={{ width: 30, height: 30, borderRadius: 8, background: groupRestricted ? c.surface2 : '#FEE2E2', border: 'none', cursor: groupRestricted ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: groupRestricted ? 0.4 : 1 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={groupRestricted ? c.muted : '#EF4444'} strokeWidth="2.2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                  </button>
                )}
              </div>

              {/* Edit group inline */}
              {editingGroup?.id === group.id && (
                <div style={{ padding: '0 14px 14px' }}>
                  <input value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUpdateGroup()} style={inp} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => { setEditingGroup(null); setInputVal('') }} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 10, padding: '9px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleUpdateGroup} disabled={saving} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '9px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>Save</button>
                  </div>
                </div>
              )}

              {/* Categories list */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${c.faint}` }}>
                  {cats.map(cat => (
                    <div key={cat.id}>
                      {editingCategory?.id === cat.id ? (
                        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUpdateCategory()} style={{ ...inp, flex: 1 }} autoFocus />
                            <button onClick={() => { setEditingCategory(null); setInputVal(''); setEditingCategoryGroup('') }} style={{ background: c.surface2, color: c.muted, border: 'none', borderRadius: 8, padding: '8px 10px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer', whiteSpace: 'nowrap' }}>✕</button>
                            <button onClick={handleUpdateCategory} disabled={saving} style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 10px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer', whiteSpace: 'nowrap', opacity: saving ? 0.6 : 1 }}>Save</button>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, whiteSpace: 'nowrap' }}>Move to group:</span>
                            <select
                              value={editingCategoryGroup}
                              onChange={e => setEditingCategoryGroup(e.target.value)}
                              style={{ ...inp, flex: 1, padding: '6px 10px', font: '600 12px Plus Jakarta Sans' }}
                            >
                              {groups.map(g => (
                                <option key={g.id} value={g.name}>{g.name}{g.name === cat.group_name ? ' (current)' : ''}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px 10px 42px', borderBottom: `1px solid ${c.faint}` }}>
                          <span style={{ flex: 1, font: '600 13px Plus Jakarta Sans', color: c.ink }}>{cat.name}</span>
                          {(() => {
                            const parentGroup = groups.find(g => g.name === cat.group_name)
                            // Only lock borrowing group categories — they're used in internal code logic.
                            // Other system groups (Savings, Income, Transfer) allow category management.
                            const isProtectedCat = cat.group_name === BORROWING_GROUP
                            return (
                              <>
                                {/* Edit category — locked for system categories */}
                                {isProtectedCat ? (
                                  <div title="System category — cannot be renamed" style={{ width: 28, height: 28, borderRadius: 8, background: c.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 4, opacity: 0.4 }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                                  </div>
                                ) : (
                                  <button onClick={() => { setEditingCategory(cat); setInputVal(cat.name); setEditingCategoryGroup(cat.group_name); setShowAddCategory(null) }}
                                    style={{ width: 28, height: 28, borderRadius: 8, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                )}
                                {/* Show/hide toggle */}
                                <button
                                  onClick={() => onToggleCategoryVisibility(cat.id, cat.is_visible === false)}
                                  title={cat.is_visible === false ? 'Show in dropdowns' : 'Hide from dropdowns'}
                                  style={{ width: 28, height: 28, borderRadius: 8, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 4, opacity: cat.is_visible === false ? 0.4 : 1 }}>
                                  {cat.is_visible === false
                                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                  }
                                </button>
                                {/* Delete — lock icon for protected categories, active red for all others */}
                                {isProtectedCat ? (
                                  <div title="System category — cannot be deleted" style={{ width: 28, height: 28, borderRadius: 8, background: c.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleDeleteCategory(cat)}
                                    title="Delete category"
                                    style={{ width: 28, height: 28, borderRadius: 8, background: '#FEE2E2', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                                  </button>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add category inline — not allowed in system groups */}
                  {!group.is_system && (showAddCategory === group.name ? (
                    <div style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCategory(group.name)} placeholder="Category name" style={{ ...inp, flex: 1 }} />
                      <button onClick={() => { setShowAddCategory(null); setInputVal('') }} style={{ background: c.surface2, color: c.muted, border: 'none', borderRadius: 8, padding: '8px 10px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}>✕</button>
                      <button onClick={() => handleAddCategory(group.name)} disabled={saving || !inputVal.trim()} style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 10px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>Add</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setShowAddCategory(group.name); setInputVal(''); setEditingCategory(null) }}
                      style={{ width: '100%', padding: '10px 14px 10px 42px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: '600 13px Plus Jakarta Sans', color: c.accent, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <span style={{ fontSize: 16 }}>+</span> Add category
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Category in-use dialog */}
      {catInUse && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={() => setCatInUse(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Cannot Delete</div>
            </div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 20 }}>
              <strong style={{ color: c.ink }}>{catInUse.cat.name}</strong> is used by{' '}
              <strong style={{ color: c.ink }}>{catInUse.txnCount} transaction{catInUse.txnCount !== 1 ? 's' : ''}</strong>.
              Reassign those transactions to a different category before deleting this one.
            </div>
            <button
              onClick={() => setCatInUse(null)}
              style={{ width: '100%', background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '12px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
