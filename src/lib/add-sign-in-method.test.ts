import { describe, expect, it } from 'vitest'
import { isSessionGoneError, isTakenError, sendCodeErrorMessage, verifyCodeErrorMessage } from './add-sign-in-method'

describe('isTakenError', () => {
  it('matches the Supabase codes and the older message-only form', () => {
    expect(isTakenError({ code: 'email_exists', message: 'x' })).toBe(true)
    expect(isTakenError({ code: 'phone_exists', message: 'x' })).toBe(true)
    expect(isTakenError({ message: 'A user with this email address has already been registered' })).toBe(true)
    expect(isTakenError({ message: 'Network error' })).toBe(false)
  })
})

describe('sendCodeErrorMessage', () => {
  it('says an address is taken, with the guest version naming the way out', () => {
    const err = { code: 'email_exists', message: 'Email address already registered' }
    expect(sendCodeErrorMessage(err, 'email')).toBe('This email is already used by another MoneyPlant account.')
    expect(sendCodeErrorMessage(err, 'email', { guest: true })).toMatch(/already has a MoneyPlant account. Accounts can't be merged/)
    expect(sendCodeErrorMessage({ code: 'phone_exists', message: 'x' }, 'phone', { guest: true })).toMatch(/^This number/)
  })

  it('reports an expired guest session only for guests', () => {
    const gone = { code: 'user_not_found', message: 'User from sub claim in JWT does not exist' }
    expect(isSessionGoneError(gone)).toBe(true)
    expect(sendCodeErrorMessage(gone, 'email', { guest: true })).toMatch(/guest session has expired/)
    expect(sendCodeErrorMessage(gone, 'email')).toBe(gone.message)
  })

  it('keeps the phone-auth-off wording and passes anything else through', () => {
    expect(sendCodeErrorMessage({ message: 'Unsupported phone provider' }, 'phone')).toBe("Adding a mobile number isn't available yet.")
    expect(sendCodeErrorMessage({ message: 'Rate limit exceeded' }, 'email')).toBe('Rate limit exceeded')
  })
})

describe('verifyCodeErrorMessage', () => {
  it('maps a wrong or expired code', () => {
    expect(verifyCodeErrorMessage({ message: 'Token has expired or is invalid' })).toBe('That code is wrong or has expired.')
    expect(verifyCodeErrorMessage({ message: 'Network error' })).toBe('Network error')
  })
})
