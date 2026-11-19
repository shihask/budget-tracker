import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import type { ProjectCollaborator } from '../../types'
import { FONT, cardStyle } from '../overview/styles'
import { Badge } from './MemberRow'
import { errorText } from './memberUi'

interface Props {
  collaborators: ProjectCollaborator[]
  /** Only the owner invites or removes collaborators. */
  isOwner: boolean
  onInvite: () => void
  onRemove: (collaboratorId: string) => Promise<void>
}

export function CollaboratorsSection({ collaborators, isOwner, onInvite, onRemove }: Props) {
  const c = useTheme()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const remove = async (collab: ProjectCollaborator) => {
    if (!confirm(`Remove ${collab.invited_email || 'this collaborator'} from this project?`)) return
    setBusyId(collab.id); setError(null)
    try { await onRemove(collab.id) } catch (e) { setError(errorText(e)) } finally { setBusyId(null) }
  }

  return (
    <section style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ font: `700 11px ${FONT}`, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Collaborators{collaborators.length > 0 && ` · ${collaborators.length}`}
        </div>
        {isOwner && (
          <button onClick={onInvite} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 10,
            border: `1px solid ${c.faint}`, background: c.surface, color: c.ink, font: `700 12px ${FONT}`, cursor: 'pointer',
          }}>
            <Plus size={14} strokeWidth={2.5} /> Invite
          </button>
        )}
      </div>

      {collaborators.length > 0 && (
        <div style={{ ...cardStyle(c), padding: 0, overflow: 'hidden' }}>
          {collaborators.map((collab, i) => (
            <div key={collab.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '8px 10px 8px 14px',
              borderTop: i === 0 ? 'none' : `1px solid ${c.faint}`,
            }}>
              <span style={{ flex: 1, minWidth: 0, font: `600 13px ${FONT}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {collab.invited_email || 'Unknown'}
              </span>
              <Badge c={c}>{collab.role === 'editor' ? 'Editor' : collab.role === 'owner' ? 'Owner' : 'Viewer'}</Badge>
              {collab.status !== 'active' && <Badge c={c}>Pending</Badge>}
              {isOwner && (
                <button aria-label={`Remove ${collab.invited_email || 'collaborator'}`} disabled={busyId === collab.id} onClick={() => remove(collab)} style={{
                  flexShrink: 0, background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: c.muted, display: 'flex',
                }}>
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" style={{ marginTop: 8, padding: '10px 12px', borderRadius: 12, background: c.badSoft, color: c.bad, font: `600 12px ${FONT}` }}>
          {error}
        </div>
      )}

      <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 8, lineHeight: 1.5 }}>
        {collaborators.length === 0 && (isOwner ? 'No collaborators yet. ' : 'No other collaborators. ')}
        Collaborators can open this project in MoneyPlant. Members are just names for splitting costs.
      </div>
    </section>
  )
}
