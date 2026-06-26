# MoneyPlant Project Documentation

## Overview

MoneyPlant is a mobile-first personal finance tracker built with React, TypeScript, Vite, Tailwind CSS, and Supabase. It helps users track accounts, expenses, income, commitments, borrowings, savings, goals, credit cards, budgets, cash-flow forecasts, shared projects, and AI-powered financial insights.

The app is designed as a PWA with a narrow single-column dashboard that works well on mobile and remains centered on desktop.

## Core Capabilities

- Email/password authentication, signup confirmation, and password reset through Supabase Auth.
- Account tracking for cash, bank, wallet, and credit card balances.
- Transaction entry with categories, groups, transfers, account balance updates, and lazy transaction loading.
- Quick Add flow with category matching, keyword fallback, and optional AI parsing/categorization.
- Budget dashboard with weekly, daily, monthly, manual, and income-cycle modes.
- Commitments, recurring bills, installment tracking, and paid-state workflows.
- Borrowing and lending tracking with repayment records and reversal support.
- Savings and investment tracking for SIPs, mutual funds, gold schemes, RDs, FDs, PPF/NPS, chit funds, and custom savings.
- Goals with progress, contributions, target dates, and AI coaching messages.
- Cash-flow forecasting using planned commitments, savings, salary overrides, and lifestyle forecasts.
- Budget strategy allocation across needs, wants, and savings.
- Daily challenges, reflections, streaks, and a plant-style finance journey view.
- Shared projects with collaborators, public share pages, budgets, transactions, notifications, and activity logs.
- Push notification support for reminders, budget alerts, commitments, summaries, and coaching.
- PWA install prompt and service worker support.

## Technology Stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS 4, custom CSS, design tokens |
| Routing | React Router DOM plus direct path handling for public project links |
| Backend | Supabase Auth, Postgres, Row Level Security, Edge Functions |
| AI | Supabase Edge Function proxying external model providers |
| Charts | Recharts |
| Forms | React Hook Form, Zod |
| UI primitives | Radix UI, lucide-react |
| PWA | vite-plugin-pwa, Workbox |
| Tests | Playwright |
| Deployment | Vercel config included |

## Repository Structure

```text
.
|-- public/                     Static PWA icons, favicons, logos, and images
|-- src/
|   |-- App.tsx                 Root auth flow, app state wiring, page/sheet orchestration
|   |-- main.tsx                React entry point
|   |-- sw.ts                   PWA service worker
|   |-- components/             Dashboard cards, pages, sheets, forms, and UI building blocks
|   |-- features/
|   |   |-- forecast/           Lifestyle forecast utilities
|   |   `-- shared-projects/    Project collaboration feature modules
|   |-- hooks/
|   |   `-- useSupabaseData.ts  Main data hook for Supabase reads/writes
|   |-- lib/                    Shared logic, Supabase client, AI helpers, metrics, tokens
|   |-- services/               Service exports
|   `-- types/                  Shared TypeScript domain models
|-- supabase/
|   |-- functions/              Supabase Edge Functions
|   `-- migrations/             Incremental database migrations
|-- tests/                      Playwright setup and e2e specs
|-- supabase-schema.sql         Older/handoff schema reference
|-- seed-transactions.sql       Seed data reference
|-- vite.config.ts              Vite, Tailwind, alias, and PWA configuration
|-- playwright.config.ts        E2E configuration
`-- package.json                Scripts and dependencies
```

## Important Source Files

| File | Purpose |
| --- | --- |
| `src/App.tsx` | Handles auth, reset links, public project pages, dashboard state, sheet/page navigation, and component wiring. |
| `src/hooks/useSupabaseData.ts` | Central data access layer. Loads user state, seeds defaults, performs CRUD operations, and keeps account balances in sync with transactions. |
| `src/types/index.ts` | Domain types for accounts, transactions, settings, forecasts, goals, savings, projects, and dashboard sections. |
| `src/lib/data.ts` | Derived finance metrics used by dashboard cards and analytics. |
| `src/lib/gemini.ts` | Client-side AI helper functions that call the `ai-categorize` Edge Function. |
| `src/lib/supabase.ts` | Supabase client initialization from Vite environment variables. |
| `src/lib/notifications.ts` | Push subscription and notification helper logic. |
| `src/components/QuickAdd.tsx` | Fast transaction entry and AI-assisted parsing/categorization. |
| `src/components/SettingsPanel.tsx` | User settings, notification preferences, budget behavior, and feature toggles. |
| `src/features/shared-projects/` | Shared project data hooks, calculations, pages, forms, invite sheet, public API helpers, and activity components. |

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key-here
```

The Supabase Edge Functions may also require server-side secrets configured in Supabase, such as AI provider keys, service-role keys, VAPID private keys, and email provider keys. Those secrets are not stored in the frontend `.env` file.

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run linting:

```bash
npm run lint
```

Run Playwright e2e tests:

```bash
npm run test:e2e
```

The Playwright config starts `npm run dev` on `http://localhost:5173` and uses an iPhone 14 viewport to match the mobile-first design.

## Data Flow

1. `App.tsx` checks Supabase auth state.
2. Anonymous users see `AuthPage`.
3. Password recovery links render `ResetPasswordPage`.
4. Public `/project/:shareCode` links render `PublicProjectPage` without requiring login.
5. Authenticated users render `AppContent`.
6. `AppContent` calls `useSupabaseData(user.id)`.
7. `useSupabaseData` loads settings, accounts, groups, categories, cards, borrowings, commitments, transactions, goals, savings, forecast settings, budget strategy settings, and planned expenses.
8. On first login, defaults are inserted for settings, groups, categories, forecast settings, and budget strategy settings.
9. UI components receive state and mutation callbacks from `useSupabaseData`.
10. Derived metrics are computed client-side with helpers such as `derive`, forecast utilities, and challenge/plant calculations.

## Domain Model Summary

The central `AppState` contains:

- `accounts`
- `categories`
- `groups`
- `credit_cards`
- `settings`
- `forecast_settings`
- `budget_strategy_settings`
- `commitments`
- `borrowings`
- `transactions`
- `goals`
- `goal_contributions`
- `savings`
- `planned_expenses`

Important transaction types include `expense`, `income`, `transfer`, `commitment`, `borrowing`, `borrowing_repayment`, `savings_contribution`, `savings_withdrawal`, `opening_balance`, `balance_adjustment`, `credit_card_payment`, `cc_opening_balance`, and `cc_balance_adjustment`.

## Supabase Notes

The project includes both a root `supabase-schema.sql` handoff file and incremental migrations under `supabase/migrations/`. The migrations are the more current source for newer features such as:

- Transaction schema updates and RPC functions.
- Forecast settings.
- Commitment/account sync fixes.
- Shared project tables.
- Project collaboration phases.
- Income pattern settings.
- Forecast settings foreign-key fixes.

Row Level Security is expected for user-owned tables. Shared project features add helper policies for owners, collaborators, editors, and public project views.

## Edge Functions

Supabase Edge Functions live in `supabase/functions/`:

| Function | Purpose |
| --- | --- |
| `ai-categorize` | AI parsing, categorization, affordability, analytics, goal, and chat-style financial coaching responses. |
| `push-subscribe` | Stores push subscriptions. |
| `push-send` | Sends push notifications. |
| `push-daily-reminder` | Scheduled daily reminders. |
| `push-budget-alert` | Budget alert notifications. |
| `push-commitment-reminder` | Commitment due reminders. |
| `push-weekly-summary` | Weekly finance summary notifications. |
| `push-financial-coach` | Financial coaching notifications. |
| `send-invite-email` | Sends shared project invitation emails. |

## AI Behavior

AI calls are initiated from client helpers in `src/lib/gemini.ts` and sent to the `ai-categorize` Supabase Edge Function with the current Supabase access token.

The app uses AI for:

- Natural-language expense parsing.
- Category suggestions.
- Affordability advice.
- Analytics summaries.
- Goal planning and progress coaching.
- General financial coaching chat.

Quick Add also has non-AI fallbacks: direct category name matching and keyword-based guessing.

## PWA Configuration

The PWA setup is in `vite.config.ts`:

- App name: `MoneyPlant`
- Display mode: standalone
- Orientation: portrait-primary
- Theme color: `#16C98A`
- Service worker source: `src/sw.ts`
- Static assets include favicons and PWA icons from `public/`

Generate icon assets with:

```bash
npm run generate-icons
```

## Testing

The repository includes Playwright tests in `tests/`.

- `tests/auth.setup.ts` logs in and saves a reusable session.
- `tests/quickadd.spec.ts` covers Quick Add behavior.
- `playwright.config.ts` runs setup first, then reuses `tests/.auth/session.json`.

For e2e tests, create a `.env.test` file with test Supabase credentials and any test user values expected by the auth setup.

## Deployment

The repository includes `vercel.json`, so the frontend is intended for Vercel deployment. Supabase database migrations and Edge Functions must be deployed separately through Supabase tooling or the Supabase dashboard.

Before deploying, confirm:

- Production `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured.
- Required Supabase secrets are configured for Edge Functions.
- Database migrations have been applied.
- Push notification VAPID keys are configured if notifications are enabled.
- PWA assets exist in `public/`.

## Development Conventions

- Keep shared domain types in `src/types/index.ts`.
- Route Supabase CRUD through `useSupabaseData` unless working inside a feature-specific data hook.
- Use the `@/` alias for imports from `src`.
- Keep dashboard sections compatible with `DEFAULT_DASHBOARD_SECTIONS`.
- When adding settings, update the TypeScript type, `EMPTY_STATE`, default insert values if needed, settings UI, `App.tsx` wiring, and database migration.
- For shared project work, prefer the feature module under `src/features/shared-projects/` instead of adding project-specific logic to generic dashboard files.
- For UI changes, preserve the mobile-first layout and test at a narrow viewport.

## Current Caveats

- `README.md` still contains the default Vite template text and does not describe the app.
- `supabase-schema.sql` appears to be an older handoff reference; rely on migrations for newer features.
- Some existing files contain mojibake/encoding artifacts in comments and display strings. Review encoding before editing those sections broadly.
- `git status` did not detect this directory as a Git repository in the current workspace session.
