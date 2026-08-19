import { supabase } from '@/lib/supabase'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`

async function callAdminApi<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('not_authenticated')

  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `admin_api_error_${res.status}`)
  }
  return res.json()
}

// Server is the source of truth — this never reads/compares email client-side.
export async function checkIsAdmin(): Promise<boolean> {
  try {
    const { isAdmin } = await callAdminApi<{ isAdmin: boolean }>({ action: 'whoami' })
    return isAdmin
  } catch {
    return false
  }
}

export type AdminFeatureFlags = {
  track_credit_cards: boolean
  track_borrowings: boolean
  autopilot_enabled: boolean
  track_savings: boolean
  track_aa_sync: boolean
  notifications_enabled: boolean
  challenge_enabled: boolean
}

export type ToggleableFeatureField = keyof AdminFeatureFlags

export type AdminUserSummary = {
  id: string
  email: string | null
  fullName: string | null
  createdAt: string
  lastSignInAt: string | null
  onboarded: boolean
  isAdmin: boolean
  features: AdminFeatureFlags
  budgetStrategy: string
  aiUsed: number
  aiTokens: number
}

export type AdminDashboardSummary = {
  totalUsers: number
  activeUsers30d: number
  adminCount: number
  totalTransactions: number
  newUsersToday: number
  newUsersThisMonth: number
  onboardedCount: number
  avgTransactionsPerUser: number
  featureAdoption: Record<ToggleableFeatureField, { count: number; pct: number }>
  budgetStrategyAdoption: { count: number; pct: number }
  aiUsageToday: { totalRequests: number; totalTokens: number; enabledPct: number }
}

export async function fetchAdminUserList(): Promise<{ users: AdminUserSummary[]; summary: AdminDashboardSummary }> {
  return callAdminApi<{ users: AdminUserSummary[]; summary: AdminDashboardSummary }>({ action: 'list' })
}

export type AdminUserDetail = {
  settings: Record<string, unknown> | null
  budgetStrategy: Record<string, unknown> | null
  counts: { transactions: number; categories: number; accounts: number; creditCards: number }
}

export async function fetchAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  return callAdminApi<AdminUserDetail>({ action: 'detail', user_id: userId })
}

export async function toggleAdminUserFeature(userId: string, field: ToggleableFeatureField, value: boolean): Promise<void> {
  await callAdminApi<{ ok: true }>({ action: 'toggle', user_id: userId, field, value })
}

export type AdminAuditLogEntry = {
  id: string
  admin_user_id: string
  target_user_id: string
  action: string
  field: string | null
  old_value: unknown
  new_value: unknown
  created_at: string
}

export async function fetchAdminAuditLog(targetUserId?: string, limit?: number): Promise<AdminAuditLogEntry[]> {
  const { entries } = await callAdminApi<{ entries: AdminAuditLogEntry[] }>({ action: 'audit-log', target_user_id: targetUserId, limit })
  return entries
}

export type AdminActivityEntry =
  | { type: 'audit'; at: string; adminUserId: string; action: string; field: string | null; oldValue: unknown; newValue: unknown }
  | { type: 'achievement'; at: string; achievementId: string }

export async function fetchAdminUserActivity(userId: string): Promise<AdminActivityEntry[]> {
  const { entries } = await callAdminApi<{ entries: AdminActivityEntry[] }>({ action: 'activity', user_id: userId })
  return entries
}
