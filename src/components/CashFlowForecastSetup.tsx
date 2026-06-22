import { useMemo, useState } from 'react'
import { BottomSheet } from '@/components/BottomSheet'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { estimateForecastSalary } from '@/lib/cashflow'
import type { AppState, Settings } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void>
}

const F = 'Plus Jakarta Sans'

export function CashFlowForecastSetup({ open, onClose, state, onUpdateSettings }: Props) {
  const c = useTheme()
  const s = state.settings

  const activeCommitments = useMemo(() => state.commitments.filter(x => x.is_active !== false && x.remaining > 0), [state.commitments])
  const activeSavings = useMemo(() => state.savings.filter(x => x.is_active !== false && x.is_recurring), [state.savings])
  const salaryEst = useMemo(() => estimateForecastSalary(state), [state])

  const initSet = (ids: string[] | null | undefined, all: string[]) => new Set(ids == null ? all : ids)

  const [enabled, setEnabled] = useState(s.forecast_enabled ?? true)
  const [days, setDays] = useState(s.forecast_days ?? 60)
  const [salaryDay, setSalaryDay] = useState(s.salary_date != null ? String(s.salary_date) : '')
  const [override, setOverride] = useState(s.forecast_salary_override != null ? String(s.forecast_salary_override) : '')
  const [commitSel, setCommitSel] = useState<Set<string>>(() => initSet(s.forecast_commitment_ids, activeCommitments.map(x => x.id)))
  const [savingsSel, setSavingsSel] = useState<Set<string>>(() => initSet(s.forecast_savings_ids, activeSavings.map(x => x.id)))
  const [saving, setSaving] = useState(false)

  const canEstimate = salaryEst.amount != null && salaryEst.source !== 'override'

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
    const patch: Partial<Settings> = {
      forecast_enabled: enabled,
      forecast_days: days,
      // store null when everything is selected so future items are auto-included
      forecast_commitment_ids: allCommit.every(id => commitSel.has(id)) ? null : [...commitSel],
      forecast_savings_ids: allSavings.every(id => savingsSel.has(id)) ? null : [...savingsSel],
    }
    if (!canEstimate) {
      const ov = parseFloat(override)
      patch.forecast_salary_override = ov > 0 ? Math.round(ov) : null
    }
    const day = parseInt(salaryDay)
    if (day >= 1 && day <= 31 && day !== s.salary_date) patch.salary_date = day // reuses the EXISTING field
    try { await onUpdateSettings(patch) } catch (_) { /* keep UI responsive */ }
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

  return (
    <BottomSheet open={open} onClose={onClose} zIndex={300}>
      <div style={{ padding: '4px 20px 24px', fontFamily: `${F}, sans-serif` }}>
        <div style={{ font: `800 20px ${F}`, color: c.ink, marginBottom: 4 }}>Cash Flow Forecast Setup</div>
        <div style={{ font: `600 13px ${F}`, color: c.muted, marginBottom: 20 }}>Built from your existing data. Tweak what's included.</div>

        {/* Salary date (reuses settings.salary_date) */}
        <label style={lbl}>Salary date</label>
        {s.salary_date != null ? (
          <div style={{ ...inp, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'default' }}>
            <span>{s.salary_date}{['th', 'st', 'nd', 'rd'][(s.salary_date % 10 > 3 || (s.salary_date > 10 && s.salary_date < 14)) ? 0 : s.salary_date % 10]} of each month</span>
            <span style={{ font: `600 11px ${F}`, color: c.muted }}>from your budget settings</span>
          </div>
        ) : (
          <input value={salaryDay} onChange={e => setSalaryDay(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="Day of month, e.g. 28" style={inp} />
        )}

        {/* Estimated salary */}
        <label style={{ ...lbl, marginTop: 18 }}>Estimated salary</label>
        {canEstimate ? (
          <div style={{ ...inp, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'default' }}>
            <span style={{ color: c.ink }}>{fmt(salaryEst.amount!)}</span>
            <span style={{ font: `600 11px ${F}`, color: c.good }}>{salaryEst.source === 'avg' ? 'avg of recent salary' : 'last salary'}</span>
          </div>
        ) : (
          <>
            <input value={override} onChange={e => setOverride(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="numeric" placeholder="Enter your usual salary" onFocus={e => e.target.select()} style={inp} />
            <div style={{ font: `600 11px ${F}`, color: c.muted, marginTop: 6 }}>We couldn't detect it — tag a salary credit under the “Salary” category and this fills in automatically.</div>
          </>
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
