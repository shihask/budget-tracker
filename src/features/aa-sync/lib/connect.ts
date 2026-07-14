import { supabase } from '@/lib/supabase'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aa-connect`

export interface ConnectAaBankResult {
  redirectUrl: string
  connectionId: string
}

export async function connectAaBank(mobile: string): Promise<ConnectAaBankResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ mobile }),
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.message ?? data?.error ?? `Connect failed: ${res.status}`)
  }
  return data as ConnectAaBankResult
}
