import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { iso, TODAY, round2, selectOnFocus } from '@/lib/utils'
import { evaluateAmountExpression, sanitizeAmountInput } from '@/lib/amountExpression'
import { BottomSheet } from '@/components/BottomSheet'
import { AmountOperatorRow } from '@/components/AmountOperatorRow'
import { CategorySelect } from '@/components/CategorySelect'
import { EventIcon, EVENT_ICON_KEYS, DEFAULT_EVENT_ICON } from '../lib/eventIcons'
import { INCOME_GROUP, TRANSFER_GROUP, BORROWING_GROUP, ADJUSTMENT_GROUP } from '@/lib/constants'
import type { AppState, LifeEvent } from '@/types'



export type EventFormValues = Omit<LifeEvent, 'id' | 'user_id' | 'created_at' | 'updated_at'>

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  onSave: (form: EventFormValues) => Promise<void>
  onAddCategory: (name: string, group_name: string) => Promise<string>
  editEvent?: LifeEvent | null
}

export function EventFormSheet({ open, onClose, state, onSave, onAddCategory, editEvent }: Props) {
  const c = useTheme()
  const [step, setStep] = useState<1 | 2>(1)
  const [icon, setIcon] = useState(DEFAULT_EVENT_ICON)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [excluded, setExcluded] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const targetRef = useRef<HTMLInputElement>(null)
  const [targetFocused, setTargetFocused] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep(1)
    setError('')
    if (editEvent) {
      setIcon(editEvent.icon ?? DEFAULT_EVENT_ICON)
      setName(editEvent.name)
      setTarget(editEvent.target_amount ? String(editEvent.target_amount) : '')
      setStartDate(editEvent.start_date ?? '')
      setEndDate(editEvent.end_date ?? '')
      setAccountId(editEvent.default_account_id ?? '')
      setCategoryId(editEvent.default_category_id ?? '')
      setExcluded(editEvent.excluded_from_budget)
    } else {
      setIcon(DEFAULT_EVENT_ICON)
      setName('')
      setTarget('')
      setStartDate(iso(TODAY))
      setEndDate('')
      setAccountId(state.accounts.find(a => a.is_active)?.id ?? '')
      setCategoryId('')
      setExcluded(true)
    }
  }, [open, editEvent, state.accounts])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const amt = evaluateAmountExpression(target)
      await onSave({
        name: name.trim(),
        icon,
        target_amount: amt && amt > 0 ? round2(amt) : null,
        start_date: startDate || null,
        end_date: endDate || null,
        excluded_from_budget: excluded,
        default_category_id: categoryId || null,
        default_account_id: accountId || null,
        status: editEvent?.status ?? 'active',
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this event.')
      setStep(1)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 14,
    border: `1.5px solid ${c.faint}`, background: c.surface2,
    font: '600 15px Plus Jakarta Sans', color: c.ink,
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    font: '700 12px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
  }

  // The copy speaks about the event by name once there is one, so the choice
  // reads as being about this wedding rather than about a settings concept.
  const subject = name.trim() || 'these'

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
          {editEvent ? 'Edit Event' : 'New Life Event'}
        </div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 20 }}>
          Step {step} of 2
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 12, padding: '10px 12px', font: '600 13px Plus Jakarta Sans', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {step === 1 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={labelStyle}>Event</div>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Brother's Wedding"
                style={inputStyle}
                autoFocus
              />
              {/* Icon grid rather than a dropdown: eight options fit on one row,
                  so picking is a single tap and every choice stays visible. */}
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {EVENT_ICON_KEYS.map(key => {
                  const active = icon === key
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={key}
                      aria-pressed={active}
                      onClick={() => setIcon(key)}
                      style={{
                        flex: 1, aspectRatio: '1', borderRadius: 12, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1.5px solid ${active ? c.accent : c.faint}`,
                        background: active ? c.accentSoft : c.surface2,
                        color: active ? c.accent : c.muted,
                        padding: 0,
                      }}
                    >
                      <EventIcon name={key} size={18} color="currentColor" />
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div style={labelStyle}>Target amount (optional)</div>
              <input
                ref={targetRef}
                type="text"
                value={target}
                onChange={e => setTarget(sanitizeAmountInput(e.target.value))}
                onFocus={e => { selectOnFocus(e.target); setTargetFocused(true) }}
                onBlur={e => {
                  setTargetFocused(false)
                  const r = evaluateAmountExpression(e.target.value)
                  setTarget(r === null ? '' : String(round2(r)))
                }}
                placeholder="0"
                inputMode="decimal"
                style={inputStyle}
              />
              {targetFocused && <AmountOperatorRow inputRef={targetRef} onChange={setTarget} />}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Starts</div>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Ends</div>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div>
              <div style={labelStyle}>Default payment account</div>
              <select value={accountId} onChange={e => setAccountId(e.target.value)}
                style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                <option value="">None</option>
                {state.accounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                {(state.credit_cards || []).map(cc => <option key={cc.id} value={cc.id}>{cc.name} (CC)</option>)}
              </select>
            </div>

            <div>
              <div style={labelStyle}>Default category</div>
              <CategorySelect
                value={categoryId}
                onChange={setCategoryId}
                state={state}
                onAddCategory={onAddCategory}
                includeEmpty
                emptyLabel="None"
                excludeGroups={[INCOME_GROUP, TRANSFER_GROUP, BORROWING_GROUP, ADJUSTMENT_GROUP]}
              />
            </div>

            <div style={{ font: '500 11.5px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
              The account and category are used to prefill one-tap entries from the dashboard card.
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!name.trim()}
              style={{
                width: '100%', padding: '14px 0', marginTop: 4, borderRadius: 16, border: 'none',
                background: name.trim() ? c.accent : c.faint, color: '#fff',
                font: '700 16px Plus Jakarta Sans', cursor: name.trim() ? 'pointer' : 'default',
              }}
            >Continue</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, lineHeight: 1.35 }}>
              How should MoneyPlant treat these expenses?
            </div>

            <ChoiceRow
              selected={excluded}
              onSelect={() => setExcluded(true)}
              badge="Recommended"
              title="Track separately"
              desc={`${subject === 'these' ? 'These' : `${subject}`} expenses get their own total and progress without affecting normal lifestyle analytics.`}
            />
            <ChoiceRow
              selected={!excluded}
              onSelect={() => setExcluded(false)}
              title="Treat as normal spending"
              desc="Include these expenses in weekly and monthly budget calculations."
            />

            <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                What changes?
              </div>
              <PillRow label="Kept out" items={['Weekly budget', 'Lifestyle forecast', 'Spending streaks']} tone={c.muted} faint={c.faint} dim={!excluded} />
              <div style={{ height: 8 }} />
              <PillRow label="Still counted" items={['Account balances', 'Cash flow', 'Event total']} tone="#10B981" faint={c.faint} />
            </div>

            <div style={{ font: '500 11.5px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
              This affects only analytics and pacing—not account balances.
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setStep(1)}
                style={{ flex: 1, padding: '14px 0', borderRadius: 16, border: 'none', background: c.surface2, color: c.muted, font: '700 15px Plus Jakarta Sans', cursor: 'pointer' }}
              >Back</button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 2, padding: '14px 0', borderRadius: 16, border: 'none', background: c.accent, color: '#fff', font: '700 16px Plus Jakarta Sans', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
              >{saving ? 'Saving…' : editEvent ? 'Save changes' : 'Create event'}</button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

function ChoiceRow({ selected, onSelect, badge, title, desc }: {
  selected: boolean; onSelect: () => void; badge?: string; title: string; desc: string
}) {
  const c = useTheme()
  return (
    <div
      onClick={onSelect}
      style={{
        borderRadius: 16, padding: '14px 16px', cursor: 'pointer',
        border: `1.5px solid ${selected ? c.accent : c.faint}`,
        background: selected ? c.accentSoft : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{
          width: 18, height: 18, borderRadius: 9, flexShrink: 0,
          border: `2px solid ${selected ? c.accent : c.faint}`,
          background: selected ? c.accent : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {selected && <div style={{ width: 6, height: 6, borderRadius: 3, background: '#fff' }} />}
        </div>
        <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>{title}</div>
        {badge && (
          <div style={{ marginLeft: 'auto', font: '700 9.5px Plus Jakarta Sans', color: c.accent, background: c.accentSoft, borderRadius: 6, padding: '3px 7px', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
            {badge}
          </div>
        )}
      </div>
      <div style={{ font: '500 12.5px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5, paddingLeft: 26 }}>{desc}</div>
    </div>
  )
}

function PillRow({ label, items, tone, faint, dim }: {
  label: string; items: string[]; tone: string; faint: string; dim?: boolean
}) {
  const c = useTheme()
  return (
    <div style={{ opacity: dim ? 0.35 : 1 }}>
      <div style={{ font: '700 10px Plus Jakarta Sans', color: tone, marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {items.map(i => (
          <span key={i} style={{ font: '600 11px Plus Jakarta Sans', color: c.ink, background: faint, borderRadius: 7, padding: '4px 8px' }}>{i}</span>
        ))}
      </div>
    </div>
  )
}
