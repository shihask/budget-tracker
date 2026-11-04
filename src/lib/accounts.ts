import { ACCOUNT_PALETTE } from '@/lib/tokens'
import type { Account } from '@/types'
import type { GlyphName } from '@/components/Glyph'

export const ACCOUNT_TYPE_ICON: Record<string, GlyphName> = {
  bank: 'shield', cash: 'wallet', credit_card: 'doc', wallet: 'spark',
}
export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  bank: 'Bank account', cash: 'Cash in hand', credit_card: 'Credit card', wallet: 'Wallet',
}

/** The account's colour — by its position among active accounts, same as the Accounts card's bar. */
export const accountColor = (activeAccounts: Account[], id: string) => {
  const i = Math.max(0, activeAccounts.findIndex(a => a.id === id))
  return ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length]
}

/** Each account's share of the money held — positive balances only, so an overdrawn
 *  account reads 0% instead of skewing the rest. Same basis as the distribution bar. */
export const accountShare = (activeAccounts: Account[], balance: number) => {
  const totalPos = activeAccounts.reduce((s, a) => s + Math.max(0, a.current_balance), 0)
  return totalPos > 0 ? Math.max(0, balance) / totalPos * 100 : 0
}

/** "<1%" for a sliver, so a ₹2 cash wallet doesn't claim 0% next to ₹6,611. */
export const shareLabel = (pct: number) => pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`
