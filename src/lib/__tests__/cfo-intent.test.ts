import { describe, it, expect } from 'vitest'
import { classifyCfoIntent, parseAmount } from '../cfo-intent'

const kind = (q: string) => classifyCfoIntent(q)?.kind ?? null

describe('classifyCfoIntent', () => {
  it('routes the core questions', () => {
    expect(kind("What's my current financial status?")).toBe('status')
    expect(kind('Analyze my financial state')).toBe('status')
    expect(kind('Give me a complete financial summary.')).toBe('status')
    expect(kind('How much money do I actually have?')).toBe('liquid')
    expect(kind('Show my current balance across all accounts.')).toBe('balances')
    expect(kind('What payments are coming before my next salary?')).toBe('upcoming')
    expect(kind("What's my real free money?")).toBe('free')
    expect(kind('How much is available after my emergency fund?')).toBe('free')
    expect(kind('How much have I spent this week?')).toBe('weekly')
    expect(kind("What's my funding gap?")).toBe('gap')
    expect(kind('What changed since my last check?')).toBe('changed')
    expect(classifyCfoIntent('Can I afford ₹8,000?')).toEqual({ kind: 'afford', amount: 8000 })
  })

  it('leaves advice, plans and stories to the coach', () => {
    expect(kind("I've been over my weekly budget. Give me a realistic recovery plan with specific steps.")).toBeNull()
    expect(kind("Give me my financial story this month — where did my money go, what's recoverable, and how am I actually doing?")).toBeNull()
    expect(kind('Why is my free money negative?')).toBeNull()
    expect(kind('Who owes me money?')).toBeNull()
  })
})

describe('parseAmount', () => {
  it('reads common shapes', () => {
    expect(parseAmount('8000')).toBe(8000)
    expect(parseAmount('₹1,34,440')).toBe(134440)
    expect(parseAmount('8k')).toBe(8000)
    expect(parseAmount('1.5 lakh')).toBe(150000)
    expect(parseAmount('nothing here')).toBeNull()
  })
  it('prefers the marked or largest number', () => {
    expect(parseAmount('can I afford an iPhone 15 for 80000')).toBe(80000)
    expect(parseAmount('2 shoes for ₹3,000')).toBe(3000)
  })
})
