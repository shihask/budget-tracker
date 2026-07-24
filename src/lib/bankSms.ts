import type { AppState } from '@/types'

export interface ParsedBankSms {
  amount: number
  description: string
  transactionDate: string
  accountId: string
  categoryId: string | null
  categorySuggestion: { name: string; group: string } | null
}

const KEYWORD_CAT: Array<[RegExp, string, string]> = [
  [/petrol|diesel|fuel|pump|cng|filling station/i, 'Fuel', 'Lifestyle'],
  [/grocery|supermarket|provision|vegetables?|fruits?|kirana|bigbasket|blinkit|zepto|jiomart|dmart/i, 'Groceries', 'Lifestyle'],
  [/swiggy|zomato|restaurant|hotel|dhaba|cafe|coffee|pizza|burger|biryani|bakery/i, 'Food', 'Lifestyle'],
  [/amazon|flipkart|myntra|meesho|nykaa|ajio|shopping/i, 'Shopping', 'Lifestyle'],
  [/medical|pharmacy|hospital|clinic|doctor|medicine|apollo|medplus|wellness/i, 'Medical', 'Lifestyle'],
  [/electricity|water supply|broadband|internet|telephone|recharge|postpaid|utility/i, 'Utilities', 'Commitments'],
]

function matchCategory(merchant: string, cats: AppState['categories']): { categoryId: string | null; categorySuggestion: { name: string; group: string } | null } {
  const m = merchant.toLowerCase()

  // Word-overlap: category name words found in merchant string
  const hit = cats
    .map(cat => ({
      cat,
      score: cat.name.toLowerCase().split(/\W+/).filter(w => w.length > 2 && m.includes(w)).length,
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)[0]
  if (hit) return { categoryId: hit.cat.id, categorySuggestion: null }

  // Keyword table
  for (const [re, name, group] of KEYWORD_CAT) {
    if (re.test(merchant)) {
      const existing = cats.find(c => c.name.toLowerCase() === name.toLowerCase())
      if (existing) return { categoryId: existing.id, categorySuggestion: null }
      return { categoryId: null, categorySuggestion: { name, group } }
    }
  }

  return { categoryId: null, categorySuggestion: null }
}

export function parseBankSms(text: string, state: AppState): ParsedBankSms | null {
  // Must contain currency signal + bank/card signal
  if (!/\b(INR|Rs\.?|₹)\b/i.test(text)) return null
  if (!/\b(bank|card|a\/c|account|avl|limit|debited?|credited?|spent|transaction)\b/i.test(text)) return null
  // Must be multi-line or long enough to be an actual SMS
  if (text.split('\n').length < 2 && text.length < 60) return null

  // ── Amount ────────────────────────────────────────────────────────────────
  const amtMatch =
    text.match(/(?:spent|debited?|of|for)\s+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d+)?)/i) ??
    text.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d+)?)/i)
  if (!amtMatch) return null
  const amount = parseFloat(amtMatch[1].replace(/,/g, ''))
  if (!amount || amount <= 0) return null

  // ── Date ──────────────────────────────────────────────────────────────────
  let transactionDate = new Date().toISOString().slice(0, 10)
  // DD-MM-YY HH:MM (Axis Bank: "24-07-26 08:16:07 IST")
  const axisDate = text.match(/\b(\d{2})-(\d{2})-(\d{2})\s+\d{2}:\d{2}/)
  if (axisDate) {
    const [, dd, mm, yy] = axisDate
    transactionDate = `20${yy}-${mm}-${dd}`
  } else {
    // DD-MM-YYYY
    const ddmmyyyy = text.match(/\b(\d{2})-(\d{2})-(\d{4})\b/)
    if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy
      transactionDate = `${yyyy}-${mm}-${dd}`
    } else {
      // YYYY-MM-DD
      const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
      if (iso) transactionDate = iso[0]
    }
  }

  // ── Account / Card ────────────────────────────────────────────────────────
  // Match last 4 digits of card number
  const cardMatch = text.match(/(?:XX|xxxx|x{3,4}|ending|card\s*(?:no\.?\s*)?)[^\d]*(\d{4})/i)
  const last4 = cardMatch?.[1]
  let accountId = ''

  if (last4) {
    const cc = state.credit_cards?.find(c => c.last_four === last4)
    if (cc) accountId = cc.id
    if (!accountId) {
      const acc = state.accounts.find(a => a.name.includes(last4))
      if (acc) accountId = acc.id
    }
  }
  if (!accountId) {
    const bankMatch = text.match(/\b(Axis|HDFC|SBI|ICICI|Kotak|IndusInd|PNB|Canara|Federal|Yes)\s+Bank/i)
    if (bankMatch) {
      const name = bankMatch[1].toLowerCase()
      const found = [...state.accounts, ...(state.credit_cards ?? [])].find(a =>
        a.name.toLowerCase().includes(name)
      )
      if (found) accountId = found.id
    }
  }
  // Fallback: first active account
  if (!accountId) accountId = state.accounts.find(a => a.is_active)?.id ?? ''

  // ── Merchant ──────────────────────────────────────────────────────────────
  let description = ''
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Axis Bank: merchant appears on the line right after the timestamp line
  const dateLineIdx = lines.findIndex(l => /\d{2}[-/]\d{2}[-/]\d{2,4}\s+\d{2}:\d{2}/.test(l))
  if (dateLineIdx >= 0 && dateLineIdx + 1 < lines.length) {
    const candidate = lines[dateLineIdx + 1]
    if (!/^(avl|not you|ref|upi|balance|limit|otp|rs\.|inr)/i.test(candidate)) {
      description = candidate.replace(/[^\w\s&'.,-]/g, ' ').trim()
    }
  }
  // "at MERCHANT on" pattern (HDFC / other banks)
  if (!description) {
    const atMatch = text.match(/\bat\s+([A-Z][A-Z0-9\s&'.,-]{2,40})(?:\s+on\b|\s+\d{2})/i)
    if (atMatch) description = atMatch[1].trim()
  }
  if (!description) description = 'Bank Transaction'

  // ── Category ──────────────────────────────────────────────────────────────
  const { categoryId, categorySuggestion } = matchCategory(description, state.categories)

  return { amount, description, transactionDate, accountId, categoryId, categorySuggestion }
}
