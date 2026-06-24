import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Project } from '../types'

export function useProjectsSummary(userId: string) {
  const [activeProjects, setActiveProjects] = useState<Project[]>([])
  const [sharedProjects, setSharedProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    fetchActive()
    return () => { mountedRef.current = false }
  }, [userId])

  async function fetchActive() {
    setLoading(true)

    const [ownedRes, collabRes] = await Promise.all([
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
    ])

    let shared: Project[] = []
    const collabRows = collabRes.data ?? []
    if (collabRows.length > 0) {
      const { data: sharedData } = await supabase
        .from('projects')
        .select('*')
        .in('id', collabRows.map(c => c.project_id))
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(3)
      shared = sharedData ?? []
    }

    if (mountedRef.current) {
      setActiveProjects(ownedRes.data ?? [])
      setSharedProjects(shared)
      setLoading(false)
    }
  }

  return { activeProjects, sharedProjects, loading, refetch: fetchActive }
}
