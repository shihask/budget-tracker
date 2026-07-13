import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt, round2 } from '@/lib/utils'
import { evaluateAmountExpression } from '@/lib/amountExpression'
import { BottomSheet } from '@/components/BottomSheet'
import { AmountOperatorRow } from '@/components/AmountOperatorRow'
import type { ProjectBudget } from '../types'

interface BudgetRow {
  id: string | null
  category: string
  budget_amount: string
  isNew: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  budgets: ProjectBudget[]
  targetAmount: number
  onAdd: (form: { category: string; budget_amount: number }) => Promise<unknown>
  onUpdate: (id: string, patch: { category?: string; budget_amount?: number }) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

export function BudgetManageSheet({ open, onClose, budgets, targetAmount, onAdd, onUpdate, onRemove }: Props) {
  const c = useTheme()
  const [rows, setRows] = useState<BudgetRow[]>([])
  const [saving, setSaving] = useState(false)
  const rowRefs = useRef<Array<HTMLInputElement | null>>([])
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      setRows(budgets.map(b => ({
        id: b.id,
        category: b.category,
        budget_amount: String(b.budget_amount),
        isNew: false,
      })))
    }
  }, [open, budgets])

  const total = rows.reduce((s, r) => s + (evaluateAmountExpression(r.budget_amount) ?? 0), 0)
  const overBudget = targetAmount > 0 && total > targetAmount

  const addRow = () => {
    setRows(prev => [...prev, { id: null, category: '', budget_amount: '', isNew: true }])
  }

  const updateRow = (idx: number, field: 'category' | 'budget_amount', value: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const existingIds = new Set(budgets.map(b => b.id))
      const currentIds = new Set(rows.filter(r => r.id).map(r => r.id!))

      for (const b of budgets) {
        if (!currentIds.has(b.id)) {
          await onRemove(b.id)
        }
      }

      for (const row of rows) {
        const amt = round2(evaluateAmountExpression(row.budget_amount) ?? 0)
        if (!row.category.trim() || amt <= 0) continue

        if (row.id && existingIds.has(row.id)) {
          const orig = budgets.find(b => b.id === row.id)
          if (orig && (orig.category !== row.category.trim() || orig.budget_amount !== amt)) {
            await onUpdate(row.id, { category: row.category.trim(), budget_amount: amt })
          }
        } else {
          await onAdd({ category: row.category.trim(), budget_amount: amt })
        }
      }

      onClose()
    } catch (e) {
      console.error('Failed to save budgets', e)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px', borderRadius: 12,
    border: `1.5px solid ${c.faint}`, background: c.surface2,
    font: '600 14px Plus Jakarta Sans', color: c.ink,
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
          Manage Budgets
        </div>
        {targetAmount > 0 && (
          <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginBottom: 16 }}>
            Target: {fmt(targetAmount)} · Allocated: {fmt(total)}
            {overBudget && (
              <span style={{ color: '#F59E0B' }}> · Exceeds by {fmt(total - targetAmount)}</span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row, idx) => (
            <div key={idx}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={row.category}
                  onChange={e => updateRow(idx, 'category', e.target.value)}
                  placeholder="Category"
                  style={{ ...inputStyle, flex: 2 }}
                />
                <input
                  ref={el => { rowRefs.current[idx] = el }}
                  type="text"
                  value={row.budget_amount}
                  onChange={e => updateRow(idx, 'budget_amount', e.target.value)}
                  onFocus={() => setFocusedRowIndex(idx)}
                  onBlur={() => setFocusedRowIndex(null)}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return
                    const r = evaluateAmountExpression(e.currentTarget.value)
                    if (r !== null) updateRow(idx, 'budget_amount', String(round2(r)))
                  }}
                  placeholder="Amount"
                  inputMode="decimal"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => removeRow(idx)}
                  style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#EF4444', flexShrink: 0 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              {focusedRowIndex === idx && (
                <AmountOperatorRow inputRef={{ current: rowRefs.current[idx] }} onChange={v => updateRow(idx, 'budget_amount', v)} />
              )}
            </div>
          ))}
        </div>

        <button
          onClick={addRow}
          style={{
            width: '100%', padding: '10px 0', marginTop: 12, borderRadius: 12,
            border: `1.5px dashed ${c.faint}`, background: 'transparent',
            color: c.accent, font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
          }}
        >+ Add Category</button>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '14px 0', marginTop: 16, borderRadius: 16,
            border: 'none', background: c.accent, color: '#fff',
            font: '700 16px Plus Jakarta Sans', cursor: 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save Budgets'}
        </button>
      </div>
    </BottomSheet>
  )
}
