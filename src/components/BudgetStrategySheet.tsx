import { useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from './BottomSheet'
import { STRATEGY_PRESETS } from './BudgetStrategyCard'
import type { BudgetStrategyType } from '@/types'

interface BudgetStrategySheetProps {
  open: boolean
  onClose: () => void
  budgetStrategy: BudgetStrategyType
  customNeedsPct: number
  customWantsPct: number
  customSavingsPct: number
  budgetStrategyBase: 'income' | 'available_funds'
  onBudgetStrategy: (strategy: BudgetStrategyType, customPcts?: { needs: number; wants: number; savings: number }) => void
  onBudgetStrategyBase: (v: 'income' | 'available_funds') => void
  onMapCategories: () => void
}

export function BudgetStrategySheet({ open, onClose, budgetStrategy, customNeedsPct, customWantsPct, customSavingsPct, budgetStrategyBase, onBudgetStrategy, onBudgetStrategyBase, onMapCategories }: BudgetStrategySheetProps) {
  const c = useTheme()
  const [customNeeds, setCustomNeeds] = useState(String(customNeedsPct))
  const [customWants, setCustomWants] = useState(String(customWantsPct))
  const [customSavings, setCustomSavings] = useState(String(customSavingsPct))

  useEffect(() => {
    if (open) {
      setCustomNeeds(String(customNeedsPct))
      setCustomWants(String(customWantsPct))
      setCustomSavings(String(customSavingsPct))
    }
  }, [open, customNeedsPct, customWantsPct, customSavingsPct])

  const customTotal = (parseInt(customNeeds) || 0) + (parseInt(customWants) || 0) + (parseInt(customSavings) || 0)
  const customValid = customTotal === 100

  const handleCustomSave = () => {
    if (!customValid) return
    onBudgetStrategy('custom', { needs: parseInt(customNeeds), wants: parseInt(customWants), savings: parseInt(customSavings) })
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 0', borderBottom: `1px solid ${c.faint}`,
  }
  const labelStyle: React.CSSProperties = {
    font: '600 13px Plus Jakarta Sans', color: c.ink,
  }

  return (
    <BottomSheet open={open} onClose={onClose} zIndex={350} showHelpButton={false}>
      <div style={{ padding: '4px 0 8px' }}>
        <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em', marginBottom: 4 }}>
          Budget Strategy
        </div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16, lineHeight: 1.5 }}>
          Allocate income across Needs, Wants &amp; Savings using a financial framework.
        </div>

        {/* Strategy selector */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {(['none', 'balanced', 'stable', 'growth', 'custom'] as BudgetStrategyType[]).map(s => {
            const label = s === 'none' ? 'None'
              : s === 'custom' ? 'Custom'
              : `${s.charAt(0).toUpperCase() + s.slice(1)} (${STRATEGY_PRESETS[s as keyof typeof STRATEGY_PRESETS].needs}/${STRATEGY_PRESETS[s as keyof typeof STRATEGY_PRESETS].wants}/${STRATEGY_PRESETS[s as keyof typeof STRATEGY_PRESETS].savings})`
            const active = budgetStrategy === s
            return (
              <button
                key={s}
                onClick={() => onBudgetStrategy(s)}
                style={{
                  padding: '6px 13px', borderRadius: 20, border: `1.5px solid ${active ? '#3B82F6' : c.faint}`,
                  background: active ? '#3B82F620' : 'transparent',
                  color: active ? '#3B82F6' : c.muted,
                  font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Custom percentages */}
        {budgetStrategy === 'custom' && (
          <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 10 }}>
              Set percentages (must total 100%)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'Needs %', val: customNeeds, set: setCustomNeeds },
                { label: 'Wants %', val: customWants, set: setCustomWants },
                { label: 'Savings %', val: customSavings, set: setCustomSavings },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <div style={{ font: '700 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
                  <input
                    type="number" min="0" max="100" value={val}
                    onChange={e => set(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: c.surface, border: `1.5px solid ${c.faint}`,
                      borderRadius: 9, padding: '8px 10px',
                      font: '700 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ font: '600 11px Plus Jakarta Sans', color: customValid ? c.good : c.bad }}>
                Total: {customTotal}% {customValid ? '✓' : '(must be 100%)'}
              </span>
              <button
                onClick={handleCustomSave}
                disabled={!customValid}
                style={{
                  background: customValid ? '#3B82F6' : c.faint,
                  color: customValid ? '#fff' : c.muted,
                  border: 'none', borderRadius: 9, padding: '7px 14px',
                  font: '700 12px Plus Jakarta Sans', cursor: customValid ? 'pointer' : 'not-allowed',
                }}
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {budgetStrategy !== 'none' && (
          <>
            {/* Map categories */}
            <div style={{ ...rowStyle, cursor: 'pointer' }} onClick={onMapCategories}>
              <div>
                <div style={labelStyle}>Map Other categories</div>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Assign Needs / Wants / Savings to custom categories</div>
              </div>
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={c.muted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </div>

            {/* Strategy base */}
            <div style={{ paddingTop: 14, paddingBottom: 6 }}>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 10 }}>
                Strategy base — what the Needs/Wants/Savings targets are calculated from
              </div>
              {([
                { value: 'income' as const, label: 'Income (Recommended)', desc: 'Only income transactions in the current cycle. How 50/30/20 is intended.' },
                { value: 'available_funds' as const, label: 'Available Funds', desc: 'Your account balance minus emergency fund. Useful when using savings or pre-funded accounts.' },
              ] as const).map(opt => (
                <div
                  key={opt.value}
                  onClick={() => onBudgetStrategyBase(opt.value)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 12px', borderRadius: 12, marginBottom: 6, cursor: 'pointer',
                    border: `1.5px solid ${budgetStrategyBase === opt.value ? '#3B82F6' : c.faint}`,
                    background: budgetStrategyBase === opt.value ? '#3B82F610' : 'transparent',
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: 999, marginTop: 1, flexShrink: 0,
                    border: `2px solid ${budgetStrategyBase === opt.value ? '#3B82F6' : c.faint}`,
                    background: budgetStrategyBase === opt.value ? '#3B82F6' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {budgetStrategyBase === opt.value && <div style={{ width: 6, height: 6, borderRadius: 999, background: '#fff' }} />}
                  </div>
                  <div>
                    <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{opt.label}</div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2, lineHeight: 1.5 }}>{opt.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
