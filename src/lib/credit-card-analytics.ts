import type { CreditCard, Transaction, TransactionType } from '@/types'
import { round2 } from '@/lib/utils'
import { ACCOUNT_PALETTE } from '@/lib/tokens'

/** Same spend set the statement engine and credit-card.ts use. */
const CC_SPEND_TYPES = new Set<TransactionType>(['expense', 'commitment'])

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Shaped to satisfy `BarPoint` (types/index.ts:561) so it feeds <WeeklyBars> directly. */
export interface MonthPoint {
  /** 'YYYY-MM' */
  month: string
  /** 'Jul' — the bar's x-axis label */
  label: string
  value: number
  transactions: Transaction[]
}

export interface CardSpend {
  cardId: string
  name: string
  total: number
  color: string
}

export interface CardInsights {
  highestMonth: MonthPoint | null
  monthlyAverage: number
  topCard: CardSpend | null
}

function isCardSpend(t: Transaction): boolean {
  return !!t.credit_card_id && CC_SPEND_TYPES.has(t.transaction_type)
}

/** Last `months` calendar months of card spend, oldest first. Months with no spend are kept as zero
 *  points so the chart shows a gap rather than silently omitting the month. */
export function monthlySpend(txns: Transaction[], months = 6, today: Date = new Date()): MonthPoint[] {
  const byMonth = new Map<string, MonthPoint>()
  const points: MonthPoint[] = []

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const point: MonthPoint = { month: key, label: MONTH_LABELS[d.getMonth()], value: 0, transactions: [] }
    byMonth.set(key, point)
    points.push(point)
  }

  for (const t of txns) {
    if (!isCardSpend(t)) continue
    const point = byMonth.get(t.transaction_date.slice(0, 7))
    if (!point) continue // outside the window
    point.value += t.amount
    point.transactions.push(t)
  }

  for (const p of points) p.value = round2(p.value)
  return points
}

/** Total card spend per card over the same window, descending. Colour comes from ACCOUNT_PALETTE by
 *  index — it exists for exactly this. Cards with no spend are dropped. */
export function spendByCard(txns: Transaction[], cards: CreditCard[]): CardSpend[] {
  const totals = new Map<string, number>()
  for (const t of txns) {
    if (!isCardSpend(t)) continue
    totals.set(t.credit_card_id!, (totals.get(t.credit_card_id!) ?? 0) + t.amount)
  }

  return cards
    .map((card, i) => ({
      cardId: card.id,
      name: card.name,
      total: round2(totals.get(card.id) ?? 0),
      color: ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length],
    }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total)
}

export function cardInsights(monthly: MonthPoint[], byCard: CardSpend[]): CardInsights {
  const withData = monthly.filter(m => m.value > 0)
  const highestMonth = withData.length
    ? withData.reduce((best, m) => (m.value > best.value ? m : best))
    : null

  // Averaged over months that actually have data — a card added last month shouldn't have its average
  // dragged down by five leading zeroes.
  const monthlyAverage = withData.length
    ? round2(withData.reduce((s, m) => s + m.value, 0) / withData.length)
    : 0

  return { highestMonth, monthlyAverage, topCard: byCard[0] ?? null }
}

/** Spend charged to any card in the current calendar month. Short-span, so the in-memory
 *  state.transactions window is safe here — no fetch needed. */
export function thisMonthCardSpend(txns: Transaction[], today: Date = new Date()): number {
  const prefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  let total = 0
  for (const t of txns) {
    if (!isCardSpend(t)) continue
    if (!t.transaction_date.startsWith(prefix)) continue
    total += t.amount
  }
  return round2(total)
}
