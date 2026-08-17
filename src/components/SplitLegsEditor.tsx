import { useTheme } from '@/lib/theme-context'
import { round2, selectOnFocus } from '@/lib/utils'
import { evaluateAmountExpression, sanitizeAmountInput } from '@/lib/amountExpression'
import { splitHint, splitRemainder } from '@/lib/splitGroups'
import type { Account, CreditCard, SplitLegInput } from '@/types'

interface SplitLegsEditorProps {
  legs: SplitLegInput[]
  onChange: (legs: SplitLegInput[]) => void
  /** The expense total the legs must add up to. */
  total: number
  accounts: Account[]
  creditCards: CreditCard[]
}

/**
 * The leg rows, the "+ Add payment" action and the remainder line — everything that
 * only exists once the user has explicitly turned split mode on. Shared by QuickAdd
 * (creating) and the transactions edit sheet (editing a group), so invariant 1 has a
 * single implementation rather than two that can drift.
 */
export function SplitLegsEditor({ legs, onChange, total, accounts, creditCards }: SplitLegsEditorProps) {
  const c = useTheme()
  const remainder = splitRemainder(legs, total)
  const hint = splitHint(legs, total)
  const usedIds = new Set(legs.map(l => l.accountId).filter(Boolean))
  const sourceCount = accounts.length + creditCards.length

  const setLeg = (i: number, patch: Partial<SplitLegInput>) =>
    onChange(legs.map((l, idx) => idx === i ? { ...l, ...patch } : l))

  const addLeg = () => onChange([...legs, { accountId: '', amount: Math.max(0, remainder) }])

  const removeLeg = (i: number) => onChange(legs.filter((_, idx) => idx !== i))

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', borderBottom: `1px solid ${c.faint}`,
  }
  const bareInput: React.CSSProperties = {
    border: 'none', background: 'transparent', outline: 'none',
    font: '600 14px Plus Jakarta Sans', color: c.ink,
  }

  return (
    <div>
      <div style={{ border: `1.5px solid ${c.faint}`, background: c.surface2, borderRadius: 13, overflow: 'hidden' }}>
        {legs.map((leg, i) => (
          <div key={i} style={{ ...rowStyle, borderBottom: i === legs.length - 1 ? 'none' : rowStyle.borderBottom }}>
            <select
              value={leg.accountId}
              onChange={e => setLeg(i, { accountId: e.target.value })}
              style={{ ...bareInput, flex: 1, minWidth: 0, cursor: 'pointer' }}
            >
              <option value="">Account…</option>
              <optgroup label="Bank / Cash">
                {accounts
                  .filter(a => a.id === leg.accountId || !usedIds.has(a.id))
                  .map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </optgroup>
              {creditCards.length > 0 && (
                <optgroup label="Credit Cards">
                  {creditCards
                    .filter(cc => cc.id === leg.accountId || !usedIds.has(cc.id))
                    .map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                </optgroup>
              )}
            </select>

            <input
              type="text"
              inputMode="decimal"
              defaultValue={leg.amount ? String(leg.amount) : ''}
              key={`amt-${i}-${leg.amount}`}
              placeholder="0"
              onFocus={e => selectOnFocus(e.target)}
              onChange={e => {
                const v = sanitizeAmountInput(e.target.value)
                if (v !== e.target.value) e.target.value = v
              }}
              onBlur={e => {
                const r = evaluateAmountExpression(e.target.value)
                const next = r === null ? 0 : round2(r)
                e.target.value = next ? String(next) : ''
                setLeg(i, { amount: next })
              }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
              style={{ ...bareInput, width: 92, textAlign: 'right' }}
            />

            {legs.length > 2 ? (
              <button
                type="button"
                onClick={() => removeLeg(i)}
                aria-label="Remove payment"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: c.muted, font: '600 15px Plus Jakarta Sans', padding: '0 2px', lineHeight: 1 }}
              >
                ×
              </button>
            ) : (
              // Invariant 2 — a split needs two legs, so the last two can't be removed.
              // Leaving the gap keeps the rows from shifting as legs are added.
              <span style={{ width: 15 }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        {/* Shares its implementation with isSplitValid, so this line always explains
            exactly why the save button is disabled — never disagrees with it. */}
        <span style={{ font: '600 11px Plus Jakarta Sans', color: hint.ok ? c.muted : c.bad }}>
          {hint.text}
        </span>
        {legs.length < sourceCount && (
          <button
            type="button"
            onClick={addLeg}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: '600 11px Plus Jakarta Sans', color: c.accent, padding: 0 }}
          >
            + Add payment
          </button>
        )}
      </div>
    </div>
  )
}
