import { useState } from 'react'
import { Users } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt, fmtDate } from '@/lib/utils'
import { BottomSheet } from '@/components/BottomSheet'
import { householdErrorMessage } from '../lib/errors'
import { matchHouseholdCategory, type HouseholdShareContext } from '../lib/share'
import { HouseholdCategoryPicker } from './ShareWithHouseholdField'
import { Button, ErrorText } from './ui'

export interface ShareableTransaction {
  id: string
  type: 'expense' | 'income'
  amount: number
  description: string
  date: string
  personalCategoryName: string | null
}

/** Share an already-recorded transaction from the Transactions list: pick the
 *  household category (prefilled by name, never guessed) and confirm. The
 *  personal record is not changed. Mount it only while a row is being shared,
 *  so each open starts from that row's own prefill. */
export function ShareTransactionSheet({ tx, household, onShare, onClose }: {
  tx: ShareableTransaction
  household: HouseholdShareContext
  onShare: (transactionId: string, householdCategoryId: string) => Promise<void>
  onClose: () => void
}) {
  const c = useTheme()
  const [categoryId, setCategoryId] = useState<string | null>(
    () => matchHouseholdCategory(tx.personalCategoryName, tx.type, household.categories),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!categoryId) { setError('Pick a household category.'); return }
    setBusy(true)
    setError(null)
    try {
      await onShare(tx.id, categoryId)
      onClose()
    } catch (err) {
      setError(householdErrorMessage(err, 'Couldn’t share this. Try again.'))
      setBusy(false)
    }
  }

  return (
    <BottomSheet open onClose={() => { if (!busy) onClose() }} dismissible={!busy} zIndex={320}>
      <div style={{ padding: '4px 20px calc(20px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span aria-hidden style={{ width: 34, height: 34, borderRadius: 10, background: c.accentSoft, color: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={17} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink }}>Share with Household</div>
            <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Add a copy to {household.householdName || 'your household'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.description || 'No note'}</div>
            <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{fmtDate(tx.date)}</div>
          </div>
          <div style={{ font: '800 15px Plus Jakarta Sans', color: tx.type === 'income' ? c.good : c.bad, flexShrink: 0 }}>
            {tx.type === 'income' ? '+' : '−'}{fmt(tx.amount, { decimals: tx.amount % 1 ? 2 : 0 })}
          </div>
        </div>

        <HouseholdCategoryPicker id="txn-share-household-category" kind={tx.type} categories={household.categories} categoryId={categoryId} onCategory={id => { setCategoryId(id); setError(null) }} disabled={busy} />
        <ErrorText>{error}</ErrorText>

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <Button kind="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <div style={{ flex: 1, display: 'flex' }}>
            <Button full onClick={() => void submit()} busy={busy} disabled={!categoryId}>
              {busy ? 'Sharing…' : 'Share'}
            </Button>
          </div>
        </div>
      </div>
    </BottomSheet>
  )
}
