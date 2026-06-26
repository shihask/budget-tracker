import { FolderOpen } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { Card } from '@/components/Card'
import type { Project } from '../types'

interface Props {
  projects: Project[]
  sharedProjects?: Project[]
  onSeeAll: () => void
  onAdd: () => void
}

export function ProjectsDashboardCard({ projects, sharedProjects = [], onSeeAll, onAdd }: Props) {
  const c = useTheme()

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: projects.length ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: '#6366F1',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
          <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Projects</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={onSeeAll} style={{ font: '600 13px Plus Jakarta Sans', color: c.accent, cursor: 'pointer' }}>See all</span>
          <button
            onClick={onAdd}
            aria-label="Add project"
            style={{
              width: 28, height: 28, borderRadius: 9, border: 'none',
              background: c.accentSoft, color: c.accent, cursor: 'pointer',
              font: '700 18px Plus Jakarta Sans',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, padding: 0,
            }}
          >+</button>
        </div>
      </div>

      {projects.length === 0 && sharedProjects.length === 0 ? (
        <div style={{ padding: '20px 0 8px', textAlign: 'center' }}>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><FolderOpen size={28} color="#A09890" /></div>
          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Start Your First Project</div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 14, lineHeight: 1.5 }}>Plan a trip, track a renovation or split expenses with friends — all in one place.</div>
          <button onClick={onAdd} style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>Create a project</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {projects.slice(0, 3).map(p => (
            <ProjectMiniCard key={p.id} project={p} onClick={onSeeAll} />
          ))}
          {projects.length > 3 && (
            <div
              onClick={onSeeAll}
              style={{ font: '600 12px Plus Jakarta Sans', color: c.accent, textAlign: 'center', cursor: 'pointer', paddingTop: 4 }}
            >
              +{projects.length - 3} more
            </div>
          )}
          {sharedProjects.length > 0 && (
            <>
              <div style={{ font: '700 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 10 }}>Shared with me</div>
              {sharedProjects.slice(0, 2).map(p => (
                <ProjectMiniCard key={p.id} project={p} onClick={onSeeAll} />
              ))}
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function ProjectMiniCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const c = useTheme()
  const target = project.target_amount || 0
  const pct = target > 0 ? Math.min(100, 100) : 0

  return (
    <div
      onClick={onClick}
      style={{
        background: c.surface2, borderRadius: 14, padding: '12px 14px', cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{project.name}</div>
        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>
          {target > 0 ? fmt(target) : 'No target'}
        </div>
      </div>
      {target > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            height: 6, borderRadius: 3, background: c.faint, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: '#6366F1',
              width: `${pct}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}
      {project.description && (
        <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 6, lineHeight: 1.4 }}>
          {project.description}
        </div>
      )}
    </div>
  )
}
