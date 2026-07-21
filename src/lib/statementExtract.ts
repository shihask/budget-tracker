import { supabase } from '@/lib/supabase'
import { withTimeout } from '@/lib/utils'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-categorize`

// A chunk can cover several statement pages/images worth of rows — allow more
// time than a single-receipt scan (RECEIPT_EXTRACT_TIMEOUT_MS in gemini.ts).
const STATEMENT_EXTRACT_TIMEOUT_MS = 45_000

export type FieldConfidence = 'high' | 'low'

export interface ParsedStatementRow {
  page: number
  description: string | null
  description_confidence: FieldConfidence
  amount: number | null
  amount_confidence: FieldConfidence
  date: string | null
  date_confidence: FieldConfidence
  type: 'debit' | 'credit'
  category: string | null
  category_suggestion: { name: string; group: string } | null
  category_confidence: FieldConfidence
}

export interface StatementExtractResult {
  statement: { bank: string | null; period_from: string | null; period_to: string | null }
  unparsed_count: number
  transactions: ParsedStatementRow[]
}

async function callStatementExtract(body: Record<string, unknown>): Promise<StatementExtractResult | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const res = await withTimeout(fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ mode: 'statement-extract', ...body }),
  }), STATEMENT_EXTRACT_TIMEOUT_MS, 'Statement scan timed out')

  if (res.status === 429) { console.warn('Mint daily limit reached (100/day)'); return null }
  if (!res.ok) return null

  const data = await res.json()
  return {
    statement: data.statement ?? { bank: null, period_from: null, period_to: null },
    unparsed_count: data.unparsed_count ?? 0,
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
  }
}

export async function extractStatementFromImages(
  images: { base64: string; mimeType: string }[],
  categoryNames: string[],
  groupNames: string[]
): Promise<StatementExtractResult | null> {
  try {
    return await callStatementExtract({ images, categoryNames, groupNames })
  } catch (e) {
    console.error('[AI] statement image extraction failed:', e)
    return null
  }
}

export async function extractStatementFromText(
  text: string,
  categoryNames: string[],
  groupNames: string[]
): Promise<StatementExtractResult | null> {
  if (!text.trim()) return null
  try {
    return await callStatementExtract({ text, categoryNames, groupNames })
  } catch (e) {
    console.error('[AI] statement text extraction failed:', e)
    return null
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}
