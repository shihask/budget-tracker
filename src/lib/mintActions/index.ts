import type { AppState, DerivedMetrics } from '@/types'
import { classifyExportIntent } from './exportIntent'
import type { MintAction } from './types'

export function detectMintAction(
  text: string,
  state: AppState,
  d: DerivedMetrics,
): MintAction | null {
  return classifyExportIntent(text, state, d)
  // future: ?? classifyBudgetAction(text) ?? classifyGoalAction(text)
}

export type { MintAction, ExportTransactionsAction } from './types'
