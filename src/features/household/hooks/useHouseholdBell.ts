import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { joinBellItems, markSeen, readSeen, type JoinBellItem } from '../lib/bell'
import type { HouseholdShareContext } from '../lib/share'
import type { Household, HouseholdCategory, HouseholdMe, HouseholdMember } from '../types'

interface Snapshot {
  household: string
  members: HouseholdMember[]
  categories: HouseholdCategory[]
  meId: string
  at: number
}

/** App-level, cheap: one RPC (null for anyone not in a household) and, only for
 *  members, the members and categories. Feeds the notification bell and Quick
 *  Add's "Share with Household". Refreshes when the app comes back to the
 *  foreground, so leaving or being removed hides the option; the database still
 *  refuses a stale share either way. Never throws. */
export function useHouseholdBell({ enabled, userId }: { enabled: boolean; userId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [seen, setSeen] = useState<Set<string>>(() => readSeen(userId))

  const load = useCallback(async () => {
    try {
      const { data: me, error } = await supabase.rpc('mp_household_current')
      if (error) return
      if (!me) { setSnapshot(null); return }
      const current = me as HouseholdMe
      const [h, m, c] = await Promise.all([
        supabase.from('households').select('name').eq('id', current.household_id).single(),
        supabase.from('household_members').select('id, household_id, role, display_name, status, joined_at, left_at')
          .eq('household_id', current.household_id),
        supabase.from('household_categories').select('id, household_id, name, kind, icon, is_archived')
          .eq('household_id', current.household_id).order('name'),
      ])
      if (h.error || m.error || c.error) return
      setSnapshot({
        household: (h.data as Pick<Household, 'name'>).name,
        members: (m.data ?? []) as HouseholdMember[],
        categories: (c.data ?? []) as HouseholdCategory[],
        meId: current.member_id,
        at: Date.now(),
      })
    } catch {
      /* the bell and Quick Add just show nothing from Household */
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
  const share: HouseholdShareContext | null = enabled && snapshot
    ? { householdName: snapshot.household, categories: snapshot.categories }
    : null

  const dismiss = useCallback((memberIds: string[]) => setSeen(markSeen(userId, memberIds)), [userId])

  return { items, householdName: snapshot?.household ?? '', share, dismiss, reload: load }
}
