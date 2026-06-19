import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet, HelpText } from './BottomSheet'
import type { AppState, BudgetBucket } from '@/types'
import { getAutoBucket } from './BudgetStrategyCard'

interface CategoryBucketMapperProps {
  open: boolean
  onClose: () => void
  categories: AppState['categories']
  groups: AppState['groups']
  onUpdateBucket: (id: string, bucket: BudgetBucket | null) => Promise<void>
}

const SYSTEM_GROUP_TYPES = new Set(['income', 'transfer', 'borrowing', 'adjustment'])

const BUCKETS: { value: BudgetBucket; label: string; color: string; desc: string }[] = [
  { value: 'needs',   label: 'Needs',   color: '#3B82F6', desc: 'Essential expenses — rent, groceries, bills, transport, healthcare' },
  { value: 'wants',   label: 'Wants',   color: '#F97316', desc: 'Lifestyle spending — dining out, entertainment, shopping, subscriptions' },
  { value: 'savings', label: 'Savings', color: '#16C98A', desc: 'Money set aside for the future — investments, SIPs, emergency fund contributions' },
]

export function CategoryBucketMapper({ open, onClose, categories, groups, onUpdateBucket }: CategoryBucketMapperProps) {
  const c = useTheme()

  const expenseGroups = useMemo(() =>
    groups.filter(g => !SYSTEM_GROUP_TYPES.has(g.type ?? '')),
    [groups]
  )

  const mappableCategories = useMemo(() =>
    categories.filter(cat => {
      const group = groups.find(g => g.name === cat.group_name)
      return group && !SYSTEM_GROUP_TYPES.has(group.type ?? '')
    }),
    [categories, groups]
  )

  // null = use group default (auto), BudgetBucket = manual override
  const [localBuckets, setLocalBuckets] = useState<Record<string, BudgetBucket | null>>(
    () => Object.fromEntries(mappableCategories.map(cat => [cat.id, cat.budget_bucket ?? null]))
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setLocalBuckets(Object.fromEntries(mappableCategories.map(cat => [cat.id, cat.budget_bucket ?? null])))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSave = async () => {
    setSaving(true)
    for (const cat of mappableCategories) {
      const next = localBuckets[cat.id] ?? null
      if (next !== (cat.budget_bucket ?? null)) {
        await onUpdateBucket(cat.id, next)
      }
    }
    setSaving(false)
    onClose()
  }

  const grouped = useMemo(() => {
    const map = new Map<string, AppState['categories']>()
    for (const g of expenseGroups) map.set(g.name, [])
    for (const cat of mappableCategories) {
      if (map.has(cat.group_name)) map.get(cat.group_name)!.push(cat)
    }
    return [...map.entries()].filter(([, cats]) => cats.length > 0)
  }, [expenseGroups, mappableCategories])

  return (
    <BottomSheet open={open} onClose={onClose} zIndex={400}>
      <div style={{ padding: '4px 0 16px' }}>
        <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 6, letterSpacing: '-0.01em' }}>
          Budget buckets
        </div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 14, lineHeight: 1.6 }}>
          Every category counts toward one of three buckets. Tap the help <strong>?</strong> above for details.
        </div>
        <HelpText>Tap ? again to hide these hints.</HelpText>

        {/* Always-visible bucket legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
          {BUCKETS.map(b => (
            <div key={b.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{
                flexShrink: 0, marginTop: 1,
                padding: '2px 9px', borderRadius: 20,
                background: `${b.color}18`, color: b.color,
                font: '700 11px Plus Jakarta Sans',
              }}>
                {b.label}
              </span>
              <span style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
                {b.desc}
              </span>
            </div>
          ))}
        </div>
        <HelpText>Your strategy (e.g. Balanced 50/30/20) sets target percentages for each bucket. The totals on the strategy card come from the bucket assignments here.</HelpText>

        {grouped.length === 0 ? (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '16px 0', textAlign: 'center' }}>
            No categories to configure.
          </div>
        ) : (
          grouped.map(([groupName, cats]) => {
            const autoBucket = getAutoBucket(groups, groupName)
            const autoBucketDef = autoBucket ? BUCKETS.find(b => b.value === autoBucket) : null

            return (
              <div key={groupName} style={{ marginBottom: 20 }}>
                {/* Group header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginBottom: 2, paddingBottom: 6,
                  borderBottom: `1.5px solid ${c.faint}`,
                }}>
                  <span style={{
                    font: '700 11px Plus Jakarta Sans', color: c.muted,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {groupName}
                  </span>
                  {autoBucketDef && (
                    <span style={{
                      font: '700 10px Plus Jakarta Sans',
                      color: autoBucketDef.color,
                      background: `${autoBucketDef.color}18`,
                      borderRadius: 4, padding: '1px 7px',
                    }}>
                      default · {autoBucketDef.label}
                    </span>
                  )}
                  {!autoBucketDef && (
                    <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>
                      no default — assign manually
                    </span>
                  )}
                  <HelpText>{autoBucketDef ? `All "${groupName}" categories count as ${autoBucketDef.label} by default. Override individual ones below.` : `"${groupName}" has no default. Pick a bucket for each category so it appears in your strategy totals.`}</HelpText>
                </div>

                {cats.map(cat => {
                  const manualBucket = localBuckets[cat.id] ?? null
                  // Effective = manual override if set, else group default
                  const effectiveBucket: BudgetBucket | null = manualBucket ?? autoBucket
                  const isOverridden = manualBucket !== null && manualBucket !== autoBucket

                  return (
                    <div key={cat.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 0', borderBottom: `1px solid ${c.faint}`,
                      gap: 10,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cat.name}
                        </div>
                        {isOverridden && (
                          <button
                            onClick={() => setLocalBuckets(prev => ({ ...prev, [cat.id]: null }))}
                            style={{
                              background: 'none', border: 'none', padding: 0,
                              font: '600 10px Plus Jakarta Sans', color: c.muted,
                              cursor: 'pointer', textDecoration: 'underline',
                            }}
                          >
                            reset to default
                          </button>
                        )}
                        <HelpText>{isOverridden ? `You've overridden this to "${BUCKETS.find(b => b.value === manualBucket)?.label}". Tap "reset to default" to go back to the group default.` : effectiveBucket ? `This counts as ${BUCKETS.find(b => b.value === effectiveBucket)?.label} (from group default). Tap a button to override it.` : 'No bucket assigned — this category is excluded from strategy totals. Tap Needs, Wants, or Savings to include it.'}</HelpText>
                      </div>

                      {/* Bucket selector */}
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        {BUCKETS.map(({ value, label, color }) => {
                          const isActive = effectiveBucket === value
                          const isManuallySet = manualBucket === value
                          return (
                            <button
                              key={value}
                              onClick={() => setLocalBuckets(prev => ({
                                ...prev,
                                // Tap active manual override → reset to auto; tap any other → set override
                                [cat.id]: isManuallySet ? null : value,
                              }))}
                              style={{
                                padding: '5px 10px', borderRadius: 8,
                                border: `1.5px solid ${isActive ? color : c.faint}`,
                                background: isActive
                                  ? isManuallySet ? color : `${color}22`
                                  : 'transparent',
                                color: isActive
                                  ? isManuallySet ? '#fff' : color
                                  : c.muted,
                                font: '700 11px Plus Jakarta Sans', cursor: 'pointer',
                              }}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })
        )}

        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '13px', borderRadius: 12, border: `1.5px solid ${c.faint}`,
              background: 'transparent', color: c.muted,
              font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2, padding: '13px', borderRadius: 12, border: 'none',
              background: c.accent, color: '#fff',
              font: '700 13px Plus Jakarta Sans',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
