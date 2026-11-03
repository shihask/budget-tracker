import type { DashboardSectionId } from '@/types'

/** Display name and description of each built-in dashboard section — shared by
 *  Dashboard Layout and the dashboard quick nav, so the two never disagree. */
export const SECTION_META: Record<DashboardSectionId, { label: string; desc: string }> = {
  hero:            { label: 'Weekly Overview',       desc: 'Spending vs budget & week summary' },
  kakeibo:         { label: 'Kakeibo',                desc: 'Savings goal & end-of-cycle review — shows only when there is something to do' },
  wealth_summary:  { label: 'Wealth Summary',         desc: 'Total savings, investments & money lent' },
  budget_strategy: { label: 'Budget Strategy',        desc: 'Needs/Wants/Savings allocation vs plan' },
  affordability:   { label: 'Affordability Checker', desc: 'Can I afford this purchase?' },
  daily_challenge: { label: 'Daily Challenge',        desc: 'Daily spending target & streak' },
  metrics:         { label: 'Your Money',             desc: 'Balance, savings & key metrics' },
  cashflow:        { label: 'Cash Flow Forecast',     desc: 'Projected balance based on known events' },
  commitments:   { label: 'Bills & Obligations',    desc: 'Bills & recurring payments' },
  goals:         { label: 'Goals',                 desc: 'Savings goals & progress tracking' },
  accounts:      { label: 'Accounts',              desc: 'Bank & cash account balances' },
  savings:       { label: 'Savings & Investments',  desc: 'SIPs, gold schemes & recurring deposits' },
  borrowing:     { label: 'Lend & Borrow',          desc: 'Money lent & borrowed' },
  credit_cards:  { label: 'Credit Cards',          desc: 'Card balances & due dates' },
  events:        { label: 'Life Events',           desc: 'Wedding, trip or house build spend, tracked separately' },
  projects:      { label: 'Projects',              desc: 'Shared goals, renovations & events' },
  analytics:     { label: 'Analytics',             desc: 'Spending trends & charts' },
  recent_txns:   { label: 'Recent Transactions',   desc: 'Latest activity' },
}
