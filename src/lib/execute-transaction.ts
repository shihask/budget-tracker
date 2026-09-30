import type { SupabaseClient } from '@supabase/supabase-js'
import type { NewTransactionInput, Transaction } from '@/types'
import type { TxDeltas } from './transaction-deltas'
import { isNetworkError } from './offline-queue'

/** The ONE path that writes a new transaction — used by an ordinary online save
 *  and by the offline queue's Save all, so a replay can never differ from a save.
 *
 *  `id` is generated once by the caller and sent as p_id. mp_execute_transaction
 *  is idempotent on it: a retry after a lost response returns the existing row
 *  and moves no balance a second time.
 *
 *  Order: RPC → tag update → reimbursement link, exactly as before. The tag update
 *  is an idempotent SET, so it runs on EVERY attempt that has tags — including a
 *  retry that found the row already saved. That is what finishes the job when
 *  the first attempt committed the row but died before tagging it. */

export type ExecuteResult =
  | { kind: 'saved'; row: Transaction }
  /** No answer from the server at some step. The row MAY exist. */
  | { kind: 'network'; error: unknown }
  /** A real server answer rejecting the save. `saved` = the row already exists
   *  (the reimbursement link failed after it was written). */
  | { kind: 'failed'; error: unknown; saved: boolean }

export async function executeTransaction(
  client: SupabaseClient,
  userId: string,
  form: NewTransactionInput,
  id: string,
  d: TxDeltas,
): Promise<ExecuteResult> {
  let row: Transaction
  try {
    const { data, error } = await client.rpc('mp_execute_transaction', {
      p_user_id:          userId,
      p_transaction_date: form.transaction_date,
      p_description:      form.description,
      p_amount:           form.amount,
      p_transaction_type: form.transaction_type,
      p_category_id:      form.category_id ?? null,
      p_from_account_id:  d.fromAccountId,
      p_to_account_id:    d.toAccountId,
      p_credit_card_id:   d.creditCardId,
      p_notes:            '',
      p_borrowing_id:     form.borrowing_id ?? null,
      p_savings_id:       null,
      p_is_credit:        form.is_credit ?? null,
      p_from_delta:       d.fromDelta,
      p_to_delta:         d.toDelta,
      p_cc_delta:         d.ccDelta,
      p_id:               id,
    })
    if (error) return isNetworkError(error) ? { kind: 'network', error } : { kind: 'failed', error, saved: false }
    row = data as Transaction
  } catch (err) {
    return isNetworkError(err) ? { kind: 'network', error: err } : { kind: 'failed', error: err, saved: false }
  }

  // Life-event tag, master (person/merchant) tag and a chosen time, in ONE update:
  // they have identical failure semantics. mp_execute_transaction owns the atomic
  // balance deltas and shouldn't grow columns that have no effect on them.
  if (form.event_id || form.master_id || form.transaction_time) {
    const tag: { event_id?: string; master_id?: string; transaction_time?: string } = {}
    if (form.event_id) tag.event_id = form.event_id
    if (form.master_id) tag.master_id = form.master_id
    if (form.transaction_time) tag.transaction_time = form.transaction_time
    try {
      const { data: tagged, error: tagErr } = await client
        .from('transactions').update(tag).eq('id', row.id).select('*').single()
      if (tagErr) {
        // No answer: report it, so a queued item stays 'uncertain' and the retry
        // (which finds the row and moves nothing) completes the tag.
        if (isNetworkError(tagErr)) return { kind: 'network', error: tagErr }
        // A real rejection must not lose the transaction — it's saved and the
        // balance moved. Leave it untagged, as before: a missing label is
        // cosmetic, and blocking capture over one would be the worse bug.
        console.error('Failed to tag transaction (event/master/time):', tagErr)
      } else if (tagged) {
        row = tagged as Transaction
      }
    } catch (err) {
      if (isNetworkError(err)) return { kind: 'network', error: err }
      console.error('Failed to tag transaction (event/master/time):', err)
    }
  }

  // Reimbursement link, same follow-up reasoning. Unlike the tag, a failure is NOT
  // swallowed: an unlinked reimbursement is silently miscounted as income.
  // Never reached for a queued item — reimbursements are refused offline.
  if (form.reimbursement_for) {
    const { data: linked, error: linkErr } = await client
      .from('transactions').update({ reimbursement_for: form.reimbursement_for })
      .eq('id', row.id).select('*').single()
    if (linkErr) return { kind: 'failed', error: linkErr, saved: true }
    if (linked) row = linked as Transaction
  }

  return { kind: 'saved', row }
}
