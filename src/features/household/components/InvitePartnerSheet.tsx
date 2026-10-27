import { useState } from 'react'
import { Copy, Share2 } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import { buildInviteLink } from '../lib/invite'
import { householdErrorMessage } from '../lib/errors'
import type { HouseholdInvite } from '../types'
import { Button, ErrorText } from './ui'

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Screen 3 — invite partner. The raw token exists only in this component's
 *  state: the server returns it once and stores only its hash, so a closed sheet
 *  can't show it again — creating a new link replaces the old one. */
export function InvitePartnerSheet({ open, pendingInvite, now, onClose, onCreateInvite, onRevoke }: {
  open: boolean
  pendingInvite: HouseholdInvite | null
  /** snapshot time from useHousehold, for expiry */
  now: number
  onClose: () => void
  onCreateInvite: () => Promise<{ token: string; expiresAt: string }>
  onRevoke: (inviteId: string) => Promise<void>
}) {
  const c = useTheme()
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const close = () => { setLink(null); setError(null); setCopied(false); onClose() }

  const create = async () => {
    setBusy(true); setError(null); setCopied(false)
    try {
      const { token, expiresAt } = await onCreateInvite()
      setLink({ url: buildInviteLink(window.location.origin, token), expiresAt })
    } catch (err) {
      setError(householdErrorMessage(err, "Couldn't create an invite link. Try again."))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    if (!pendingInvite) return
    setBusy(true); setError(null)
    try {
      await onRevoke(pendingInvite.id)
      setLink(null)
    } catch (err) {
      setError(householdErrorMessage(err, "Couldn't cancel the invite. Try again."))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!link) return
    try { await navigator.clipboard.writeText(link.url); setCopied(true) }
    catch { setError('Copy failed — press and hold the link to copy it.') }
  }

  const share = async () => {
    if (!link) return
    try {
      await navigator.share({ title: 'Join my MoneyPlant household', text: 'Join my household on MoneyPlant to track our shared expenses:', url: link.url })
    } catch { /* dismissed, or sharing unavailable — Copy is right there */ }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const pendingStillValid = !!pendingInvite && new Date(pendingInvite.expires_at).getTime() > now

  return (
    <BottomSheet open={open} onClose={busy ? () => {} : close} zIndex={220} showHelpButton={false} dismissible={!busy}>
      <div style={{ padding: '0 4px 12px' }}>
        <h2 style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, margin: '0 0 6px' }}>Invite your partner</h2>

        {link ? (
          <>
            <p style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
              Send this link to your partner. They sign in (or sign up) and join.
            </p>
            <div style={{ background: c.surface2, borderRadius: 13, padding: '12px 14px', font: '600 12px ui-monospace, monospace', color: c.ink, wordBreak: 'break-all', userSelect: 'all', marginBottom: 12 }}>
              {link.url}
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              {canShare && <div style={{ flex: 1 }}><Button full onClick={share}><Share2 size={16} /> Share</Button></div>}
              <div style={{ flex: 1 }}><Button full kind={canShare ? 'secondary' : 'primary'} onClick={copy}><Copy size={16} /> {copied ? 'Copied' : 'Copy link'}</Button></div>
            </div>
            <BearerWarning expiresAt={link.expiresAt} />
          </>
        ) : pendingStillValid ? (
          <>
            <p style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
              An invite link is active until {fmtWhen(pendingInvite!.expires_at)}. For safety a link is shown only once — if you no longer have it, create a new one. The old link stops working.
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              <Button full busy={busy} onClick={create}>Create a new link</Button>
              <Button full kind="danger" busy={busy} onClick={revoke}>Cancel the invite</Button>
            </div>
          </>
        ) : (
          <>
            <p style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
              Create a private link and send it to your partner on WhatsApp or anywhere else. It works once and expires in 7 days.
            </p>
            <Button full busy={busy} onClick={create}>{busy ? 'Creating…' : 'Create invite link'}</Button>
          </>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </BottomSheet>
  )
}

function BearerWarning({ expiresAt }: { expiresAt: string }) {
  const c = useTheme()
  return (
    <div role="note" style={{ background: c.warnSoft, borderRadius: 13, padding: '11px 13px', font: '600 12px Plus Jakarta Sans', color: c.ink, lineHeight: 1.5 }}>
      Anyone who opens this link can join your household until it's used or expires on {fmtWhen(expiresAt)}. Send it only to your partner. You can cancel it anytime from Members.
    </div>
  )
}
