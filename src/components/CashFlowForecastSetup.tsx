import { useMemo, useState, useRef } from 'react'
import { BottomSheet } from '@/components/BottomSheet'
import { AmountOperatorRow } from '@/components/AmountOperatorRow'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { evaluateAmountExpression } from '@/lib/amountExpression'
import { estimateForecastSalary, SALARY_SOURCE_LABEL } from '@/lib/cashflow'
import { getIncomePattern } from '@/lib/income-pattern'
import type { AppState, Settings, ForecastSettings } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void>
  onUpdateForecastSettings: (patch: Partial<ForecastSettings>) => Promise<void>
}

const F = 'Plus Jakarta Sans'

export function CashFlowForecastSetup({ open, onClose, state, onUpdateSettings, onUpdateForecastSettings }: Props) {
  const c = useTheme()
  const s = state.settings
  const fs = state.forecast_settings
  const pattern = getIncomePattern(s)

  const activeCommitments = useMemo(() => state.commitments.filter(x => x.is_active !== false && x.remaining > 0), [state.commitments])
  const activeSavings = useMemo(() => state.savings.filter(x => x.is_active !== false && x.is_recurring), [state.savings])
  const salaryEst = useMemo(() => estimateForecastSalary(state), [state])

  const initSet = (ids: string[] | null | undefined, all: string[]) => new Set(ids == null ? all : ids)

  const [enabled, setEnabled] = useState(fs.enabled ?? true)
  const [days, setDays] = useState(fs.days ?? 60)
  const [salaryDay, setSalaryDay] = useState(s.salary_date != null ? String(s.salary_date) : '')
  const [useCustom, setUseCustom] = useState(fs.salary_override != null && fs.salary_override > 0)
  const [customAmt, setCustomAmt] = useState(fs.salary_override != null ? String(fs.salary_override) : '')
  const customAmtRef = useRef<HTMLInputElement | null>(null)
  const [customAmtFocused, setCustomAmtFocused] = useState(false)
  const [commitSel, setCommitSel] = useState<Set<string>>(() => initSet(fs.commitment_ids, activeCommitments.map(x => x.id)))
  const [savingsSel, setSavingsSel] = useState<Set<string>>(() => initSet(fs.savings_ids, activeSavings.map(x => x.id)))
  const [saving, setSaving] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // Auto-detected salary (ignoring override) for display purposes
  const autoSalary = useMemo(() => {
    const patched = { ...state, forecast_settings: { ...fs, salary_override: null } }
    return estimateForecastSalary(patched)
  }, [state, fs])

  const toggle = (set: Set<string>, id: string, setter: (v: Set<string>) => void) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    const allCommit = activeCommitments.map(x => x.id)
    const allSavings = activeSavings.map(x => x.id)
    const parsedCustom = evaluateAmountExpression(customAmt) ?? NaN
    const fPatch: Partial<ForecastSettings> = {
      enabled,
      days,
      commitment_ids: allCommit.every(id => commitSel.has(id)) ? null : [...commitSel],
      savings_ids: allSavings.every(id => savingsSel.has(id)) ? null : [...savingsSel],
      salary_override: useCustom && parsedCustom > 0 ? Math.round(parsedCustom) : null,
    }
    const settingsPatch: Partial<Settings> = {}
    const day = parseInt(salaryDay)
    if (day >= 1 && day <= 31 && day !== s.salary_date) settingsPatch.salary_date = day
    try {
      await onUpdateForecastSettings(fPatch)
      if (Object.keys(settingsPatch).length > 0) await onUpdateSettings(settingsPatch)
    } catch (_) { /* keep UI responsive */ }
    setSaving(false)
    onClose()
  }

  const lbl: React.CSSProperties = { font: `700 11px ${F}`, color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8, display: 'block' }
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 12, padding: '12px 14px', font: `700 15px ${F}`, color: c.ink, outline: 'none' }

  const CheckRow = ({ checked, onTap, label, amount }: { checked: boolean; onTap: () => void; label: string; amount: number }) => (
    <button onClick={onTap} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, background: 'none', border: 'none', padding: '9px 0', cursor: 'pointer' }}>
      <div style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, background: checked ? c.accent : 'transparent', border: `1.5px solid ${checked ? c.accent : c.faint}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {checked && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
      </div>
      <span style={{ flex: 1, textAlign: 'left', font: `700 14px ${F}`, color: c.ink }}>{label}</span>
      <span style={{ font: `600 13px ${F}`, color: c.muted }}>{fmt(amount)}</span>
    </button>
  )

  const hasAuto = autoSalary.amount != null
  const activeSource = salaryEst.source
  const activeLabel = activeSource != null ? SALARY_SOURCE_LABEL[activeSource] : 'Not Available'

  return (
    <BottomSheet open={open} onClose={onClose} zIndex={300} showHelpButton={false}>
      <div style={{ padding: '4px 20px 24px', fontFamily: `${F}, sans-serif` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ font: `800 20px ${F}`, color: c.ink }}>Cash Flow Forecast Setup</div>
          <button onClick={() => setShowHelp(!showHelp)} style={{ width: 28, height: 28, borderRadius: 999, background: showHelp ? c.accent : c.surface2, border: `1px solid ${showHelp ? c.accent : c.faint}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ font: `700 13px ${F}`, color: showHelp ? '#fff' : c.muted, lineHeight: 1 }}>?</span>
          </button>
        </div>
        {showHelp ? (
          <div style={{ background: c.accentSoft, borderRadius: 12, padding: '12px 14px', marginBottom: 20 }}>
            <div style={{ font: `700 12px ${F}`, color: c.accent, marginBottom: 8 }}>How Forecast Setup Works</div>
            {[
              { label: pattern === 'monthly' ? 'Salary Date' : 'Income Schedule', desc: pattern === 'monthly' ? 'The day you receive your salary. Used to calculate salary cycles and forecast income.' : 'Your income schedule determines how forecast cycles are calculated.' },
              { label: pattern === 'monthly' ? 'Estimated Salary' : pattern === 'weekly' ? 'Estimated Weekly Income' : pattern === 'variable' ? 'Estimated Daily Income' : 'Estimated Monthly Drawings', desc: pattern === 'monthly' ? 'Auto-detected from your salary history. Use custom estimate if it\'s inaccurate or if you expect a different amount.' : pattern === 'weekly' ? 'Based on your weekly income.' : pattern === 'variable' ? 'Estimated from your recent earnings.' : 'Estimated from your recorded drawings.' },
              { label: 'Forecast Period', desc: 'How far ahead the forecast looks. 30 days covers this month, 60 days covers the next income cycle too, 90 days gives a longer view.' },
              { label: 'Commitments', desc: 'Recurring bills and obligations (EMI, rent, insurance). Unchecked items are excluded from the forecast.' },
              { label: 'Savings Plans', desc: 'Recurring savings contributions (SIP, RD, Gold, Chit). Unchecked items are excluded from the forecast.' },
            ].map(h => (
              <div key={h.label} style={{ marginBottom: 8 }}>
                <span style={{ font: `700 11px ${F}`, color: c.ink }}>{h.label}</span>
                <div style={{ font: `500 11px ${F}`, color: c.muted, lineHeight: 1.4, marginTop: 1 }}>{h.desc}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ font: `600 13px ${F}`, color: c.muted, marginBottom: 20 }}>Built from your existing data. Tweak what's included.</div>
        )}

        {/* Salary date */}
        <label style={lbl}>{pattern === 'monthly' ? 'Salary date' : 'Income schedule'}</label>
        {pattern === 'monthly' ? (
          s.salary_date != null ? (
            <div style={{ ...inp, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'default' }}>
              <span>{s.salary_date}{['th', 'st', 'nd', 'rd'][(s.salary_date % 10 > 3 || (s.salary_date > 10 && s.salary_date < 14)) ? 0 : s.salary_date % 10]} of each month</span>
              <span style={{ font: `600 11px ${F}`, color: c.muted }}>from your budget settings</span>
            </div>
          ) : (
            <input value={salaryDay} onChange={e => setSalaryDay(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="Day of month, e.g. 28" style={inp} />
          )
        ) : (
          <div style={{ ...inp, cursor: 'default', font: `600 13px ${F}`, color: c.muted }}>
            Income settings are managed in the Budget section of Settings
          </div>
        )}

        {/* Estimated salary with source transparency */}
        <label style={{ ...lbl, marginTop: 18 }}>{pattern === 'monthly' ? 'Estimated salary' : pattern === 'weekly' ? 'Estimated weekly income' : pattern === 'variable' ? 'Estimated daily income' : 'Estimated monthly drawings'}</label>
        {salaryEst.amount != null ? (
          <div style={{ background: c.surface2, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ font: `800 20px ${F}`, color: c.ink }}>{fmt(salaryEst.amount)}</span>
              <span style={{ font: `600 11px ${F}`, color: c.accent, background: c.accentSoft, borderRadius: 6, padding: '3px 8px' }}>{activeLabel}</span>
            </div>
          </div>
        ) : (
          <div style={{ background: c.surface2, borderRadius: 12, padding: '14px' }}>
            <div style={{ font: `700 14px ${F}`, color: c.muted, marginBottom: 6 }}>Not Available</div>
            <div style={{ font: `600 12px ${F}`, color: c.muted, lineHeight: 1.5 }}>
              Enter a custom estimate below to improve forecast accuracy.
            </div>
          </div>
        )}

        {/* Custom override toggle */}
        <button
          onClick={() => setUseCustom(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: useCustom ? c.accentSoft : c.surface2, border: `1.5px solid ${useCustom ? c.accent : c.faint}`, borderRadius: 12, padding: '11px 14px', cursor: 'pointer', marginTop: 10 }}
        >
          <span style={{ font: `700 13px ${F}`, color: useCustom ? c.accent : c.ink }}>Use Custom Estimate</span>
          <div style={{ width: 42, height: 24, borderRadius: 999, background: useCustom ? c.accent : c.faint, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ width: 18, height: 18, borderRadius: 999, background: '#fff', position: 'absolute', top: 3, left: useCustom ? 21 : 3, transition: 'left 0.2s' }} />
          </div>
        </button>

        {useCustom && (
          <div style={{ marginTop: 10 }}>
            <input
              ref={customAmtRef}
              value={customAmt}
              onChange={e => setCustomAmt(e.target.value.replace(/[^0-9+\-*x×X/÷\s]/g, ''))}
              inputMode="decimal"
              placeholder={pattern === 'monthly' ? 'Enter your expected salary' : pattern === 'weekly' ? 'Enter your expected weekly income' : pattern === 'variable' ? 'Enter your expected daily income' : 'Enter your expected monthly drawings'}
              onFocus={e => { e.target.select(); setCustomAmtFocused(true) }}
              onBlur={e => {
                setCustomAmtFocused(false)
                const r = evaluateAmountExpression(e.target.value)
                if (r !== null) setCustomAmt(String(Math.round(r)))
              }}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                const r = evaluateAmountExpression(e.currentTarget.value)
                if (r !== null) setCustomAmt(String(Math.round(r)))
              }}
              style={inp}
            />
            {customAmtFocused && <AmountOperatorRow inputRef={customAmtRef} onChange={setCustomAmt} />}
            {hasAuto && (
              <div style={{ font: `600 11px ${F}`, color: c.muted, marginTop: 6 }}>
                Auto-detected: {fmt(autoSalary.amount!)} ({autoSalary.source != null ? SALARY_SOURCE_LABEL[autoSalary.source] : ''})
              </div>
            )}
          </div>
        )}

        {/* Forecast period */}
        <label style={{ ...lbl, marginTop: 18 }}>Forecast period</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[30, 60, 90].map(n => (
            <button key={n} onClick={() => setDays(n)} style={{ flex: 1, padding: '11px', borderRadius: 11, border: `1.5px solid ${days === n ? c.accent : c.faint}`, background: days === n ? c.accent : 'transparent', color: days === n ? '#fff' : c.ink, font: `700 13px ${F}`, cursor: 'pointer' }}>{n} days</button>
          ))}
        </div>

        {/* Include commitments */}
        {activeCommitments.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <label style={lbl}>Include commitments</label>
            {activeCommitments.map(cm => (
              <CheckRow key={cm.id} checked={commitSel.has(cm.id)} onTap={() => toggle(commitSel, cm.id, setCommitSel)} label={cm.name} amount={Math.round(Math.min(cm.amount, cm.remaining))} />
            ))}
          </div>
        )}

        {/* Include savings */}
        {activeSavings.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <label style={lbl}>Include savings plans</label>
            {activeSavings.map(sv => (
              <CheckRow key={sv.id} checked={savingsSel.has(sv.id)} onTap={() => toggle(savingsSel, sv.id, setSavingsSel)} label={sv.name} amount={Math.round(sv.amount)} />
            ))}
          </div>
        )}

        {/* Show on dashboard */}
        <button onClick={() => setEnabled(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: c.surface2, border: 'none', borderRadius: 12, padding: '13px 14px', cursor: 'pointer', marginTop: 22 }}>
          <span style={{ font: `700 14px ${F}`, color: c.ink }}>Show forecast on dashboard</span>
          <div style={{ width: 42, height: 24, borderRadius: 999, background: enabled ? c.accent : c.faint, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ width: 18, height: 18, borderRadius: 999, background: '#fff', position: 'absolute', top: 3, left: enabled ? 21 : 3, transition: 'left 0.2s' }} />
          </div>
        </button>

        <button onClick={save} disabled={saving} style={{ width: '100%', background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '15px', font: `800 15px ${F}`, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, marginTop: 16 }}>
          {saving ? 'Saving…' : 'Save forecast settings'}
        </button>
      </div>
    </BottomSheet>
  )
}
