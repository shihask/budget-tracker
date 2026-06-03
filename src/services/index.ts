// All CRUD operations go directly through Supabase client SDK — no API layer.
// Usage: import these services in your hooks/components and call them.
// The app currently runs in local-state mode (seed data); swap in these services
// when your Supabase project is configured.

import { supabase } from '@/lib/supabase'
import type { Account, Category, Transaction, Borrowing, Settings, TransactionType } from '@/types'

// ── Accounts ─────────────────────────────────────────────────────────────────
export const accountsService = {
  async getAll(): Promise<Account[]> {
    const { data, error } = await supabase
      .from('accounts').select('*').eq('is_active', true).order('type')
    if (error) throw error
    return data || []
  },

  async updateBalance(id: string, delta: number): Promise<void> {
    // Read-then-write (no RPC needed for prototype)
    const { data: acc, error: re } = await supabase.from('accounts').select('current_balance').eq('id', id).single()
    if (re || !acc) throw re
    const { error } = await supabase.from('accounts').update({ current_balance: acc.current_balance + delta }).eq('id', id)
    if (error) throw error
  },
}

// ── Categories ────────────────────────────────────────────────────────────────
export const categoriesService = {
  async getAll(): Promise<Category[]> {
    const { data, error } = await supabase.from('categories').select('*').order('group_name')
    if (error) throw error
    return data || []
  },
}

// ── Transactions ──────────────────────────────────────────────────────────────
export const transactionsService = {
  async getAll(limit = 50): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, category:categories(*), from_account:accounts!from_account_id(*)')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data as Transaction[]) || []
  },

  async getByDateRange(start: string, end: string): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, category:categories(*), from_account:accounts!from_account_id(*)')
      .gte('transaction_date', start)
      .lte('transaction_date', end)
      .order('transaction_date', { ascending: false })
    if (error) throw error
    return (data as Transaction[]) || []
  },

  async create(
    tx: Omit<Transaction, 'id' | 'created_at' | 'category' | 'from_account'>
  ): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .insert(tx)
      .select('*, category:categories(*), from_account:accounts!from_account_id(*)')
      .single()
    if (error) throw error

    // Update account balance
    if (tx.from_account_id && ['expense', 'commitment', 'borrowing_repayment'].includes(tx.transaction_type)) {
      await accountsService.updateBalance(tx.from_account_id, -tx.amount)
    }
    if (tx.from_account_id && tx.transaction_type === 'income') {
      await accountsService.updateBalance(tx.from_account_id, tx.amount)
    }

    return data as Transaction
  },

  async delete(id: string, tx: Transaction): Promise<void> {
    // Reverse balance effect
    if (tx.from_account_id && ['expense', 'commitment', 'borrowing_repayment'].includes(tx.transaction_type)) {
      await accountsService.updateBalance(tx.from_account_id, tx.amount)
    }
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) throw error
  },

  async getWeeklySpend(start: string, end: string): Promise<number> {
    // Lifestyle = category group 'Lifestyle'
    const { data, error } = await supabase
      .from('transactions')
      .select('amount, category:categories!inner(group_name)')
      .eq('transaction_type', 'expense')
      .gte('transaction_date', start)
      .lte('transaction_date', end)
      .eq('category.group_name', 'Lifestyle')
    if (error) throw error
    return (data || []).reduce((s, t) => s + t.amount, 0)
  },
}

// ── Borrowings ────────────────────────────────────────────────────────────────
export const borrowingsService = {
  async getAll(): Promise<Borrowing[]> {
    const { data, error } = await supabase.from('borrowings').select('*').order('person_name')
    if (error) throw error
    return data || []
  },

  async addPayment(id: string, paymentAmount: number): Promise<void> {
    const { data: b, error: re } = await supabase.from('borrowings').select('paid_amount').eq('id', id).single()
    if (re || !b) throw re
    const { error } = await supabase.from('borrowings').update({ paid_amount: b.paid_amount + paymentAmount }).eq('id', id)
    if (error) throw error
  },

  async create(b: Omit<Borrowing, 'id' | 'remaining_amount'>): Promise<Borrowing> {
    const { data, error } = await supabase.from('borrowings').insert(b).select().single()
    if (error) throw error
    return data
  },
}

// ── Settings ──────────────────────────────────────────────────────────────────
export const settingsService = {
  async get(): Promise<Settings | null> {
    const { data, error } = await supabase.from('settings').select('*').limit(1).single()
    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  async update(updates: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
    const existing = await this.get()
    if (!existing) {
      const { data, error } = await supabase.from('settings').insert(updates).select().single()
      if (error) throw error
      return data
    }
    const { data, error } = await supabase.from('settings').update(updates).eq('id', existing.id).select().single()
    if (error) throw error
    return data
  },
}
