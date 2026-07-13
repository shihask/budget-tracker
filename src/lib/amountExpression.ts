// Recursive-descent arithmetic evaluator for amount fields — lets users type
// "200+22" or "500-200" instead of pre-computing the result. Pure math: never
// rounds. Callers round for money display/storage via round2() (see utils.ts).

const MAX_LENGTH = 100

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
