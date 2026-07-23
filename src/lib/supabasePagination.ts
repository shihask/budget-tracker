import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 1000

export async function fetchAllPages<T>(table: string, userId: string, orderCol: string): Promise<T[]> {
  const rows: T[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order(orderCol, { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data as T[]) || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return rows
}
