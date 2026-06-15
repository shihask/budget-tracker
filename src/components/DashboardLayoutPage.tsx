import { useState, useEffect, useRef } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import type { Category, DashboardSection, DashboardSectionId, Settings } from '@/types'
import { DEFAULT_DASHBOARD_SECTIONS } from '@/types'

const LOCKED_IDS: string[] = ['hero', 'affordability']

const SECTION_META: Record<DashboardSectionId, { label: string; desc: string }> = {
  hero:          { label: 'Weekly Overview',       desc: 'Spending vs budget & week summary' },
  affordability: { label: 'Affordability Checker', desc: 'Can I afford this purchase?' },
  metrics:       { label: 'Your Money',            desc: 'Balance, savings & key metrics' },
  commitments:   { label: 'Bills & Obligations',    desc: 'Bills & recurring payments' },
  goals:         { label: 'Goals',                 desc: 'Savings goals & progress tracking' },
  accounts:      { label: 'Accounts',              desc: 'Bank & cash account balances' },
  savings:       { label: 'Savings & Investments',  desc: 'SIPs, gold schemes & recurring deposits' },
  borrowing:     { label: 'Lend & Borrow',          desc: 'Money lent & borrowed' },
  credit_cards:  { label: 'Credit Cards',          desc: 'Card balances & due dates' },
  analytics:     { label: 'Analytics',             desc: 'Spending trends & charts' },
  recent_txns:   { label: 'Recent Transactions',   desc: 'Latest activity' },
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function GripIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill={color}>
      <circle cx="5" cy="4"  r="1.4" /><circle cx="5" cy="8"  r="1.4" /><circle cx="5" cy="12" r="1.4" />
      <circle cx="11" cy="4" r="1.4" /><circle cx="11" cy="8" r="1.4" /><circle cx="11" cy="12" r="1.4" />
    </svg>
  )
}

function LockIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  )
}

// ── Sortable row ──────────────────────────────────────────────────────────────
interface RowProps {
  section: DashboardSection
  featureOff: boolean
  onToggle: () => void
  onDelete?: () => void
}

function SortableRow({ section, featureOff, onToggle, onDelete }: RowProps) {
  const c = useTheme()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  const isCustom = section.id.startsWith('custom__')

  const label = isCustom
    ? (section.customName ?? 'Custom section')
    : (SECTION_META[section.id as DashboardSectionId]?.label ?? section.id)

  const desc = isCustom
    ? [
        ...(section.customGroups ?? []),
        ...(section.customCategories?.length ? [`+${section.customCategories.length} individual`] : []),
      ].join(' · ') || 'No groups selected'
    : (SECTION_META[section.id as DashboardSectionId]?.desc ?? '')

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 0', borderBottom: `1px solid ${c.faint}`,
        opacity: isDragging ? 0.5 : featureOff ? 0.45 : 1,
        background: isDragging ? c.surface2 : 'transparent',
        borderRadius: isDragging ? 12 : 0,
        zIndex: isDragging ? 999 : 'auto',
        position: 'relative',
      }}
    >
      {/* Drag handle */}
      <div {...attributes} {...listeners} style={{ padding: '6px 4px', cursor: 'grab', touchAction: 'none', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <GripIcon color={c.muted} />
      </div>

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{label}</span>
          {isCustom && (
            <span style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, background: c.accentSoft, padding: '2px 7px', borderRadius: 5 }}>Custom</span>
          )}
          {featureOff && (
            <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, background: c.surface2, padding: '2px 7px', borderRadius: 5 }}>Feature off</span>
          )}
        </div>
        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</div>
      </div>

      {/* Toggle */}
      <button
        onClick={() => { if (!featureOff) onToggle() }}
        style={{
          width: 44, height: 26, borderRadius: 999, border: 'none',
          cursor: featureOff ? 'default' : 'pointer',
          background: (section.visible && !featureOff) ? c.accent : c.surface2,
          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999,
          background: '#fff', transition: 'left 0.2s',
          left: (section.visible && !featureOff) ? 21 : 3,
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }} />
      </button>

      {/* Delete (custom sections only) */}
      {isCustom && onDelete && (
        <button
          onClick={onDelete}
          style={{
            width: 32, height: 32, borderRadius: 9, background: '#FEE2E2', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="#EF4444" strokeWidth={2.2} strokeLinecap="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
interface Props {
  sections: DashboardSection[]
  settings: Settings
  categories: Category[]
  onUpdate: (sections: DashboardSection[]) => Promise<void>
  onClose: () => void
}

export function DashboardLayoutPage({ sections, settings, categories, onUpdate, onClose }: Props) {
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

  const validBuiltinIds = new Set(DEFAULT_DASHBOARD_SECTIONS.map(s => s.id))

  const merged = (() => {
    // Drop any stored section IDs that no longer exist as built-ins (e.g. old 'renovation')
    const valid = sections.filter(s => s.id.startsWith('custom__') || validBuiltinIds.has(s.id))
    const ids = valid.map(s => s.id)
    const missing = DEFAULT_DASHBOARD_SECTIONS.filter(s => !ids.includes(s.id))
    return [...valid, ...missing]
  })()

  const [local, setLocal] = useState<DashboardSection[]>(merged)

  // Only reset local when sections are added or removed externally.
  // Ignoring order-only changes preserves drag results while onUpdate propagates.
  useEffect(() => {
    setLocal(prev => {
      const prevIds = new Set(prev.map(s => s.id))
      const nextIds = new Set(merged.map(s => s.id))
      const same = prevIds.size === nextIds.size && [...prevIds].every(id => nextIds.has(id))
      return same ? prev : merged
    })
  }, [sections])

  const lockedSections = local.filter(s => LOCKED_IDS.includes(s.id))
  const freeSections   = local.filter(s => !LOCKED_IDS.includes(s.id))

  const commit = async (newFree: DashboardSection[]) => {
    const updated = [...lockedSections, ...newFree]
    setLocal(updated)
    await onUpdate(updated)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = freeSections.findIndex(s => s.id === active.id)
    const newIndex = freeSections.findIndex(s => s.id === over.id)
    commit(arrayMove(freeSections, oldIndex, newIndex))
  }

  const toggleVisible = (id: string) => {
    commit(freeSections.map(s => s.id === id ? { ...s, visible: !s.visible } : s))
  }

  const deleteSection = (id: string) => {
    commit(freeSections.filter(s => s.id !== id))
  }

  const handleReset = async () => {
    const reset = DEFAULT_DASHBOARD_SECTIONS.map(s => ({ ...s }))
    setLocal(reset)
    await onUpdate(reset)
  }

  const featureDisabled = (id: string) => {
    if (id === 'savings')      return !(settings.track_savings ?? false)
    if (id === 'borrowing')    return !(settings.track_borrowings ?? true)
    if (id === 'credit_cards') return !(settings.track_credit_cards ?? false)
    return false
  }

  // ── Add custom section state ─────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addGroups, setAddGroups] = useState<string[]>([])
  const [addCats, setAddCats] = useState<string[]>([])
  const [showCatPicker, setShowCatPicker] = useState(false)

  const availableGroups = Array.from(new Set(categories.map(cat => cat.group_name).filter(Boolean))).sort() as string[]

  const toggleAddGroup = (g: string) => {
    setAddGroups(prev => {
      if (prev.includes(g)) return prev.filter(x => x !== g)
      if (!addName) setAddName(g)
      return [...prev, g]
    })
  }

  const toggleAddCat = (id: string) => {
    setAddCats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const canAdd = addGroups.length > 0 || addCats.length > 0

  const handleAdd = async () => {
    if (!canAdd) return
    const name = addName.trim() || (addGroups.length >= 1 ? addGroups[0] : 'Custom')
    const newSection: DashboardSection = {
      id: `custom__${Date.now()}`,
      visible: true,
      customName: name,
      customGroups: addGroups,
      customCategories: addCats,
    }
    await commit([...freeSections, newSection])
    setAddName(''); setAddGroups([]); setAddCats([]); setShowCatPicker(false); setAddOpen(false)
  }

  const closeAdd = () => {
    setAddName(''); setAddGroups([]); setAddCats([]); setShowCatPicker(false); setAddOpen(false)
  }

  const sectionLabel: React.CSSProperties = {
    font: '700 11px Plus Jakarta Sans', color: c.muted,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '16px 0 8px',
  }

  return (
    <div ref={containerRef} style={{
      position: 'fixed', inset: 0, background: c.bg, zIndex: 300,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: `calc(14px + env(safe-area-inset-top, 0px)) 16px 14px`,
        borderBottom: `1px solid ${c.faint}`,
        display: 'flex', alignItems: 'center', gap: 12,
        background: c.bg, flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            width: 36, height: 36, borderRadius: 999, border: 'none',
            background: c.surface2, cursor: 'pointer', color: c.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Dashboard Layout</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Drag to reorder · toggle to show/hide</div>
        </div>
        <button
          onClick={handleReset}
          style={{
            background: 'none', border: `1.5px solid ${c.faint}`, borderRadius: 10,
            padding: '7px 14px', font: '700 12px Plus Jakarta Sans',
            color: c.muted, cursor: 'pointer', flexShrink: 0,
          }}
        >
          Reset
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 16px calc(24px + env(safe-area-inset-bottom, 0px))` }}>

        {/* Locked */}
        <div style={sectionLabel}>Always shown</div>
        {lockedSections.map(s => (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 0', borderBottom: `1px solid ${c.faint}`,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: c.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <LockIcon color={c.muted} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{SECTION_META[s.id as DashboardSectionId].label}</div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{SECTION_META[s.id as DashboardSectionId].desc}</div>
            </div>
            <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, background: c.surface2, padding: '4px 9px', borderRadius: 7 }}>
              Locked
            </div>
          </div>
        ))}

        {/* Draggable free sections */}
        <div style={sectionLabel}>Customizable</div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={freeSections.map(s => s.id)} strategy={verticalListSortingStrategy}>
            {freeSections.map(s => (
              <SortableRow
                key={s.id}
                section={s}
                featureOff={featureDisabled(s.id)}
                onToggle={() => toggleVisible(s.id)}
                onDelete={s.id.startsWith('custom__') ? () => deleteSection(s.id) : undefined}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Add custom section button */}
        <button
          onClick={() => setAddOpen(true)}
          style={{
            width: '100%', marginTop: 12, padding: '13px 16px',
            background: c.accentSoft, border: `1.5px dashed ${c.accent}`,
            borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <div style={{ width: 28, height: 28, borderRadius: 8, background: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ font: '700 13px Plus Jakarta Sans', color: c.accent }}>Add custom section</div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.accent, opacity: 0.7, marginTop: 1 }}>Track any category group or mix</div>
          </div>
        </button>

        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textAlign: 'center', paddingTop: 20 }}>
          Changes save automatically · Reset removes custom sections
        </div>
      </div>

      {/* Add custom section sheet */}
      <BottomSheet open={addOpen} onClose={closeAdd} zIndex={500}>
          <div>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em', marginBottom: 4 }}>Add custom section</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 20 }}>
              Pick groups or categories to track, then give the section a name.
            </div>

            {/* Section name */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Section name</div>
              <input
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder={addGroups.length > 0 ? addGroups[0] : 'e.g. Renovation, Travel…'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: c.surface2, border: `1.5px solid ${c.faint}`,
                  borderRadius: 13, padding: '12px 14px',
                  font: '700 15px Plus Jakarta Sans', color: c.ink, outline: 'none',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                }}
              />
            </div>

            {/* Category groups */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Category groups
                {addGroups.length > 0 && (
                  <span style={{ marginLeft: 8, background: c.accent, color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 11, letterSpacing: 0, textTransform: 'none' }}>
                    {addGroups.length} selected
                  </span>
                )}
              </div>
              {availableGroups.length === 0 ? (
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>No groups yet — create some in Categories first.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {availableGroups.map(g => (
                    <button
                      key={g}
                      onClick={() => toggleAddGroup(g)}
                      style={{
                        padding: '9px 16px', borderRadius: 999,
                        background: addGroups.includes(g) ? c.accent : c.surface2,
                        color: addGroups.includes(g) ? '#fff' : c.ink,
                        border: 'none', cursor: 'pointer',
                        font: '700 13px Plus Jakarta Sans',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Individual categories (expandable) */}
            <div style={{ marginBottom: 20 }}>
              <button
                onClick={() => setShowCatPicker(v => !v)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 10px',
                  font: '700 11px Plus Jakarta Sans', color: c.muted,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                }}
              >
                Individual categories
                {addCats.length > 0 && (
                  <span style={{ background: c.accent, color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 11, letterSpacing: 0, textTransform: 'none' }}>
                    {addCats.length}
                  </span>
                )}
                <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                  {showCatPicker ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                </svg>
              </button>
              {showCatPicker && (
                categories.length === 0 ? (
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>No categories yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => toggleAddCat(cat.id)}
                        style={{
                          padding: '7px 12px', borderRadius: 999,
                          background: addCats.includes(cat.id) ? c.accentSoft : c.surface2,
                          color: addCats.includes(cat.id) ? c.accent : c.ink,
                          border: `1.5px solid ${addCats.includes(cat.id) ? c.accent : 'transparent'}`,
                          cursor: 'pointer', font: '600 12px Plus Jakarta Sans',
                          fontFamily: 'Plus Jakarta Sans, sans-serif',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        {cat.name}
                        <span style={{ font: '600 10px Plus Jakarta Sans', color: addCats.includes(cat.id) ? c.accent : c.muted, opacity: 0.8 }}>
                          {cat.group_name}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={closeAdd}
                style={{ flex: 1, background: c.surface2, border: 'none', borderRadius: 14, padding: 13, font: '700 14px Plus Jakarta Sans', color: c.muted, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!canAdd}
                style={{
                  flex: 2, background: canAdd ? c.accent : c.surface2, color: canAdd ? '#fff' : c.muted,
                  border: 'none', borderRadius: 14, padding: 13,
                  font: '700 14px Plus Jakarta Sans', cursor: canAdd ? 'pointer' : 'default',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                }}
              >
                Add section
              </button>
            </div>
          </div>
      </BottomSheet>
    </div>
  )
}
