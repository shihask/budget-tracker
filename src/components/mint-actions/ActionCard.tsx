import type { MintAction } from '@/lib/mintActions'
import type { ColorTokens } from '@/lib/tokens'
import { ExportTransactionsCard } from './ExportTransactionsCard'

interface ActionCardProps {
  action: MintAction
  onAction: (action: MintAction) => Promise<void>
  c: ColorTokens
}

export function ActionCard({ action, onAction, c }: ActionCardProps) {
  switch (action.type) {
    case 'export_transactions':
      return <ExportTransactionsCard action={action} onAction={onAction} c={c} />
  }
}
