# MoneyPlant — Claude Code Reference

## Stack
React + TypeScript + Vite · Supabase (Postgres + Edge Functions) · deployed on Vercel  
PWA, mobile-first, single-column layout (max ~720px on desktop)

## Key file map
| File | Purpose |
|------|---------|
| `src/types/index.ts` | All shared interfaces (`Settings`, `Category`, `AppState`, …) |
| `src/hooks/useSupabaseData.ts` | Single data hook — all Supabase reads/writes, `EMPTY_STATE`, `DEFAULT_SETTINGS` |
| `src/App.tsx` | Root component — all state wiring, opens/closes panels, passes props down |
| `src/components/SettingsPanel.tsx` | Slide-in settings drawer |
| `src/components/QuickAdd.tsx` | FAB + sheet for adding transactions; auto-categorize logic lives here |
| `src/components/CategorySelect.tsx` | Category dropdown, supports `filterGroup` prop |
| `src/lib/gemini.ts` | Client-side AI helper (`categorizeWithAI`) |
| `supabase/functions/ai-categorize/index.ts` | Deno Edge Function — Groq proxy, usage counter |

## How to add a new Settings field — checklist
1. **`src/types/index.ts`** — add field to `Settings` interface
2. **`src/hooks/useSupabaseData.ts`** — add field with default to `EMPTY_STATE.settings` (line ~13)
3. **`src/components/SettingsPanel.tsx`** — add prop + toggle/control UI
4. **`src/App.tsx`** — pass `state.settings.<field> ?? <default>` and `onField={v => updateSettings({ <field>: v })}` to `SettingsPanel`; pass to any other component that needs it (e.g. `QuickAddSheet`)
5. **Supabase SQL** — `ALTER TABLE settings ADD COLUMN IF NOT EXISTS <field> <type> DEFAULT <value>;`

## Settings fields (current)
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `weekly_budget` | number | 5000 | |
| `emergency_fund` | number | 20000 | |
| `salary_date` | number\|null | null | Day of month |
| `track_credit_cards` | boolean | false | opt-in |
| `track_borrowings` | boolean | true | opt-out |
| `autopilot_enabled` | boolean | false | AI categorization, opt-in |
| `dashboard_sections` | json\|null | null | Section order/visibility |
| `track_savings` | boolean | false | Savings & Investments tracker, opt-in |

## Budget Strategy system
Two independent budgeting systems coexist:
1. **Spending Budget** (existing) — Daily/Weekly/Monthly limit on tracked expense categories
2. **Budget Strategy** (new) — Allocate income across Needs/Wants/Savings per a financial framework

### Key files
| File | Purpose |
|------|---------|
| `src/components/BudgetStrategyCard.tsx` | Card shown on dashboard when strategy ≠ none; also exports `getStrategyPcts`, `getCategoryBucket` |
| `src/components/CategoryBucketMapper.tsx` | BottomSheet for mapping "Other" group categories to budget buckets |

### Bucket derivation (`getCategoryBucket`)
- Group type `essential` or `commitment` → **needs**
- Group type `savings` → **savings**
- Group type `discretionary`, name ≠ "Other" → **wants**
- Group name "Other" → uses `category.budget_bucket` from DB (user-defined)
- System groups (income, transfer, borrowing, adjustment) → null (excluded)

### Table: `budget_strategy_settings` (separate from `settings`)
| Column | Type | Default |
|--------|------|---------|
| `budget_strategy` | text | `'none'` |
| `custom_needs_pct` | integer | `50` |
| `custom_wants_pct` | integer | `30` |
| `custom_savings_pct` | integer | `20` |
| `budget_strategy_base` | text | `'income'` |

### SQL migrations needed
```sql
CREATE TABLE IF NOT EXISTS budget_strategy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  budget_strategy text DEFAULT 'none',
  custom_needs_pct integer DEFAULT 50,
  custom_wants_pct integer DEFAULT 30,
  custom_savings_pct integer DEFAULT 20,
  budget_strategy_base text DEFAULT 'income'
);
ALTER TABLE budget_strategy_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own budget strategy" ON budget_strategy_settings FOR ALL USING (auth.uid() = user_id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS budget_bucket text DEFAULT NULL;
```

## Auto-categorize in QuickAdd (three-tier)
1. **Name match** (`findCategoryMatches`) — word-overlap against category names  
2. **Keyword fallback** (`guessCategory`) — hardcoded `KEYWORD_CATS` table  
3. **AI** (`categorizeWithAI`) — Groq via Edge Function, min 4 chars + 1200 ms debounce, only when `autopilotEnabled === true`

Uses `catsRef` (not `cats` state) inside the effect to avoid re-triggering when a new category is added.

## AI Edge Function
- File: `supabase/functions/ai-categorize/index.ts`
- Model: `llama-3.1-8b-instant` via Groq, `max_tokens: 30`, `temperature: 0`
- Quota: 100 calls/user/month tracked in `settings.ai_requests_used` + `ai_requests_reset_at`
- Response format: exact category name **or** `NEW: <name> | <group>`

## Git conventions
- Commit directly to `main` — no feature branches
- Never `git push` unless the user explicitly says so in that message

## React patterns used
- `stateRef` / `catsRef` — `useRef` mirroring state so callbacks/effects read current value without stale closures
- All data mutations go through `useSupabaseData` callbacks (`addCategory`, `updateSettings`, …)
- `filterGroup` prop on `CategorySelect` — pass `'Income'` to show only income categories
- Income group dedup runs on load (React StrictMode fires load twice)
