import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt, round2 } from '@/lib/utils'
import type { MemberSummary, ProjectCollaborator, ProjectMember, ProjectTransaction, SettlementResult } from '../../types'
import { buildMemberRows } from '../../lib/members'
import { FONT, cardStyle } from '../overview/styles'
import { LinkButton } from '../overview/ui'
import { useIsWide } from '../shared/useIsWide'
import { MemberRow } from './MemberRow'
import { MemberDetailSheet } from './MemberDetailSheet'
import { MemberFormSheet } from './MemberFormSheet'
import { CollaboratorsSection } from './CollaboratorsSection'
import { WIDE_COLUMNS } from './memberUi'

interface Props {
  members: ProjectMember[]
  memberSummaries: MemberSummary[]
  /** The page's existing calcSettlement result — the only source of settlement status. */
  settlement: SettlementResult
  transactions: ProjectTransaction[]
  collaborators: ProjectCollaborator[]
  target: number
  /** Owner or editor — may add, edit and remove members. */
  canEdit: boolean
  /** Owner only — may invite and remove collaborators. */
  isOwner: boolean
  /** The Settlement tab exists (≥ 2 members). */
  canSettle: boolean
  onAddMember: (form: { name: string; email: string | null }) => Promise<void>
  onUpdateMember: (id: string, form: { name: string; email: string | null }) => Promise<void>
  onRemoveMember: (id: string) => Promise<void>
  onInvite: (email?: string) => void
  onRemoveCollaborator: (collaboratorId: string) => Promise<void>
  onGoToSettlement: () => void
}

export function MembersTab({
  members, memberSummaries, settlement, transactions, collaborators, target, canEdit, isOwner, canSettle,
  onAddMember, onUpdateMember, onRemoveMember, onInvite, onRemoveCollaborator, onGoToSettlement,
}: Props) {
  const c = useTheme()
  const wide = useIsWide()
  const rows = useMemo(
    () => buildMemberRows(members, memberSummaries, settlement, transactions, target),
    [members, memberSummaries, settlement, transactions, target],
  )
  // Sheets are remounted per opening (key) so they always start fresh.
  const [form, setForm] = useState<{ key: number; member: ProjectMember | null; open: boolean }>({ key: 0, member: null, open: false })
  const [detail, setDetail] = useState<{ key: number; id: string; open: boolean } | null>(null)

  const openForm = (member: ProjectMember | null) => setForm(f => ({ key: f.key + 1, member, open: true }))
  const detailRow = detail ? rows.find(r => r.member.id === detail.id) ?? null : null
  const collaboratorEmails = new Set(collaborators.map(x => x.invited_email).filter(Boolean) as string[])

  const totals = rows.reduce((t, r) => ({ kitty: t.kitty + r.putInKitty, personal: t.personal + r.paidPersonally }), { kitty: 0, personal: 0 })
  const totalsLine = [
    totals.kitty > 0.01 && `${fmt(round2(totals.kitty))} put in kitty`,
    totals.personal > 0.01 && `${fmt(round2(totals.personal))} paid personally`,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: `800 16px ${FONT}`, color: c.ink }}>{members.length} member{members.length === 1 ? '' : 's'}</div>
          {totalsLine && <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 2 }}>{totalsLine}</div>}
        </div>
        {canEdit && (
          <button onClick={() => openForm(null)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, height: 40, padding: '0 14px', flexShrink: 0,
            borderRadius: 12, border: 'none', background: c.accent, color: '#fff', font: `700 13px ${FONT}`, cursor: 'pointer',
          }}>
            <Plus size={15} strokeWidth={2.5} /> Add member
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ ...cardStyle(c), marginTop: 12, padding: '18px 16px', textAlign: 'center', font: `500 13px ${FONT}`, color: c.muted }}>
          No members yet. {canEdit ? 'Add the people sharing this trip.' : ''}
        </div>
      ) : (
        <div style={{ ...cardStyle(c), marginTop: 12, padding: 0, overflow: 'hidden' }}>
          {wide && (
            <div style={{
              display: 'grid', gridTemplateColumns: WIDE_COLUMNS, gap: 12, padding: '8px 14px',
              borderBottom: `1px solid ${c.faint}`, font: `700 11px ${FONT}`, color: c.muted,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              <span style={{ gridColumn: '1 / 3' }}>Member</span>
              <span style={{ textAlign: 'right' }}>Put in kitty</span>
              <span style={{ textAlign: 'right' }}>Paid personally</span>
              <span style={{ textAlign: 'right' }}>Settlement</span>
              <span />
            </div>
          )}
          {rows.map((r, i) => (
            <div key={r.member.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${c.faint}` }}>
              <MemberRow row={r} wide={wide} onOpen={() => setDetail(d => ({ key: (d?.key ?? 0) + 1, id: r.member.id, open: true }))} />
            </div>
          ))}
        </div>
      )}

      {canSettle && rows.some(r => r.net !== null) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <LinkButton c={c} label="Settlement shows who pays whom" onClick={onGoToSettlement} />
        </div>
      )}

      <CollaboratorsSection collaborators={collaborators} isOwner={isOwner} onInvite={() => onInvite()} onRemove={onRemoveCollaborator} />

      <MemberFormSheet
        key={`form-${form.key}`}
        open={form.open}
        member={form.member}
        onClose={() => setForm(f => ({ ...f, open: false }))}
        onSave={vals => form.member ? onUpdateMember(form.member.id, vals) : onAddMember(vals)}
      />
      <MemberDetailSheet
        key={`detail-${detail?.key ?? 0}`}
        open={!!detail?.open && !!detailRow}
        row={detailRow}
        transactions={transactions}
        canEdit={canEdit}
        canInvite={isOwner && !!detailRow?.member.email && !collaboratorEmails.has(detailRow.member.email)}
        onClose={() => setDetail(d => d ? { ...d, open: false } : d)}
        onEdit={m => { setDetail(d => d ? { ...d, open: false } : d); openForm(m) }}
        onInvite={email => { setDetail(d => d ? { ...d, open: false } : d); onInvite(email) }}
        onRemove={onRemoveMember}
      />
    </div>
  )
}
