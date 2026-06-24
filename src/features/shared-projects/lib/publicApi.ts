import { supabase } from '@/lib/supabase'
import type { Project, ProjectMember, ProjectTransaction, ProjectAttachment } from '../types'

export async function loadPublicProject(shareCode: string): Promise<{
  project: Project
  members: ProjectMember[]
  transactions: ProjectTransaction[]
  attachments: ProjectAttachment[]
} | null> {
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('share_code', shareCode)
    .eq('is_public', true)
    .single()

  if (error || !project) return null

  await supabase.rpc('mp_increment_share_views', { p_share_code: shareCode })

  const [membersRes, txnsRes] = await Promise.all([
    supabase
      .from('project_members')
      .select('*')
      .eq('project_id', project.id)
      .order('display_order', { ascending: true }),
    supabase
      .from('project_transactions')
      .select('*')
      .eq('project_id', project.id)
      .order('transaction_date', { ascending: false }),
  ])

  const members = membersRes.data ?? []
  const transactions = txnsRes.data ?? []

  const txnIds = transactions.map(t => t.id)
  const { data: attachments } = txnIds.length > 0
    ? await supabase
      .from('project_attachments')
      .select('*')
      .in('project_transaction_id', txnIds)
    : { data: [] }

  const memberMap = new Map(members.map(m => [m.id, m]))
  const txnsWithMembers = transactions.map(t => ({
    ...t,
    member: t.member_id ? memberMap.get(t.member_id) : undefined,
  }))

  return { project, members, transactions: txnsWithMembers, attachments: attachments ?? [] }
}
