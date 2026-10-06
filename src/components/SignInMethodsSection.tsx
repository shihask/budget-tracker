import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme-context'
import {
  type Identifier, OTP_LENGTH, OTP_RESEND_SECONDS,
  displayIdentifier, displayStoredPhone, isPhoneAuthOff, parseIdentifier,
} from '@/lib/auth-identifier'
import { BottomSheet } from './BottomSheet'

type Kind = Identifier['kind']

/**
 * Settings → Sign-in methods: lets an email (or Google) account add a mobile
 * number, and a mobile account add an email, so either signs in to the same
 * account with the same password. Add-only in v1 — changing an existing email
 * would need Supabase's two-inbox confirmation.
 *
 * Linking is updateUser({ phone | email }) → a code to the *new* address →
 * verifyOtp(type 'phone_change' | 'email_change'). Supabase emits USER_UPDATED,
 * App re-sets the session, and `user` arrives here with the new value.
 */
export function SignInMethodsSection({ user, rowStyle, labelStyle }: {
  user: User
  rowStyle: React.CSSProperties
  labelStyle: React.CSSProperties
}) {
  const c = useTheme()
  const [adding, setAdding] = useState<Kind | null>(null)
  const [justAdded, setJustAdded] = useState<Kind | null>(null)
  // Bumped on every open so the sheet remounts with an empty form.
  const [sheetKey, setSheetKey] = useState(0)

  const rows: { kind: Kind; label: string; value: string }[] = [
    { kind: 'email', label: 'Email', value: user.email ?? '' },
    { kind: 'phone', label: 'Mobile number', value: displayStoredPhone(user.phone) },
  ]

  return (
    <>
      {rows.map(r => (
        <div key={r.kind} style={rowStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={labelStyle}>{r.label}</div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: r.value ? c.sub : c.muted, marginTop: 2, wordBreak: 'break-all' }}>
              {r.value || 'Not added'}
              {justAdded === r.kind && r.value && <span style={{ color: c.good }}> · Added</span>}
            </div>
          </div>
          {!r.value && (
            <button onClick={() => { setJustAdded(null); setSheetKey(k => k + 1); setAdding(r.kind) }} style={{
              flexShrink: 0, background: 'none', border: `1.5px solid ${c.accent}`, borderRadius: 999,
              padding: '5px 14px', font: '700 12px Plus Jakarta Sans', color: c.accent, cursor: 'pointer',
            }}>
              Add
            </button>
          )}
        </div>
      ))}
      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, padding: '8px 0 4px', lineHeight: 1.5 }}>
        Sign in with either one and the same password. Signed up with Google? Use "Forgot password?" on the
        sign-in screen once to set a password, or "Sign in with a code".
      </div>
      <AddSignInMethodSheet
        key={sheetKey}
        kind={adding}
        onClose={() => setAdding(null)}
        onAdded={k => { setAdding(null); setJustAdded(k) }}
      />
    </>
  )
}

function AddSignInMethodSheet({ kind, onClose, onAdded }: {
  kind: Kind | null
  onClose: () => void
  onAdded: (kind: Kind) => void
}) {
  const c = useTheme()
  const [input, setInput] = useState('')
  const [sentTo, setSentTo] = useState<Identifier | null>(null)
  const [otp, setOtp] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const noun = kind === 'phone' ? 'number' : 'email'

  const sendCode = async (id: Identifier) => {
    setLoading(true); setError(null)
    const { error } = await supabase.auth.updateUser(id.kind === 'email' ? { email: id.value } : { phone: id.value })
    if (error) {
      setError(isPhoneAuthOff(error.message) ? "Adding a mobile number isn't available yet."
        : /already|exists/i.test(error.message) ? `This ${noun} is already used by another MoneyPlant account.`
          : error.message)
    } else {
      setSentTo(id); setOtp(''); setResendIn(OTP_RESEND_SECONDS)
    }
    setLoading(false)
  }

  const handleContinue = () => {
    const id = parseIdentifier(input)
    if (!id || id.kind !== kind) {
      setError(kind === 'phone' ? 'Enter a valid 10-digit mobile number.' : 'Enter a valid email address.')
      return
    }
    sendCode(id)
  }

  const verifyCode = async () => {
    if (!sentTo || otp.length !== OTP_LENGTH) return
    setLoading(true); setError(null)
    const { error } = await supabase.auth.verifyOtp(sentTo.kind === 'email'
      ? { email: sentTo.value, token: otp, type: 'email_change' }
      : { phone: sentTo.value, token: otp, type: 'phone_change' })
    setLoading(false)
    if (error) {
      setError(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired.' : error.message)
      return
    }
    onAdded(sentTo.kind)
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`,
    borderRadius: 12, padding: '12px 14px', font: '600 15px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const primary = (disabled: boolean): React.CSSProperties => ({
    width: '100%', marginTop: 12, border: 'none', borderRadius: 12, padding: '13px',
    background: disabled ? c.faint : c.accent, color: disabled ? c.muted : '#fff',
    font: '700 14px Plus Jakarta Sans', cursor: disabled ? 'not-allowed' : 'pointer',
  })
  const textBtn: React.CSSProperties = {
    display: 'block', margin: '12px auto 0', background: 'none', border: 'none',
    color: c.muted, font: '600 13px Plus Jakarta Sans', cursor: 'pointer',
  }

  return (
    <BottomSheet open={kind !== null} onClose={onClose} showHelpButton={false} zIndex={210}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
          {sentTo ? 'Enter the code' : kind === 'phone' ? 'Add mobile number' : 'Add email'}
        </div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16, lineHeight: 1.5 }}>
          {sentTo
            ? <>We sent a 6-digit code to <strong style={{ color: c.ink }}>{displayIdentifier(sentTo)}</strong></>
            : `We'll send a 6-digit code to confirm it's yours.`}
        </div>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: 10, padding: '9px 12px', font: '600 12px Plus Jakarta Sans', marginBottom: 12 }}>
            {error}
          </div>
        )}
        {sentTo ? (
          <>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
              onKeyDown={e => { if (e.key === 'Enter') verifyCode() }}
              placeholder="••••••" style={{ ...inp, letterSpacing: '0.4em', textAlign: 'center' }} autoFocus />
            <button onClick={verifyCode} disabled={loading || otp.length !== OTP_LENGTH} style={primary(loading || otp.length !== OTP_LENGTH)}>
              {loading ? 'Please wait…' : 'Verify'}
            </button>
            <button onClick={() => { if (resendIn <= 0 && !loading) sendCode(sentTo) }} style={textBtn}>
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </button>
            <button onClick={() => { setSentTo(null); setOtp(''); setError(null) }} style={textBtn}>
              &larr; Use a different {noun}
            </button>
          </>
        ) : (
          <>
            <input type={kind === 'phone' ? 'tel' : 'email'} inputMode={kind === 'phone' ? 'numeric' : 'email'}
              value={input} onChange={e => { setInput(e.target.value); setError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') handleContinue() }}
              placeholder={kind === 'phone' ? '98765 43210' : 'you@example.com'}
              autoComplete={kind === 'phone' ? 'tel-national' : 'email'} autoCapitalize="none" spellCheck={false}
              style={inp} autoFocus />
            <button onClick={handleContinue} disabled={loading || !input.trim()} style={primary(loading || !input.trim())}>
              {loading ? 'Please wait…' : 'Send code'}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
