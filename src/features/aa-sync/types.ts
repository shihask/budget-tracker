export type SyncProviderName = 'aa' | 'csv' | 'pdf'

export type SyncConnectionStatus =
  | 'pending'
  | 'active'
  | 'syncing'
  | 'synced'
  | 'expired'
  | 'revoked'
  | 'error'

export type SyncFetchType = 'onetime' | 'periodic'

export type SyncEventStatus = 'pending' | 'processed' | 'merged' | 'skipped' | 'error' | 'needs_review'

export type SyncEventType = 'transaction' | 'balance' | 'profile'

// Derived, not persisted — computed in useAaSyncData from SyncConnection
// fields. Keeps status-interpretation logic in one place instead of every
// future UI surface re-deriving it independently.
export type ConnectionHealth = 'healthy' | 'degraded' | 'failed' | 'expired' | 'revoked'

export interface SyncConnection {
  id: string
  user_id: string
  provider: SyncProviderName
  provider_connection_id: string
  status: SyncConnectionStatus
  fetch_type: SyncFetchType | null
  fetch_frequency: string | null
  consent_expires_at: string | null
  last_synced_at: string | null
  last_processed_session_id: string | null
  next_sync_after: string | null
  retry_count: number
  last_attempted_at: string | null
  last_error: string | null
  provider_metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SyncEvent {
  id: string
  user_id: string
  connection_id: string | null
  provider: SyncProviderName
  provider_connection_id: string
  provider_account_id: string | null
  provider_event_id: string | null
  event_type: SyncEventType
  raw_payload: Record<string, unknown>
  provider_metadata: Record<string, unknown>
  status: SyncEventStatus
  fetched_at: string
  processed_at: string | null
  processor: string | null
  error_message: string | null
  review_reason: string | null
  review_context: Record<string, unknown> | null
  created_at: string
}

export interface AccountConnection {
  id: string
  user_id: string
  account_id: string
  provider: SyncProviderName
  provider_connection_id: string
  provider_account_id: string
  provider_metadata: Record<string, unknown>
  created_at: string
}
