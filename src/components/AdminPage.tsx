import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import type { ColorTokens } from '@/lib/tokens'
import { timeAgo } from '@/lib/utils'
import { ACHIEVEMENTS } from '@/lib/achievement-definitions'
import {
  fetchAdminUserList, fetchAdminUserDetail, toggleAdminUserFeature,
  fetchAdminAuditLog, fetchAdminUserActivity,
  type AdminUserSummary, type AdminUserDetail, type ToggleableFeatureField,
  type AdminDashboardSummary, type AdminAuditLogEntry, type AdminActivityEntry,
} from '@/lib/adminApi'

interface Props {
  open: boolean
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
}

const FEATURE_LABELS: Record<ToggleableFeatureField, string> = {
  track_credit_cards: 'Credit Cards',
  track_borrowings: 'Borrowings',
  autopilot_enabled: 'AI Autopilot',
  track_savings: 'Savings & Investments',
  track_aa_sync: 'Account Aggregator Sync',
  notifications_enabled: 'Notifications',
  challenge_enabled: 'Daily Challenge',
}
const FEATURE_ORDER = Object.keys(FEATURE_LABELS) as ToggleableFeatureField[]

type FilterKey = 'admin' | 'ai' | 'challenge' | 'savings'
const FILTER_DEFS: { key: FilterKey; label: string; test: (u: AdminUserSummary) => boolean }[] = [
  { key: 'admin', label: 'Admin', test: u => u.isAdmin },
  { key: 'ai', label: 'AI enabled', test: u => u.features.autopilot_enabled },
  { key: 'challenge', label: 'Challenge', test: u => u.features.challenge_enabled },
  { key: 'savings', label: 'Savings', test: u => u.features.track_savings },
]

type SortKey = 'active' | 'joined' | 'name' | 'features'
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'active', label: 'Last active' },
  { key: 'joined', label: 'Joined' },
  { key: 'name', label: 'Name' },
  { key: 'features', label: 'Features on' },
]
function sortValue(u: AdminUserSummary, key: SortKey): number | string {
  switch (key) {
    case 'joined': return u.createdAt
    case 'active': return u.lastSignInAt ?? ''
    case 'name': return (u.fullName || u.email || '').toLowerCase()
    case 'features': return FEATURE_ORDER.filter(f => u.features[f]).length
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function healthDot(u: AdminUserSummary, c: ColorTokens): { color: string; label: string } {
  if (!u.onboarded) return { color: c.warn, label: 'Not onboarded — no accounts yet' }
  if (!u.lastSignInAt) return { color: c.bad, label: 'Never signed in' }
  const days = (Date.now() - new Date(u.lastSignInAt).getTime()) / 86400000
  if (days <= 7) return { color: c.good, label: 'Active this week' }
  if (days <= 30) return { color: c.warn, label: 'Active this month' }
  return { color: c.bad, label: 'Inactive 30+ days' }
}

function extractBool(v: unknown, field: string | null): string {
  if (!field || typeof v !== 'object' || v === null) return '—'
  const val = (v as Record<string, unknown>)[field]
  return val === true ? 'On' : val === false ? 'Off' : String(val ?? '—')
}

function Toggle({ checked, onChange, disabled, c }: { checked: boolean; onChange: () => void; disabled?: boolean; c: ColorTokens }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 42, height: 24, borderRadius: 999, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: checked ? c.accent : c.faint, position: 'relative', flexShrink: 0,
        opacity: disabled ? 0.5 : 1, transition: 'background 0.15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}

function Row({ label, value, c }: { label: string; value: string; c: ColorTokens }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ font: '500 12px Plus Jakarta Sans', color: c.muted }}>{label}</span>
      <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink }}>{value}</span>
    </div>
  )
}

function CopyButton({ text, c }: { text: string; c: ColorTokens }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  return (
    <button
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }).catch(() => {})
      }}
      aria-label="Copy email"
      style={{
        width: 22, height: 22, borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: copied ? c.good : c.muted, padding: 0,
      }}
    >
      {copied
        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>}
    </button>
  )
}

function StatTile({ label, value, c }: { label: string; value: string; c: ColorTokens }) {
  return (
    <div style={{ borderRadius: 14, padding: '10px 12px', background: c.surface, border: `1px solid ${c.faint}`, flex: '1 1 100px', minWidth: 92 }}>
      <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink }}>{value}</div>
      <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function AdoptionBar({ label, pct, count, total, c }: { label: string; pct: number; count: number; total: number; c: ColorTokens }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink }}>{label}</span>
        <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>{pct}% · {count}/{total}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: c.faint, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: c.accent }} />
      </div>
    </div>
  )
}

function RefreshButton({ onClick, spinning, c }: { onClick: () => void; spinning: boolean; c: ColorTokens }) {
  return (
    <button
      onClick={onClick}
      disabled={spinning}
      aria-label="Refresh"
      style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: spinning ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: spinning ? 'adminRefreshSpin 0.7s linear infinite' : 'none' }}>
        <path d="M21 12a9 9 0 11-3-6.7"/><path d="M21 3v6h-6"/>
      </svg>
    </button>
  )
}

function AuditRow({ entry, usersById, c, showTarget }: { entry: AdminAuditLogEntry; usersById: Map<string, AdminUserSummary>; c: ColorTokens; showTarget: boolean }) {
  const admin = usersById.get(entry.admin_user_id)
  const target = usersById.get(entry.target_user_id)
  const fieldLabel = entry.field ? (FEATURE_LABELS[entry.field as ToggleableFeatureField] ?? entry.field) : entry.action
  const oldVal = extractBool(entry.old_value, entry.field)
  const newVal = extractBool(entry.new_value, entry.field)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0', borderBottom: `1px solid ${c.faint}` }}>
      <div style={{ font: '600 12.5px Plus Jakarta Sans', color: c.ink }}>{fieldLabel}: {oldVal} → {newVal}</div>
      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {showTarget && <>{target?.fullName || target?.email || 'Unknown account'} · </>}
        by {admin?.fullName || admin?.email || 'Unknown admin'} · {timeAgo(entry.created_at)}
      </div>
    </div>
  )
}

function ActivityRow({ entry, c }: { entry: AdminActivityEntry; c: ColorTokens }) {
  if (entry.type === 'achievement') {
    const def = ACHIEVEMENTS.find(d => d.id === entry.achievementId)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0', borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ font: '600 12.5px Plus Jakarta Sans', color: c.ink }}>🏆 Unlocked "{def?.title ?? entry.achievementId}"</div>
        <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>{timeAgo(entry.at)}</div>
      </div>
    )
  }
  const fieldLabel = entry.field ? (FEATURE_LABELS[entry.field as ToggleableFeatureField] ?? entry.field) : entry.action
  const oldVal = extractBool(entry.oldValue, entry.field)
  const newVal = extractBool(entry.newValue, entry.field)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0', borderBottom: `1px solid ${c.faint}` }}>
      <div style={{ font: '600 12.5px Plus Jakarta Sans', color: c.ink }}>⚙️ {fieldLabel}: {oldVal} → {newVal} <span style={{ color: c.muted, fontWeight: 500 }}>(admin change)</span></div>
      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>{timeAgo(entry.at)}</div>
    </div>
  )
}

// Full-screen overlay following the AchievementsPage/GrowPage pattern (open/onClose,
// swipe-to-dismiss, sticky header, scroll-locked body). Two sub-views live in one
// overlay: an account list (with a dashboard summary, feature adoption, search/sort/
// filter, and a global activity feed), and a per-account detail with feature toggles
// and its own activity feed — swiping back from detail returns to the list before
// closing the whole panel.
export function AdminPage({ open, onClose, onSwipeProgress }: Props) {
  const c = useTheme()

  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400

  const [users, setUsers] = useState<AdminUserSummary[] | null>(null)
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [globalActivity, setGlobalActivity] = useState<AdminAuditLogEntry[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [userActivity, setUserActivity] = useState<AdminActivityEntry[] | null>(null)
  const [pendingField, setPendingField] = useState<ToggleableFeatureField | null>(null)

  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('active')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setEntryPlayed(true), 360)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!open) { setClosing(false); setDragX(0); setEntryPlayed(false); setSelectedUserId(null); setSearch(''); setActiveFilters(new Set()) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev; document.documentElement.style.overflow = prevHtml }
  }, [open])

  // Initial load only — navigating list <-> detail, searching, sorting, and
  // filtering all stay purely local against this cached data. Only this
  // `open` transition and the explicit Refresh button hit the network.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setUsers(null); setSummary(null); setLoadError(null); setGlobalActivity(null)
    Promise.all([fetchAdminUserList(), fetchAdminAuditLog(undefined, 30)])
      .then(([listRes, auditRes]) => {
        if (cancelled) return
        setUsers(listRes.users); setSummary(listRes.summary); setGlobalActivity(auditRes)
      })
      .catch(e => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'load_failed') })
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!selectedUserId) { setDetail(null); setDetailError(null); setUserActivity(null); return }
    let cancelled = false
    setDetail(null); setDetailError(null); setUserActivity(null)
    Promise.all([fetchAdminUserDetail(selectedUserId), fetchAdminUserActivity(selectedUserId)])
      .then(([d, activity]) => { if (!cancelled) { setDetail(d); setUserActivity(activity) } })
      .catch(e => { if (!cancelled) setDetailError(e instanceof Error ? e.message : 'load_failed') })
    return () => { cancelled = true }
  }, [selectedUserId])

  const triggerClose = () => {
    setClosing(true); onSwipeProgress?.(1)
    setTimeout(() => { onSwipeProgress?.(0); onClose() }, 290)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (closing) return
    const t = e.touches[0]
    if (t.clientX > 28) return
    gestureRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: Date.now() }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dy = Math.abs(t.clientY - gestureRef.current.startY)
    if (dy > Math.abs(dx) + 5 && Math.abs(dx) < 15) {
      gestureRef.current = null; setDragX(0); onSwipeProgress?.(0); return
    }
    gestureRef.current = { ...gestureRef.current, lastX: t.clientX, lastT: Date.now() }
    const x = Math.max(0, dx); setDragX(x); onSwipeProgress?.(x / W)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dt = Date.now() - gestureRef.current.lastT
    const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
    gestureRef.current = null
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) {
      if (selectedUserId) { setSelectedUserId(null); setDragX(0); onSwipeProgress?.(0) }
      else triggerClose()
    } else {
      setSnapping(true); setDragX(0); onSwipeProgress?.(0); setTimeout(() => setSnapping(false), 300)
    }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0); onSwipeProgress?.(0)
    setTimeout(() => setSnapping(false), 300)
  }

  const usersById = useMemo(() => new Map((users ?? []).map(u => [u.id, u])), [users])

  const filteredSortedUsers = useMemo(() => {
    if (!users) return []
    let list = users
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(u => (u.email ?? '').toLowerCase().includes(q) || (u.fullName ?? '').toLowerCase().includes(q))
    if (activeFilters.size > 0) list = list.filter(u => FILTER_DEFS.every(f => !activeFilters.has(f.key) || f.test(u)))
    return [...list].sort((a, b) => {
      const av = sortValue(a, sortKey), bv = sortValue(b, sortKey)
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortAsc ? cmp : -cmp
    })
  }, [users, search, activeFilters, sortKey, sortAsc])

  const toggleFilter = (key: FilterKey) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  if (!open) return null

  const selectedUser = users?.find(u => u.id === selectedUserId) ?? null

  const handleToggle = async (field: ToggleableFeatureField, nextValue: boolean) => {
    if (!selectedUserId) return
    setPendingField(field)
    setUsers(list => list?.map(u => u.id === selectedUserId ? { ...u, features: { ...u.features, [field]: nextValue } } : u) ?? list)
    try {
      await toggleAdminUserFeature(selectedUserId, field, nextValue)
    } catch (e) {
      setUsers(list => list?.map(u => u.id === selectedUserId ? { ...u, features: { ...u.features, [field]: !nextValue } } : u) ?? list)
      setDetailError(e instanceof Error ? e.message : 'toggle_failed')
    } finally {
      setPendingField(null)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      if (selectedUserId) {
        const [d, activity, listRes] = await Promise.all([
          fetchAdminUserDetail(selectedUserId), fetchAdminUserActivity(selectedUserId), fetchAdminUserList(),
        ])
        setDetail(d); setUserActivity(activity); setUsers(listRes.users); setSummary(listRes.summary); setDetailError(null); setLoadError(null)
      } else {
        const [listRes, auditRes] = await Promise.all([fetchAdminUserList(), fetchAdminAuditLog(undefined, 30)])
        setUsers(listRes.users); setSummary(listRes.summary); setGlobalActivity(auditRes); setLoadError(null)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'refresh_failed'
      if (selectedUserId) setDetailError(msg); else setLoadError(msg)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}
      style={{
        position: 'fixed', inset: 0, background: c.bg, zIndex: 200,
        overflowY: dragX > 0 ? 'hidden' : 'auto',
        overscrollBehavior: 'contain',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        willChange: 'transform',
        ...(closing
          ? { transform: 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
          : dragX > 0
          ? { transform: `translateX(${dragX}px)`, animation: 'none', boxShadow: '-8px 0 24px rgba(0,0,0,0.18)' }
          : snapping
          ? { transform: 'translateX(0)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
          : entryPlayed ? {}
          : { animation: 'slideInFromRight 0.32s cubic-bezier(0.32,0.72,0,1)' }),
      }}
    >
      <style>{`@keyframes adminRefreshSpin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
          <button
            onClick={() => selectedUserId ? setSelectedUserId(null) : triggerClose()}
            style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedUser ? (selectedUser.fullName || selectedUser.email || 'Account') : 'Admin'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 1 }}>
              <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedUser ? (selectedUser.email ?? '—') : `${users?.length ?? 0} account${users?.length === 1 ? '' : 's'}`}
              </span>
              {selectedUser && <CopyButton text={selectedUser.email ?? ''} c={c} />}
            </div>
          </div>
          <RefreshButton onClick={handleRefresh} spinning={refreshing} c={c} />
        </div>
      </div>

      {!selectedUser && (
        <div style={{ padding: '4px 20px 40px' }}>
          {loadError && (
            <div style={{ marginTop: 20, font: '600 13px Plus Jakarta Sans', color: c.bad }}>Couldn't load accounts: {loadError}</div>
          )}
          {!loadError && users === null && (
            <div style={{ marginTop: 20, font: '600 13px Plus Jakarta Sans', color: c.muted }}>Loading accounts…</div>
          )}

          {summary && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                <StatTile label="Total users" value={String(summary.totalUsers)} c={c} />
                <StatTile label="Active (30d)" value={String(summary.activeUsers30d)} c={c} />
                <StatTile label="Admins" value={String(summary.adminCount)} c={c} />
                <StatTile label="Total txns" value={String(summary.totalTransactions)} c={c} />
                <StatTile label="New today" value={String(summary.newUsersToday)} c={c} />
                <StatTile label="New this month" value={String(summary.newUsersThisMonth)} c={c} />
                <StatTile label="Onboarded" value={String(summary.onboardedCount)} c={c} />
                <StatTile label="Avg txns/user" value={String(summary.avgTransactionsPerUser)} c={c} />
              </div>

              <div style={{ marginTop: 22, font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Feature Adoption
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {FEATURE_ORDER.map(f => (
                  <AdoptionBar key={f} label={FEATURE_LABELS[f]} pct={summary.featureAdoption[f].pct} count={summary.featureAdoption[f].count} total={summary.totalUsers} c={c} />
                ))}
                <AdoptionBar label="Budget Strategy" pct={summary.budgetStrategyAdoption.pct} count={summary.budgetStrategyAdoption.count} total={summary.totalUsers} c={c} />
              </div>
              <div style={{ marginTop: 8, font: '600 11px Plus Jakarta Sans', color: c.sub }}>
                🤖 {summary.aiUsageToday.totalRequests} AI request{summary.aiUsageToday.totalRequests === 1 ? '' : 's'} · {summary.aiUsageToday.totalTokens.toLocaleString()} tokens today across all accounts
              </div>
            </>
          )}

          {users && users.length > 0 && (
            <>
              <div style={{ marginTop: 22, font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Accounts
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or email"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${c.faint}`, background: c.surface, color: c.ink, font: '600 13px Plus Jakarta Sans', outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {SORT_OPTIONS.map(opt => {
                    const active = sortKey === opt.key
                    return (
                      <button
                        key={opt.key}
                        onClick={() => { if (active) setSortAsc(v => !v); else { setSortKey(opt.key); setSortAsc(false) } }}
                        style={{ font: '600 11px Plus Jakarta Sans', padding: '6px 10px', borderRadius: 999, background: active ? c.accentSoft : c.surface2, color: active ? c.accent : c.muted, border: 'none', cursor: 'pointer' }}
                      >
                        {opt.label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {FILTER_DEFS.map(f => {
                    const active = activeFilters.has(f.key)
                    return (
                      <button
                        key={f.key}
                        onClick={() => toggleFilter(f.key)}
                        style={{ font: '600 11px Plus Jakarta Sans', padding: '6px 10px', borderRadius: 999, background: active ? c.accent : c.surface2, color: active ? '#fff' : c.muted, border: 'none', cursor: 'pointer' }}
                      >
                        {f.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {filteredSortedUsers.length === 0 && (
                <div style={{ marginTop: 16, font: '600 13px Plus Jakarta Sans', color: c.muted }}>No accounts match your search/filters.</div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {filteredSortedUsers.map(u => {
                  const onCount = FEATURE_ORDER.filter(f => u.features[f]).length
                  const health = healthDot(u, c)
                  return (
                    <div
                      key={u.id}
                      onClick={() => setSelectedUserId(u.id)}
                      style={{ textAlign: 'left', borderRadius: 16, padding: '12px 14px', background: c.surface, border: `1px solid ${c.faint}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <span title={health.label} style={{ width: 8, height: 8, borderRadius: 999, background: health.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.fullName || u.email || u.id}
                          </div>
                          {u.isAdmin && (
                            <span style={{ font: '700 9px Plus Jakarta Sans', color: c.accent, background: c.accentSoft, borderRadius: 999, padding: '2px 6px', flexShrink: 0 }}>ADMIN</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 1 }}>
                          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.email ?? '—'}
                          </div>
                          <CopyButton text={u.email ?? ''} c={c} />
                        </div>
                        <div style={{ font: '500 11px Plus Jakarta Sans', color: c.sub, marginTop: 4 }}>
                          Joined {formatDate(u.createdAt)} · {u.lastSignInAt ? timeAgo(u.lastSignInAt) : 'Never active'} · {onCount}/{FEATURE_ORDER.length} features on
                        </div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round"><path d="M9 6l6 6-6 6"/></svg>
                    </div>
                  )
                })}
              </div>
            </>
          )}
          {users && users.length === 0 && (
            <div style={{ marginTop: 20, font: '600 13px Plus Jakarta Sans', color: c.muted }}>No accounts found.</div>
          )}

          <div style={{ marginTop: 28, font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Recent Admin Activity
          </div>
          <div style={{ marginTop: 10, borderRadius: 16, padding: '0 14px', background: c.surface, border: `1px solid ${c.faint}` }}>
            {!loadError && globalActivity === null && <div style={{ padding: '10px 0', font: '600 12px Plus Jakarta Sans', color: c.muted }}>Loading…</div>}
            {globalActivity && globalActivity.length === 0 && <div style={{ padding: '10px 0', font: '600 12px Plus Jakarta Sans', color: c.muted }}>No admin activity yet.</div>}
            {globalActivity?.map(entry => (
              <AuditRow key={entry.id} entry={entry} usersById={usersById} c={c} showTarget />
            ))}
          </div>
        </div>
      )}

      {selectedUser && (
        <div style={{ padding: '4px 20px 40px' }}>
          <div style={{ marginTop: 16, font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Overview
          </div>
          <div style={{ marginTop: 10, borderRadius: 16, padding: '12px 14px', background: c.surface, border: `1px solid ${c.faint}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Row label="Joined" value={formatDate(selectedUser.createdAt)} c={c} />
            <Row label="Last active" value={formatDate(selectedUser.lastSignInAt)} c={c} />
            <Row label="Budget strategy" value={selectedUser.budgetStrategy} c={c} />
            <Row label="AI requests used today" value={String(selectedUser.aiUsed)} c={c} />
                  <Row label="AI tokens used today" value={selectedUser.aiTokens.toLocaleString()} c={c} />
            {detail && (
              <>
                <Row label="Transactions" value={String(detail.counts.transactions)} c={c} />
                <Row label="Categories" value={String(detail.counts.categories)} c={c} />
                <Row label="Accounts" value={String(detail.counts.accounts)} c={c} />
                <Row label="Credit cards" value={String(detail.counts.creditCards)} c={c} />
              </>
            )}
          </div>

          {detailError && (
            <div style={{ marginTop: 12, font: '600 13px Plus Jakarta Sans', color: c.bad }}>{detailError}</div>
          )}

          <div style={{ marginTop: 22, font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Features
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FEATURE_ORDER.map(field => (
              <div
                key={field}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  borderRadius: 14, padding: '10px 14px', background: c.surface, border: `1px solid ${c.faint}`,
                }}
              >
                <span style={{ font: '600 13px Plus Jakarta Sans', color: c.ink }}>{FEATURE_LABELS[field]}</span>
                <Toggle
                  checked={selectedUser.features[field]}
                  disabled={pendingField === field}
                  onChange={() => handleToggle(field, !selectedUser.features[field])}
                  c={c}
                />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 22, font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Recent Activity
          </div>
          <div style={{ marginTop: 10, borderRadius: 16, padding: '0 14px', background: c.surface, border: `1px solid ${c.faint}` }}>
            {userActivity === null && !detailError && <div style={{ padding: '10px 0', font: '600 12px Plus Jakarta Sans', color: c.muted }}>Loading…</div>}
            {userActivity && userActivity.length === 0 && <div style={{ padding: '10px 0', font: '600 12px Plus Jakarta Sans', color: c.muted }}>No activity recorded yet.</div>}
            {userActivity?.map((entry, i) => (
              <ActivityRow key={i} entry={entry} c={c} />
            ))}
          </div>
        </div>
      )}

      <div style={{ height: 'calc(40px + env(safe-area-inset-bottom, 0px))' }} />
    </div>
  )
}
