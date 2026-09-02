import { toCsv } from '@/lib/csvUtils'
import { catById } from '@/lib/data'
import { eventTransactions } from '@/lib/events'
import type { AppState, LifeEvent } from '@/types'

const EVENT_EXPORT_COLUMNS = [
  'Date', 'Description', 'Amount', 'Category', 'Group', 'Account',
  // Split legs stay one row each, same as the main transactions export.
  'Split Group', 'Notes',
]

/** Slugged event name so two events never collide in the Downloads folder. */
function buildFilename(event: LifeEvent): string {
  const slug = event.name.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Event'
  return `MoneyPlant_${slug}_${new Date().toISOString().slice(0, 10)}.csv`
}

/** Downloads the expenses tagged to one life event. Reads the rows already in
 *  state — the event total is derived the same way, so the file always matches
 *  what the detail sheet shows. Returns the row count. */
export function exportEventCsv(state: AppState, event: LifeEvent): number {
  const txns = eventTransactions(state.transactions, event.id)
  const catMap = catById(state.categories)
  const accountNames = Object.fromEntries(state.accounts.map(a => [a.id, a.name]))
  const cardNames = Object.fromEntries(state.credit_cards.map(cc => [cc.id, cc.name]))

  const rows = txns.map(t => {
    const cat = catMap[t.category_id ?? '']
    return {
      'Date': t.transaction_date,
      'Description': t.description,
      'Amount': t.amount,
      'Category': cat?.name ?? '',
      'Group': cat?.group_name ?? '',
      'Account': accountNames[t.from_account_id ?? ''] ?? cardNames[t.credit_card_id ?? ''] ?? '',
      'Split Group': t.split_group_id ?? '',
      'Notes': t.notes ?? '',
    }
  })

  const csv = toCsv(rows, EVENT_EXPORT_COLUMNS)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildFilename(event)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return rows.length
}
