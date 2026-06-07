import { supabase } from '@/lib/supabase'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-categorize`

export type AICategorizationResult =
  | { type: 'category'; name: string }
  | { type: 'suggestion'; name: string; group: string }

export async function categorizeWithAI(
  description: string,
  categoryNames: string[],
  groupNames: string[]
): Promise<AICategorizationResult | null> {
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
      body: JSON.stringify({ description, categoryNames, groupNames }),
    })

    if (res.status === 429) { console.warn('AI quota reached (100/month)'); return null }
    if (!res.ok) return null

    const data = await res.json()

    if (data.suggestion?.name) {
      return { type: 'suggestion', name: data.suggestion.name, group: data.suggestion.group }
    }
    if (data.result) {
      const match = categoryNames.find(c => c.toLowerCase() === data.result.toLowerCase())
      if (match) return { type: 'category', name: match }
    }
    return null
  } catch {
    return null
  }
}
