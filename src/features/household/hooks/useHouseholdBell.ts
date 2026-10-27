import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { joinBellItems, markSeen, readSeen, type JoinBellItem } from '../lib/bell'
import type { Household, HouseholdMe, HouseholdMember } from '../types'

/** App-level, cheap: one RPC (null for anyone not in a household) and, only for
 *  members, one members read. Feeds the notification bell; never throws. */
export function useHouseholdBell({ enabled, userId }: { enabled: boolean; userId: string }) {
  const [snapshot, setSnapshot] = useState<{ household: string; members: HouseholdMember[]; meId: string; at: number } | null>(null)
  const [seen, setSeen] = useState<Set<string>>(() => readSeen(userId))

  const load = useCallback(async () => {
    try {
      const { data: me, error } = await supabase.rpc('mp_household_current')
      if (error || !me) { setSnapshot(null); return }
      const current = me as HouseholdMe
      const [h, m] = await Promise.all([
        supabase.from('households').select('name').eq('id', current.household_id).single(),
        supabase.from('household_members').select('id, household_id, role, display_name, status, joined_at, left_at')
          .eq('household_id', current.household_id),
      ])
      if (h.error || m.error) return
      setSnapshot({ household: (h.data as Pick<Household, 'name'>).name, members: (m.data ?? []) as HouseholdMember[], meId: current.member_id, at: Date.now() })
    } catch {
      /* the bell just shows nothing from Household */
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    // First read off the effect's synchronous path, like the visibility refresh below.
    void Promise.resolve().then(load)
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled, load])

  const items: JoinBellItem[] = enabled && snapshot ? joinBellItems(snapshot.members, snapshot.meId, seen, snapshot.at) : []

  const dismiss = useCallback((memberIds: string[]) => setSeen(markSeen(userId, memberIds)), [userId])

  return { items, householdName: snapshot?.household ?? '', dismiss, reload: load }
}
