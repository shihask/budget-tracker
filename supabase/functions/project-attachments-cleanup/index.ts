// Cron-triggered nightly (see 20261122000001_project_attachment_access.sql). Removes receipt
// files in the project-attachments bucket that no project_attachments row points to and that
// are older than 24 h: receipts of deleted transactions and projects (the rows cascade away,
// the files don't), uploads whose row never saved, and backlog from before v1.115.
//
// Deleting storage.objects rows does NOT free the bytes, so this goes through the Storage API.
// Safety: at most 500 files per run; refuses when orphans are over half the bucket (likely a
// path-matching bug); re-checks each batch against project_attachments right before removing.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireServiceRole } from '../_shared/requireServiceRole.ts'
import { planSweep, stillOrphaned, type OrphanReport } from './plan.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const BUCKET = 'project-attachments'
const RUN_LIMIT = 500

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const denied = requireServiceRole(req, corsHeaders)
  if (denied) return denied

  try {
    const body = await req.json().catch(() => ({}))
    const allowLarge = body?.allowLarge === true

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data, error } = await supabase.rpc('mp_project_attachment_orphans', { p_limit: RUN_LIMIT })
    if (error) {
      console.error('[project-attachments-cleanup] list failed', error.message)
      return json({ error: 'list_failed' }, 500)
    }
    const report = data as OrphanReport
    const plan = planSweep(report, allowLarge)

    if (plan.action === 'nothing') return json({ bucket: report.bucket_total, orphans: 0, removed: 0 })
    if (plan.action === 'refuse') {
      console.error('[project-attachments-cleanup] refused', plan.reason)
      return json({ refused: plan.reason, bucket: report.bucket_total, orphans: report.orphan_total }, 409)
    }

    let removed = 0
    let skipped = 0
    let failed = 0
    for (const batch of plan.batches) {
      const { data: rows, error: checkError } = await supabase
        .from('project_attachments').select('path').in('path', batch)
      if (checkError) {
        failed += batch.length
        console.error('[project-attachments-cleanup] re-check failed', checkError.message)
        continue
      }
      const target = stillOrphaned(batch, (rows ?? []).map((r: { path: string }) => r.path))
      skipped += batch.length - target.length
      if (target.length === 0) continue
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(target)
      if (removeError) {
        failed += target.length
        console.error('[project-attachments-cleanup] remove failed', removeError.message)
      } else {
        removed += target.length
      }
    }

    return json({ bucket: report.bucket_total, orphans: report.orphan_total, removed, skipped, failed })
  } catch (e) {
    console.error('[project-attachments-cleanup] unexpected failure', e instanceof Error ? e.message : String(e))
    return json({ error: 'unexpected' }, 500)
  }
})
