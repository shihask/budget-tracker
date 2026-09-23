import {
  inr, shortDate, positionHeadline,
  type CfoSnapshot, type CfoDecision, type AffordVerdict,
} from '@/lib/cfo-snapshot'
import type { CfoDeltas } from '@/lib/cfo-history'

// Kept apart from CfoCard.tsx so that file exports only components (fast refresh).

export type CfoCardData =
  | { kind: 'status'; snap: CfoSnapshot; decision: CfoDecision; story: string[]; deltas: CfoDeltas | null }
  | { kind: 'gap'; snap: CfoSnapshot; decision: CfoDecision }
  | { kind: 'liquid'; snap: CfoSnapshot }
  | { kind: 'balances'; snap: CfoSnapshot }
  | { kind: 'upcoming'; snap: CfoSnapshot }
  | { kind: 'free'; snap: CfoSnapshot }
  | { kind: 'weekly'; snap: CfoSnapshot }
  | { kind: 'afford'; snap: CfoSnapshot; amount: number | null; verdict: AffordVerdict | null }
  | { kind: 'changed'; snap: CfoSnapshot; deltas: CfoDeltas | null }

export function relativeCheckTime(iso: string, now: number = Date.now()): string {
  const h = Math.floor((now - Date.parse(iso)) / 3_600_000)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

// The one plain sentence at the top of every CFO answer. Also stands in for a
// local answer's text in the chat history sent to the model.
export function cfoHeadline(card: CfoCardData): string {
  const s = card.snap
  switch (card.kind) {
    case 'status':
    case 'gap':
    case 'free':
      return positionHeadline(s)
    case 'liquid':
      return `You have ${inr(s.liquidCash)} in cash across ${s.accounts.length} account${s.accounts.length === 1 ? '' : 's'}.`
    case 'balances':
      return `Your balances total ${inr(s.liquidCash)}.`
    case 'upcoming': {
      const total = s.mandatoryTotal + s.flexibleTotal
      const when = s.nextIncomeDate ? `before your ${s.incomeLabel} on ${shortDate(s.nextIncomeDate)}` : 'in the next 30 days'
      return s.obligations.length ? `${inr(total)} is due ${when}.` : `Nothing scheduled ${when}.`
    }
    case 'weekly': {
      const w = s.weekly
      if (w.budget <= 0) return `${inr(w.spent)} spent ${w.periodLabel}.`
      return w.over > 0
        ? `${inr(w.spent)} spent ${w.periodLabel} — ${inr(w.over)} over your ${inr(w.budget)} budget.`
        : `${inr(w.spent)} spent ${w.periodLabel} — ${inr(w.left)} left of your ${inr(w.budget)} budget.`
    }
    case 'afford':
      if (card.amount == null || !card.verdict) return 'Tell me the amount — for example, "Can I afford ₹8,000?"'
      return card.verdict.verdict === 'yes' ? `Yes — you can afford ${inr(card.amount)}.`
        : card.verdict.verdict === 'tight' ? `You can afford ${inr(card.amount)}, but it's tight.`
        : `Not right now — ${inr(card.amount)} would leave you short.`
    case 'changed':
      return card.deltas
        ? "Here's what moved since your last check."
        : "First check saved on this device — ask again later and I'll show what moved."
  }
}
