import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme-context'
import { OTP_LENGTH, displayIdentifier } from '@/lib/auth-identifier'
import { isGuest, guestSavedOnKey, guestGoogleLinkKey } from '@/lib/guest'
import { trackStep } from '@/lib/funnel'
import { localIso } from '@/lib/utils'
import { inAppBrowserName } from '@/lib/browser-env'
import { useAddSignInMethod } from '@/hooks/useAddSignInMethod'
import { BottomSheet } from './BottomSheet'

/**
 * Save a guest account: link an email or mobile to the guest's own uid
 * (updateUser → code → verifyOtp email_change / phone_change), so every entry
 * stays where it is. After the code, App sees a permanent user with no name and
 * shows CompleteProfilePage (name + password), the same step as any new sign-up.
 *
 * A successful verifyOtp alone isn't proof the account is permanent: the sheet
 * refreshes the session and only reports success once the new token says
 * is_anonymous = false.
 *
 * Google: linkIdentity attaches a Google sign-in to the same uid (needs Manual
 * Linking on in Supabase Auth). It leaves the app; App finishes the save on
 * return (see guestGoogleLinkKey). A Google account that already has a
 * MoneyPlant account comes back as identity_already_exists → `googleTaken`.
 */
export function GuestSaveSheet({ open, userId, googleTaken = false, onClose, onSignInInstead }: {
  open: boolean
  userId: string
  /** Back from Google, which was already linked to another MoneyPlant account. */
  googleTaken?: boolean
  onClose: () => void
  /** The address already has an account: leave guest mode and sign in to it. */
  onSignInInstead: () => void
}) {
  const c = useTheme()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  // Google blocks OAuth in social apps' WebViews (403 disallowed_useragent).
  const inAppBrowser = inAppBrowserName()
  const {
    input, setInput, otp, setOtp, sentTo, resendIn, loading, error, taken,
    submitAddress, verifyCode, resend, changeAddress,
  } = useAddSignInMethod({
    accept: 'any',
    guest: true,
    onVerified: async () => {
      const { data, error } = await supabase.auth.refreshSession()
      if (error || !data.user || isGuest(data.user)) {
        throw new Error("Your code was accepted, but the account isn't saved yet. Try Verify again in a moment.")
      }
      trackStep('guest_saved')
      try { localStorage.setItem(guestSavedOnKey(userId), localIso(new Date())) } catch { /* only the return-visit step is lost */ }
      // App now swaps to CompleteProfilePage (no name yet); this sheet unmounts with it.
    },
  })

  const linkGoogle = async () => {
    setGoogleError(null); setGoogleLoading(true)
    try { localStorage.setItem(guestGoogleLinkKey(userId), '1') } catch { /* only guest_saved goes uncounted */ }
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
    })
    if (error) {
      try { localStorage.removeItem(guestGoogleLinkKey(userId)) } catch { /* nothing to undo */ }
      setGoogleError(error.code === 'manual_linking_disabled'
        ? 'Saving with Google isn’t available right now. Use your email or mobile number instead.'
        : error.message)
      setGoogleLoading(false)
    }
    // On success the browser is already leaving for Google.
  }
  const shownError = error ?? googleError ?? (googleTaken && !sentTo
    ? 'That Google account already has a MoneyPlant account. Use a different one, or sign in to it instead.'
    : null)

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
    <BottomSheet open={open} onClose={onClose} showHelpButton={false} zIndex={210}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
          {sentTo ? 'Enter the code' : 'Create your free account'}
        </div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16, lineHeight: 1.5 }}>
          {sentTo
            ? <>We sent a 6-digit code to <strong style={{ color: c.ink }}>{displayIdentifier(sentTo)}</strong></>
            : 'Your guest entries stay with you. Add your email or mobile number and we’ll send a code to confirm it.'}
        </div>
        {shownError && (
          <div role="alert" style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: 10, padding: '9px 12px', font: '600 12px Plus Jakarta Sans', marginBottom: 12, lineHeight: 1.45 }}>
            {shownError}
          </div>
        )}
        {sentTo ? (
          <>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" value={otp}
              onChange={e => setOtp(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void verifyCode() }}
              placeholder="••••••" style={{ ...inp, letterSpacing: '0.4em', textAlign: 'center' }} autoFocus />
            <button onClick={() => void verifyCode()} disabled={loading || otp.length !== OTP_LENGTH} style={primary(loading || otp.length !== OTP_LENGTH)}>
              {loading ? 'Please wait…' : 'Verify'}
            </button>
            <button onClick={resend} style={textBtn}>
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </button>
            <button onClick={changeAddress} style={textBtn}>&larr; Use a different email or number</button>
          </>
        ) : (
          <>
            <input type="text" inputMode="email" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAddress() }}
              placeholder="you@example.com or 98765 43210"
              autoComplete="username" autoCapitalize="none" spellCheck={false} style={inp} autoFocus />
            <button onClick={submitAddress} disabled={loading || !input.trim()} style={primary(loading || !input.trim())}>
              {loading ? 'Please wait…' : 'Send code'}
            </button>
            {(taken || googleTaken) && (
              <button onClick={onSignInInstead} style={textBtn}>Sign in to that account instead</button>
            )}
            {!inAppBrowser && (<>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 12px' }}>
                <div style={{ flex: 1, height: 1, background: c.faint }} />
                <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>or</span>
                <div style={{ flex: 1, height: 1, background: c.faint }} />
              </div>
              <button onClick={() => void linkGoogle()} disabled={googleLoading || loading} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                background: c.surface, border: `1.5px solid ${c.faint}`, borderRadius: 12, padding: 12,
                font: '700 14px Plus Jakarta Sans', color: c.ink, cursor: googleLoading ? 'not-allowed' : 'pointer',
              }}>
                <GoogleMark />
                {googleLoading ? 'Opening Google…' : 'Continue with Google'}
              </button>
            </>)}
          </>
        )}
      </div>
    </BottomSheet>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.860-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  )
}
