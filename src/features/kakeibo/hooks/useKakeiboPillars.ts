import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isPillar, mergeAiPillars, type CategoryPillarRow, type Pillar, type TxnPillarRow } from '../lib/pillars'

export interface KakeiboPillars {
  status: 'loading' | 'ready' | 'unavailable'
  catPillars: Map<string, CategoryPillarRow>
  txnPillars: Map<string, TxnPillarRow>
  /** null = reset to default (delete the row). Always source 'user'. */
  setCategoryPillar: (categoryId: string, pillar: Pillar | null) => Promise<void>
  setTxnPillar: (transactionId: string, pillar: Pillar | null) => Promise<void>
  /** AI suggestions through mp_kakeibo_save_ai_pillars — never overwrites a user row. */
  saveAiSuggestions: (items: { category_id: string; pillar: Pillar }[]) => Promise<void>
}

const PAGE = 1000

/** Kakeibo's pillar layer: its own two tables, its own queries. Never touches
 *  transactions, categories or budget buckets. Load failure → 'unavailable'
 *  (the workspace still works on seed pillars and says so). */
export function useKakeiboPillars(userId: string, enabled: boolean): KakeiboPillars {
  const [cat, setCat] = useState<Map<string, CategoryPillarRow> | null>(null)
  const [txn, setTxn] = useState<Map<string, TxnPillarRow> | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || loadedFor === userId) return
    let alive = true
    ;(async () => {
      const { data: c, error: e1 } = await supabase
        .from('kakeibo_category_pillars').select('category_id, pillar, source').eq('user_id', userId)
      if (e1) throw e1
      const t: TxnPillarRow[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from('kakeibo_txn_pillars').select('transaction_id, pillar').eq('user_id', userId)
          .order('transaction_id').range(offset, offset + PAGE - 1)
        if (error) throw error
        t.push(...((data as TxnPillarRow[]) ?? []))
        if (!data || data.length < PAGE) break
      }
      if (!alive) return
      setCat(new Map(((c as CategoryPillarRow[]) ?? []).filter(r => isPillar(r.pillar)).map(r => [r.category_id, r])))
      setTxn(new Map(t.filter(r => isPillar(r.pillar)).map(r => [r.transaction_id, r])))
      setLoadedFor(userId)
    })().catch(err => {
      console.error('Kakeibo: failed to load pillars', err)
      if (alive) { setFailedFor(userId); setLoadedFor(userId) }
    })
    return () => { alive = false }
  }, [enabled, userId, loadedFor])

  const setCategoryPillar = useCallback(async (categoryId: string, pillar: Pillar | null) => {
    if (pillar == null) {
      const { error } = await supabase.from('kakeibo_category_pillars').delete().eq('user_id', userId).eq('category_id', categoryId)
      if (error) throw error
      setCat(prev => { const m = new Map(prev ?? []); m.delete(categoryId); return m })
      return
    }
    const row = { user_id: userId, category_id: categoryId, pillar, source: 'user' as const }
    const { error } = await supabase.from('kakeibo_category_pillars').upsert(row, { onConflict: 'user_id,category_id' })
    if (error) throw error
    setCat(prev => new Map(prev ?? []).set(categoryId, { category_id: categoryId, pillar, source: 'user' }))
  }, [userId])

  const setTxnPillar = useCallback(async (transactionId: string, pillar: Pillar | null) => {
    if (pillar == null) {
      const { error } = await supabase.from('kakeibo_txn_pillars').delete().eq('user_id', userId).eq('transaction_id', transactionId)
      if (error) throw error
      setTxn(prev => { const m = new Map(prev ?? []); m.delete(transactionId); return m })
      return
    }
    const { error } = await supabase.from('kakeibo_txn_pillars')
      .upsert({ user_id: userId, transaction_id: transactionId, pillar }, { onConflict: 'user_id,transaction_id' })
    if (error) throw error
    setTxn(prev => new Map(prev ?? []).set(transactionId, { transaction_id: transactionId, pillar }))
  }, [userId])

  const saveAiSuggestions = useCallback(async (items: { category_id: string; pillar: Pillar }[]) => {
    if (items.length === 0) return
    const { error } = await supabase.rpc('mp_kakeibo_save_ai_pillars', { p_items: items })
    if (error) throw error
    setCat(prev => mergeAiPillars(prev ?? new Map(), items))
  }, [])

  return useMemo<KakeiboPillars>(() => ({
    status: failedFor === userId ? 'unavailable' : cat && txn && loadedFor === userId ? 'ready' : 'loading',
    catPillars: cat ?? new Map(),
    txnPillars: txn ?? new Map(),
    setCategoryPillar, setTxnPillar, saveAiSuggestions,
  }), [failedFor, userId, cat, txn, loadedFor, setCategoryPillar, setTxnPillar, saveAiSuggestions])
}
