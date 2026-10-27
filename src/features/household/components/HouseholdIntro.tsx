import { useState } from 'react'
import { Users } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import { checkName, DISPLAY_NAME_MAX, HOUSEHOLD_NAME_MAX } from '../lib/validation'
import { householdErrorMessage } from '../lib/errors'
import { Button, ErrorText, FieldLabel } from './ui'
import { useFieldStyle } from '../hooks/usePageShell'
import { PrivacyExplainer } from './PrivacyExplainer'

/** Screen 1 — no household yet: what it is, what's shared, and the way in. */
export function HouseholdIntro({ guest, onCreate, onSaveGuest }: {
  guest: boolean
  onCreate: () => void
  onSaveGuest: () => void
}) {
  const c = useTheme()
  return (
    <div style={{ padding: '28px 4px 8px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ width: 60, height: 60, borderRadius: 18, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Users size={28} color={c.accent} />
        </div>
        <h2 style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Manage shared money together</h2>
        <p style={{ font: '500 14px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, margin: 0 }}>
          Track the income and expenses you share with your partner — groceries, rent, bills — against one monthly household budget.
        </p>
      </div>

      <PrivacyExplainer />

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {guest ? (
          <>
            <Button full onClick={onSaveGuest}>Save your account to start</Button>
            <p style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
              A household is shared with another person, so it needs a saved account.
            </p>
          </>
        ) : (
          <>
            <Button full onClick={onCreate}>Create a household</Button>
            <p style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
              Got an invite? Open the link your partner sent you.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** Screen 2 — create household. */
export function CreateHouseholdSheet({ open, defaultName, onClose, onCreate }: {
  open: boolean
  defaultName: string
  onClose: () => void
  onCreate: (name: string, displayName: string) => Promise<void>
}) {
  const c = useTheme()
  const field = useFieldStyle()
  const [name, setName] = useState('Our Home')
  const [displayName, setDisplayName] = useState(defaultName)
  const [errors, setErrors] = useState<{ name?: string; displayName?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const n = checkName(name, HOUSEHOLD_NAME_MAX, 'a household name')
    const d = checkName(displayName, DISPLAY_NAME_MAX, 'your name')
    setErrors({ name: n.ok ? undefined : n.error, displayName: d.ok ? undefined : d.error })
    if (!n.ok || !d.ok) return
    setBusy(true)
    try {
      await onCreate(n.value, d.value)
      onClose()
    } catch (err) {
      setErrors({ form: householdErrorMessage(err, "Couldn't create the household. Try again.") })
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={busy ? () => {} : onClose} zIndex={220} showHelpButton={false} dismissible={!busy}>
      <form onSubmit={e => { e.preventDefault(); void submit() }} style={{ padding: '0 4px 12px' }}>
        <h2 style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, margin: '0 0 4px' }}>Create a household</h2>
        <p style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, margin: '0 0 18px', lineHeight: 1.5 }}>
          You can invite your partner right after.
        </p>
        <FieldLabel htmlFor="hh-name">Household name</FieldLabel>
        <input id="hh-name" value={name} onChange={e => setName(e.target.value)} maxLength={HOUSEHOLD_NAME_MAX}
          aria-invalid={!!errors.name} aria-describedby={errors.name ? 'hh-name-err' : undefined} style={field} />
        <ErrorText id="hh-name-err">{errors.name}</ErrorText>
        <div style={{ height: 14 }} />
        <FieldLabel htmlFor="hh-you">Your name, as your partner will see it</FieldLabel>
        <input id="hh-you" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={DISPLAY_NAME_MAX}
          autoComplete="given-name" aria-invalid={!!errors.displayName} aria-describedby={errors.displayName ? 'hh-you-err' : undefined} style={field} />
        <ErrorText id="hh-you-err">{errors.displayName}</ErrorText>
        <ErrorText>{errors.form}</ErrorText>
        <div style={{ height: 18 }} />
        <Button type="submit" full busy={busy}>{busy ? 'Creating…' : 'Create household'}</Button>
      </form>
    </BottomSheet>
  )
}
