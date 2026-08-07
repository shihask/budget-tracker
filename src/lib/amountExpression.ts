// Recursive-descent arithmetic evaluator for amount fields — lets users type
// "200+22" or "500-200" instead of pre-computing the result. Pure math: never
// rounds. Callers round for money display/storage via round2() (see utils.ts).

const MAX_LENGTH = 100

// Live-typing mask for amount/expression inputs: rejects a keystroke the
// moment it makes the field impossible to ever complete into a valid
// expression (e.g. a 2nd '.' in one number, or a 3rd decimal digit), while
// still allowing in-progress states a finished expression passes through
// (trailing operator, lone '.', empty string) so typing isn't blocked
// mid-entry. Pair with evaluateAmountExpression() on blur/submit for the
// final numeric value.
export function isValidPartialAmountInput(input: string): boolean {
  if (input.length > MAX_LENGTH) return false
  const stripped = input.replace(/[₹,]/g, '')
  if (!/^[\d.+\-*x×X/÷\s()]*$/.test(stripped)) return false
  const normalized = stripped.replace(/[×xX]/g, '*').replace(/÷/g, '/')
  const tokens = normalized.split(/[+\-*/()\s]+/).filter(Boolean)
  return tokens.every(t => /^\d*(\.\d{0,2})?$/.test(t))
}

// Trims trailing characters until what's left passes isValidPartialAmountInput
// — the actual keystroke mask. Wrap an amount input's onChange with this so a
// disallowed character (or a 2nd '.'/3rd decimal digit) can never land in the
// field, instead of silently accepting garbage that only fails later on blur.
export function sanitizeAmountInput(raw: string): string {
  let v = raw
  while (v.length > 0 && !isValidPartialAmountInput(v)) v = v.slice(0, -1)
  return v
}

export function evaluateAmountExpression(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > MAX_LENGTH) return null

  const stripped = trimmed.replace(/[₹,]/g, '').trim()
  if (!stripped) return null

  const normalized = stripped
    .replace(/[×xX]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, '')

  if (!/^[\d.+\-*/()]+$/.test(normalized)) return null

  const parser = new Parser(normalized)
  const result = parser.parseExpr()
  if (result === null || parser.pos !== normalized.length) return null
  if (!Number.isFinite(result)) return null

  return result
}

class Parser {
  pos = 0
  constructor(private readonly expr: string) {}

  parseExpr(): number | null {
    let val = this.parseTerm()
    if (val === null) return null
    while (this.expr[this.pos] === '+' || this.expr[this.pos] === '-') {
      const op = this.expr[this.pos]
      this.pos++
      const rhs = this.parseTerm()
      if (rhs === null) return null
      val = op === '+' ? val + rhs : val - rhs
    }
    return val
  }

  private parseTerm(): number | null {
    let val = this.parseFactor()
    if (val === null) return null
    while (this.expr[this.pos] === '*' || this.expr[this.pos] === '/') {
      const op = this.expr[this.pos]
      this.pos++
      const rhs = this.parseFactor()
      if (rhs === null) return null
      if (op === '*') {
        val *= rhs
      } else {
        if (rhs === 0) return null
        val /= rhs
      }
    }
    return val
  }

  private parseFactor(): number | null {
    if (this.expr[this.pos] === '-') {
      this.pos++
      const val = this.parseFactor()
      return val === null ? null : -val
    }
    if (this.expr[this.pos] === '(') {
      this.pos++
      const val = this.parseExpr()
      if (val === null || this.expr[this.pos] !== ')') return null
      this.pos++
      return val
    }
    return this.parseNumber()
  }

  private parseNumber(): number | null {
    const start = this.pos
    while (this.expr[this.pos] >= '0' && this.expr[this.pos] <= '9') this.pos++
    if (this.expr[this.pos] === '.') {
      this.pos++
      while (this.expr[this.pos] >= '0' && this.expr[this.pos] <= '9') this.pos++
    }
    if (this.pos === start || (this.pos === start + 1 && this.expr[start] === '.')) return null
    return parseFloat(this.expr.slice(start, this.pos))
  }
}
