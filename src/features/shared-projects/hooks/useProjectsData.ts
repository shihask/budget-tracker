import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  Project, ProjectMember, ProjectTransaction, ProjectAttachment,
  ProjectCollaborator, ProjectBudget, ProjectActivityLog, CollaboratorRole
} from '../types'

interface ProjectDetail {
  members: ProjectMember[]
  transactions: ProjectTransaction[]
  attachments: ProjectAttachment[]
  collaborators: ProjectCollaborator[]
  budgets: ProjectBudget[]
  activityLog: ProjectActivityLog[]
}

export function useProjectsData(userId: string) {
  const [projects, setProjects] = useState<Project[]>([])
  const [sharedProjects, setSharedProjects] = useState<Project[]>([])
  const [projectRoles, setProjectRoles] = useState<Map<string, CollaboratorRole>>(new Map())
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    supabase.rpc('mp_resolve_pending_invites').then(() => fetchProjects(), () => fetchProjects())
    return () => { mountedRef.current = false }
  }, [userId])

  const fetchProjects = useCallback(async () => {
    setLoading(true)

    const [ownedRes, collabRes] = await Promise.all([
      supabase
        .from('projects')
        .select('*')
        .eq('owner_user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('project_collaborators')
        .select('project_id, role')
        .eq('user_id', userId)
        .eq('status', 'active'),
    ])

    const owned = ownedRes.data ?? []
    const collabRows = collabRes.data ?? []

    let shared: Project[] = []
    if (collabRows.length > 0) {
      const sharedIds = collabRows.map(c => c.project_id)
      const { data: sharedData } = await supabase
        .from('projects')
        .select('*')
        .in('id', sharedIds)
        .order('created_at', { ascending: false })
      shared = sharedData ?? []
    }

    if (mountedRef.current) {
      setProjects(owned)
      setSharedProjects(shared)
      const roles = new Map<string, CollaboratorRole>()
      owned.forEach(p => roles.set(p.id, 'owner'))
      collabRows.forEach(c => roles.set(c.project_id, c.role as CollaboratorRole))
      setProjectRoles(roles)
      setLoading(false)
    }
  }, [userId])

  // ── Activity logging ───────────────────────────────────────────────────

  const logActivity = useCallback(async (
    projectId: string,
    actionType: string,
    description: string,
    metadata: Record<string, unknown> = {}
  ) => {
    supabase.from('project_activity_log').insert({
      project_id: projectId,
      user_id: userId,
      action_type: actionType,
      description,
      metadata,
    }).then(() => {}, () => {})
  }, [userId])

  // ── Project CRUD ──────────────────────────────────────────────────────

  const addProject = useCallback(async (form: {
    name: string
    description?: string
    notes?: string
    target_amount: number
    currency?: string
  }): Promise<Project> => {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        owner_user_id: userId,
        name: form.name,
        description: form.description || null,
        notes: form.notes || null,
        target_amount: form.target_amount,
        currency: form.currency || 'INR',
      })
      .select()
      .single()
    if (error) throw error
    setProjects(prev => [data, ...prev])
    setProjectRoles(prev => new Map(prev).set(data.id, 'owner'))
    logActivity(data.id, 'project_created', `Created project "${form.name}"`)
    return data
  }, [userId, logActivity])

  const updateProject = useCallback(async (
    id: string,
    patch: Partial<Pick<Project, 'name' | 'description' | 'notes' | 'target_amount' | 'status' | 'currency'>>
  ) => {
    const { error } = await supabase
      .from('projects')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    const updater = (p: Project) => p.id === id ? { ...p, ...patch, updated_at: new Date().toISOString() } : p
    setProjects(prev => prev.map(updater))
    setSharedProjects(prev => prev.map(updater))
  }, [])

  const deleteProject = useCallback(async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) throw error
    setProjects(prev => prev.filter(p => p.id !== id))
    if (detailProjectId === id) {
      setDetail(null)
      setDetailProjectId(null)
    }
  }, [detailProjectId])

  // ── Load project detail ───────────────────────────────────────────────

  const loadProjectDetail = useCallback(async (projectId: string) => {
    setDetailProjectId(projectId)
    const [membersRes, txnsRes, attachRes, collabRes, budgetsRes, activityRes] = await Promise.all([
      supabase
        .from('project_members')
        .select('*')
        .eq('project_id', projectId)
        .order('display_order', { ascending: true }),
      supabase
        .from('project_transactions')
        .select('*')
        .eq('project_id', projectId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('project_attachments')
        .select('*')
        .in('project_transaction_id',
          (await supabase
            .from('project_transactions')
            .select('id')
            .eq('project_id', projectId)
          ).data?.map(t => t.id) ?? []
        ),
      supabase
        .from('project_collaborators')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true }),
      supabase
        .from('project_budgets')
        .select('*')
        .eq('project_id', projectId)
        .order('display_order', { ascending: true }),
      supabase
        .from('project_activity_log')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    const members = membersRes.data ?? []
    const transactions = txnsRes.data ?? []
    const attachments = attachRes.data ?? []
    const collaborators = collabRes.data ?? []
    const budgets = budgetsRes.data ?? []
    const activityLog = activityRes.data ?? []

    const memberMap = new Map(members.map(m => [m.id, m]))
    const txnsWithMembers = transactions.map(t => ({
      ...t,
      member: t.member_id ? memberMap.get(t.member_id) : undefined,
    }))

    if (mountedRef.current) {
      setDetail({ members, transactions: txnsWithMembers, attachments, collaborators, budgets, activityLog })
    }
  }, [])

  // ── Members ───────────────────────────────────────────────────────────

  const addMember = useCallback(async (projectId: string, form: {
    name: string
    email?: string
    share_ratio?: number
  }): Promise<ProjectMember> => {
    const maxOrder = detail?.members.reduce((m, mb) => Math.max(m, mb.display_order), -1) ?? -1
    const { data, error } = await supabase
      .from('project_members')
      .insert({
        project_id: projectId,
        name: form.name,
        email: form.email || null,
        share_ratio: form.share_ratio ?? 1,
        display_order: maxOrder + 1,
      })
      .select()
      .single()
    if (error) throw error
    setDetail(prev => prev ? { ...prev, members: [...prev.members, data] } : prev)
    logActivity(projectId, 'member_added', `Added member "${form.name}"`, { member_id: data.id })
    return data
  }, [detail, logActivity])

  const updateMember = useCallback(async (
    id: string,
    patch: Partial<Pick<ProjectMember, 'name' | 'email' | 'share_ratio' | 'is_active' | 'display_order'>>
  ) => {
    const { error } = await supabase
      .from('project_members')
      .update(patch)
      .eq('id', id)
    if (error) throw error
    setDetail(prev => prev ? {
      ...prev,
      members: prev.members.map(m => m.id === id ? { ...m, ...patch } : m),
    } : prev)
  }, [])

  const removeMember = useCallback(async (id: string) => {
    const member = detail?.members.find(m => m.id === id)
    const { error } = await supabase.from('project_members').delete().eq('id', id)
    if (error) throw error
    setDetail(prev => prev ? {
      ...prev,
      members: prev.members.filter(m => m.id !== id),
    } : prev)
    if (member && detailProjectId) {
      logActivity(detailProjectId, 'member_removed', `Removed member "${member.name}"`, { member_id: id })
    }
  }, [detail, detailProjectId, logActivity])

  // ── Project Transactions ──────────────────────────────────────────────

  const addProjectTransaction = useCallback(async (form: {
    project_id: string
    member_id: string | null
    transaction_type: 'contribution' | 'expense'
    amount: number
    description?: string
    category?: string
    notes?: string
    transaction_date: string
  }): Promise<ProjectTransaction> => {
    const { data, error } = await supabase
      .from('project_transactions')
      .insert({
        project_id: form.project_id,
        member_id: form.member_id,
        transaction_type: form.transaction_type,
        amount: form.amount,
        description: form.description || null,
        category: form.category || null,
        notes: form.notes || null,
        transaction_date: form.transaction_date,
      })
      .select()
      .single()
    if (error) throw error

    const memberMap = detail ? new Map(detail.members.map(m => [m.id, m])) : new Map()
    const txn: ProjectTransaction = {
      ...data,
      member: data.member_id ? memberMap.get(data.member_id) : undefined,
    }

    setDetail(prev => prev ? {
      ...prev,
      transactions: [txn, ...prev.transactions],
    } : prev)
    const label = form.transaction_type === 'contribution'
      ? `Added contribution of ₹${form.amount.toLocaleString()}`
      : `Added expense of ₹${form.amount.toLocaleString()}${form.category ? ` (${form.category})` : ''}`
    logActivity(form.project_id, 'transaction_added', label, { transaction_id: data.id, type: form.transaction_type, amount: form.amount })
    return txn
  }, [detail, logActivity])

  const updateProjectTransaction = useCallback(async (
    id: string,
    patch: Partial<Pick<ProjectTransaction,
      'member_id' | 'amount' | 'description' | 'category' | 'notes' | 'transaction_date'
    >>
  ) => {
    const { error } = await supabase
      .from('project_transactions')
      .update(patch)
      .eq('id', id)
    if (error) throw error

    const memberMap = detail ? new Map(detail.members.map(m => [m.id, m])) : new Map()
    setDetail(prev => prev ? {
      ...prev,
      transactions: prev.transactions.map(t =>
        t.id === id
          ? { ...t, ...patch, member: patch.member_id !== undefined ? memberMap.get(patch.member_id!) : t.member }
          : t
      ),
    } : prev)
  }, [detail])

  const deleteProjectTransaction = useCallback(async (id: string) => {
    const txn = detail?.transactions.find(t => t.id === id)
    const { error } = await supabase.from('project_transactions').delete().eq('id', id)
    if (error) throw error
    setDetail(prev => prev ? {
      ...prev,
      transactions: prev.transactions.filter(t => t.id !== id),
      attachments: prev.attachments.filter(a => a.project_transaction_id !== id),
    } : prev)
    if (txn && detailProjectId) {
      logActivity(detailProjectId, 'transaction_deleted', `Deleted ${txn.transaction_type} of ₹${txn.amount.toLocaleString()}`, { type: txn.transaction_type, amount: txn.amount })
    }
  }, [detail, detailProjectId, logActivity])

  // ── Sharing ───────────────────────────────────────────────────────────

  const generateShareCode = useCallback(async (projectId: string): Promise<string> => {
    const { data, error } = await supabase.rpc('mp_generate_share_code', { p_project_id: projectId })
    if (error) throw error
    const code = data as string
    setProjects(prev => prev.map(p =>
      p.id === projectId
        ? { ...p, share_code: code, is_public: true, shared_at: new Date().toISOString() }
        : p
    ))
    logActivity(projectId, 'share_enabled', 'Generated public share link')
    return code
  }, [logActivity])

  const revokeShareCode = useCallback(async (projectId: string) => {
    const { error } = await supabase
      .from('projects')
      .update({ share_code: null, is_public: false, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (error) throw error
    setProjects(prev => prev.map(p =>
      p.id === projectId
        ? { ...p, share_code: null, is_public: false }
        : p
    ))
    logActivity(projectId, 'share_revoked', 'Revoked public share link')
  }, [logActivity])

  // ── Collaborators ─────────────────────────────────────────────────────

  const addCollaborator = useCallback(async (projectId: string, email: string, role: CollaboratorRole) => {
    const { data, error } = await supabase.rpc('mp_add_collaborator', {
      p_project_id: projectId,
      p_email: email,
      p_role: role,
    })
    if (error) throw error
    const { data: collabs } = await supabase
      .from('project_collaborators')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    setDetail(prev => prev ? { ...prev, collaborators: collabs ?? [] } : prev)
    logActivity(projectId, 'collaborator_invited', `Invited ${email} as ${role}`, { email, role })
    return data
  }, [logActivity])

  const removeCollaborator = useCallback(async (projectId: string, collaboratorId: string) => {
    const collab = detail?.collaborators.find(c => c.id === collaboratorId)
    const { error } = await supabase.rpc('mp_remove_collaborator', {
      p_project_id: projectId,
      p_collaborator_id: collaboratorId,
    })
    if (error) throw error
    setDetail(prev => prev ? {
      ...prev,
      collaborators: prev.collaborators.filter(c => c.id !== collaboratorId),
    } : prev)
    logActivity(projectId, 'collaborator_removed', `Removed collaborator ${collab?.invited_email || ''}`, { collaborator_id: collaboratorId })
  }, [detail, logActivity])

  const updateCollaboratorRole = useCallback(async (collaboratorId: string, role: CollaboratorRole) => {
    const { error } = await supabase
      .from('project_collaborators')
      .update({ role })
      .eq('id', collaboratorId)
    if (error) throw error
    setDetail(prev => prev ? {
      ...prev,
      collaborators: prev.collaborators.map(c => c.id === collaboratorId ? { ...c, role } : c),
    } : prev)
  }, [])

  // ── Budgets ───────────────────────────────────────────────────────────

  const addBudget = useCallback(async (projectId: string, form: {
    category: string
    budget_amount: number
  }): Promise<ProjectBudget> => {
    const maxOrder = detail?.budgets.reduce((m, b) => Math.max(m, b.display_order), -1) ?? -1
    const { data, error } = await supabase
      .from('project_budgets')
      .insert({
        project_id: projectId,
        category: form.category,
        budget_amount: form.budget_amount,
        display_order: maxOrder + 1,
      })
      .select()
      .single()
    if (error) throw error
    setDetail(prev => prev ? { ...prev, budgets: [...prev.budgets, data] } : prev)
    return data
  }, [detail])

  const updateBudget = useCallback(async (
    id: string,
    patch: Partial<Pick<ProjectBudget, 'category' | 'budget_amount' | 'display_order'>>
  ) => {
    const { error } = await supabase
      .from('project_budgets')
      .update(patch)
      .eq('id', id)
    if (error) throw error
    setDetail(prev => prev ? {
      ...prev,
      budgets: prev.budgets.map(b => b.id === id ? { ...b, ...patch } : b),
    } : prev)
  }, [])

  const removeBudget = useCallback(async (id: string) => {
    const { error } = await supabase.from('project_budgets').delete().eq('id', id)
    if (error) throw error
    setDetail(prev => prev ? {
      ...prev,
      budgets: prev.budgets.filter(b => b.id !== id),
    } : prev)
  }, [])

  // ── Attachments ───────────────────────────────────────────────────────

  const uploadAttachment = useCallback(async (
    file: File,
    projectId: string,
    transactionId: string
  ): Promise<ProjectAttachment> => {
    const ext = file.name.split('.').pop() || 'bin'
    const storagePath = `${userId}/${projectId}/${crypto.randomUUID()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('project-attachments')
      .upload(storagePath, file, { contentType: file.type })
    if (uploadErr) throw uploadErr

    const { data, error } = await supabase
      .from('project_attachments')
      .insert({
        project_transaction_id: transactionId,
        path: storagePath,
        file_name: file.name,
      })
      .select()
      .single()
    if (error) throw error

    setDetail(prev => prev ? { ...prev, attachments: [...prev.attachments, data] } : prev)
    return data
  }, [userId])

  const deleteAttachment = useCallback(async (attachment: ProjectAttachment) => {
    await supabase.storage.from('project-attachments').remove([attachment.path])
    const { error } = await supabase.from('project_attachments').delete().eq('id', attachment.id)
    if (error) throw error
    setDetail(prev => prev ? {
      ...prev,
      attachments: prev.attachments.filter(a => a.id !== attachment.id),
    } : prev)
  }, [])

  const getAttachmentUrl = useCallback(async (path: string): Promise<string | null> => {
    const { data } = await supabase.storage.from('project-attachments').createSignedUrl(path, 3600)
    return data?.signedUrl ?? null
  }, [])

  return {
    projects,
    sharedProjects,
    projectRoles,
    loading,
    detail,
    detailProjectId,
    fetchProjects,
    addProject,
    updateProject,
    deleteProject,
    loadProjectDetail,
    addMember,
    updateMember,
    removeMember,
    addProjectTransaction,
    updateProjectTransaction,
    deleteProjectTransaction,
    generateShareCode,
    revokeShareCode,
    addCollaborator,
    removeCollaborator,
    updateCollaboratorRole,
    addBudget,
    updateBudget,
    removeBudget,
    uploadAttachment,
    deleteAttachment,
    getAttachmentUrl,
    logActivity,
  }
}
