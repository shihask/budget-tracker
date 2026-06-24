import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Project } from '../types'

export function useProjectsSummary(userId: string) {
  const [activeProjects, setActiveProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    fetchActive()
    return () => { mountedRef.current = false }
  }, [userId])

  async function fetchActive() {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('owner_user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5)
    if (!error && mountedRef.current) setActiveProjects(data ?? [])
    if (mountedRef.current) setLoading(false)
  }

  return { activeProjects, loading, refetch: fetchActive }
}
