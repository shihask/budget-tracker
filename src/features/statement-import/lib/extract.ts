import { supabase } from '@/lib/supabase'
import type { Account, Category } from '@/types'
import { INCOME_GROUP, TRANSFER_GROUP } from '@/lib/constants'
import { categorizeForSync } from '@/lib/categorize'
import { fetchDedupCandidates, scoreDedupCandidates, type PromotionAction } from '@/features/aa-sync/lib/dedup'
import { hasExtractablePageText } from '@/lib/pdfTextHeuristic'
import type { PDFDocumentProxy } from 'pdfjs-dist'

// pdfjs-dist (~400kB+) is only ever needed by users who actually pick a PDF
// file — dynamically imported at each call site below so the rest of the app
// (the vast majority of sessions, which never touch statement import at all,
// let alone the PDF path specifically) doesn't pay for it on initial load.
async function loadPdfModule() {
  return import('@/lib/pdfExtract')
}
import { extractStatementFromImages, extractStatementFromText, blobToBase64, type ParsedStatementRow } from '@/lib/statementExtract'
import type { OnAiUsed } from '@/lib/gemini'
import { dedupeParsedRows, isDailyImportLimitError, DAILY_IMPORT_LIMIT_ERRCODE } from './pure'
import { resolveImportedAccountHint } from './accountHint'
import type { ImportBatch, StatementReviewContext } from '../types'

export const STATEMENT_IMPORTS_BUCKET = 'statement-imports'
export const PAGES_PER_CHUNK = 8
export const IMAGES_PER_CHUNK = 6
// Bump whenever the statement-extract prompt/schema changes in a way that
// alters output — lets a future investigation tell which batches came from
// which extraction contract. v2 adds per-row account_hint + status.
const EXTRACTOR_VERSION = 2

async function fetchBatch(batchId: string): Promise<ImportBatch> {
  const { data, error } = await supabase.from('import_batches').select('*').eq('id', batchId).single()
  if (error || !data) throw error ?? new Error('Import batch not found')
  return data as ImportBatch
}

async function updateBatch(batchId: string, patch: Partial<ImportBatch>): Promise<void> {
  const { error } = await supabase.from('import_batches').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', batchId)
  if (error) throw error
}

// Both create* functions used to `throw insertError`, which throws a plain
// object — supabase-js only constructs a PostgrestError under .throwOnError().
// The sheet's catch does `e instanceof Error ? e.message : <fallback>`, so the
// DB's message was always discarded in favour of "Could not read this PDF".
// Wrap it into a real Error so the copy survives.
//
// Only the daily-cap message is passed through: it is written to be read by a
// user. Every other PostgREST message ("new row violates row-level security
// policy...") is worse than the generic fallback, so it stays internal.
function importInsertError(insertError: unknown): Error {
  if (isDailyImportLimitError(insertError)) {
    const message = (insertError as { message?: string }).message
      || 'You have hit your daily statement import limit. Try again after midnight UTC.'
    return Object.assign(new Error(message), { code: DAILY_IMPORT_LIMIT_ERRCODE })
  }
  return new Error('Could not start import')
}

// The row is inserted before the upload, so a failed upload leaves a row stuck
// at status 'uploading' with an empty storage_path — invisible to the resume
// query forever, and permanently burning one of the day's slots. Take it back
// out; the user is about to retry.
//
// Objects are removed BEFORE the row, and that order is not cosmetic: the
// 7-day import-cleanup sweep finds storage objects by walking import_batches
// rows, so anything already uploaded (the image path can fail on file 3 of 5)
// becomes permanently unreachable the moment its row is gone. Nothing would
// ever collect it.
//
// Best-effort, but never silent: a failed compensating delete leaves real
// quota and storage residue, so both halves are logged. The original upload
// error is what the caller rethrows — this must not mask it.
async function deleteBatchAfterFailedUpload(batchId: string, storagePath: string): Promise<void> {
  try {
    await removeBatchSourceFiles(storagePath)
  } catch (e) {
    console.error('[import] could not remove partial uploads after failed upload', { batchId, storagePath, error: e })
  }
  const { error } = await supabase.from('import_batches').delete().eq('id', batchId)
  if (error) console.error('[import] could not remove batch row after failed upload', { batchId, error })
}

export async function createPdfImportBatch(userId: string, accountId: string, file: File): Promise<string> {
  const { data: inserted, error: insertError } = await supabase
    .from('import_batches')
    .insert({ user_id: userId, account_id: accountId, provider: 'pdf', file_name: file.name, storage_path: '', extractor_version: EXTRACTOR_VERSION })
    .select('id')
    .single()
  if (insertError || !inserted) throw importInsertError(insertError)
  const batchId = inserted.id as string

  const storagePath = `${userId}/${batchId}`
  const { error: uploadError } = await supabase.storage.from(STATEMENT_IMPORTS_BUCKET).upload(`${storagePath}/0`, file, { contentType: file.type || 'application/pdf', upsert: true })
  if (uploadError) {
    await deleteBatchAfterFailedUpload(batchId, storagePath)
    throw uploadError
  }

  const { loadPdf } = await loadPdfModule()
  const doc = await loadPdf(file)
  const totalChunks = Math.ceil(doc.numPages / PAGES_PER_CHUNK)

  await updateBatch(batchId, { storage_path: storagePath, status: 'extracting', total_chunks: totalChunks })
  return batchId
}

export async function createImageImportBatch(userId: string, accountId: string, files: File[]): Promise<string> {
  const { data: inserted, error: insertError } = await supabase
    .from('import_batches')
    .insert({
      user_id: userId, account_id: accountId, provider: 'image',
      file_name: files.length === 1 ? files[0].name : `${files.length} screenshots`,
      storage_path: '', extractor_version: EXTRACTOR_VERSION,
    })
    .select('id')
    .single()
  if (insertError || !inserted) throw importInsertError(insertError)
  const batchId = inserted.id as string

  const storagePath = `${userId}/${batchId}`
  for (let i = 0; i < files.length; i++) {
    const { error: uploadError } = await supabase.storage
      .from(STATEMENT_IMPORTS_BUCKET)
      .upload(`${storagePath}/${i}`, files[i], { contentType: files[i].type || 'image/jpeg', upsert: true })
    if (uploadError) {
      await deleteBatchAfterFailedUpload(batchId, storagePath)
      throw uploadError
    }
  }

  const totalChunks = Math.ceil(files.length / IMAGES_PER_CHUNK)
  await updateBatch(batchId, { storage_path: storagePath, status: 'extracting', total_chunks: totalChunks })
  return batchId
}

// Idempotent: a batch whose files are already gone, or that never got as far
// as uploading (storage_path ''), is a no-op — so callers can retry, and the
// discard, completion and failed-upload paths can share this without any of
// them having to know what the others already did.
export async function removeBatchSourceFiles(storagePath: string): Promise<void> {
  if (!storagePath) return
  const { data: files } = await supabase.storage.from(STATEMENT_IMPORTS_BUCKET).list(storagePath)
  if (!files?.length) return
  const { error } = await supabase.storage
    .from(STATEMENT_IMPORTS_BUCKET)
    .remove(files.map(f => `${storagePath}/${f.name}`))
  if (error) throw error
}

export async function discardImportBatch(batch: ImportBatch): Promise<void> {
  await supabase.from('sync_events').delete().eq('user_id', batch.user_id).eq('provider_connection_id', batch.id)
  // Unchanged behaviour: a failed remove must not stop the row from going —
  // the user asked for this import to be gone. Orphaned objects are the lesser
  // evil and are recoverable by a bucket sweep.
  try {
    await removeBatchSourceFiles(batch.storage_path)
  } catch (e) {
    console.warn('[import] discard: could not remove source files', e)
  }
  await supabase.from('import_batches').delete().eq('id', batch.id)
}

// Ends a batch: flip to 'completed' FIRST, then drop the source files.
//
// The order is the whole point. 'completed' is the one status the sheet's
// resume query never picks up, so once the flip lands the batch can never be
// reopened against files that are no longer there. Purging first and then
// failing the flip would leave a resumable batch pointing at an empty folder,
// and runExtraction would download nothing and throw.
//
// updateBatch throws on failure, so the purge is unreachable if the flip
// didn't happen — that ordering is enforced by the await, not by this comment.
//
// The reverse failure (flip lands, purge doesn't) is deliberately NOT treated
// as recoverable-by-resume: the import really is complete, and pretending
// otherwise would re-offer finished work. The orphaned objects are left for
// the 7-day import-cleanup sweep. Completion state and storage cleanup are
// separate failure domains.
export async function completeImportBatch(batch: ImportBatch): Promise<void> {
  await updateBatch(batch.id, { status: 'completed' })
  await removeBatchSourceFiles(batch.storage_path)
}

interface RunExtractionOptions {
  categories: Category[]
  categoryNames: string[]
  groupNames: string[]
  accounts: Account[]
  sourceFiles?: File[] // skip re-downloading from Storage right after upload; omit to resume from storage
  isCancelled?: () => boolean
  onProgress?: (chunksProcessed: number, totalChunks: number) => void
  // Mirrors the server's AI quota count back into settings, same contract as
  // every other AI caller (see aiUsagePatch in gemini.ts). Without it a
  // statement import spends quota the Settings card never learns about until
  // the next page load.
  onAiUsed?: OnAiUsed
}

function categoryPoolFor(direction: 'income' | 'expense', categories: Category[]): Category[] {
  return direction === 'income'
    ? categories.filter(c => c.group_name === INCOME_GROUP)
    : categories.filter(c => c.group_name !== INCOME_GROUP && c.group_name !== TRANSFER_GROUP)
}

function resolveCategoryId(categoryName: string | null, description: string | null, categories: Category[], pool: Category[]): string | null {
  if (categoryName) {
    const match = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase())
    if (match) return match.id
  }
  return description ? categorizeForSync(description, pool).categoryId : null
}

async function downloadStoredBlob(storagePath: string, key: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(STATEMENT_IMPORTS_BUCKET).download(`${storagePath}/${key}`)
  if (error || !data) throw error ?? new Error(`Could not download ${key}`)
  return data
}

// One call per chunk (not per page) so the model sees continuation across
// pages — fewer hallucinated repeated headers, one normalization pass,
// cheaper. A chunk is treated as text-or-scanned as a whole based on its
// first page — real statements don't mix scanned and digital pages within a
// handful of consecutive ones, so this per-chunk simplification is fine in
// practice without per-page branching complexity.
async function extractPdfChunk(
  doc: PDFDocumentProxy, pageStart: number, pageEnd: number, categoryNames: string[], groupNames: string[],
  onAiUsed?: OnAiUsed
): Promise<{ rows: ParsedStatementRow[]; unparsedCount: number } | null> {
  const { getPdfPageText, renderPdfPageToImage } = await loadPdfModule()
  const firstPageText = await getPdfPageText(doc, pageStart)

  if (hasExtractablePageText(firstPageText)) {
    const pageTexts = [firstPageText]
    for (let p = pageStart + 1; p <= pageEnd; p++) pageTexts.push(await getPdfPageText(doc, p))
    const combined = pageTexts.map((t, i) => `--- Page ${pageStart + i} ---\n${t}`).join('\n\n')
    const result = await extractStatementFromText(combined, categoryNames, groupNames, onAiUsed)
    if (!result) return null
    return { rows: result.transactions, unparsedCount: result.unparsed_count }
  }

  const images: { base64: string; mimeType: string }[] = []
  for (let p = pageStart; p <= pageEnd; p++) {
    const blob = await renderPdfPageToImage(doc, p)
    images.push({ base64: await blobToBase64(blob), mimeType: 'image/jpeg' })
  }
  const result = await extractStatementFromImages(images, categoryNames, groupNames, onAiUsed)
  if (!result) return null
  return { rows: result.transactions, unparsedCount: result.unparsed_count }
}

async function extractImageChunk(
  blobs: Blob[], categoryNames: string[], groupNames: string[],
  onAiUsed?: OnAiUsed
): Promise<{ rows: ParsedStatementRow[]; unparsedCount: number } | null> {
  const images = await Promise.all(blobs.map(async b => ({ base64: await blobToBase64(b), mimeType: b.type || 'image/jpeg' })))
  const result = await extractStatementFromImages(images, categoryNames, groupNames, onAiUsed)
  if (!result) return null
  return { rows: result.transactions, unparsedCount: result.unparsed_count }
}

// Scores + inserts one chunk's parsed rows as needs_review sync_events —
// crash-safe by design: called once per chunk, right after that chunk's AI
// call returns, before the next chunk starts.
async function commitChunkRows(
  batch: ImportBatch, rows: ParsedStatementRow[], categories: Category[], accounts: Account[]
): Promise<void> {
  const deduped = dedupeParsedRows(
    rows.map(r => ({ ...r, direction: (r.type === 'credit' ? 'income' : 'expense') as 'income' | 'expense' }))
  )
  const activeBankAccounts = accounts.filter(a => a.is_active)

  const eventsToInsert: Record<string, unknown>[] = []
  for (const row of deduped) {
    if (row.amount == null || !row.date) continue // nothing usable to review
    const direction = row.direction

    // Resolve the account BEFORE dedup-scoring, not after — a row scored
    // against the wrong account's transactions can miss a real duplicate or
    // false-match one that just happens to share amount/date/description.
    const accountMatch = resolveImportedAccountHint(row.account_hint, activeBankAccounts)
    const resolvedAccountId = accountMatch?.accountId ?? batch.account_id
    const accountMatchStatus: 'matched' | 'unmatched' | 'no_hint' =
      !row.account_hint ? 'no_hint' : accountMatch ? 'matched' : 'unmatched'

    const candidates = await fetchDedupCandidates(batch.user_id, resolvedAccountId, {
      amount: row.amount, date: row.date, description: row.description, direction,
    })
    const decision = scoreDedupCandidates({ amount: row.amount, date: row.date, description: row.description, direction }, candidates)
    const pool = categoryPoolFor(direction, categories)
    const categoryId = resolveCategoryId(row.category, row.description, categories, pool)

    const reviewContext: StatementReviewContext = {
      decision_action: decision.action,
      confidence: decision.confidence,
      explanation: decision.explanation,
      candidate_transaction_id: decision.matchedTransactionId ?? null,
      suggested_category_id: categoryId,
      category_suggestion: row.category_suggestion,
      amount: row.amount,
      date: row.date,
      description: row.description,
      direction,
      account_id: resolvedAccountId,
      page: row.page,
      field_confidence: {
        description: row.description_confidence,
        amount: row.amount_confidence,
        date: row.date_confidence,
        category: row.category_confidence,
      },
      account_hint: row.account_hint,
      account_match_status: accountMatchStatus,
      status: row.status,
    }

    eventsToInsert.push({
      user_id: batch.user_id,
      connection_id: null,
      provider: batch.provider,
      provider_connection_id: batch.id,
      provider_account_id: null,
      provider_event_id: null,
      event_type: 'transaction',
      raw_payload: row,
      provider_metadata: {},
      status: 'needs_review',
      review_reason: decision.action === 'merge' ? 'likely_duplicate' : decision.action === 'review' ? 'possible_duplicate' : 'no_match',
      review_context: reviewContext,
    })
  }

  if (eventsToInsert.length > 0) {
    const { error } = await supabase.from('sync_events').insert(eventsToInsert)
    if (error) throw error
  }
}

// Drives one batch's extraction to completion (or until cancelled). Safe to
// call again after a crash/close — picks up from batch.chunks_processed.
export async function runExtraction(batchId: string, opts: RunExtractionOptions): Promise<void> {
  let batch = await fetchBatch(batchId)
  if (batch.status === 'completed' || batch.status === 'cancelled') return
  if (batch.status === 'uploading') { await updateBatch(batchId, { status: 'extracting' }); batch = await fetchBatch(batchId) }

  const perChunkUnit = batch.provider === 'pdf' ? PAGES_PER_CHUNK : IMAGES_PER_CHUNK

  let pdfDoc: PDFDocumentProxy | null = null
  let imageBlobs: Blob[] | null = null
  let totalUnits: number
  if (batch.provider === 'pdf') {
    const { loadPdf } = await loadPdfModule()
    const pdfBlob = opts.sourceFiles?.[0] ?? await downloadStoredBlob(batch.storage_path, '0')
    pdfDoc = await loadPdf(pdfBlob)
    totalUnits = pdfDoc.numPages
  } else if (opts.sourceFiles?.length) {
    imageBlobs = opts.sourceFiles
    totalUnits = imageBlobs.length
  } else {
    const { data: files } = await supabase.storage.from(STATEMENT_IMPORTS_BUCKET).list(batch.storage_path)
    const ordered = (files ?? []).slice().sort((a, b) => Number(a.name) - Number(b.name))
    imageBlobs = await Promise.all(ordered.map(f => downloadStoredBlob(batch.storage_path, f.name)))
    totalUnits = imageBlobs.length
  }

  const totalChunks = batch.total_chunks ?? Math.ceil(totalUnits / perChunkUnit)

  for (let chunkIndex = batch.chunks_processed; chunkIndex < totalChunks; chunkIndex++) {
    if (opts.isCancelled?.()) {
      await updateBatch(batchId, { status: 'cancelled' })
      return
    }

    const rangeStart = chunkIndex * perChunkUnit
    const rangeEnd = Math.min((chunkIndex + 1) * perChunkUnit, totalUnits) - 1

    const extracted = pdfDoc
      ? await extractPdfChunk(pdfDoc, rangeStart + 1, rangeEnd + 1, opts.categoryNames, opts.groupNames, opts.onAiUsed)
      : await extractImageChunk(imageBlobs!.slice(rangeStart, rangeEnd + 1), opts.categoryNames, opts.groupNames, opts.onAiUsed)

    if (!extracted) throw new Error(`Chunk ${chunkIndex + 1} of ${totalChunks} failed to extract`)

    await commitChunkRows(batch, extracted.rows, opts.categories, opts.accounts)

    const chunkLogEntry = { chunk_index: chunkIndex, page_start: rangeStart + 1, page_end: rangeEnd + 1, rows_found: extracted.rows.length }
    const nextChunkLog = [...batch.chunk_log, chunkLogEntry]
    const nextUnparsedCount = batch.unparsed_count + extracted.unparsedCount
    await updateBatch(batchId, { chunks_processed: chunkIndex + 1, chunk_log: nextChunkLog, unparsed_count: nextUnparsedCount })
    batch = { ...batch, chunks_processed: chunkIndex + 1, chunk_log: nextChunkLog, unparsed_count: nextUnparsedCount }

    opts.onProgress?.(chunkIndex + 1, totalChunks)
  }

  await updateBatch(batchId, { status: 'review' })
}

export type { PromotionAction }
