import { ReceiptIndianRupee as Receipt, ArrowDownLeft, ArrowLeftRight, Gift } from 'lucide-react'
import type { ColorTokens } from '@/lib/tokens'
import type { TransactionKind } from '../../lib/transactions'

/** Leading icon tile per kind. Only contributions and the kitty get colour. */
export function kindTile(c: ColorTokens, kind: TransactionKind) {
  switch (kind) {
    case 'contribution': return { Icon: ArrowDownLeft, bg: c.goodSoft, fg: c.good }
    case 'group-money': return { Icon: Gift, bg: c.goodSoft, fg: c.good }
    // A payment moves money between two parties — neutral, never spending or income.
    case 'settlement': return { Icon: ArrowLeftRight, bg: c.surface2, fg: c.sub }
    case 'expense-kitty': return { Icon: Receipt, bg: c.accentSoft, fg: c.accent }
    case 'expense-member': return { Icon: Receipt, bg: c.surface2, fg: c.sub }
  }
}
