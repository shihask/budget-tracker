import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppState, Transaction, Commitment } from '@/types'

const EMPTY_STATE: AppState = {
  accounts: [],
  categories: [],
  settings: { id: '', weekly_budget: 5000, emergency_fund: 20000 },
  commitments: [],
  borrowings: [],
  transactions: [],
}

export function useSupabaseData() {
  const [state, setState] = useState<AppState>(EMPTY_STATE)
  const [loading, setLoading] = useState(true)
  const [usingSupabase, setUsingSupabase] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [
          { data: settings },
          { data: accounts },
          { data: categories },
          { data: borrowings },
          { data: commitments },
          { data: transactions },
        ] = await Promise.all([
          supabase.from('settings').select('*').limit(1).single(),
          supabase.from('accounts').select('*').eq('is_active', true).order('name'),
          supabase.from('categories').select('*').order('group_name'),
          supabase.from('borrowings').select('*').order('person_name'),
          supabase.from('commitments').select('*').order('name'),
          supabase.from('transactions')
            .select('*, category:categories(*), from_account:accounts!from_account_id(*)')
            .order('transaction_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(200),
        ])

        if (!settings) {
          console.warn('No settings found in Supabase')
          setLoading(false)
          return
        }

        setState({
          accounts: accounts || [],
          categories: categories || [],
          settings,
          commitments: (commitments as Commitment[]) || [],
          borrowings: borrowings || [],
          transactions: (transactions as Transaction[]) || [],
        })
        setUsingSupabase(true)
        console.info('✅ Loaded all data from Supabase')
      } catch (err) {
        console.error('Supabase load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const addTransaction = useCallback(async (
    form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>
  ) => {
    try {
      const { data: newTx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          transaction_date: form.transaction_date,
          description: form.description,
          amount: form.amount,
          transaction_type: form.transaction_type,
          category_id: form.category_id,
          from_account_id: form.from_account_id,
          to_account_id: null,
          notes: '',
        })
        .select('*, category:categories(*), from_account:accounts!from_account_id(*)')
        .single()

      if (txErr) throw txErr

      // Update account balance
      if (form.from_account_id) {
        const { data: acc } = await supabase
          .from('accounts').select('current_balance')
          .eq('id', form.from_account_id).single()
        if (acc) {
          await supabase.from('accounts')
            .update({ current_balance: acc.current_balance - form.amount })
            .eq('id', form.from_account_id)
        }
      }

      setState(s => ({
        ...s,
        transactions: [newTx as Transaction, ...s.transactions],
        accounts: s.accounts.map(a =>
          a.id === form.from_account_id
            ? { ...a, current_balance: a.current_balance - form.amount }
            : a
        ),
      }))
    } catch (err) {
      console.error('Failed to save transaction:', err)
      throw err
    }
  }, [])

  return { state, setState, loading, usingSupabase, addTransaction }
}
