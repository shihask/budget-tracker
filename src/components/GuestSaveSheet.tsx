import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme-context'
import { OTP_LENGTH, displayIdentifier } from '@/lib/auth-identifier'
import { isGuest, guestSavedOnKey } from '@/lib/guest'
import { trackStep } from '@/lib/funnel'
import { localIso } from '@/lib/utils'
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
 */
export function GuestSaveSheet({ open, userId, onClose, onSignInInstead }: {
  open: boolean
  userId: string
  onClose: () => void
  /** The address already has an account: leave guest mode and sign in to it. */
  onSignInInstead: () => void
}) {
  const c = useTheme()
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
          {sentTo ? 'Enter the code' : 'Save your account'}
        </div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16, lineHeight: 1.5 }}>
          {sentTo
            ? <>We sent a 6-digit code to <strong style={{ color: c.ink }}>{displayIdentifier(sentTo)}</strong></>
            : 'Keep your entries and reach them from any device. Add your email or mobile number and we’ll send a code to confirm it.'}
        </div>
        {error && (
          <div role="alert" style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: 10, padding: '9px 12px', font: '600 12px Plus Jakarta Sans', marginBottom: 12, lineHeight: 1.45 }}>
            {error}
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
            {taken && (
              <button onClick={onSignInInstead} style={textBtn}>Sign in to that account instead</button>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  )
}
