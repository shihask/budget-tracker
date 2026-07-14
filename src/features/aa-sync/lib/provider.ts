// The provider abstraction — a design contract, not executable shared code.
//
// This interface spans two runtimes and is never imported/implemented as a
// single TypeScript module both the Vite bundle and a Deno Edge Function
// import: `connect()` is invoked from the browser (a button click → a thin
// Edge Function, since it needs a provider secret the client must never
// see). `onNotification()`/`fetch()`/`normalize()` for the 'aa' provider
// execute inside Edge Functions (see supabase/functions/aa-webhook,
// supabase/functions/_shared/setu-client.ts), not in this src/ tree. A
// future CSV provider might implement `connect` as "open a file picker"
// (pure client, no Edge Function at all) and `fetch`/`normalize` entirely
// client-side. Treat this file as documentation of the contract each
// provider must satisfy, not as a base class to instantiate.

import type { SyncProviderName } from '../types'

export interface FinancialEvent {
  eventType: 'transaction' | 'balance' | 'profile'
  accountId: string | null // provider_account_id — e.g. linkRefNumber, identifies which linked account this belongs to
  externalId: string | null // e.g. txnId — nullable for balance/profile events
  amount: number | null
  date: string | null // ISO date, no time component (Phase 0: valueDate has none)
  description: string | null // e.g. narration — feeds categorizeForSync directly (Phase 1b)
  raw: Record<string, unknown> // full per-event slice, stored verbatim in sync_events.raw_payload
  metadata: Record<string, unknown> // ifsc, branch, mode, type, reference, fipID, masked acc number, ...
}

export interface SyncProvider {
  readonly name: SyncProviderName

  /** Browser-invoked. Returns a URL to redirect the user to for consent/authorization. */
  connect(userId: string, opts: Record<string, unknown>): Promise<{ redirectUrl: string; connectionId: string }>

  /** Provider-invoked (webhook) or scheduler-invoked. Verifies + updates connection/event state. */
  onNotification(payload: unknown): Promise<void>

  /** Fetches raw payload(s) for a connection. One call can return many events — see normalize(). */
  fetch(connectionId: string): Promise<unknown[]>

  /**
   * Pure function: raw payload in, FinancialEvent[] out. No DB access, no API
   * calls, no account lookup, no category lookup, no dedup logic — same
   * input always produces the same output. This is what makes replay safe:
   * if the mapping logic has a bug, the fix re-runs normalize() against the
   * raw_payload already sitting in sync_events, with no side effects from
   * the first, buggy run to untangle.
   */
  normalize(rawPayload: unknown): FinancialEvent[]
}
