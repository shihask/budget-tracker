// normalize() for the 'aa' provider — Deno-side, mirrors the shape documented
// in src/features/aa-sync/lib/provider.ts's SyncProvider interface, but is
// NOT imported from there: the interface is a design contract spanning two
// runtimes, not literally shared code (see that file's header comment).
//
// Pure function: raw Setu session response in, FinancialEvent[] out. No DB
// access, no API calls, no side effects — see the Phase 1a plan's
// "normalize() is a pure function" note for why that matters (safe replay).
//
// Field shapes verified live against sandbox in Phase 0 — see
// docs/aa-integration-phase0.md §2 (Data Mapping). Summary field names differ
// per FI type (currentBalance vs currentValue, etc.) — this only handles
// DEPOSIT and RECURRING_DEPOSIT, the two types Phase 0 actually tested.

export interface FinancialEvent {
  eventType: 'transaction' | 'balance' | 'profile'
  accountId: string | null
  externalId: string | null
  amount: number | null
  date: string | null
  description: string | null
  raw: Record<string, unknown>
  metadata: Record<string, unknown>
}

interface SetuAccountEntry {
  linkRefNumber: string
  maskedAccNumber: string
  FIstatus: string
  data?: {
    account?: {
      type?: string
      profile?: { holders?: unknown }
      summary?: Record<string, unknown>
      transactions?: { startDate?: string; endDate?: string; transaction?: Array<Record<string, unknown>> }
    }
  }
}

interface SetuSessionResponse {
  fips?: Array<{ fipID: string; accounts: SetuAccountEntry[] }>
}

export function normalizeAaSession(session: SetuSessionResponse): FinancialEvent[] {
  const events: FinancialEvent[] = []

  for (const fip of session.fips ?? []) {
    for (const acc of fip.accounts ?? []) {
      const accountId = acc.linkRefNumber
      const account = acc.data?.account
      if (!account) continue

      if (account.profile?.holders) {
        events.push({
          eventType: 'profile',
          accountId,
          externalId: null,
          amount: null,
          date: null,
          description: null,
          raw: account.profile as Record<string, unknown>,
          metadata: { fipID: fip.fipID, maskedAccNumber: acc.maskedAccNumber, accType: account.type },
        })
      }

      if (account.summary) {
        const summary = account.summary
        const balance = summary.currentBalance ?? summary.currentValue ?? null
        events.push({
          eventType: 'balance',
          accountId,
          externalId: null,
          amount: balance != null ? Number(balance) : null,
          date: typeof summary.balanceDateTime === 'string' ? summary.balanceDateTime : null,
          description: null,
          raw: summary,
          metadata: { fipID: fip.fipID, maskedAccNumber: acc.maskedAccNumber, accType: account.type },
        })
      }

      for (const txn of account.transactions?.transaction ?? []) {
        events.push({
          eventType: 'transaction',
          accountId,
          externalId: typeof txn.txnId === 'string' ? txn.txnId : null,
          amount: txn.amount != null ? Number(txn.amount) : null,
          date: typeof txn.valueDate === 'string' ? txn.valueDate : null,
          description: typeof txn.narration === 'string' ? txn.narration : null,
          raw: txn,
          metadata: {
            fipID: fip.fipID,
            maskedAccNumber: acc.maskedAccNumber,
            mode: txn.mode,
            type: txn.type,
            reference: txn.reference,
            balance: txn.balance,
          },
        })
      }
    }
  }

  return events
}
