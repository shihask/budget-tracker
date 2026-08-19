import { cors, getAdminStatus, requireAdmin, serviceClient } from '../_shared/adminAuth.ts'

// Boolean opt-in/opt-out feature flags on `settings` that the admin panel may
// toggle for any account. Kept as an explicit allow-list — never pass a
// client-supplied column name straight to `.update()`.
const TOGGLEABLE_FIELDS = [
  'track_credit_cards',
  'track_borrowings',
  'autopilot_enabled',
  'track_savings',
  'track_aa_sync',
  'notifications_enabled',
  'challenge_enabled',
] as const
type ToggleableField = typeof TOGGLEABLE_FIELDS[number]

// Mirrors EMPTY_STATE.settings (src/hooks/useSupabaseData.ts) — used when an
// account has no `settings` row yet, so a missing row doesn't misreport every
// feature as "off" (track_borrowings actually defaults to true).
const DEFAULT_FIELD_VALUES: Record<ToggleableField, boolean> = {
  track_credit_cards: false,
  track_borrowings: true,
  autopilot_enabled: false,
  track_savings: false,
  track_aa_sync: false,
  notifications_enabled: false,
  challenge_enabled: false,
}

type SettingsRow = Record<string, unknown> & { user_id: string; ai_requests_used?: number; ai_tokens_used?: number; ai_token_budget_override?: number | null; ai_requests_reset_at?: string | null }

// The daily counters are only meaningful for the UTC day they belong to: a
// stale count from a user who has not called the AI today would over-report.
// This mirrors mp_ai_usage_is_stale() in SQL — the third copy of this
// comparison, now the only one left client-side, and it exists solely because
// the admin list reads settings in bulk rather than per-user.
function isStaleUsageDay(resetAt: string | null | undefined): boolean {
  if (!resetAt) return true
  const stored = new Date(resetAt)
  const now = new Date()
  return stored.toISOString().slice(0, 10) < now.toISOString().slice(0, 10)
}

function effectiveAiUsed(s: SettingsRow | undefined): number {
  if (!s || isStaleUsageDay(s.ai_requests_reset_at)) return 0
  return s.ai_requests_used ?? 0
}

// Admin is allowed to see the technical numbers the product hides from users.
function effectiveAiTokens(s: SettingsRow | undefined): number {
  if (!s || isStaleUsageDay(s.ai_requests_reset_at)) return 0
  return s.ai_tokens_used ?? 0
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const body = await req.json().catch(() => ({}))
    const { action } = body

    // ── whoami: always 200, never throws on "not admin" — the client uses this
    // to decide whether to show the Admin entry point at all. ──
    if (action === 'whoami') {
      const { isAdmin } = await getAdminStatus(req)
      return json({ isAdmin })
    }

    const auth = await requireAdmin(req)
    if ('error' in auth) return auth.error
    const { user: caller } = auth
    const db = serviceClient()

    // ── list: account roster + dashboard summary ──
    if (action === 'list') {
      const { data: listData, error: listError } = await db.auth.admin.listUsers()
      if (listError) return json({ error: 'list_users_failed' }, 500)

      const ids = listData.users.map(u => u.id)
      const now = new Date()
      const [
        { data: settingsRows },
        { data: budgetRows },
        { data: adminRoleRows },
        { data: accountOwnerRows },
        { count: totalTransactions },
      ] = await Promise.all([
        db.from('settings').select('user_id, ai_requests_used, ai_tokens_used, ai_token_budget_override, ai_requests_reset_at, ' + TOGGLEABLE_FIELDS.join(', ')).in('user_id', ids),
        db.from('budget_strategy_settings').select('user_id, budget_strategy').in('user_id', ids),
        db.from('user_roles').select('user_id').eq('role', 'admin'),
        db.from('accounts').select('user_id').in('user_id', ids),
        db.from('transactions').select('id', { count: 'exact', head: true }),
      ])

      const settingsByUser = new Map<string, SettingsRow>((settingsRows ?? []).map((r: SettingsRow) => [r.user_id, r]))
      const budgetByUser = new Map<string, string>((budgetRows ?? []).map((r: { user_id: string; budget_strategy: string }) => [r.user_id, r.budget_strategy]))
      const onboardedIds = new Set<string>((accountOwnerRows ?? []).map((r: { user_id: string }) => r.user_id))
      const adminIds = new Set<string>((adminRoleRows ?? []).map((r: { user_id: string }) => r.user_id))

      const users = listData.users.map(u => {
        const s = settingsByUser.get(u.id)
        const features: Record<ToggleableField, boolean> = {} as Record<ToggleableField, boolean>
        for (const f of TOGGLEABLE_FIELDS) features[f] = s ? Boolean(s[f]) : DEFAULT_FIELD_VALUES[f]
        return {
          id: u.id,
          email: u.email ?? null,
          fullName: (u.user_metadata as { full_name?: string } | null)?.full_name ?? null,
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at ?? null,
          onboarded: onboardedIds.has(u.id),
          isAdmin: adminIds.has(u.id),
          features,
          budgetStrategy: budgetByUser.get(u.id) ?? 'none',
          aiUsed: effectiveAiUsed(s),
          aiTokens: effectiveAiTokens(s),
          // null means "following the global default" — the UI shows which.
          aiTokenBudgetOverride: (s?.ai_token_budget_override ?? null) as number | null,
        }
      })

      const totalUsers = users.length
      const pct = (n: number) => totalUsers > 0 ? Math.round((n / totalUsers) * 100) : 0
      const activeUsers30d = users.filter(u => u.lastSignInAt && (now.getTime() - new Date(u.lastSignInAt).getTime()) <= 30 * 24 * 60 * 60 * 1000).length
      const newUsersToday = users.filter(u => isSameDay(new Date(u.createdAt), now)).length
      const newUsersThisMonth = users.filter(u => isSameMonth(new Date(u.createdAt), now)).length
      const onboardedCount = users.filter(u => u.onboarded).length
      const aiTotalToday = users.reduce((sum, u) => sum + u.aiUsed, 0)
      const aiTokensToday = users.reduce((sum, u) => sum + u.aiTokens, 0)
      const aiEnabledCount = users.filter(u => u.features.autopilot_enabled).length
      const budgetStrategyAdoptedCount = users.filter(u => u.budgetStrategy !== 'none').length

      const featureAdoption: Record<ToggleableField, { count: number; pct: number }> = {} as Record<ToggleableField, { count: number; pct: number }>
      for (const f of TOGGLEABLE_FIELDS) {
        const count = users.filter(u => u.features[f]).length
        featureAdoption[f] = { count, pct: pct(count) }
      }

      const summary = {
        totalUsers,
        activeUsers30d,
        adminCount: adminIds.size,
        totalTransactions: totalTransactions ?? 0,
        newUsersToday,
        newUsersThisMonth,
        onboardedCount,
        avgTransactionsPerUser: totalUsers > 0 ? Math.round(((totalTransactions ?? 0) / totalUsers) * 10) / 10 : 0,
        featureAdoption,
        budgetStrategyAdoption: { count: budgetStrategyAdoptedCount, pct: pct(budgetStrategyAdoptedCount) },
        aiUsageToday: { totalRequests: aiTotalToday, totalTokens: aiTokensToday, enabledPct: pct(aiEnabledCount) },
      }

      return json({ users, summary })
    }

    // ── detail: full settings/budget-strategy row + counts for one account ──
    if (action === 'detail') {
      const { user_id } = body
      if (!user_id) return json({ error: 'invalid_request' }, 400)

      const [
        { data: settings },
        { data: budgetStrategy },
        { count: transactionCount },
        { count: categoryCount },
        { count: accountCount },
        { count: creditCardCount },
      ] = await Promise.all([
        db.from('settings').select('*').eq('user_id', user_id).maybeSingle(),
        db.from('budget_strategy_settings').select('*').eq('user_id', user_id).maybeSingle(),
        db.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', user_id),
        db.from('categories').select('id', { count: 'exact', head: true }).eq('user_id', user_id),
        db.from('accounts').select('id', { count: 'exact', head: true }).eq('user_id', user_id),
        db.from('credit_cards').select('id', { count: 'exact', head: true }).eq('user_id', user_id),
      ])

      return json({
        settings,
        budgetStrategy,
        counts: {
          transactions: transactionCount ?? 0,
          categories: categoryCount ?? 0,
          accounts: accountCount ?? 0,
          creditCards: creditCardCount ?? 0,
        },
      })
    }

    // ── audit-log: latest admin_audit_logs rows, optionally scoped to one target user ──
    if (action === 'audit-log') {
      const { target_user_id, limit } = body
      const lim = typeof limit === 'number' && limit > 0 && limit <= 200 ? limit : 50
      let q = db.from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(lim)
      if (target_user_id) q = q.eq('target_user_id', target_user_id)
      const { data, error } = await q
      if (error) return json({ error: 'audit_log_failed' }, 500)
      return json({ entries: data ?? [] })
    }

    // ── activity: one account's admin-initiated changes + achievement unlocks, merged ──
    if (action === 'activity') {
      const { user_id } = body
      if (!user_id) return json({ error: 'invalid_request' }, 400)

      const [{ data: auditRows }, { data: achievementRows }] = await Promise.all([
        db.from('admin_audit_logs').select('*').eq('target_user_id', user_id).order('created_at', { ascending: false }).limit(50),
        db.from('user_achievements').select('achievement_id, unlocked_at').eq('user_id', user_id).order('unlocked_at', { ascending: false }).limit(50),
      ])

      const entries = [
        ...(auditRows ?? []).map((r: Record<string, unknown>) => ({
          type: 'audit' as const,
          at: r.created_at as string,
          adminUserId: r.admin_user_id as string,
          action: r.action as string,
          field: r.field as string | null,
          oldValue: r.old_value,
          newValue: r.new_value,
        })),
        ...(achievementRows ?? []).map((r: { achievement_id: string; unlocked_at: string }) => ({
          type: 'achievement' as const,
          at: r.unlocked_at,
          achievementId: r.achievement_id,
        })),
      ].sort((a, b) => b.at.localeCompare(a.at))

      return json({ entries })
    }

    // ── toggle: flip one allow-listed boolean feature flag for one account ──
    if (action === 'toggle') {
      const { user_id, field, value } = body
      if (!user_id || typeof value !== 'boolean' || !TOGGLEABLE_FIELDS.includes(field)) {
        return json({ error: 'invalid_request' }, 400)
      }

      const { data: current } = await db.from('settings').select(field).eq('user_id', user_id).maybeSingle()
      const oldValue = (current as Record<string, unknown> | null)?.[field] ?? null

      const { error: updateError } = await db.from('settings').update({ [field]: value }).eq('user_id', user_id)
      if (updateError) return json({ error: 'update_failed' }, 500)

      // The settings write already succeeded — don't fail the request over a logging
      // hiccup, but surface it loudly so a broken audit trail is never silent.
      const { error: auditError } = await db.from('admin_audit_logs').insert({
        admin_user_id: caller.id,
        target_user_id: user_id,
        action: 'toggle_feature',
        field,
        old_value: { [field]: oldValue },
        new_value: { [field]: value },
      })
      if (auditError) console.error('[admin-api] audit log insert failed:', auditError)

      return json({ ok: true })
    }

    // Per-user daily AI token budget. null clears the override so the user
    // follows the global default again — important, because when the global
    // budget is recalibrated everyone on the default should move with it, and
    // only deliberate overrides should stay put.
    if (action === 'set-token-budget') {
      const { user_id, value } = body
      const clearing = value === null
      const valid = clearing
        || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1000000)
      if (!user_id || !valid) return json({ error: 'invalid_request' }, 400)

      const { data: current } = await db
        .from('settings').select('ai_token_budget_override').eq('user_id', user_id).maybeSingle()
      const oldValue = (current as { ai_token_budget_override?: number | null } | null)?.ai_token_budget_override ?? null

      const { error: updateError } = await db
        .from('settings').update({ ai_token_budget_override: clearing ? null : value }).eq('user_id', user_id)
      if (updateError) return json({ error: 'update_failed' }, 500)

      // settings.ai_usage_pct is a display cache refreshed only when an AI call
      // returns, so changing the budget silently invalidates it: raising a
      // maxed-out user to 100,000 left the card reading 100% until their next
      // request. Recompute it here, since this is the one place that knows the
      // divisor just changed. mp_ai_usage_today stays authoritative — this only
      // keeps the mirror honest.
      const { data: usageRows } = await db.rpc('mp_ai_usage_today', { p_user_id: user_id })
      const freshPct = (usageRows as { usage_pct: number }[] | null)?.[0]?.usage_pct
      if (freshPct != null) {
        const { error: pctError } = await db.from('settings').update({ ai_usage_pct: freshPct }).eq('user_id', user_id)
        if (pctError) console.error('[admin-api] usage_pct refresh failed:', pctError)
      }

      // Always audited: this is one person changing another person's allowance,
      // and a budget of 0 cuts their AI off entirely once enforcement is on.
      const { error: auditError } = await db.from('admin_audit_logs').insert({
        admin_user_id: caller.id,
        target_user_id: user_id,
        action: 'set_token_budget',
        field: 'ai_token_budget_override',
        old_value: { ai_token_budget_override: oldValue },
        new_value: { ai_token_budget_override: clearing ? null : value },
      })
      if (auditError) console.error('[admin-api] audit log insert failed:', auditError)

      return json({ ok: true })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    console.error('[admin-api] unhandled exception:', e)
    return json({ error: 'internal_error' }, 500)
  }
})
