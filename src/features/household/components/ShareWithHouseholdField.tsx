import { Users } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import type { HouseholdCategory } from '../types'

/** Quick Add's "Share with Household": a switch (off by default) and, when on,
 *  the household category for the shared copy. Says exactly what is shared. */
export function ShareWithHouseholdField({ on, onToggle, householdName, kind, categories, categoryId, onCategory, disabled }: {
  on: boolean
  onToggle: (on: boolean) => void
  householdName: string
  kind: 'expense' | 'income'
  categories: HouseholdCategory[]
  /** null = nothing matched yet; the user must pick */
  categoryId: string | null
  onCategory: (id: string) => void
  disabled?: boolean
}) {
  const c = useTheme()
  const choosable = categories.filter(cat => cat.kind === kind && !cat.is_archived)
  return (
    <div style={{ background: on ? c.accentSoft : c.surface2, borderRadius: 14, padding: '12px 14px', transition: 'background 0.2s' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: disabled ? 'default' : 'pointer' }}>
        <span aria-hidden style={{ width: 30, height: 30, borderRadius: 9, background: on ? c.accent : c.surface, color: on ? '#fff' : c.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Users size={15} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', font: '700 13px Plus Jakarta Sans', color: c.ink }}>Share with Household</span>
          <span style={{ display: 'block', font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
            Also record this transaction in {householdName || 'your household'}.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={disabled}
          onChange={e => onToggle(e.target.checked)}
          aria-label="Share with Household"
          style={{ width: 20, height: 20, accentColor: c.accent, cursor: disabled ? 'default' : 'pointer', flexShrink: 0 }}
        />
      </label>

      {on && (
        <div style={{ marginTop: 12 }}>
          <label htmlFor="qa-household-category" style={{ display: 'block', font: '700 12px Plus Jakarta Sans', color: c.sub, marginBottom: 6 }}>
            Household category
          </label>
          <select
            id="qa-household-category"
            value={categoryId ?? ''}
            onChange={e => onCategory(e.target.value)}
            disabled={disabled}
            aria-invalid={!categoryId}
            style={{
              width: '100%', boxSizing: 'border-box', border: `1.5px solid ${categoryId ? c.faint : c.warn}`, background: c.surface,
              borderRadius: 12, padding: '10px 12px', font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="" disabled>Pick a household category</option>
            {choosable.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
          <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 8, lineHeight: 1.45 }}>
            Your partner sees the amount, date, note and this category — never your account or balance. Later edits to the amount, date or note update the shared copy; deleting this deletes it too.
          </div>
        </div>
      )}
    </div>
  )
}
