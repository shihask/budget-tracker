import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Project } from '../types'

export interface PendingInvite {
  id: string
  project_id: string
  role: string
  project: Project
}

export function useProjectsSummary(userId: string) {
  const [activeProjects, setActiveProjects] = useState<Project[]>([])
  const [sharedProjects, setSharedProjects] = useState<Project[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    fetchActive()

    const channel = supabase
      .channel(`project-invites-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_collaborators',
          filter: `user_id=eq.${userId}`,
        },
        () => { if (mountedRef.current) fetchActive() }
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [userId])

  async function fetchActive() {
    setLoading(true)

    const [ownedRes, activeCollabRes, invitedCollabRes] = await Promise.all([
      supabase
        .from('projects')
        .select('*')
        .eq('owner_user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('project_collaborators')
        .select('project_id')
        .eq('user_id', userId)
        .eq('status', 'active'),
      supabase
        .from('project_collaborators')
        .select('id, project_id, role')
        .eq('user_id', userId)
        .eq('status', 'invited'),
    ])

    let shared: Project[] = []
    const activeRows = activeCollabRes.data ?? []
    if (activeRows.length > 0) {
      const { data: sharedData } = await supabase
        .from('projects')
        .select('*')
        .in('id', activeRows.map(c => c.project_id))
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(3)
      shared = sharedData ?? []
    }

    let invites: PendingInvite[] = []
    const invitedRows = invitedCollabRes.data ?? []
    if (invitedRows.length > 0) {
      const { data: inviteProjects } = await supabase
        .from('projects')
        .select('*')
        .in('id', invitedRows.map(c => c.project_id))
      if (inviteProjects) {
        const projectMap = new Map(inviteProjects.map(p => [p.id, p]))
        invites = invitedRows
          .filter(r => projectMap.has(r.project_id))
          .map(r => ({ id: r.id, project_id: r.project_id, role: r.role, project: projectMap.get(r.project_id)! }))
      }
    }

    if (mountedRef.current) {
      setActiveProjects(ownedRes.data ?? [])
      setSharedProjects(shared)
      setPendingInvites(invites)
      setLoading(false)
    }
  }

  const acceptInvite = async (collaboratorId: string) => {
    const { error } = await supabase.rpc('mp_accept_invite', { p_collaborator_id: collaboratorId })
    if (error) throw error
    await fetchActive()
  }

  const declineInvite = async (collaboratorId: string) => {
    const { error } = await supabase.rpc('mp_decline_invite', { p_collaborator_id: collaboratorId })
    if (error) throw error
    setPendingInvites(prev => prev.filter(i => i.id !== collaboratorId))
  }

  return { activeProjects, sharedProjects, pendingInvites, loading, refetch: fetchActive, acceptInvite, declineInvite }
}
