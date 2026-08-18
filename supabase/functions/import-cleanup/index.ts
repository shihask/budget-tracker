// Cron-triggered daily (see 20260818000002_import_cleanup_cron_job.sql for the
// pg_cron/pg_net schedule). Reclaims bucket space from abandoned statement
// imports.
//
// Why this exists: completeImportBatch purges source files when a user
// finishes an import, but nothing reclaims batches left in 'uploading',
// 'extracting', 'review', 'cancelled' or 'error'. With the 8/day x 10 MB
// ingress cap that residue grows at up to 80 MB/user/day forever, which a 1 GB
// free-tier bucket cannot absorb.
//
// Deleting rows from storage.objects does NOT delete the underlying bytes, so
// this cannot be a pure-SQL cron job — it has to call the Storage API, which
// is why it is an Edge Function rather than another cron.schedule() body.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STATEMENT_IMPORTS_BUCKET = 'statement-imports'

// One run's work list. The claim is bounded so a backlog is drained over
// several nightly runs rather than in one long invocation that risks timing
// out mid-sweep and stranding rows in 'purging'.
const CLAIM_LIMIT = 200

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // INVARIANT: this worker must never delete a 'completed' batch or its
    // source path, regardless of age. 'completed' is the terminal state and
    // its source should already have been purged by completeImportBatch; a
    // completed batch that still has objects is a purge failure to
    // investigate, not an abandoned import to collect. The exclusion is
    // enforced inside mp_claim_stale_import_batches — it is restated here so
    // it is not left implicit in a WHERE clause someone later edits.
    //
    // The claim is atomic and moves each batch to 'purging', which is absent
    // from the sheet's resume query. Once claimed, a user cannot re-enter the
    // batch, so the files below cannot be deleted out from under an active
    // resume.
    const { data: claimed, error: claimError } = await supabase
      .rpc('mp_claim_stale_import_batches', { p_limit: CLAIM_LIMIT })

    if (claimError) {
      console.error('[import-cleanup] claim failed', claimError)
      return new Response(JSON.stringify({ error: 'claim_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const batches = (claimed ?? []) as { id: string; user_id: string; storage_path: string }[]
    if (batches.length === 0) {
      return new Response(JSON.stringify({ claimed: 0, purged: 0, failed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let purged = 0
    let failed = 0

    for (const batch of batches) {
      try {
        // A batch that never got past the insert has storage_path '' — nothing
        // to list, but the row still has to go.
        if (batch.storage_path) {
          const { data: files, error: listError } = await supabase.storage
            .from(STATEMENT_IMPORTS_BUCKET)
            .list(batch.storage_path)
          if (listError) throw listError

          if (files?.length) {
            const { error: removeError } = await supabase.storage
              .from(STATEMENT_IMPORTS_BUCKET)
              .remove(files.map((f: { name: string }) => `${batch.storage_path}/${f.name}`))
            if (removeError) throw removeError
          }
        }

        // sync_events rows are keyed to the batch by provider_connection_id
        // (see runExtraction), and outlive it otherwise — the needs_review
        // rows for an abandoned import would never be surfaced by anything
        // once the batch is gone.
        await supabase.from('sync_events')
          .delete()
          .eq('user_id', batch.user_id)
          .eq('provider_connection_id', batch.id)

        const { error: deleteError } = await supabase.from('import_batches').delete().eq('id', batch.id)
        if (deleteError) throw deleteError

        purged++
      } catch (e) {
        // Leave the row in 'purging'. Its updated_at is now fresh, so it is
        // not re-claimed until the retention window elapses again —
        // self-healing, at the cost of one extra window of residue. That is
        // deliberate: a tight retry loop on a persistently failing object
        // would burn the whole run.
        failed++
        console.error('[import-cleanup] could not purge batch', { batchId: batch.id, storagePath: batch.storage_path, error: e })
      }
    }

    return new Response(JSON.stringify({ claimed: batches.length, purged, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[import-cleanup] unexpected failure', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
