import { useState } from 'react'
import { Check } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import type { ColorTokens } from '@/lib/tokens'
import { BottomSheet } from '@/components/BottomSheet'
import type { ProjectMember } from '../../types'
import { normalizeSharedBy, resolveSharedBy } from '../../lib/sharedBy'
import { FONT } from '../overview/styles'

interface Props {
  open: boolean
  members: ProjectMember[]
  /** Current value: null = everyone active. The parent remounts this per opening. */
  value: string[] | null
  onClose: () => void
  /** null = everyone active; otherwise ≥ 1 member id. Never []. */
  onDone: (value: string[] | null) => void
}

const byOrder = (a: ProjectMember, b: ProjectMember) => (a.display_order - b.display_order) || (a.id < b.id ? -1 : 1)

export function SharedByPicker({ open, members, value, onClose, onDone }: Props) {
  const c = useTheme()
  const sorted = [...members].sort(byOrder)
  const active = sorted.filter(m => m.is_active)
  const inactive = sorted.filter(m => !m.is_active)
  const resolved = resolveSharedBy(value, members)
  // Everyone → the active members ticked, inactive unticked.
  const [picked, setPicked] = useState<Set<string>>(() =>
    new Set(resolved.everyone || resolved.malformed ? active.map(m => m.id) : resolved.people.map(m => m.id)))

  const toggle = (id: string) => setPicked(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const none = picked.size === 0

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false} zIndex={260}>
      <div style={{ padding: '0 4px 12px' }}>
        <div style={{ font: `800 18px ${FONT}`, color: c.ink }}>Who shared this?</div>
        <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 2 }}>
          The expense is split by share ratio among the people ticked.
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <QuickButton c={c} label={`Everyone (${active.length})`} onClick={() => setPicked(new Set(active.map(m => m.id)))} />
          <QuickButton c={c} label="Clear" onClick={() => setPicked(new Set())} />
        </div>

        <Section c={c} title="Active" members={active} picked={picked} onToggle={toggle} />
        {inactive.length > 0 && (
          <Section c={c} title="Inactive" hint="only if they shared this expense" members={inactive} picked={picked} onToggle={toggle} />
        )}

        {resolved.removed > 0 && (
          <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 10 }}>
            {resolved.removed} {resolved.removed === 1 ? 'person' : 'people'} on this expense {resolved.removed === 1 ? 'is' : 'are'} no longer in the project and will be left out.
          </div>
        )}

        {none && (
          <div role="alert" style={{ font: `600 12px ${FONT}`, color: c.bad, marginTop: 12 }}>
            Pick at least one person.
          </div>
        )}
        <button
          onClick={() => !none && onDone(normalizeSharedBy(picked, members))}
          disabled={none}
          style={{
            width: '100%', padding: '14px 0', marginTop: 14, borderRadius: 16, border: 'none',
            background: none ? c.faint : c.accent, color: '#fff', font: `700 16px ${FONT}`,
            cursor: none ? 'default' : 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </BottomSheet>
  )
}

function QuickButton({ c, label, onClick }: { c: ColorTokens; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 999, border: `1px solid ${c.faint}`, background: c.surface,
      color: c.ink, font: `700 12px ${FONT}`, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      {label}
    </button>
  )
}

function Section({ c, title, hint, members, picked, onToggle }: {
  c: ColorTokens; title: string; hint?: string; members: ProjectMember[]; picked: Set<string>; onToggle: (id: string) => void
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ font: `700 11px ${FONT}`, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {title}{hint && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}> · {hint}</span>}
      </div>
      {members.map(m => {
        const on = picked.has(m.id)
        return (
          <button
            key={m.id}
            role="checkbox"
            aria-checked={on}
            onClick={() => onToggle(m.id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 46, padding: '6px 2px',
              border: 'none', borderBottom: `1px solid ${c.faint}`, background: 'transparent', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span aria-hidden style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${on ? c.accent : c.faint}`, background: on ? c.accent : 'transparent',
            }}>
              {on && <Check size={13} color="#fff" strokeWidth={3} />}
            </span>
            <span style={{ flex: 1, minWidth: 0, font: `600 14px ${FONT}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.name}
            </span>
            {m.share_ratio !== 1 && (
              <span style={{ font: `700 10px ${FONT}`, color: c.sub, background: c.surface2, padding: '1px 7px', borderRadius: 999, flexShrink: 0 }}>
                ×{m.share_ratio}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
