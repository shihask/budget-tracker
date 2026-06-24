import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { useProjectsData } from '../hooks/useProjectsData'
import { ProjectFormSheet } from './ProjectFormSheet'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { Project, ProjectStatus, ProjectRole } from '../types'

interface Props {
  userId: string
  userName: string
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  initialAddOpen?: boolean
}

export function ProjectsListPage({ userId, userName, onClose, onSwipeProgress, initialAddOpen }: Props) {
  const c = useTheme()
  const data = useProjectsData(userId)
  const { projects, sharedProjects, projectRoles, loading } = data

  const [filterStatus, setFilterStatus] = useState<ProjectStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(initialAddOpen ?? false)
  const [detailProject, setDetailProject] = useState<Project | null>(null)

  // ── Swipe-back gesture ────────────────────────────────────────────────
  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const dragXRef = useRef(0)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400

  useEffect(() => {
    const t = setTimeout(() => setEntryPlayed(true), 360)
    return () => clearTimeout(t)
  }, [])

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

  const triggerClose = () => {
    setClosing(true)
    onSwipeProgress?.(1)
    setTimeout(() => { onSwipeProgress?.(0); onClose() }, 290)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (closing) return
    const t = e.touches[0]
    if (t.clientX > 28) return
    gestureRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: Date.now() }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dy = Math.abs(t.clientY - gestureRef.current.startY)
    if (dy > Math.abs(dx) + 5 && Math.abs(dx) < 15) {
      gestureRef.current = null; setDragX(0); onSwipeProgress?.(0); return
    }
    gestureRef.current = { ...gestureRef.current, lastX: t.clientX, lastT: Date.now() }
    const x = Math.max(0, dx)
    dragXRef.current = x
    setDragX(x)
    onSwipeProgress?.(x / W)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dt = Date.now() - gestureRef.current.lastT
    const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
    gestureRef.current = null
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) {
      triggerClose()
    } else {
      setSnapping(true); setDragX(0); dragXRef.current = 0; onSwipeProgress?.(0)
      setTimeout(() => setSnapping(false), 300)
    }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0); dragXRef.current = 0; onSwipeProgress?.(0)
    setTimeout(() => setSnapping(false), 300)
  }

  // ── Filtered projects ──────────────────────────────────────────────────
  const applyFilters = (items: Project[]) => {
    if (filterStatus !== 'all') items = items.filter(p => p.status === filterStatus)
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
    }
    return items
  }
  const filtered = useMemo(() => applyFilters([...projects]), [projects, filterStatus, search])
  const filteredShared = useMemo(() => applyFilters([...sharedProjects]), [sharedProjects, filterStatus, search])

  const statusCounts = useMemo(() => ({
    all: projects.length + sharedProjects.length,
    active: projects.filter(p => p.status === 'active').length,
    completed: [...projects, ...sharedProjects].filter(p => p.status === 'completed').length,
    archived: [...projects, ...sharedProjects].filter(p => p.status === 'archived').length,
  }), [projects, sharedProjects])

  const handleAdd = async (form: { name: string; description?: string; notes?: string; target_amount: number }) => {
    const project = await data.addProject(form)
    await data.addMember(project.id, { name: userName })
  }

  const statusColors: Record<ProjectStatus, string> = {
    active: '#10B981',
    completed: '#6366F1',
    archived: c.muted,
  }

  return createPortal(
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        background: c.bg,
        transform: closing ? `translateX(${W}px)` : `translateX(${dragX}px)`,
        transition: (closing || snapping) ? 'transform 0.29s cubic-bezier(.4,.9,.3,1)' : entryPlayed ? 'none' : 'transform 0.33s cubic-bezier(.4,.9,.3,1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        ...(!entryPlayed && !closing ? { animation: 'slideInFromRight 0.33s cubic-bezier(.4,.9,.3,1) forwards' } : {}),
      }}
    >
      {/* Header */}
      <div style={{
        padding: '52px 18px 12px', background: c.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${c.faint}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={triggerClose}
            style={{
              width: 36, height: 36, borderRadius: 12, border: 'none',
              background: c.surface2, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink }}>Projects</div>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          style={{
            width: 36, height: 36, borderRadius: 12, border: 'none',
            background: c.accent, color: '#fff', cursor: 'pointer',
            font: '700 20px Plus Jakarta Sans',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}
        >+</button>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 18px 0' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search projects…"
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 14,
            border: `1.5px solid ${c.faint}`, background: c.surface2,
            font: '600 14px Plus Jakarta Sans', color: c.ink,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Status filter chips */}
      <div style={{ padding: '10px 18px', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {(['all', 'active', 'completed', 'archived'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              padding: '6px 14px', borderRadius: 10,
              border: `1.5px solid ${filterStatus === s ? c.accent : c.faint}`,
              background: filterStatus === s ? c.accentSoft : 'transparent',
              color: filterStatus === s ? c.accent : c.muted,
              font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
              textTransform: 'capitalize', whiteSpace: 'nowrap',
            }}
          >
            {s} ({statusCounts[s]})
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 100px', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        {loading ? (
          <div style={{ font: '600 14px Plus Jakarta Sans', color: c.muted, textAlign: 'center', paddingTop: 40 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ font: '600 14px Plus Jakarta Sans', color: c.muted }}>No projects found</div>
            <button
              onClick={() => setAddOpen(true)}
              style={{
                marginTop: 12, padding: '10px 24px', borderRadius: 14,
                border: 'none', background: c.accent, color: '#fff',
                font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
              }}
            >Create your first project</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
            {filtered.length > 0 && sharedProjects.length > 0 && (
              <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 4 }}>My Projects</div>
            )}
            {filtered.map(p => (
              <ProjectCard key={p.id} project={p} role="owner" statusColors={statusColors} onOpen={() => { data.loadProjectDetail(p.id); setDetailProject(p) }} onDelete={() => data.deleteProject(p.id)} />
            ))}
            {filteredShared.length > 0 && (
              <>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 10 }}>Shared with Me</div>
                {filteredShared.map(p => (
                  <ProjectCard key={p.id} project={p} role={projectRoles.get(p.id) || 'viewer'} statusColors={statusColors} onOpen={() => { data.loadProjectDetail(p.id); setDetailProject(p) }} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <ProjectFormSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleAdd}
      />

      {detailProject && (
        <ProjectDetailPage
          project={detailProject}
          data={data}
          role={projectRoles.get(detailProject.id) || 'owner'}
          onClose={() => setDetailProject(null)}
          onSwipeProgress={onSwipeProgress}
          onProjectUpdated={(updated) => {
            setDetailProject(updated)
          }}
        />
      )}

      <style>{`
        @keyframes slideInFromRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>,
    document.body
  )
}

function ProjectCard({ project: p, role, statusColors, onOpen, onDelete }: {
  project: Project
  role: ProjectRole
  statusColors: Record<ProjectStatus, string>
  onOpen: () => void
  onDelete?: () => void
}) {
  const c = useTheme()
  return (
    <div
      onClick={onOpen}
      style={{
        background: c.surface, borderRadius: 18, padding: '14px 16px',
        border: `1px solid ${c.faint}`, cursor: 'pointer',
        boxShadow: c.cardShadow,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink, flex: 1 }}>{p.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {role !== 'owner' && (
            <div style={{
              font: '700 10px Plus Jakarta Sans', color: role === 'editor' ? '#6366F1' : c.muted,
              background: role === 'editor' ? '#6366F118' : c.surface2,
              padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase',
            }}>
              {role}
            </div>
          )}
          <div style={{
            font: '700 10px Plus Jakarta Sans', color: statusColors[p.status],
            background: `${statusColors[p.status]}18`,
            padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase',
          }}>
            {p.status}
          </div>
          {role === 'owner' && onDelete && (
            <button
              onClick={e => {
                e.stopPropagation()
                if (confirm(`Delete "${p.name}"? This will remove all members, transactions, and attachments.`)) onDelete()
              }}
              style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#EF4444', flexShrink: 0 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      {p.description && (
        <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 4, lineHeight: 1.4 }}>{p.description}</div>
      )}
      {p.target_amount > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Target</div>
            <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(p.target_amount)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
