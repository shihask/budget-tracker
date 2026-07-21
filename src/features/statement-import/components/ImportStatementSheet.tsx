import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import { BottomSheet } from '@/components/BottomSheet'
import { MintAnimation } from '@/components/MintAnimation'
import { CategorySelect } from '@/components/CategorySelect'
import { compressImage } from '@/lib/imageCompress'
import { INCOME_GROUP, TRANSFER_GROUP } from '@/lib/constants'
import {
  createPdfImportBatch, createImageImportBatch, runExtraction, discardImportBatch,
} from '../lib/extract'
import { sortForReview } from '../lib/pure'
import type { ImportBatch, StatementReviewContext } from '../types'
import type { AppState, Transaction } from '@/types'

interface SyncEventRow {
  id: string
  review_context: StatementReviewContext
}

type Phase = 'upload' | 'extracting' | 'cancelled' | 'review' | 'summary'

interface Props {
  open: boolean
  onClose: () => void
  userId: string
  state: AppState
  onAddCategory: (name: string, group_name: string) => Promise<string>
  onUpdateTransaction: (old: Transaction, form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'> & { to_account_id?: string | null }) => Promise<void>
  onResolved: () => void
}

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'transparent', border: '1.5px solid currentColor',
  borderRadius: 11, padding: '10px 12px',
  font: '600 14px Plus Jakarta Sans', outline: 'none',
}

export function ImportStatementSheet({ open, onClose, userId, state, onAddCategory, onUpdateTransaction, onResolved }: Props) {
  const c = useTheme()
  const [phase, setPhase] = useState<Phase>('upload')
  const [accountId, setAccountId] = useState('')
  const [batch, setBatch] = useState<ImportBatch | null>(null)
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const [rows, setRows] = useState<SyncEventRow[]>([])
  const [candidates, setCandidates] = useState<Map<string, Transaction>>(new Map())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [editingExisting, setEditingExisting] = useState<Set<string>>(new Set())
  const [existingDrafts, setExistingDrafts] = useState<Record<string, { description: string; amount: string; date: string; category_id: string; from_account_id: string }>>({})
  const [newDrafts, setNewDrafts] = useState<Record<string, { description: string; amount: string; date: string; category_id: string; account_id: string }>>({})
  const [stats, setStats] = useState({ added: 0, usedExisting: 0, updated: 0, skipped: 0 })

  const cancelRequestedRef = useRef(false)
  const activeAccounts = state.accounts.filter(a => a.is_active)

  useEffect(() => {
    if (!open) return
    setUploadError(null)
    cancelRequestedRef.current = false
    if (!accountId && activeAccounts.length > 0) setAccountId(activeAccounts[0].id)

    ;(async () => {
      const { data } = await supabase
        .from('import_batches')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['review', 'extracting', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        const existing = data as ImportBatch
        setBatch(existing)
        setAccountId(existing.account_id)
        if (existing.status === 'cancelled') setPhase('cancelled')
        else if (existing.status === 'extracting') { setPhase('extracting'); startExtraction(existing, undefined) }
        else { setPhase('review'); loadReviewRows(existing.id) }
      } else {
        setPhase('upload')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId])

  async function loadReviewRows(batchId: string) {
    const { data } = await supabase
      .from('sync_events')
      .select('id, review_context')
      .eq('provider_connection_id', batchId)
      .eq('status', 'needs_review')
      .order('created_at', { ascending: true })

    const evs = (data as SyncEventRow[]) ?? []
    if (evs.length === 0) { setPhase('summary'); return }
    setRows(sortForReview(evs, r => r.review_context.decision_action, r => r.review_context.field_confidence))

    const candidateIds = evs.map(e => e.review_context.candidate_transaction_id).filter((id): id is string => !!id)
    if (candidateIds.length > 0) {
      const { data: txns } = await supabase.from('transactions').select('*, category:categories(*)').in('id', candidateIds)
      setCandidates(new Map((txns as Transaction[] ?? []).map(t => [t.id, t])))
    } else {
      setCandidates(new Map())
    }
  }

  async function startExtraction(forBatch: ImportBatch, sourceFiles: File[] | undefined) {
    setPhase('extracting')
    setProgress({ processed: forBatch.chunks_processed, total: forBatch.total_chunks ?? 0 })
    const categoryNames = state.categories.map(cat => cat.name)
    const groupNames = state.groups.map(g => g.name)
    try {
      await runExtraction(forBatch.id, {
        categories: state.categories,
        categoryNames,
        groupNames,
        sourceFiles,
        isCancelled: () => cancelRequestedRef.current,
        onProgress: (processed, total) => setProgress({ processed, total }),
      })
    } catch (e) {
      await supabase.from('import_batches').update({ status: 'error', error_message: e instanceof Error ? e.message : String(e) }).eq('id', forBatch.id)
      setUploadError(e instanceof Error ? e.message : 'Extraction failed')
      const { data } = await supabase.from('import_batches').select('*').eq('id', forBatch.id).single()
      setBatch(data as ImportBatch)
      return
    }

    const { data } = await supabase.from('import_batches').select('*').eq('id', forBatch.id).single()
    const finalBatch = data as ImportBatch
    setBatch(finalBatch)
    if (finalBatch.status === 'cancelled') setPhase('cancelled')
    else { setPhase('review'); loadReviewRows(finalBatch.id) }
  }

  async function handlePdfPick(file: File) {
    setUploadError(null)
    try {
      const batchId = await createPdfImportBatch(userId, accountId, file)
      const { data } = await supabase.from('import_batches').select('*').eq('id', batchId).single()
      const created = data as ImportBatch
      setBatch(created)
      startExtraction(created, [file])
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Could not read this PDF')
    }
  }

  async function handleImagesPick(files: File[]) {
    setUploadError(null)
    try {
      const compressed = await Promise.all(files.map(async f => (await compressImage(f)).blob as File))
      const batchId = await createImageImportBatch(userId, accountId, compressed)
      const { data } = await supabase.from('import_batches').select('*').eq('id', batchId).single()
      const created = data as ImportBatch
      setBatch(created)
      startExtraction(created, compressed)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Could not read one of those images')
    }
  }

  function handleCancel() {
    cancelRequestedRef.current = true
  }

  async function handleResumeCancelled() {
    if (!batch) return
    await supabase.from('import_batches').update({ status: 'extracting' }).eq('id', batch.id)
    cancelRequestedRef.current = false
    startExtraction({ ...batch, status: 'extracting' }, undefined)
  }

  async function handleDiscard() {
    if (!batch) return
    await discardImportBatch(batch)
    setBatch(null)
    setRows([])
    setPhase('upload')
  }

  // ── Review actions ──
  function categoryProps(direction: 'income' | 'expense') {
    return direction === 'income' ? { filterGroup: INCOME_GROUP } : { excludeGroups: [INCOME_GROUP, TRANSFER_GROUP] }
  }

  function finishRow(id: string) {
    const next = rows.filter(r => r.id !== id)
    setRows(next)
    if (next.length === 0) setPhase('summary')
    onResolved()
  }

  async function actUseExisting(row: SyncEventRow) {
    const ctx = row.review_context
    if (!ctx.candidate_transaction_id) return
    setBusyId(row.id); setRowError(null)
    try {
      const { error } = await supabase.rpc('mp_finalize_sync_event', {
        p_sync_event_id: row.id, p_outcome: 'merge_into', p_processor: 'client',
        p_merge_transaction_id: ctx.candidate_transaction_id, p_review_reason: 'user_confirmed_merge', p_review_context: ctx,
      })
      if (error) throw error
      setStats(s => ({ ...s, usedExisting: s.usedExisting + 1 }))
      finishRow(row.id)
    } catch (e) { setRowError(e instanceof Error ? e.message : 'Could not confirm match') } finally { setBusyId(null) }
  }

  async function actUpdateExisting(row: SyncEventRow) {
    const ctx = row.review_context
    const existing = ctx.candidate_transaction_id ? candidates.get(ctx.candidate_transaction_id) : null
    if (!existing) return
    const draft = existingDrafts[row.id]
    setBusyId(row.id); setRowError(null)
    try {
      await onUpdateTransaction(existing, {
        transaction_date: draft?.date ?? existing.transaction_date,
        description: draft?.description ?? existing.description,
        amount: draft ? Number(draft.amount) : existing.amount,
        transaction_type: existing.transaction_type,
        category_id: draft?.category_id ?? existing.category_id,
        from_account_id: draft?.from_account_id ?? existing.from_account_id,
      })
      const { error } = await supabase.rpc('mp_finalize_sync_event', {
        p_sync_event_id: row.id, p_outcome: 'merge_into', p_processor: 'client',
        p_merge_transaction_id: existing.id, p_review_reason: 'user_confirmed_merge_with_edit', p_review_context: ctx,
      })
      if (error) throw error
      setStats(s => ({ ...s, updated: s.updated + 1 }))
      finishRow(row.id)
    } catch (e) { setRowError(e instanceof Error ? e.message : 'Could not update that transaction') } finally { setBusyId(null) }
  }

  async function actAdd(row: SyncEventRow) {
    const ctx = row.review_context
    const draft = newDrafts[row.id]
    const categoryId = draft?.category_id ?? ctx.suggested_category_id ?? null
    const accId = draft?.account_id ?? ctx.account_id
    const amount = draft ? Number(draft.amount) : ctx.amount
    setBusyId(row.id); setRowError(null)
    try {
      const { error } = await supabase.rpc('mp_finalize_sync_event', {
        p_sync_event_id: row.id, p_outcome: 'insert', p_processor: 'client',
        p_transaction: {
          account_id: accId,
          transaction_date: draft?.date ?? ctx.date,
          description: draft?.description ?? ctx.description ?? '',
          amount,
          transaction_type: ctx.direction,
          category_id: categoryId,
          account_delta: ctx.direction === 'income' ? amount : -amount,
        },
        p_review_reason: 'user_confirmed_separate', p_review_context: ctx,
      })
      if (error) throw error
      setStats(s => ({ ...s, added: s.added + 1 }))
      finishRow(row.id)
    } catch (e) { setRowError(e instanceof Error ? e.message : 'Could not add transaction') } finally { setBusyId(null) }
  }

  async function actSkip(row: SyncEventRow) {
    setBusyId(row.id); setRowError(null)
    try {
      const { error } = await supabase.rpc('mp_finalize_sync_event', {
        p_sync_event_id: row.id, p_outcome: 'skip', p_processor: 'client',
        p_review_reason: 'user_skipped', p_review_context: row.review_context,
      })
      if (error) throw error
      setStats(s => ({ ...s, skipped: s.skipped + 1 }))
      finishRow(row.id)
    } catch (e) { setRowError(e instanceof Error ? e.message : 'Could not skip this row') } finally { setBusyId(null) }
  }

  async function handleDone() {
    if (batch) await supabase.from('import_batches').update({ status: 'completed' }).eq('id', batch.id)
    setBatch(null)
    setStats({ added: 0, usedExisting: 0, updated: 0, skipped: 0 })
    onClose()
  }

  const reviewedCount = stats.added + stats.usedExisting + stats.updated + stats.skipped

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Import Statement</div>

        {phase === 'upload' && (
          <>
            <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginBottom: 16 }}>
              Upload a UPI-app history or bank statement — screenshots or a PDF. We'll find every transaction and let you review each one.
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Account</div>
              <select value={accountId} onChange={e => setAccountId(e.target.value)} style={{ ...inp, color: c.ink, borderColor: c.faint, background: c.surface2 }}>
                {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {uploadError && <div style={{ font: '600 13px Plus Jakarta Sans', color: c.bad, marginBottom: 12 }}>{uploadError}</div>}

            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false)
                const files = Array.from(e.dataTransfer.files)
                const pdf = files.find(f => f.type === 'application/pdf')
                const images = files.filter(f => f.type.startsWith('image/'))
                if (pdf) handlePdfPick(pdf)
                else if (images.length) handleImagesPick(images)
              }}
              style={{
                border: `1.5px dashed ${dragOver ? c.accent : c.faint}`, borderRadius: 14, padding: 20,
                textAlign: 'center', marginBottom: 12, background: dragOver ? c.accentSoft : 'transparent',
              }}
            >
              <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, marginBottom: 12 }}>Drag & drop screenshots or a PDF here</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <label style={{ padding: '10px 16px', borderRadius: 10, background: c.accent, color: '#fff', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>
                  Choose screenshots
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                    onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) handleImagesPick(files); e.target.value = '' }} />
                </label>
                <label style={{ padding: '10px 16px', borderRadius: 10, border: `1.5px solid ${c.faint}`, color: c.ink, font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>
                  Choose PDF
                  <input type="file" accept="application/pdf" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfPick(f); e.target.value = '' }} />
                </label>
              </div>
            </div>
          </>
        )}

        {phase === 'extracting' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <MintAnimation variant="thinking" size={38} style={{ margin: '0 auto 12px' }} />
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
              {progress.total > 1 ? `Reading part ${progress.processed + 1} of ${progress.total}…` : 'Reading your statement…'}
            </div>
            {uploadError && <div style={{ font: '600 13px Plus Jakarta Sans', color: c.bad, marginTop: 10 }}>{uploadError}</div>}
            <button onClick={handleCancel} style={{ marginTop: 16, padding: '8px 16px', borderRadius: 10, border: 'none', background: 'transparent', color: c.muted, font: '600 12px Plus Jakarta Sans', cursor: 'pointer', textDecoration: 'underline' }}>
              Cancel
            </button>
          </div>
        )}

        {phase === 'cancelled' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, marginBottom: 16 }}>
              Import paused — {batch?.chunks_processed ?? 0} of {batch?.total_chunks ?? 0} part(s) read so far.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={handleResumeCancelled} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: c.accent, color: '#fff', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>
                Resume extraction
              </button>
              <button onClick={handleDiscard} style={{ padding: '10px 16px', borderRadius: 10, border: `1.5px solid ${c.faint}`, background: 'transparent', color: c.muted, font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>
                Discard import
              </button>
            </div>
          </div>
        )}

        {phase === 'review' && (
          <>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 12 }}>
              {reviewedCount} reviewed · {rows.length} remaining
              <button onClick={handleDiscard} style={{ float: 'right', background: 'none', border: 'none', color: c.bad, font: '600 12px Plus Jakarta Sans', cursor: 'pointer', textDecoration: 'underline' }}>
                Discard import
              </button>
            </div>
            {rowError && <div style={{ font: '600 13px Plus Jakarta Sans', color: c.bad, marginBottom: 12 }}>{rowError}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rows.map(row => {
                const ctx = row.review_context
                const existing = ctx.candidate_transaction_id ? candidates.get(ctx.candidate_transaction_id) : null
                const isBusy = busyId === row.id
                const isEditingExisting = editingExisting.has(row.id)

                if (existing) {
                  const draft = existingDrafts[row.id] ?? {
                    description: existing.description, amount: String(existing.amount),
                    date: existing.transaction_date, category_id: existing.category_id ?? '', from_account_id: existing.from_account_id ?? '',
                  }
                  return (
                    <div key={row.id} style={{ padding: '12px 14px', borderRadius: 14, border: `1.5px solid ${c.faint}`, background: c.surface2 }}>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', marginBottom: 3 }}>Parsed</div>
                          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ctx.description || '(no description)'}</div>
                          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>₹{ctx.amount} · {ctx.date}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', marginBottom: 3 }}>Already logged</div>
                          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{existing.description || '(no description)'}</div>
                          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>₹{existing.amount} · {existing.transaction_date}{existing.category ? ` · ${existing.category.name}` : ''}</div>
                        </div>
                      </div>

                      {ctx.explanation?.length > 0 && (
                        <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginBottom: 10 }}>{ctx.explanation.join(' · ')}</div>
                      )}

                      {isEditingExisting && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                          <input value={draft.description} onChange={e => setExistingDrafts(p => ({ ...p, [row.id]: { ...draft, description: e.target.value } }))} style={{ ...inp, color: c.ink, borderColor: c.faint }} placeholder="Description" />
                          <input type="number" value={draft.amount} onChange={e => setExistingDrafts(p => ({ ...p, [row.id]: { ...draft, amount: e.target.value } }))} style={{ ...inp, color: c.ink, borderColor: c.faint }} placeholder="Amount" />
                          <input type="date" value={draft.date} onChange={e => setExistingDrafts(p => ({ ...p, [row.id]: { ...draft, date: e.target.value } }))} style={{ ...inp, color: c.ink, borderColor: c.faint }} />
                          <CategorySelect value={draft.category_id} onChange={v => setExistingDrafts(p => ({ ...p, [row.id]: { ...draft, category_id: v } }))} state={state} onAddCategory={onAddCategory} style={{ ...inp, color: c.ink, borderColor: c.faint }} includeEmpty {...categoryProps(ctx.direction)} />
                          <select value={draft.from_account_id} onChange={e => setExistingDrafts(p => ({ ...p, [row.id]: { ...draft, from_account_id: e.target.value } }))} style={{ ...inp, color: c.ink, borderColor: c.faint }}>
                            {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <button onClick={() => actUseExisting(row)} disabled={isBusy} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: c.accent, color: '#fff', font: '700 13px Plus Jakarta Sans', cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.7 : 1 }}>
                          Use Existing
                        </button>
                        {isEditingExisting ? (
                          <button onClick={() => actUpdateExisting(row)} disabled={isBusy} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: c.ink, color: c.surface, font: '700 13px Plus Jakarta Sans', cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.7 : 1 }}>
                            Save update
                          </button>
                        ) : (
                          <button onClick={() => { setEditingExisting(p => new Set(p).add(row.id)); setExistingDrafts(p => ({ ...p, [row.id]: draft })) }} disabled={isBusy} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1.5px solid ${c.faint}`, background: 'transparent', color: c.ink, font: '700 13px Plus Jakarta Sans', cursor: isBusy ? 'not-allowed' : 'pointer' }}>
                            Update Existing
                          </button>
                        )}
                      </div>
                      <button onClick={() => actSkip(row)} disabled={isBusy} style={{ width: '100%', padding: '8px', borderRadius: 10, border: 'none', background: 'transparent', color: c.muted, font: '600 12px Plus Jakarta Sans', cursor: isBusy ? 'not-allowed' : 'pointer', textDecoration: 'underline' }}>
                        Skip
                      </button>
                    </div>
                  )
                }

                const draft = newDrafts[row.id] ?? {
                  description: ctx.description ?? '', amount: String(ctx.amount), date: ctx.date,
                  category_id: ctx.suggested_category_id ?? '', account_id: ctx.account_id,
                }
                const fc = ctx.field_confidence
                const flag = (low: boolean) => low ? <span style={{ color: c.warn, marginLeft: 4 }} title="AI isn't sure about this field">⚠</span> : null

                return (
                  <div key={row.id} style={{ padding: '12px 14px', borderRadius: 14, border: `1.5px solid ${c.faint}`, background: c.surface2 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                      <div>
                        <label style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Description{flag(fc.description === 'low')}</label>
                        <input value={draft.description} onChange={e => setNewDrafts(p => ({ ...p, [row.id]: { ...draft, description: e.target.value } }))} style={{ ...inp, color: c.ink, borderColor: c.faint, marginTop: 4 }} />
                      </div>
                      <div>
                        <label style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Amount{flag(fc.amount === 'low')}</label>
                        <input type="number" value={draft.amount} onChange={e => setNewDrafts(p => ({ ...p, [row.id]: { ...draft, amount: e.target.value } }))} style={{ ...inp, color: c.ink, borderColor: c.faint, marginTop: 4 }} />
                      </div>
                      <div>
                        <label style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Date{flag(fc.date === 'low')}</label>
                        <input type="date" value={draft.date} onChange={e => setNewDrafts(p => ({ ...p, [row.id]: { ...draft, date: e.target.value } }))} style={{ ...inp, color: c.ink, borderColor: c.faint, marginTop: 4 }} />
                      </div>
                      <div>
                        <label style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Category{flag(fc.category === 'low')}</label>
                        <div style={{ marginTop: 4 }}>
                          <CategorySelect value={draft.category_id} onChange={v => setNewDrafts(p => ({ ...p, [row.id]: { ...draft, category_id: v } }))} state={state} onAddCategory={onAddCategory} style={{ ...inp, color: c.ink, borderColor: c.faint }} includeEmpty {...categoryProps(ctx.direction)} />
                        </div>
                      </div>
                      <div>
                        <label style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase' }}>Account</label>
                        <select value={draft.account_id} onChange={e => setNewDrafts(p => ({ ...p, [row.id]: { ...draft, account_id: e.target.value } }))} style={{ ...inp, color: c.ink, borderColor: c.faint, marginTop: 4 }}>
                          {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => actAdd(row)} disabled={isBusy} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: c.accent, color: '#fff', font: '700 13px Plus Jakarta Sans', cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.7 : 1 }}>
                        Add
                      </button>
                      <button onClick={() => actSkip(row)} disabled={isBusy} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1.5px solid ${c.faint}`, background: 'transparent', color: c.muted, font: '700 13px Plus Jakarta Sans', cursor: isBusy ? 'not-allowed' : 'pointer' }}>
                        Skip
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {phase === 'summary' && batch && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>{batch.file_name}</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, marginBottom: 16 }}>
              {batch.unparsed_count > 0 ? 'Import completed with warnings' : 'Import complete'}
            </div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 2, marginBottom: 12 }}>
              ✓ {stats.added} added · ✓ {stats.usedExisting} used existing<br />
              ✓ {stats.updated} updated · ✓ {stats.skipped} skipped
            </div>
            <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginBottom: 4 }}>Account balances are up to date.</div>
            {batch.unparsed_count > 0 && (
              <div style={{ font: '500 12px Plus Jakarta Sans', color: c.warn, marginBottom: 4 }}>
                {batch.unparsed_count} row(s) couldn't be read confidently — check the original file if you're missing something.
              </div>
            )}
            <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginBottom: 20 }}>
              Reviewed in {Math.max(1, Math.round((Date.now() - new Date(batch.created_at).getTime()) / 60000))} minute(s)
            </div>
            <button onClick={handleDone} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: c.accent, color: '#fff', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>
              Done
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
