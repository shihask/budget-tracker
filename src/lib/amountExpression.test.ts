import { describe, it, expect } from 'vitest'
import { evaluateAmountExpression } from './amountExpression'

describe('evaluateAmountExpression', () => {
  const valid: [string, number][] = [
    ['200+22', 222],
    ['500-200', 300],
    ['20*5', 100],
    ['100/4', 25],
    ['100+20*3', 160],
    ['(100+20)*3', 360],
    ['-100+50', -50],
    ['100+-50', 50],
    ['₹200+₹22', 222],
    ['1,000+500', 1500],
    ['100', 100],
  ]

  for (const [input, expected] of valid) {
    it(`evaluates "${input}" to ${expected}`, () => {
      expect(evaluateAmountExpression(input)).toBeCloseTo(expected, 9)
    })
  }

  it('does not round internally (0.1+0.2 keeps float drift)', () => {
    expect(evaluateAmountExpression('0.1+0.2')).toBeCloseTo(0.3, 9)
  })

  const invalid: string[] = [
    '',
    '   ',
    '200+',
    '+',
    '*',
    '200++5',
    '200**2',
    '200//5',
    'abc',
    '1e9',
    '100/0',
    '()',
    '(100+20',
    'a'.repeat(101),
  ]

  for (const input of invalid) {
    it(`rejects ${JSON.stringify(input.length > 20 ? input.slice(0, 20) + '…' : input)}`, () => {
      expect(evaluateAmountExpression(input)).toBeNull()
    })
  }
})
