import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { type Identifier, OTP_LENGTH, OTP_RESEND_SECONDS, parseIdentifier } from '@/lib/auth-identifier'
import { isTakenError, sendCodeErrorMessage, verifyCodeErrorMessage } from '@/lib/add-sign-in-method'

type Kind = Identifier['kind']

/**
 * Adds an email or mobile to the signed-in account: updateUser({ email | phone })
 * sends a code to the *new* address, verifyOtp(type 'email_change' |
 * 'phone_change') confirms it. Supabase then emits USER_UPDATED and App re-sets
 * the session. The uid never changes — that is what lets a guest save their
 * entries without moving a row.
 *
 * `accept` is the kind the form takes ('any' = the one box that reads either).
 * `onVerified` runs after the code is accepted; if it throws, its message is
 * shown and the form stays on the code step.
 */
export function useAddSignInMethod({ accept, guest = false, onVerified }: {
  accept: Kind | 'any' | null
  guest?: boolean
  onVerified: (kind: Kind) => void | Promise<void>
}) {
  const [input, setInputRaw] = useState('')
  const [sentTo, setSentTo] = useState<Identifier | null>(null)
  const [otp, setOtpRaw] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The address belongs to another account — the guest sheet offers "sign in to it". */
  const [taken, setTaken] = useState(false)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const sendCode = async (id: Identifier) => {
    setLoading(true); setError(null); setTaken(false)
    const { error } = await supabase.auth.updateUser(id.kind === 'email' ? { email: id.value } : { phone: id.value })
    if (error) {
      setError(sendCodeErrorMessage(error, id.kind, { guest }))
      setTaken(isTakenError(error))
    } else {
      setSentTo(id); setOtpRaw(''); setResendIn(OTP_RESEND_SECONDS)
    }
    setLoading(false)
  }

  const submitAddress = () => {
    const id = parseIdentifier(input)
    if (!id || (accept !== 'any' && id.kind !== accept)) {
      setError(accept === 'phone' ? 'Enter a valid 10-digit mobile number.'
        : accept === 'email' ? 'Enter a valid email address.'
          : 'Enter a valid email or 10-digit mobile number.')
      return
    }
    void sendCode(id)
  }

  const verifyCode = async () => {
    if (!sentTo || otp.length !== OTP_LENGTH || loading) return
    setLoading(true); setError(null)
    const { error } = await supabase.auth.verifyOtp(sentTo.kind === 'email'
      ? { email: sentTo.value, token: otp, type: 'email_change' }
      : { phone: sentTo.value, token: otp, type: 'phone_change' })
    if (error) {
      setLoading(false)
      setError(verifyCodeErrorMessage(error))
      return
    }
    try {
      await onVerified(sentTo.kind)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    }
    setLoading(false)
  }

  const resend = () => { if (sentTo && resendIn <= 0 && !loading) void sendCode(sentTo) }
  const changeAddress = () => { setSentTo(null); setOtpRaw(''); setError(null); setTaken(false) }

  return {
    input, setInput: (v: string) => { setInputRaw(v); setError(null); setTaken(false) },
    otp, setOtp: (v: string) => setOtpRaw(v.replace(/\D/g, '').slice(0, OTP_LENGTH)),
    sentTo, resendIn, loading, error, taken,
    submitAddress, verifyCode, resend, changeAddress,
  }
}
