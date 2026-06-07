import { supabase } from '@/lib/supabase'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-categorize`

export async function categorizeWithAI(description: string, categoryNames: string[]): Promise<string | null> {
  if (!description.trim()) return null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ description, categoryNames }),
    })

    if (res.status === 429) {
      console.warn('AI quota reached for this month (100/month)')
      return null
    }
    if (!res.ok) return null

    const data = await res.json()
    if (!data.result) return null
    return categoryNames.find(c => c.toLowerCase() === data.result.toLowerCase()) ?? null
  } catch {
    return null
  }
}
