import { fmt } from '@/lib/utils'
import type { SettlementComputation, SettlementParticipant, Transfer } from './settlement'

// Every sentence on the Settlement screen and in the shared text is built here from
// engine values (paise). Nothing is hand-written arithmetic, so the words always
// reconcile with the numbers.

export const rs = (paise: number) => fmt(paise / 100)

export type Tone = 'good' | 'ink' | 'muted'

export function standing(net: number): { label: string; tone: Tone } {
  if (net > 0) return { label: `Gets back ${rs(net)}`, tone: 'good' }
  if (net < 0) return { label: `Owes ${rs(-net)}`, tone: 'ink' }
  return { label: 'Even', tone: 'muted' }
}

/**
 * "₹4,000 put in kitty + ₹1,000 paid personally − ₹3,000 share of spending = gets back ₹2,000".
 * Terms come from the participant's own engine values; the engine guarantees
 * putIn + paidPersonally − share = net, so the sentence always adds up.
 */
export function breakdownLine(p: SettlementParticipant): string {
  const credits = [
    p.putIn > 0 && `${rs(p.putIn)} put in kitty`,
    p.paidPersonally > 0 && `${rs(p.paidPersonally)} paid personally`,
  ].filter(Boolean) as string[]
  let line = credits.length ? credits.join(' + ') : 'Nothing put in'
  if (p.share > 0) line += ` − ${rs(p.share)} share of spending`
  else if (p.share < 0) line += ` + ${rs(-p.share)} share of surplus returned`
  else if (!p.active) line += ' · inactive, so no share of spending'
  const end = p.net > 0 ? `gets back ${rs(p.net)}` : p.net < 0 ? `owes ${rs(-p.net)}` : 'even'
  return `${line} = ${end}`
}

/** Kitty: "₹9,700 put in by members + ₹2,000 group money − ₹9,700 paid from kitty = balance ₹2,000". */
export function kittyLine(d: SettlementComputation): string {
  const fromMembers = d.participants.filter(p => p.kind === 'member').reduce((s, p) => s + p.putIn, 0)
  const paidPersonally = d.participants.reduce((s, p) => s + p.paidPersonally, 0)
  const spentFromKitty = d.totals.expenses - paidPersonally
  const parts = [`${rs(fromMembers)} put in by members`]
  if (d.totals.groupMoney > 0) parts.push(`+ ${rs(d.totals.groupMoney)} group money`)
  parts.push(`− ${rs(spentFromKitty)} paid from kitty`)
  return `${parts.join(' ')} = balance ${d.kitty.balance < 0 ? '−' : ''}${rs(Math.abs(d.kitty.balance))}`
}

export interface SummaryLine { key: string; label: string; amount: number; hint: string }

/** Members pay / From kitty balance / Kitty top-up needed / Members receive — zero lines omitted. */
export function summaryLines(d: SettlementComputation): SummaryLine[] {
  const r = d.reconciliation
  return ([
    { key: 'membersPay', label: 'Members pay', amount: r.membersPay, hint: 'from their own money' },
    { key: 'kittyPays', label: 'From kitty balance', amount: r.kittyPays, hint: "suggested payments, not anyone's own money" },
    { key: 'kittyOwed', label: 'Kitty top-up needed', amount: r.kittyOwed, hint: "the kitty's balance is negative" },
    { key: 'membersReceive', label: 'Members receive', amount: r.membersReceive, hint: 'in total' },
  ] as SummaryLine[]).filter(l => l.amount > 0)
}

/** "₹1,000 from members + ₹1,000 from kitty = ₹2,000 received" — both sides from the plan itself. */
export function equation(d: SettlementComputation): string {
  const r = d.reconciliation
  const left = [r.membersPay > 0 && `${rs(r.membersPay)} from members`, r.kittyPays > 0 && `${rs(r.kittyPays)} from kitty`].filter(Boolean)
  const right = [r.membersReceive > 0 && `${rs(r.membersReceive)} received`, r.kittyOwed > 0 && `${rs(r.kittyOwed)} kitty top-up`].filter(Boolean)
  return `${left.join(' + ')} = ${right.join(' + ')}`
}

export function headline(d: SettlementComputation): string {
  if (d.totals.expenses === 0) return 'Nothing spent yet'
  if (!d.balanced) return "Settlement couldn't be verified"
  const n = d.transfers.length
  if (n === 0) return 'Everyone is even'
  return `${n} payment${n === 1 ? '' : 's'} settle${n === 1 ? 's' : ''} this trip`
}

export interface Note { tone: 'info' | 'warn'; text: string }

export function notes(d: SettlementComputation): Note[] {
  const out: Note[] = []
  for (const i of d.issues) {
    switch (i.kind) {
      case 'no_sharers':
        out.push({ tone: 'warn', text: `${rs(Math.abs(i.amount))} of spending has no one to share it, because no member is active. Settlement can't be worked out until someone is.` })
        break
      case 'invalid_amount':
      case 'invalid_ratio':
        if (!out.some(n => n.text.startsWith('Some amounts'))) {
          out.push({ tone: 'warn', text: "Some amounts or shares couldn't be read, so no payments are suggested. Check the transactions for anything unusual." })
        }
        break
      case 'invariant_failed':
        out.push({ tone: 'warn', text: "Settlement couldn't be verified, so no payments are suggested." })
        break
      case 'unassigned_contributions':
        out.push({ tone: 'info', text: `${rs(i.amount)} came from people no longer in this project, or contributions not assigned to anyone. It's treated as group money: it lowers everyone's share and isn't credited to any current member.` })
        break
      case 'kitty_overspent':
        out.push({ tone: 'warn', text: `The kitty's balance is −${rs(i.amount)}. It paid out more than it received, so it needs ${rs(i.amount)} topped up. Usually an expense someone paid personally was marked as paid from the kitty — fixing that expense will credit them instead.` })
        break
    }
  }
  if (d.balanced && d.totals.sharedCost < 0) {
    out.push({ tone: 'info', text: `Group money is more than the trip's spending. The extra ${rs(-d.totals.sharedCost)} is returned to members by their share.` })
  }
  return out
}

export function transferHint(t: Transfer): string | null {
  if (t.from.kind === 'kitty') return 'Suggested payment from the kitty balance'
  if (t.to.kind === 'kitty') return 'Tops up the kitty'
  return null
}

/** Plain text for WhatsApp etc. Only ever describes a verified plan. */
export function shareText(d: SettlementComputation, projectName: string): string {
  const lines = [`${projectName} — settlement`]
  if (d.totals.expenses === 0) return [...lines, 'Nothing spent yet.'].join('\n')
  if (!d.balanced) return [...lines, "Settlement couldn't be verified yet."].join('\n')
  if (d.transfers.length === 0) return [...lines, 'Everyone is even.'].join('\n')
  for (const t of d.transfers) {
    const hint = t.from.kind === 'kitty' ? ' (from the kitty balance)' : t.to.kind === 'kitty' ? ' (tops up the kitty)' : ''
    lines.push(`${t.from.name} → ${t.to.name}: ${rs(t.amount)}${hint}`)
  }
  lines.push(`Balanced: ${equation(d)}`)
  lines.push('Worked out in MoneyPlant')
  return lines.join('\n')
}
