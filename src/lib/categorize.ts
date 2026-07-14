import type { Category } from '@/types'

// Keyword → category name mapping for auto-detection
const KEYWORD_CATS: [string[], string][] = [
  [['breakfast', 'lunch', 'dinner', 'food', 'eat', 'restaurant', 'hotel', 'bakery', 'sweet', 'biriyani', 'parotta', 'dosa', 'idli'], 'Food'],
  [['tea', 'coffee', 'chai', 'juice', 'drink', 'snack', 'biscuit'], 'Tea & Snacks'],
  [['petrol', 'fuel', 'diesel', 'gas', 'bunk', 'pump', 'filling station'], 'Fuel'],
  [['grocery', 'groceries', 'vegetable', 'rice', 'dal', 'flour', 'milk', 'bread', 'egg', 'fruit', 'supermarket', 'provision', 'store', 'market', 'sabzi'], 'Groceries'],
  [['medical', 'medicine', 'doctor', 'hospital', 'pharmacy', 'tablet', 'injection', 'clinic', 'health', 'lab', 'prescription'], 'Medical'],
  [['shopping', 'clothes', 'shirt', 'pants', 'dress', 'shoes', 'amazon', 'flipkart', 'mall', 'apparel'], 'Shopping'],
  [['netflix', 'spotify', 'hotstar', 'prime video', 'youtube premium', 'disney', 'subscription', 'streaming'], 'Shopping'],
  [['electricity', 'electric', 'bill', 'internet', 'wifi', 'broadband', 'mobile recharge', 'recharge', 'bsnl', 'jio', 'airtel', 'kseb', 'utility'], 'Utilities'],
  [['loan', 'emi', 'mortgage', 'installment'], 'Loan EMI'],
  [['gold', 'jewel', 'chit', 'kuri', 'chitty'], 'Gold Scheme'],
  [['sip', 'mutual fund', 'investment'], 'SIP'],
  [['kitchen', 'utensil', 'vessel', 'cooker'], 'Kitchen'],
  [['granite', 'marble', 'tiles', 'flooring'], 'Granite'],
  [['wiring', 'electrician', 'switch', 'fan', 'bulb', 'mcb'], 'Electrical'],
  [['plumbing', 'pipe', 'tap', 'bathroom', 'toilet', 'sink'], 'Plumbing'],
  [['family', 'home expense', 'domestic'], 'Family'],
]

// Match description words against actual category names — returns ranked matches
export function findCategoryMatches(description: string, categories: Category[]): Category[] {
  const descWords = description.toLowerCase().split(/\s+/).filter(w => w.length >= 3)
  if (descWords.length === 0) return []
  const scored = categories
    .map(cat => {
      const catLower = cat.name.toLowerCase()
      const score = descWords.reduce((s, w) => s + (catLower.includes(w) ? 1 : 0), 0)
      return { cat, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
  if (scored.length === 0) return []
  const top = scored[0].score
  return scored.filter(({ score }) => score >= top).map(({ cat }) => cat)
}

export function guessCategory(description: string, categories: Category[]): string | null {
  const lower = description.toLowerCase()
  for (const [keywords, catName] of KEYWORD_CATS) {
    if (keywords.some(kw => lower.includes(kw))) {
      const cat = categories.find(c => c.name.toLowerCase().includes(catName.toLowerCase()))
      if (cat) return cat.id
    }
  }
  return null
}

export interface SyncCategorizeResult {
  categoryId: string | null
  confidence: number   // 1 = keyword hit, 0.5 = single word-overlap match, 0 = none
  source: 'keyword' | 'word_overlap' | 'none'
}

// Conservative categorization for bulk/automated sync — no human in the loop
// to pick among ambiguous chip suggestions the way QuickAdd's interactive
// flow does, so ambiguity resolves to uncategorized, never a guess.
// Deliberately excludes the AI tier (categorizeWithAI/parseExpenseWithAI) —
// quota-limited (100/month) and single-utterance-shaped, ruled out for bulk
// sync during Phase 0's research.
export function categorizeForSync(description: string, categories: Category[]): SyncCategorizeResult {
  if (!description) return { categoryId: null, confidence: 0, source: 'none' }
  const guessed = guessCategory(description, categories)
  if (guessed) return { categoryId: guessed, confidence: 1, source: 'keyword' }
  const matches = findCategoryMatches(description, categories)
  if (matches.length === 1) return { categoryId: matches[0].id, confidence: 0.5, source: 'word_overlap' }
  return { categoryId: null, confidence: 0, source: 'none' }
}
