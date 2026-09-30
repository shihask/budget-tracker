import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { localIso } from '@/lib/utils'
import { fmtDue } from '@/lib/recurring'
import { BottomSheet } from './BottomSheet'

// Which due date a payment is for — see paidForChoices / paid_through in recurring.ts.

interface PickerProps {
  options: Date[]
  value: string
  onChange: (iso: string) => void
  label?: string
}

export function PaidForPicker({ options, value, onChange, label = 'Paying for' }: PickerProps) {
  const c = useTheme()
  const today = localIso(new Date())
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map(d => {
          const iso = localIso(d)
          const on = iso === value
          const late = iso < today
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onChange(iso)}
              style={{
                flex: 1, minWidth: 84, borderRadius: 11, padding: '9px 10px', cursor: 'pointer',
                background: on ? c.accentSoft : c.surface2,
                border: `1.5px solid ${on ? c.accent : c.faint}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              }}
            >
              <span style={{ font: '700 13px Plus Jakarta Sans', color: on ? c.accent : c.ink }}>Due {fmtDue(d)}</span>
              {late && <span style={{ font: '600 10px Plus Jakarta Sans', color: c.warn }}>late</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface SheetProps {
  open: boolean
  name: string
  options: Date[]
  current: Date | null
  onClose: () => void
  onSave: (iso: string) => Promise<void>
}

// Corrects which due the latest payment was for, without recording another payment.
export function PaidForSheet({ open, name, options, current, onClose, onSave }: SheetProps) {
  const c = useTheme()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset to the current value each time the sheet opens (or for another item).
  const currentIso = current ? localIso(current) : ''
  const openKey = open ? `${name}|${currentIso}` : ''
  const [seenKey, setSeenKey] = useState('')
  if (openKey !== seenKey) {
    setSeenKey(openKey)
    if (open) { setValue(currentIso); setError(null) }
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false} zIndex={300} maxHeight="85svh">
      <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>Which due did you pay?</div>
      <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 16 }}>
        Your last <strong style={{ color: c.ink }}>{name}</strong> payment covered this due date. Everything up to it counts as paid; later dues stay in your forecast.
      </div>
      <PaidForPicker options={options} value={value} onChange={setValue} label="Last payment was for" />
      {error && <div style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
        <button
          disabled={!value || saving}
          onClick={async () => {
            setSaving(true); setError(null)
            try { await onSave(value); onClose() }
            catch (e) { setError((e as { message?: string })?.message || 'Could not save. Try again.') }
            setSaving(false)
          }}
          style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: saving ? 'not-allowed' : 'pointer', opacity: !value || saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </BottomSheet>
  )
}
