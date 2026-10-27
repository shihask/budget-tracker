import { describe, it, expect } from 'vitest'
import { AMOUNT_MAX, checkDescription, checkName, isIsoDate, parseAmount, parseLimit } from '../lib/validation'

describe('parseAmount', () => {
  it('accepts whole and two-decimal amounts, with Indian commas', () => {
    expect(parseAmount('2000')).toEqual({ ok: true, value: 2000 })
    expect(parseAmount(' 1,20,000.50 ')).toEqual({ ok: true, value: 120000.5 })
    expect(parseAmount('0.01')).toEqual({ ok: true, value: 0.01 })
  })
  it('rejects empty, zero, negative, 3 decimals, text and overflow', () => {
    for (const bad of ['', '0', '0.00', '-5', '1.234', 'abc', '1e5', String(AMOUNT_MAX + 1)]) {
      expect(parseAmount(bad).ok, bad).toBe(false)
    }
    expect(parseAmount(String(AMOUNT_MAX)).ok).toBe(true)
  })
})

describe('parseLimit', () => {
  it('allows a zero budget, unlike an entry amount', () => {
    expect(parseLimit('0')).toEqual({ ok: true, value: 0 })
    expect(parseLimit('0.00')).toEqual({ ok: true, value: 0 })
    expect(parseLimit('35,000')).toEqual({ ok: true, value: 35000 })
    expect(parseLimit('-1').ok).toBe(false)
  })
})

describe('names and notes', () => {
  it('trims, requires a value and enforces the length', () => {
    expect(checkName('  Our Home ', 60, 'a name')).toEqual({ ok: true, value: 'Our Home' })
    expect(checkName('   ', 60, 'a name').ok).toBe(false)
    expect(checkName('x'.repeat(41), 40, 'a name').ok).toBe(false)
  })
  it('turns an empty note into null and caps it at 120', () => {
    expect(checkDescription('  ')).toEqual({ ok: true, value: null })
    expect(checkDescription('x'.repeat(121)).ok).toBe(false)
  })
})

describe('isIsoDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('26-10-01')).toBe(false)
  })
})
