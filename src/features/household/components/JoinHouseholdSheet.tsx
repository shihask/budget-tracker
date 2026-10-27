import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import { clearPendingInvite } from '../lib/invite'
import { checkName, DISPLAY_NAME_MAX } from '../lib/validation'
import { householdErrorMessage, isGuestRefusal } from '../lib/errors'
import type { InvitePreview } from '../types'
import { Button, ErrorText, FieldLabel } from './ui'
import { useFieldStyle } from '../hooks/usePageShell'

type View =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'invalid' }
  | { kind: 'guest' }
  | { kind: 'ready'; preview: Extract<InvitePreview, { valid: true }> }

/** Accepting an invite link. The token came from sessionStorage (index.html put it
 *  there); every way out of this sheet except "save your account first" clears it. */
export function JoinHouseholdSheet({ token, guest, defaultName, onPreview, onAccept, onSaveGuest, onDone }: {
  token: string
  guest: boolean
  defaultName: string
  onPreview: (token: string) => Promise<InvitePreview>
  onAccept: (token: string, displayName: string) => Promise<void>
  onSaveGuest: () => void
  /** joined = true after a successful accept */
  onDone: (joined: boolean) => void
}) {
  const c = useTheme()
  const field = useFieldStyle()
  const [view, setView] = useState<View>(guest ? { kind: 'guest' } : { kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [name, setName] = useState(defaultName)
  const [nameError, setNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (guest) return
    let cancelled = false
    onPreview(token)
      .then(p => {
        if (cancelled) return
        if (!p.valid) { clearPendingInvite(); setView({ kind: 'invalid' }); return }
        if (p.already_member) { clearPendingInvite(); onDone(true); return }
        setView({ kind: 'ready', preview: p })
      })
      .catch(err => {
        if (cancelled) return
        if (isGuestRefusal(err)) setView({ kind: 'guest' })
        else setView({ kind: 'error', message: householdErrorMessage(err, "Couldn't check this invite. Try again.") })
      })
    return () => { cancelled = true }
  }, [token, guest, onPreview, onDone, attempt])

  const dismiss = () => { if (busy) return; clearPendingInvite(); onDone(false) }

  const join = async () => {
    const n = checkName(name, DISPLAY_NAME_MAX, 'your name')
    setNameError(n.ok ? null : n.error)
    if (!n.ok) return
    setBusy(true); setFormError(null)
    try {
      await onAccept(token, n.value)
      clearPendingInvite()
      onDone(true)
    } catch (err) {
      const message = householdErrorMessage(err, "Couldn't join the household. Try again.")
      // A dead link stays dead: drop it so it isn't retried on the next open.
      if ((err as { code?: string })?.code === 'PT422' && /no longer valid/i.test(message)) {
        clearPendingInvite(); setView({ kind: 'invalid' })
      } else {
        setFormError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <div style={{ textAlign: 'center', marginBottom: 16 }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
        <Users size={24} color={c.accent} />
      </div>
    </div>
  )

  return (
    <BottomSheet open onClose={view.kind === 'guest' ? () => onDone(false) : dismiss} zIndex={230} showHelpButton={false} dismissible={!busy}>
      <div style={{ padding: '0 4px 12px' }} aria-live="polite">
        {header}
        {view.kind === 'loading' && (
          <p style={{ font: '600 14px Plus Jakarta Sans', color: c.muted, textAlign: 'center' }}>Checking your invite…</p>
        )}

        {view.kind === 'error' && (
          <>
            <ErrorText>{view.message}</ErrorText>
            <div style={{ height: 14 }} />
            <Button full onClick={() => { setView({ kind: 'loading' }); setAttempt(a => a + 1) }}>Try again</Button>
          </>
        )}

        {view.kind === 'invalid' && (
          <>
            <h2 style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, textAlign: 'center', margin: '0 0 6px' }}>This invite link is no longer valid</h2>
            <p style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, textAlign: 'center', margin: '0 0 18px', lineHeight: 1.5 }}>
              It may have been used, cancelled or expired. Ask your partner to send a new one.
            </p>
            <Button full kind="secondary" onClick={() => onDone(false)}>OK</Button>
          </>
        )}

        {view.kind === 'guest' && (
          <>
            <h2 style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, textAlign: 'center', margin: '0 0 6px' }}>Save your account to join</h2>
            <p style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, textAlign: 'center', margin: '0 0 18px', lineHeight: 1.5 }}>
              You've been invited to a MoneyPlant household. A household is shared with another person, so it needs a saved account. Your invite will be waiting.
            </p>
            <Button full onClick={() => { onDone(false); onSaveGuest() }}>Save my account</Button>
            <div style={{ height: 8 }} />
            <Button full kind="quiet" onClick={dismiss}>Not now</Button>
          </>
        )}

        {view.kind === 'ready' && (
          <form onSubmit={e => { e.preventDefault(); void join() }}>
            <h2 style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, textAlign: 'center', margin: '0 0 6px' }}>
              {view.preview.inviter_display_name} invited you to “{view.preview.household_name}”
            </h2>
            <p style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, textAlign: 'center', margin: '0 0 16px', lineHeight: 1.5 }}>
              You'll both see the income, expenses and budgets added to the household. Your personal accounts and transactions stay private.
            </p>
            {view.preview.in_other_household ? (
              <>
                <ErrorText>You're already in another household. Leave it first (Household → Members), then open this link again.</ErrorText>
                <div style={{ height: 14 }} />
                <Button full kind="secondary" onClick={dismiss}>OK</Button>
              </>
            ) : (
              <>
                <FieldLabel htmlFor="hh-join-name">Your name, as your partner will see it</FieldLabel>
                <input id="hh-join-name" value={name} onChange={e => setName(e.target.value)} maxLength={DISPLAY_NAME_MAX}
                  autoComplete="given-name" aria-invalid={!!nameError} style={field} />
                <ErrorText>{nameError}</ErrorText>
                <ErrorText>{formError}</ErrorText>
                <div style={{ height: 16 }} />
                <Button type="submit" full busy={busy}>{busy ? 'Joining…' : 'Join household'}</Button>
                <div style={{ height: 8 }} />
                <Button full kind="quiet" onClick={dismiss}>Not now</Button>
              </>
            )}
          </form>
        )}
      </div>
    </BottomSheet>
  )
}
