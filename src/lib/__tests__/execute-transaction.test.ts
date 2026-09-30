import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { executeTransaction } from '../execute-transaction'
import { txDeltas } from '../transaction-deltas'
import type { NewTransactionInput } from '@/types'

const NETWORK = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }

/** A tiny stand-in for the server, behaving like the idempotent
 *  mp_execute_transaction: a known p_id returns the existing row and moves
 *  nothing. `balanceMoves` counts how many times a delta was applied. */
function fakeServer() {
  const rows = new Map<string, Record<string, unknown>>()
  const s = {
    rows,
    balanceMoves: 0,
    rpcCalls: 0,
    updateCalls: 0,
    /** Scripted failures, consumed in order: 'rpc-lost' = committed but the
     *  response never arrived; 'tag-network' / 'tag-denied' for the follow-up. */
    fail: [] as ('rpc-lost' | 'tag-network' | 'tag-denied')[],
    client: null as unknown as SupabaseClient,
  }
  const rpc = async (_fn: string, args: Record<string, unknown>) => {
    s.rpcCalls++
    const id = args.p_id as string
    if (!rows.has(id)) {
      rows.set(id, { id, amount: args.p_amount, description: args.p_description, event_id: null, master_id: null, transaction_time: null })
      s.balanceMoves++
    }
    if (s.fail[0] === 'rpc-lost') { s.fail.shift(); return { data: null, error: NETWORK } }
    return { data: { ...rows.get(id) }, error: null }
  }
  const from = () => ({
    update: (patch: Record<string, unknown>) => ({
      eq: (_col: string, id: string) => ({
        select: () => ({
          single: async () => {
            s.updateCalls++
            const f = s.fail[0]
            if (f === 'tag-network') { s.fail.shift(); return { data: null, error: NETWORK } }
            if (f === 'tag-denied') { s.fail.shift(); return { data: null, error: { code: '23503', message: 'event gone' } } }
            const row = { ...rows.get(id)!, ...patch }
            rows.set(id, row)
            return { data: row, error: null }
          },
        }),
      }),
    }),
  })
  s.client = { rpc, from } as unknown as SupabaseClient
  return s
}

const form = (extra: Partial<NewTransactionInput> = {}): NewTransactionInput => ({
  transaction_date: '2026-09-29', description: 'Ooty petrol', amount: 500, transaction_type: 'expense',
  category_id: 'fuel', from_account_id: 'cash', ...extra,
})
const deltas = (f: NewTransactionInput) => txDeltas(f, new Set())

describe('executeTransaction — retry after a committed-but-unacknowledged save', () => {
  it('tag update lost → retry finds the row, finishes the tag, moves the balance once', async () => {
    const srv = fakeServer()
    const f = form({ event_id: 'ooty', transaction_time: '10:05' })

    srv.fail = ['tag-network']
    const first = await executeTransaction(srv.client, 'u', f, 'U1', deltas(f))
    expect(first.kind).toBe('network')            // → the queue marks U1 'uncertain'
    expect(srv.rows.size).toBe(1)                 // …but the row IS on the server
    expect(srv.balanceMoves).toBe(1)
    expect(srv.rows.get('U1')!.event_id).toBeNull()

    const retry = await executeTransaction(srv.client, 'u', f, 'U1', deltas(f))
    expect(retry.kind).toBe('saved')
    expect(srv.rows.size).toBe(1)                 // one transaction
    expect(srv.balanceMoves).toBe(1)              // balance moved once
    expect(srv.rows.get('U1')).toMatchObject({ event_id: 'ooty', transaction_time: '10:05' })  // tag completed
  })

  it('RPC response lost → retry with the same id is idempotent', async () => {
    const srv = fakeServer()
    srv.fail = ['rpc-lost']
    expect((await executeTransaction(srv.client, 'u', form(), 'U1', deltas(form()))).kind).toBe('network')
    expect((await executeTransaction(srv.client, 'u', form(), 'U1', deltas(form()))).kind).toBe('saved')
    expect(srv.rows.size).toBe(1)
    expect(srv.balanceMoves).toBe(1)
  })

  it('no tags → no follow-up update, even on retry', async () => {
    const srv = fakeServer()
    await executeTransaction(srv.client, 'u', form(), 'U1', deltas(form()))
    await executeTransaction(srv.client, 'u', form(), 'U1', deltas(form()))
    expect(srv.updateCalls).toBe(0)
    expect(srv.balanceMoves).toBe(1)
  })

  it('a permanent tag error on an online save is logged, not thrown — the transaction is saved (unchanged behaviour)', async () => {
    const srv = fakeServer()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    srv.fail = ['tag-denied']
    const f = form({ event_id: 'deleted-event' })
    const res = await executeTransaction(srv.client, 'u', f, 'U1', deltas(f))
    expect(res.kind).toBe('saved')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('sends the client id as p_id and the shared deltas', async () => {
    const srv = fakeServer()
    const rpcSpy = vi.spyOn(srv.client, 'rpc')
    const f = form({ transaction_type: 'transfer', to_account_id: 'bank', category_id: null })
    await executeTransaction(srv.client, 'u', f, 'U9', deltas(f))
    expect(rpcSpy.mock.calls[0][1]).toMatchObject({ p_id: 'U9', p_from_delta: -500, p_to_account_id: 'bank', p_to_delta: 500 })
  })
})
