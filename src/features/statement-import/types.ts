import type { FieldConfidence } from '@/lib/statementExtract'

export type ImportProvider = 'pdf' | 'image'
export type ImportBatchStatus = 'uploading' | 'extracting' | 'review' | 'completed' | 'cancelled' | 'error'

export interface ImportBatch {
  id: string
  user_id: string
  account_id: string
  provider: ImportProvider
  file_name: string
  storage_path: string
  status: ImportBatchStatus
  extractor_version: number
  total_chunks: number | null
  chunks_processed: number
  chunk_log: { chunk_index: number; page_start: number; page_end: number; rows_found: number }[]
  unparsed_count: number
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface StatementFieldConfidence {
  description: FieldConfidence
  amount: FieldConfidence
  date: FieldConfidence
  category: FieldConfidence
}

// Shape of sync_events.review_context for provider IN ('pdf','image') rows —
// a superset of DedupReviewSheet's AA-sync ReviewContext (adds decision_action,
// page, field_confidence), read only by StatementReviewSheet.
export interface StatementReviewContext {
  decision_action: 'insert' | 'merge' | 'review'
  confidence: number
  explanation: string[]
  candidate_transaction_id: string | null
  suggested_category_id: string | null
  category_suggestion: { name: string; group: string } | null
  amount: number
  date: string
  description: string | null
  direction: 'income' | 'expense'
  account_id: string
  page: number
  field_confidence: StatementFieldConfidence
}
