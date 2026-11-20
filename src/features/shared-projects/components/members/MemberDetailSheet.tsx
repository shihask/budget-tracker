import { useState } from 'react'
import { AlertTriangle, Mail, Pencil, RotateCcw } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { BottomSheet } from '@/components/BottomSheet'
import type { ProjectMember, ProjectTransaction } from '../../types'
import { removalImpact, settlementStatus, type MemberRowData } from '../../lib/members'
import { FONT } from '../overview/styles'
import { Avatar, MemberBadges } from './MemberRow'
import { errorText, toneColor } from './memberUi'

interface Props {
  open: boolean
  /** The parent remounts this sheet (key) on every opening, so it always starts on the details step. */
  row: MemberRowData | null
  transactions: ProjectTransaction[]
  /** Owner or editor. */
  canEdit: boolean
  /** Owner, member has an email, and isn't a collaborator yet. */
  canInvite: boolean
  onClose: () => void
  onEdit: (m: ProjectMember) => void
  onInvite: (email: string) => void
  onRemove: (id: string) => Promise<void>
  /** Mark inactive (false) or active again (true). Never deletes anything. */
  onSetActive: (id: string, active: boolean) => Promise<void>
  /** Public share page: never show a member's email. */
  hideEmail?: boolean
}

const PAYMENTS_BLOCK_DELETE = "Can't be deleted permanently: they have recorded settlement payments. They stay inactive, and their history is kept."

export function MemberDetailSheet({ open, row, transactions, canEdit, canInvite, onClose, onEdit, onInvite, onRemove, onSetActive, hideEmail = false }: Props) {
  const c = useTheme()
  const [step, setStep] = useState<'view' | 'deactivate' | 'delete'>('view')
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!row) return <BottomSheet open={false} onClose={onClose} showHelpButton={false}>{null}</BottomSheet>
  const m = row.member
  const impact = removalImpact(m.id, transactions)
  const hasHistory = impact.count > 0
  // Recorded settlement payments: permanent delete would reinterpret them, so the database
  // refuses it; the UI never offers it.
  const blockedByPayments = impact.payments > 0
  const status = row.net === null ? null : settlementStatus(row.net)

  const remove = async () => {
    setBusy(true); setError(null)
    try { await onRemove(m.id); onClose() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const setActive = async (active: boolean) => {
    setBusy(true); setError(null)
    try { await onSetActive(m.id, active); if (active) setStep('view'); else onClose() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  const facts: { label: string; value: React.ReactNode; note?: string }[] = [
    { label: 'Put in kitty', value: fmt(row.putInKitty) },
    { label: 'Paid personally', value: fmt(row.paidPersonally) },
    ...(row.estShare !== null ? [{
      label: 'Est. share of trip budget', value: fmt(row.estShare),
      note: 'An estimate from the trip budget, not what anyone owes.',
    }] : []),
    ...(status ? [{
      label: 'Settlement', value: <span style={{ color: toneColor(c, status.tone) }}>{status.label}</span>,
    }] : []),
    { label: 'Transactions', value: impact.count },
  ]

  const errorBanner = error && (
    <div role="alert" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: c.badSoft, color: c.bad, font: `600 12px ${FONT}` }}>
      {error}
    </div>
  )

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 12px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar c={c} name={m.name} inactive={row.inactive} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ font: `800 20px ${FONT}`, color: c.ink, overflowWrap: 'anywhere' }}>{m.name}</span>
              <MemberBadges c={c} row={row} />
            </div>
            {m.email && !hideEmail && <div style={{ font: `500 13px ${FONT}`, color: c.muted, marginTop: 2, overflowWrap: 'anywhere' }}>{m.email}</div>}
          </div>
        </div>

        {step === 'view' ? (
          <>
            <div style={{ marginTop: 16, borderTop: `1px solid ${c.faint}` }}>
              {facts.map(f => (
                <div key={f.label} style={{ padding: '10px 0', borderBottom: `1px solid ${c.faint}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ font: `500 13px ${FONT}`, color: c.muted }}>{f.label}</span>
                    <span style={{ font: `700 13px ${FONT}`, color: c.ink, textAlign: 'right' }}>{f.value}</span>
                  </div>
                  {f.note && <div style={{ font: `500 11px ${FONT}`, color: c.muted, marginTop: 2 }}>{f.note}</div>}
                </div>
              ))}
            </div>
            {row.inactive && (
              <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 10 }}>
                Inactive: doesn't share the trip's costs. Their contributions and payments still count in Settlement.
              </div>
            )}

            {errorBanner}

            {(canEdit || canInvite) && (
              <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                {canEdit && row.inactive && (
                  <button onClick={() => setActive(true)} disabled={busy} style={{
                    flex: '1 1 140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '12px 0', borderRadius: 14, border: `1.5px solid ${c.faint}`, background: 'transparent',
                    color: c.ink, font: `700 14px ${FONT}`, cursor: 'pointer',
                  }}>
                    <RotateCcw size={15} /> Make active again
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => onEdit(m)} style={{
                    flex: '1 1 140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '12px 0', borderRadius: 14, border: 'none', background: c.accent, color: '#fff',
                    font: `700 14px ${FONT}`, cursor: 'pointer',
                  }}>
                    <Pencil size={15} /> Edit
                  </button>
                )}
                {canInvite && m.email && (
                  <button onClick={() => onInvite(m.email!)} style={{
                    flex: '1 1 140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '12px 0', borderRadius: 14, border: `1.5px solid ${c.faint}`, background: 'transparent',
                    color: c.ink, font: `700 14px ${FONT}`, cursor: 'pointer',
                  }}>
                    <Mail size={15} /> Invite to group
                  </button>
                )}
              </div>
            )}
            {canEdit && (row.inactive && blockedByPayments ? (
              <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 14, textAlign: 'center', lineHeight: 1.5 }}>
                {PAYMENTS_BLOCK_DELETE}
              </div>
            ) : (
              // Active with history → mark inactive. No history → plain delete. Inactive → only permanent delete is left.
              <button onClick={() => { setStep(!row.inactive && hasHistory ? 'deactivate' : 'delete'); setError(null) }} style={{
                display: 'block', margin: '14px auto 0', background: 'none', border: 'none', padding: '6px 10px',
                color: c.bad, font: `700 13px ${FONT}`, cursor: 'pointer',
              }}>
                {row.inactive ? 'Delete permanently' : 'Remove member'}
              </button>
            ))}
          </>
        ) : step === 'deactivate' ? (
          /* Remove = mark inactive. Nothing is deleted; it can be undone. */
          <div style={{ marginTop: 16 }}>
            <div role="alert" style={{ padding: 14, borderRadius: 14, background: c.surface2 }}>
              <div style={{ font: `800 15px ${FONT}`, color: c.ink }}>Remove {m.name}?</div>
              <div style={{ font: `500 13px ${FONT}`, color: c.ink, marginTop: 8, lineHeight: 1.55 }}>
                This member will no longer share trip costs. If they participated in the trip, keep them active. Their existing contributions, payments and settlement history will be preserved.
              </div>
              <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 8, lineHeight: 1.5 }}>
                They can't be picked for new entries, and you can make them active again at any time.
              </div>
            </div>

            {errorBanner}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setStep('view')} disabled={busy} style={{
                flex: 1, padding: '12px 0', borderRadius: 14, border: `1.5px solid ${c.faint}`, background: 'transparent',
                color: c.ink, font: `700 14px ${FONT}`, cursor: 'pointer',
              }}>
                Keep member
              </button>
              <button onClick={() => setActive(false)} disabled={busy} style={{
                flex: 1, padding: '12px 0', borderRadius: 14, border: 'none', background: busy ? c.faint : c.bad, color: '#fff',
                font: `700 14px ${FONT}`, cursor: busy ? 'default' : 'pointer',
              }}>
                {busy ? 'Removing…' : 'Remove member'}
              </button>
            </div>
            {blockedByPayments ? (
              <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>
                {PAYMENTS_BLOCK_DELETE}
              </div>
            ) : (
              <button onClick={() => { setStep('delete'); setError(null) }} style={{
                display: 'block', margin: '12px auto 0', background: 'none', border: 'none', padding: '6px 10px',
                color: c.muted, font: `600 12px ${FONT}`, cursor: 'pointer', textDecoration: 'underline',
              }}>
                Delete permanently instead
              </button>
            )}
          </div>
        ) : (
          /* Permanent delete — the hard delete, with its consequences spelled out */
          <div style={{ marginTop: 16 }}>
            {hasHistory ? (
              <div role="alert" style={{ padding: 14, borderRadius: 14, background: c.warnSoft, border: `1px solid ${c.warn}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `800 15px ${FONT}`, color: c.ink }}>
                  <AlertTriangle size={18} color={c.warn} style={{ flexShrink: 0 }} />
                  Deleting {m.name} permanently changes past records
                </div>
                <div style={{ font: `500 13px ${FONT}`, color: c.ink, marginTop: 8, lineHeight: 1.5 }}>
                  {m.name} has {impact.atLeast ? 'at least ' : ''}{impact.count} transaction{impact.count === 1 ? '' : 's'}. After deleting:
                </div>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, font: `500 13px ${FONT}`, color: c.ink, lineHeight: 1.55 }}>
                  {impact.contributed > 0 && <li>{impact.atLeast ? 'At least ' : ''}{fmt(impact.contributed)} that {m.name} put in the kitty will <strong>no longer be credited to {m.name}</strong>. Settlement will treat it as <strong>group money</strong>, shared by everyone who remains.</li>}
                  {impact.paidPersonally > 0 && <li>{impact.atLeast ? 'At least ' : ''}{fmt(impact.paidPersonally)} paid personally will look like it was paid from the Kitty.</li>}
                  <li>Settlement will no longer include {m.name}, so what they're owed or owe won't be shown.</li>
                  <li><strong>This can't be undone.</strong></li>
                </ul>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, font: `600 13px ${FONT}`, color: c.ink, cursor: 'pointer' }}>
                  <input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)}
                    style={{ width: 18, height: 18, marginTop: 1, accentColor: c.bad, flexShrink: 0 }} />
                  I understand. Delete {m.name} permanently.
                </label>
              </div>
            ) : (
              <div style={{ font: `600 14px ${FONT}`, color: c.ink, lineHeight: 1.5 }}>
                Remove {m.name} from this group? They have no transactions, so nothing else changes.
              </div>
            )}

            {errorBanner}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setStep('view'); setUnderstood(false); setError(null) }} disabled={busy} style={{
                flex: 1, padding: '12px 0', borderRadius: 14, border: `1.5px solid ${c.faint}`, background: 'transparent',
                color: c.ink, font: `700 14px ${FONT}`, cursor: 'pointer',
              }}>
                Keep member
              </button>
              <button onClick={remove} disabled={busy || (hasHistory && !understood)} style={{
                flex: 1, padding: '12px 0', borderRadius: 14, border: 'none',
                background: busy || (hasHistory && !understood) ? c.faint : c.bad, color: '#fff',
                font: `700 14px ${FONT}`, cursor: busy || (hasHistory && !understood) ? 'default' : 'pointer',
              }}>
                {busy ? 'Deleting…' : hasHistory ? 'Delete permanently' : 'Remove'}
              </button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
