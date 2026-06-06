import { useState, useEffect } from 'react'
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
import type { DashboardSection, DashboardSectionId, Settings } from '@/types'
import { DEFAULT_DASHBOARD_SECTIONS } from '@/types'

const LOCKED_IDS: DashboardSectionId[] = ['hero', 'affordability']

const SECTION_META: Record<DashboardSectionId, { label: string; desc: string }> = {
  hero:          { label: 'Weekly Overview',       desc: 'Spending vs budget & week summary' },
  affordability: { label: 'Affordability Checker', desc: 'Can I afford this purchase?' },
  metrics:       { label: 'Your Money',            desc: 'Balance, savings & key metrics' },
  commitments:   { label: 'Commitments',           desc: 'Bills & recurring payments' },
  accounts:      { label: 'Accounts',              desc: 'Bank & cash account balances' },
  borrowing:     { label: 'Borrowing',             desc: 'Money lent & borrowed' },
  credit_cards:  { label: 'Credit Cards',          desc: 'Card balances & due dates' },
  analytics:     { label: 'Analytics',             desc: 'Spending trends & charts' },
  renovation:    { label: 'Renovation',            desc: 'Project budget tracker' },
  recent_txns:   { label: 'Recent Transactions',   desc: 'Latest activity' },
}

// ── Grip icon ─────────────────────────────────────────────────────────────────
function GripIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill={color}>
      <circle cx="5" cy="4"  r="1.4" />
      <circle cx="5" cy="8"  r="1.4" />
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="11" cy="4"  r="1.4" />
      <circle cx="11" cy="8"  r="1.4" />
      <circle cx="11" cy="12" r="1.4" />
    </svg>
  )
}

// ── Lock icon ─────────────────────────────────────────────────────────────────
function LockIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  )
}

// ── Sortable row ──────────────────────────────────────────────────────────────
interface RowProps {
  section: DashboardSection
  featureOff: boolean
  onToggle: () => void
}

function SortableRow({ section, featureOff, onToggle }: RowProps) {
  const c = useTheme()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })

  const meta = SECTION_META[section.id]

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
      <div
        {...attributes}
        {...listeners}
        style={{
          padding: '6px 4px', cursor: 'grab', touchAction: 'none',
          display: 'flex', alignItems: 'center', flexShrink: 0,
        }}
      >
        <GripIcon color={c.muted} />
      </div>

      {/* Label */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{meta.label}</span>
          {featureOff && (
            <span style={{
              font: '600 10px Plus Jakarta Sans', color: c.muted,
              background: c.surface2, padding: '2px 7px', borderRadius: 5,
            }}>
              Feature off
            </span>
          )}
        </div>
        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{meta.desc}</div>
      </div>

      {/* Visibility toggle */}
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
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
interface Props {
  sections: DashboardSection[]
  settings: Settings
  onUpdate: (sections: DashboardSection[]) => Promise<void>
  onClose: () => void
}

export function DashboardLayoutPage({ sections, settings, onUpdate, onClose }: Props) {
  const c = useTheme()

  const merged = (() => {
    const ids = sections.map(s => s.id)
    const missing = DEFAULT_DASHBOARD_SECTIONS.filter(s => !ids.includes(s.id))
    return [...sections, ...missing]
  })()

  const [local, setLocal] = useState<DashboardSection[]>(merged)

  useEffect(() => { setLocal(merged) }, [sections])

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

  const toggleVisible = (id: DashboardSectionId) => {
    commit(freeSections.map(s => s.id === id ? { ...s, visible: !s.visible } : s))
  }

  const handleReset = async () => {
    const reset = DEFAULT_DASHBOARD_SECTIONS.map(s => ({ ...s }))
    setLocal(reset)
    await onUpdate(reset)
  }

  const featureDisabled = (id: DashboardSectionId) => {
    if (id === 'borrowing')    return !(settings.track_borrowings ?? true)
    if (id === 'credit_cards') return !(settings.track_credit_cards ?? false)
    return false
  }

  const sectionLabel: React.CSSProperties = {
    font: '700 11px Plus Jakarta Sans', color: c.muted,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '16px 0 8px',
  }

  return (
    <div style={{
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
            <div style={{
              width: 32, height: 32, borderRadius: 10, background: c.surface2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <LockIcon color={c.muted} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{SECTION_META[s.id].label}</div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{SECTION_META[s.id].desc}</div>
            </div>
            <div style={{
              font: '700 11px Plus Jakarta Sans', color: c.muted,
              background: c.surface2, padding: '4px 9px', borderRadius: 7,
            }}>
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
              />
            ))}
          </SortableContext>
        </DndContext>

        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textAlign: 'center', paddingTop: 20 }}>
          Changes save automatically
        </div>
      </div>
    </div>
  )
}
