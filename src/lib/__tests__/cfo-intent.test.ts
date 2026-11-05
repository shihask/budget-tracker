import { describe, it, expect } from 'vitest'
import { classifyCfoIntent, parseAmount, parseForecastDate, parseBareForecastDate } from '../cfo-intent'

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

// Thursday 5 Nov 2026, the day of the Manglish conversation that found the bug.
const NOW = new Date(2026, 10, 5, 12, 0, 0)
const on = (q: string) => {
  const r = classifyCfoIntent(q, NOW)
  return r?.kind === 'balanceOn' ? r.date : null
}

describe('balance on a date', () => {
  it('routes English and Manglish questions', () => {
    expect(on('next month ee date enthe kayyil ethra cash undavum')).toBe('2026-12-05')
    expect(on('How much will I have on 5 Dec?')).toBe('2026-12-05')
    expect(on('how much money will i have by december 5th')).toBe('2026-12-05')
    expect(on('balance on 30/11')).toBe('2026-11-30')
    expect(on('naale ethra undavum')).toBe('2026-11-06')
    expect(on("what will I have left in 2 weeks? how much")).toBe('2026-11-19')
    expect(on('how much will I have at the end of the month')).toBe('2026-11-30')
  })

  it('leaves spending, payments and dateless questions alone', () => {
    expect(on('how much money did I spend on 5 nov')).toBeNull()
    expect(on('what payments are due by 5 dec')).toBeNull()
    expect(kind('How much money do I actually have?')).toBe('liquid')
    expect(on('why will I have only 4000 on 5 dec')).toBeNull()
  })
})

describe('parseForecastDate', () => {
  const iso = (q: string) => parseForecastDate(q, NOW)?.iso ?? null
  it('reads calendar dates, day first', () => {
    expect(iso('5 december')).toBe('2026-12-05')
    expect(iso('Dec 5, 2027')).toBe('2027-12-05')
    expect(iso('5-12')).toBe('2026-12-05')
    expect(iso('31 feb')).toBeNull()
    expect(iso('1.5 lakh')).toBeNull()
  })
  it('a year-less date long past means next year; a recent one stays past', () => {
    expect(iso('5 jan')).toBe('2027-01-05')
    expect(iso('1 nov')).toBe('2026-11-01')
  })
  it('clamps next month to its length', () => {
    expect(parseForecastDate('next month', new Date(2027, 0, 31))?.iso).toBe('2027-02-28')
  })
})

describe('parseBareForecastDate', () => {
  it('accepts a lone date as a follow-up', () => {
    expect(parseBareForecastDate('5 December', NOW)).toBe('2026-12-05')
    expect(parseBareForecastDate('by 5 november', NOW)).toBe('2026-11-05')
    expect(parseBareForecastDate('and tomorrow?', NOW)).toBe('2026-11-06')
  })
  it('rejects anything more — that is a new question or an expense', () => {
    expect(parseBareForecastDate('tea 20 on 5 dec', NOW)).toBeNull()
    expect(parseBareForecastDate('spent 500 tomorrow', NOW)).toBeNull()
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
