import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { categorizeForSync } from '@/lib/categorize'
import { INCOME_GROUP, TRANSFER_GROUP } from '@/lib/constants'
import { fetchDedupCandidates, scoreDedupCandidates, type PromotionDecision } from '../lib/dedup'
import { suggestAccountLink, defaultAccountName } from '../lib/accountLinking'
import type { SyncEvent } from '../types'
import type { Account, Category } from '@/types'

// One page of the pending backlog per DB round-trip, not one unbounded
// synchronous burst — Phase 1a may have already accumulated real pending
// sync_events by the time this hook first mounts for a given user.
const BACKLOG_PAGE_SIZE = 25

// ReBIT `type` values this pipeline knows how to sign — a real
// money-correctness gap Phase 0 flagged and never finished ("type/mode need
// their own translation table, not fuzzy-matched"). Any value outside this
// allowlist throws (→ status='error', see processEvent) rather than
// silently defaulting to debit. Confirmed live that at least one real value
// ("OPENING", on recurring-deposit opening entries — see
// scripts/aa-discovery-spike/samples/rd-session.json) exists outside this
// allowlist, so unrecognized values are not a hypothetical.
const DIRECTION_MAP: Record<string, 'income' | 'expense'> = {
  CREDIT: 'income',
  DEBIT: 'expense',
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

// raw_payload.amount is a numeric-looking STRING in real captured payloads
// (e.g. "5000.0"), not a JSON number — verified live, not assumed.
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

interface FinalizeResult {
  claimed: boolean
  transaction_id?: string
}

type ProcessOutcome = 'handled' | 'left_pending'

interface UseSyncPromotionOptions {
  userId: string
  enabled: boolean
  accounts: Pick<Account, 'id' | 'name' | 'type'>[]
  categories: Category[]
  onPromoted: (count: number) => void
}

// Serial promotion loop — turns pending sync_events into real
// transactions/accounts. Kept separate from useAaSyncData (read-only
// connection status, no writes) since this hook performs writes and has its
// own trigger/error shape. Mirrors useAaSyncData's mountedRef +
// postgres_changes channel-per-user idiom.
export function useSyncPromotion({ userId, enabled, accounts, categories, onPromoted }: UseSyncPromotionOptions) {
  const [processing, setProcessing] = useState(false)
  const mountedRef = useRef(true)
  const runningRef = useRef(false)
  const accountsRef = useRef(accounts)
  accountsRef.current = accounts
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories
  const onPromotedRef = useRef(onPromoted)
  onPromotedRef.current = onPromoted

  // Nested inside drainBacklog (not hook-level functions) so there's no
  // separate reactive identity for useCallback's dependency array to track
  // — both close over drainBacklog's own batchAccountCache/userId and the
  // refs above, which are always current regardless of when they run.
  const drainBacklog = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    setProcessing(true)
    const batchAccountCache = new Map<string, string>()
    // Seeded from accountsRef, then grown as accounts get auto-created
    // during this batch. accountsRef only reflects state.accounts, which
    // React only refreshes via onPromoted — fired below whenever an account
    // gets auto-created, the only kind of AppState-relevant write this hook
    // still makes directly (every transaction event now lands in
    // needs_review, never auto-inserted/merged — see the "review-everything"
    // plan). Without this refresh, two sync_events from DIFFERENT
    // provider_connection_ids that happen to represent the same real bank
    // account (same masked suffix) can both auto-create within one batch,
    // since the second one's suggestAccountLink check would otherwise run
    // against a stale list that doesn't yet include the first — caught
    // live: two "Bank account ···af56" rows created 427ms apart in the
    // same drain pass.
    const knownAccounts = [...accountsRef.current]
    let accountsCreated = 0

    async function finalize(eventId: string, outcome: string, extra: Record<string, unknown> = {}): Promise<FinalizeResult> {
      const { data, error } = await supabase.rpc('mp_finalize_sync_event', {
        p_sync_event_id: eventId,
        p_outcome: outcome,
        p_processor: 'client',
        p_transaction: null,
        p_merge_transaction_id: null,
        p_review_reason: null,
        p_review_context: null,
        ...extra,
      })
      if (error) throw error
      return data as FinalizeResult
    }

    async function processEvent(event: SyncEvent): Promise<ProcessOutcome> {
      // Step 1: resolve the provider account to a real MoneyPlant Account,
      // cached per batch so it's resolved once per (connection, account) pair.
      const cacheKey = `${event.provider_connection_id}:${event.provider_account_id}`
      let accountId = batchAccountCache.get(cacheKey)

      if (accountId === undefined) {
        // Check the REAL mapping first — batchAccountCache only remembers
        // what THIS batch has resolved, not what earlier batches already
        // linked. Skipping this and going straight to suggestAccountLink
        // was a real bug: once an account exists, its own name matches its
        // own masked suffix, so every future event for that already-linked
        // (connection, account) pair "found a likely match" against
        // itself and returned 'left_pending' forever — no RPC call, no
        // error, nothing to see in the network tab, silently stuck
        // 'pending' indefinitely. Caught live: a fully-linked connection's
        // events never processed across multiple reloads/reconnects.
        const { data: existingLink, error: lookupError } = await supabase
          .from('account_connections')
          .select('account_id')
          .eq('provider_connection_id', event.provider_connection_id)
          .eq('provider_account_id', event.provider_account_id)
          .maybeSingle()
        if (lookupError) throw lookupError

        if (existingLink) {
          accountId = (existingLink as { account_id: string }).account_id
          batchAccountCache.set(cacheKey, accountId)
        } else {
          const maskedAccNumber = str((event.provider_metadata as Record<string, unknown>)?.maskedAccNumber)
          const suggestion = maskedAccNumber ? suggestAccountLink(maskedAccNumber, knownAccounts) : null

          // A likely-matching existing Account was found — don't guess
          // which one is right. Leave the event pending; AccountLinkReviewSheet
          // resolves it (confirm or create-separate), which re-triggers this
          // hook via the sync_events realtime subscription.
          if (suggestion) return 'left_pending'

          const newAccountName = maskedAccNumber ? defaultAccountName(maskedAccNumber) : 'Bank account'
          const { data, error } = await supabase.rpc('mp_link_sync_account', {
            p_provider: event.provider,
            p_provider_connection_id: event.provider_connection_id,
            p_provider_account_id: event.provider_account_id,
            p_existing_account_id: null,
            p_new_account: {
              name: newAccountName,
              type: 'bank',
              current_balance: 0,
            },
            p_provider_metadata: event.provider_metadata ?? {},
          })
          if (error) throw error
          accountId = (data as { account_id: string }).account_id
          batchAccountCache.set(cacheKey, accountId)
          knownAccounts.push({ id: accountId, name: newAccountName, type: 'bank' })
          accountsCreated++
        }
      }

      // Step 2: non-transaction events (balance/profile) skip straight
      // through — no reconciliation against current_balance this phase (see
      // Phase 1b plan §1: a balance event reports an absolute value, not a
      // delta, and current_balance is maintained exclusively via pre-computed
      // signed deltas everywhere else in this codebase).
      if (event.event_type !== 'transaction') {
        await finalize(event.id, 'skip')
        return 'handled'
      }

      const payload = event.raw_payload as Record<string, unknown>
      const metadata = event.provider_metadata as Record<string, unknown>
      const amount = num(payload?.amount)
      const rawDate = str(payload?.valueDate)
      const description = str(payload?.narration)
      const directionRaw = str(metadata?.type)
      const direction = directionRaw ? DIRECTION_MAP[directionRaw] : undefined

      // Malformed/unexpected upstream data is an operational failure to
      // investigate, not a dedup decision — goes through the plain
      // status='error' path (see the catch block below), never a silent
      // debit default.
      if (amount == null || !rawDate) {
        throw new Error(`sync_event ${event.id}: missing amount or valueDate in raw_payload`)
      }
      if (!direction) {
        throw new Error(`sync_event ${event.id}: unrecognized transaction direction "${directionRaw ?? 'null'}"`)
      }

      // Step 3: dedup-score against a fresh server-side candidate pool —
      // never state.transactions (paginated to the most recent 200 rows).
      const candidateEvent = { amount, date: rawDate, description, direction }
      const candidates = await fetchDedupCandidates(userId, accountId, candidateEvent)
      const decision: PromotionDecision = scoreDedupCandidates(candidateEvent, candidates)

      // Step 4: always categorize — every transaction event now waits for
      // an explicit user decision (see the "review-everything" plan), so
      // the suggested category needs to be ready regardless of how
      // confident the dedup match looks, not just for the 'insert'/'review'
      // tiers as before.
      let categoryId: string | null = null
      if (description) {
        const pool = direction === 'income'
          ? categoriesRef.current.filter(c => c.group_name === INCOME_GROUP)
          : categoriesRef.current.filter(c => c.group_name !== INCOME_GROUP && c.group_name !== TRANSFER_GROUP)
        categoryId = categorizeForSync(description, pool).categoryId
      }

      // Step 5: every transaction event lands in needs_review — the dedup
      // score becomes a suggestion for DedupReviewSheet, not a
      // self-executing decision. mp_finalize_sync_event's 'insert'/
      // 'merge_into' outcomes still exist and still do exactly the right
      // thing; they're only ever reached now via that sheet's explicit
      // "Add transaction" / "Merge with existing" actions, never from here.
      const reviewReason = decision.action === 'merge' ? 'likely_duplicate'
        : decision.action === 'review' ? 'possible_duplicate'
        : 'no_match'

      await finalize(event.id, 'needs_review', {
        p_review_reason: reviewReason,
        p_review_context: {
          confidence: decision.confidence,
          explanation: decision.explanation,
          candidate_transaction_id: decision.matchedTransactionId ?? null,
          suggested_category_id: categoryId,
          amount, date: rawDate, description, direction, account_id: accountId,
        },
      })
      return 'handled'
    }

    try {
      for (;;) {
        const { data, error } = await supabase
          .from('sync_events')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'pending')
          .order('fetched_at', { ascending: true })
          .limit(BACKLOG_PAGE_SIZE)

        if (error) {
          console.error('[useSyncPromotion] failed to fetch backlog:', error)
          break
        }

        const events = (data as SyncEvent[]) ?? []
        if (events.length === 0) break

        let progressed = false
        for (const event of events) {
          if (!mountedRef.current) return
          try {
            const outcome = await processEvent(event)
            if (outcome === 'handled') progressed = true
            // 'left_pending' — awaiting AccountLinkReviewSheet, no progress this pass
          } catch (e) {
            console.error('[useSyncPromotion] event failed, marking error:', event.id, e)
            await supabase
              .from('sync_events')
              .update({ status: 'error', error_message: String(e), processed_at: new Date().toISOString(), processor: 'client' })
              .eq('id', event.id)
              .eq('status', 'pending')
            progressed = true
          }
        }

        // Stop once the page is smaller than a full page (backlog drained)
        // or once a full page made zero progress (everything left is stuck
        // awaiting account-link review — retrying would spin forever).
        if (events.length < BACKLOG_PAGE_SIZE || !progressed) break
      }
    } finally {
      runningRef.current = false
      if (mountedRef.current) setProcessing(false)
      // Refetches state.accounts so a newly auto-created account shows up
      // — otherwise it (and accountsRef, seeding the next batch's
      // knownAccounts) stays stale indefinitely, reopening the same
      // duplicate-account window this batch's own knownAccounts tracking
      // only closes within one pass.
      if (accountsCreated > 0) onPromotedRef.current(0)
    }
  }, [userId])

  useEffect(() => {
    mountedRef.current = true
    if (!enabled) return

    drainBacklog()

    const channel = supabase
      .channel(`aa-sync-promotion-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sync_events', filter: `user_id=eq.${userId}` },
        () => { if (mountedRef.current) drainBacklog() }
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [userId, enabled, drainBacklog])

  // Exposed so AccountLinkReviewSheet can re-trigger draining right after
  // resolving an account link — that action writes account_connections,
  // not sync_events, so it never fires the realtime subscription above.
  return { processing, drain: drainBacklog }
}
