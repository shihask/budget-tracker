import { useState } from 'react'
import { Pencil, UserPlus } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import { checkName, HOUSEHOLD_NAME_MAX } from '../lib/validation'
import { householdErrorMessage } from '../lib/errors'
import type { Household, HouseholdInvite, HouseholdMe, HouseholdMember } from '../types'
import { Button, Card, ErrorText, FieldLabel, SectionLabel } from './ui'
import { useFieldStyle } from '../hooks/usePageShell'
import { PrivacyExplainer } from './PrivacyExplainer'

const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Screen 8 — members, invitation status, privacy, leave / remove. */
export function HouseholdMembers({ household, me, members, pendingInvite, now, onInvite, onRevokeInvite, onRename, onLeave, onRemove, confirm }: {
  household: Household
  me: HouseholdMe
  members: HouseholdMember[]
  pendingInvite: HouseholdInvite | null
  /** snapshot time from useHousehold, for expiry */
  now: number
  onInvite: () => void
  onRevokeInvite: (id: string) => Promise<void>
  onRename: (name: string) => Promise<void>
  onLeave: () => Promise<void>
  onRemove: (member: HouseholdMember) => Promise<void>
  confirm: (message: string, opts?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>
}) {
  const c = useTheme()
  const [renameOpen, setRenameOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const active = members.filter(m => m.status === 'active')
  const former = members.filter(m => m.status !== 'active')
  const partner = active.find(m => m.id !== me.member_id) ?? null
  const isOwner = me.role === 'owner'
  const pendingValid = !!pendingInvite && new Date(pendingInvite.expires_at).getTime() > now

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true); setError(null)
    try { await fn() } catch (err) { setError(householdErrorMessage(err, fallback)) } finally { setBusy(false) }
  }

  const leave = async () => {
    const alone = active.length <= 1
    const ok = await confirm(
      alone
        ? `Leave "${household.name}"? You're the only member, so the household will be closed. Its shared entries are kept but no one will be able to open them. This can't be undone from the app.`
        : `Leave "${household.name}"? You'll lose access to its shared entries and budgets right away. ${partner?.display_name ?? 'Your partner'} keeps them${isOwner ? ' and becomes the owner' : ''}. Your personal finances aren't affected.`,
      { confirmLabel: 'Leave household', danger: true },
    )
    if (ok) await run(onLeave, "Couldn't leave the household. Try again.")
  }

  const remove = async (m: HouseholdMember) => {
    const ok = await confirm(
      `Remove ${m.display_name} from "${household.name}"? They lose access to the shared entries and budgets right away. Entries they added stay in the household.`,
      { confirmLabel: 'Remove', danger: true },
    )
    if (ok) await run(() => onRemove(m), "Couldn't remove the member. Try again.")
  }

  return (
    <div>
      <SectionLabel>Household</SectionLabel>
      <Card style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>{household.name}</div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Shared household · {active.length} {active.length === 1 ? 'member' : 'members'}</div>
        </div>
        <button type="button" onClick={() => setRenameOpen(true)} aria-label="Rename household"
          style={{ width: 36, height: 36, borderRadius: 11, border: 'none', background: c.surface2, color: c.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Pencil size={15} />
        </button>
      </Card>

      <SectionLabel>Members</SectionLabel>
      <Card style={{ padding: '4px 14px', marginBottom: 12 }}>
        {active.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${c.faint}` }}>
            <span aria-hidden style={{ width: 36, height: 36, borderRadius: 999, background: c.accentSoft, color: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 14px Plus Jakarta Sans' }}>
              {m.display_name.slice(0, 1).toUpperCase()}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', font: '700 14px Plus Jakarta Sans', color: c.ink }}>{m.display_name}{m.id === me.member_id ? ' (you)' : ''}</span>
              <span style={{ display: 'block', font: '600 12px Plus Jakarta Sans', color: c.muted }}>{m.role === 'owner' ? 'Owner' : 'Member'}</span>
            </span>
            {isOwner && m.id !== me.member_id && (
              <Button kind="quiet" onClick={() => void remove(m)} disabled={busy} ariaLabel={`Remove ${m.display_name}`}>Remove</Button>
            )}
          </div>
        ))}

        {active.length < 2 && (
          <div style={{ padding: '12px 0' }}>
            {pendingValid ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, font: '600 13px Plus Jakarta Sans', color: c.sub, lineHeight: 1.45 }}>
                  Invite link sent · waiting until {fmtWhen(pendingInvite!.expires_at)}
                </span>
                <Button kind="quiet" onClick={() => void run(() => onRevokeInvite(pendingInvite!.id), "Couldn't cancel the invite.")} disabled={busy}>Cancel</Button>
              </div>
            ) : (
              <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>
                {pendingInvite && pendingInvite.status === 'pending' ? 'Your last invite link expired.' : 'Your partner hasn\'t joined yet.'}
              </span>
            )}
            <div style={{ height: 10 }} />
            <Button full onClick={onInvite}><UserPlus size={16} /> {pendingValid ? 'Manage invite link' : 'Invite your partner'}</Button>
          </div>
        )}
      </Card>
      {former.length > 0 && (
        <p style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, margin: '0 0 20px 4px' }}>
          {former.length} former {former.length === 1 ? 'member' : 'members'} — their entries stay in the household.
        </p>
      )}

      <div style={{ height: 8 }} />
      <SectionLabel>What's shared</SectionLabel>
      <PrivacyExplainer />

      <div style={{ height: 24 }} />
      <ErrorText>{error}</ErrorText>
      <Button full kind="danger" onClick={() => void leave()} disabled={busy}>Leave household</Button>

      <RenameSheet key={household.name} open={renameOpen} current={household.name} onClose={() => setRenameOpen(false)} onSave={onRename} />
    </div>
  )
}

function RenameSheet({ open, current, onClose, onSave }: { open: boolean; current: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const c = useTheme()
  const field = useFieldStyle()
  const [name, setName] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const n = checkName(name, HOUSEHOLD_NAME_MAX, 'a household name')
    if (!n.ok) { setError(n.error); return }
    setBusy(true); setError(null)
    try { await onSave(n.value); onClose() }
    catch (err) { setError(householdErrorMessage(err, "Couldn't rename. Try again.")) }
    finally { setBusy(false) }
  }
  return (
    <BottomSheet open={open} onClose={busy ? () => {} : onClose} zIndex={220} showHelpButton={false} dismissible={!busy}>
      <form onSubmit={e => { e.preventDefault(); void submit() }} style={{ padding: '0 4px 12px' }}>
        <h2 style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, margin: '0 0 14px' }}>Rename household</h2>
        <FieldLabel htmlFor="hh-rename">Household name</FieldLabel>
        <input id="hh-rename" value={name} onChange={e => setName(e.target.value)} maxLength={HOUSEHOLD_NAME_MAX} style={field} />
        <ErrorText>{error}</ErrorText>
        <div style={{ height: 16 }} />
        <Button type="submit" full busy={busy}>Save</Button>
      </form>
    </BottomSheet>
  )
}
