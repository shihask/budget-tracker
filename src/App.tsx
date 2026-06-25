import React, { useState, useMemo, useEffect } from 'react'

const APP_VERSION = '1.41.0'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ThemeContext } from '@/lib/theme-context'
import { makeColors } from '@/lib/tokens'
import { useSupabaseData } from '@/hooks/useSupabaseData'
import { derive } from '@/lib/data'
import { fmt, iso, TODAY } from '@/lib/utils'
import type { Layout, DashboardSectionId } from '@/types'
import { DEFAULT_DASHBOARD_SECTIONS } from '@/types'

import { Header } from '@/components/Header'
import { HeroWeekly } from '@/components/HeroWeekly'
import { SectionTitle } from '@/components/SectionTitle'
import { MetricCards } from '@/components/MetricCards'
import { Analytics } from '@/components/Analytics'
import { AccountsSection } from '@/components/AccountsSection'
import { CommitmentsSection } from '@/components/CommitmentsSection'
import { CommitmentsPage } from '@/components/CommitmentsPage'
import { BorrowingSection } from '@/components/BorrowingSection'
import { BorrowingPage } from '@/components/BorrowingPage'
import { SavingsSection } from '@/components/SavingsSection'
import { SavingsPage } from '@/components/SavingsPage'
import { CustomGroupSection, RecentTxns } from '@/components/Sections'
import { FAB, QuickAddSheet } from '@/components/QuickAdd'
import { SettingsPanel } from '@/components/SettingsPanel'
import { TransactionsPage } from '@/components/TransactionsPage'
import { Glyph } from '@/components/Glyph'
import { PWAPrompt } from '@/components/PWAPrompt'
import { AuthPage, ResetPasswordPage } from '@/components/AuthPage'
import { CategoriesPage } from '@/components/CategoriesPage'
import { CreditCardsSection } from '@/components/CreditCardsSection'
import { AffordabilityChecker } from '@/components/AffordabilityChecker'
import { GoalsSection } from '@/components/GoalsSection'
import { RemindersBar, buildReminders } from '@/components/RemindersBar'
import { SavingsSuggestions } from '@/components/SavingsSuggestions'
import { BottomSheet } from '@/components/BottomSheet'
import { DashboardLayoutPage } from '@/components/DashboardLayoutPage'
import { AIAssistFAB } from '@/components/AIAssistFAB'
import { AIChatSheet } from '@/components/AIChatSheet'
import { AnalyticsPage } from '@/components/AnalyticsPage'
import { CashFlowForecastCard } from '@/components/CashFlowForecastCard'
import { CashFlowForecastPage } from '@/components/CashFlowForecastPage'
import { CashFlowForecastSetup } from '@/components/CashFlowForecastSetup'
import { OnboardingFlow } from '@/components/OnboardingFlow'
import { UpdateToast } from '@/components/UpdateToast'
import { InsightCard } from '@/components/InsightCard'
import { WealthSummaryCard } from '@/components/WealthSummaryCard'
import { DailyChallengeCard } from '@/components/DailyChallengeCard'
import { PlantPage } from '@/components/PlantPage'
import { BudgetStrategyCard } from '@/components/BudgetStrategyCard'
import { CategoryBucketMapper } from '@/components/CategoryBucketMapper'
import { BudgetStrategySheet } from '@/components/BudgetStrategySheet'
import { DailyReflectionSheet } from '@/components/DailyReflectionSheet'
import { computeChallenge } from '@/lib/challenge'
import { ProjectsDashboardCard } from '@/features/shared-projects/components/ProjectsDashboardCard'
import { ProjectsListPage } from '@/features/shared-projects/components/ProjectsListPage'
import { PublicProjectPage } from '@/features/shared-projects/components/PublicProjectPage'
import { useProjectsSummary } from '@/features/shared-projects/hooks/useProjectsSummary'
import { NotificationsSheet } from '@/features/shared-projects/components/NotificationsSheet'

// ── Root: only handles auth state ────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // Check URL hash immediately — Supabase puts #type=recovery on reset links
  const [isResetting, setIsResetting] = useState(() => {
    const hash = window.location.hash
    return hash.includes('type=recovery') || hash.includes('type=signup')
      ? hash.includes('type=recovery')
      : false
  })

  useEffect(() => {
    // If recovery token in URL, don't call getSession yet — wait for onAuthStateChange
    const hash = window.location.hash
    const hasRecoveryToken = hash.includes('type=recovery')

    if (!hasRecoveryToken) {
      supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsResetting(true)
        setSession(s)
        window.history.replaceState(null, '', window.location.pathname)
      } else {
        if (!isResetting) setSession(s)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined && !isResetting) return (
    <div style={{ minHeight: '100svh', background: '#EDE7DD', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: 999, border: '3px solid #10B981', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  // Public project view — works for both logged-in and anonymous visitors
  const path = window.location.pathname
  if (path.startsWith('/project/')) {
    const code = path.replace('/project/', '').replace(/\/$/, '')
    if (code) return (
      <ThemeContext.Provider value={makeColors('#10B981', false)}>
        <PublicProjectPage shareCode={code} />
      </ThemeContext.Provider>
    )
  }

  if (isResetting) return <ResetPasswordPage onDone={async () => {
    setIsResetting(false)
    const { data: { session } } = await supabase.auth.getSession()
    setSession(session)
  }} />

  if (!session) return <AuthPage />

  return <AppContent session={session} />
}

// ── AppContent: all hooks live here, no early returns before them ─────────────
function AppContent({ session }: { session: Session }) {
  const user = session.user
  const userName  = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
  const userEmail = user.email || ''

  const [accent, setAccent] = useState('#10B981')
  const [dark, setDark] = useState(false)
  const [layout, setLayout] = useState<Layout>('grid')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [aiProcessing, setAiProcessing] = useState(false)
  const [showOnboardingFlow, setShowOnboardingFlow] = useState(() => {
    try { return localStorage.getItem('mp_onboarded_' + user.id) === null } catch (_) { return false }
  })
  const [showDashboardWelcome, setShowDashboardWelcome] = useState(false)
  const [txnsOpen, setTxnsOpen] = useState(false)
  const [commitmentsOpen, setCommitmentsOpen] = useState(false)
  const [commitmentsAddOnOpen, setCommitmentsAddOnOpen] = useState(false)
  const [borrowingOpen, setBorrowingOpen] = useState(false)
  const [borrowingAddOnOpen, setBorrowingAddOnOpen] = useState(false)
  const [savingsOpen, setSavingsOpen] = useState(false)
  const [savingsAddOnOpen, setSavingsAddOnOpen] = useState(false)
  const [catsOpen, setCatsOpen] = useState(false)
  const [budgetEditOpen, setBudgetEditOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [metricsInfoOpen, setMetricsInfoOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [cashflowOpen, setCashflowOpen] = useState(false)
  const [cashflowSetupOpen, setCashflowSetupOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [projectsAddOnOpen, setProjectsAddOnOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [seenSharedIds, setSeenSharedIds] = useState<Set<string>>(() => {
    try { const ids = JSON.parse(localStorage.getItem('mp_seen_shared_' + session.user.id) || '[]'); return new Set(ids) } catch { return new Set() }
  })
  const [emergencyEditOpen, setEmergencyEditOpen] = useState(false)
  const [emergencyInput, setEmergencyInput] = useState('')
  const [savingEmergency, setSavingEmergency] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [excludePromptTxnId, setExcludePromptTxnId] = useState<string | null>(null)
  const [plantSheetOpen, setPlantSheetOpen] = useState(false)
  const [reflectionOpen, setReflectionOpen] = useState(false)
  const [dashEditTx, setDashEditTx] = useState<import('@/types').Transaction | null>(null)
  const [swipePct, setSwipePct] = useState(0)
  const [strategyMapperOpen, setStrategyMapperOpen] = useState(false)
  const [budgetStrategySheetOpen, setBudgetStrategySheetOpen] = useState(false)

  const { state, loading, usingSupabase, allTransactionsLoaded, loadingMore, loadMoreTransactions, addTransaction, deleteTransaction, updateTransaction, updateSettings, updateForecastSettings, updateBudgetStrategySettings, addAccount, deleteAccount, updateAccount, adjustBalance, addGroup, updateGroup, deleteGroup, toggleGroupVisibility, addCategory, updateCategory, deleteCategory, toggleCategoryVisibility, updateCategoryBucket, addCreditCard, updateCreditCard, deleteCreditCard, payCreditCardBill, adjustCreditCardBalance, addBorrowing, updateBorrowing, deleteBorrowing, recordBorrowingPayment, reversePayment, addCommitment, updateCommitment, deleteCommitment, markCommitmentPaid, addGoal, updateGoal, deleteGoal, addGoalSavings, addSavings, updateSavings, deleteSavings, recordContribution, updateSavingsValue, recordSavingsPayout, revertSavingsPayout, addPlannedExpense, updatePlannedExpense, deletePlannedExpense, updateChallengeResult, excludeChallengeTransaction, toggleChallengeExclusion } = useSupabaseData(session.user.id)

  const projectsSummary = useProjectsSummary(session.user.id)
  const unseenSharedCount = projectsSummary.sharedProjects.filter(p => !seenSharedIds.has(p.id)).length
  const markNotificationsRead = () => {
    const allIds = projectsSummary.sharedProjects.map(p => p.id)
    const next = new Set([...seenSharedIds, ...allIds])
    setSeenSharedIds(next)
    try { localStorage.setItem('mp_seen_shared_' + session.user.id, JSON.stringify([...next])) } catch {}
  }

  const [prefillGoal, setPrefillGoal] = useState<{ name: string; goal_amount: number; current_saved: number; monthly_target: number; target_date: string } | null>(null)
  const [challengeWin, setChallengeWin] = useState<{ amount: number } | null>(null)
  const [challengeWinInput, setChallengeWinInput] = useState('')

  useEffect(() => {
    if (!loading && state.accounts.length > 0) {
      setShowOnboardingFlow(false)
      try { localStorage.setItem('mp_onboarded_' + session.user.id, '1') } catch (_) {}
    }
  }, [loading, state.accounts.length])
  const c = useMemo(() => makeColors(accent, dark), [accent, dark])
  const d = useMemo(() => derive(state), [state])

  // Merge saved sections with defaults so newly added sections always appear
  const dashboardSections = useMemo(() => {
    const saved = state.settings.dashboard_sections
    if (!saved) return DEFAULT_DASHBOARD_SECTIONS
    const savedIds = new Set(saved.map(s => s.id))
    const missing = DEFAULT_DASHBOARD_SECTIONS.filter(s => !savedIds.has(s.id))
    if (missing.length === 0) return saved
    // Insert each new section at its intended position (after its preceding
    // default section that the user already has) instead of dumping at the end.
    const merged = [...saved]
    for (const def of missing) {
      const defIdx = DEFAULT_DASHBOARD_SECTIONS.findIndex(s => s.id === def.id)
      let insertAt = merged.length
      for (let i = defIdx - 1; i >= 0; i--) {
        const idx = merged.findIndex(m => m.id === DEFAULT_DASHBOARD_SECTIONS[i].id)
        if (idx >= 0) { insertAt = idx + 1; break }
      }
      merged.splice(insertAt, 0, def)
    }
    return merged
  }, [state.settings.dashboard_sections])

  const safeDailyLimit = useMemo(() => {
    if (!(state.settings.challenge_enabled)) return 0
    return computeChallenge(state, state.settings.challenge_difficulty ?? 'medium').safeDailyLimit
  }, [state.accounts, state.commitments, state.settings]) // eslint-disable-line react-hooks/exhaustive-deps

  const todayStr = iso(TODAY)
  const yesterdayStr = iso(new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 1))
  const showReflectionBanner = !loading &&
    state.settings.last_reflection_date !== todayStr &&
    state.transactions.some(t => t.transaction_date === yesterdayStr && t.transaction_type === 'expense')

  const alertReminders = buildReminders(state)
  const notificationCount = projectsSummary.pendingInvites.length + unseenSharedCount
    + alertReminders.length
    + (d.weeklyPct >= 90 ? 1 : 0)
    + (showReflectionBanner ? 1 : 0)

  const handleSave = async (form: Parameters<typeof addTransaction>[0]) => {
    const prevPct = d.weeklyPct
    const newTx = await addTransaction(form)
    setFlash(form.description)
    setTimeout(() => setFlash(null), 2200)

    // Challenge: flag large expenses for optional exclusion
    if (
      newTx &&
      form.transaction_type === 'expense' &&
      (state.settings.challenge_enabled ?? false) &&
      safeDailyLimit > 0 &&
      form.amount > safeDailyLimit * 2
    ) {
      setExcludePromptTxnId(newTx.id)
      setTimeout(() => setExcludePromptTxnId(null), 5000)
    }

    // Budget alert: fire when crossing the 90% threshold
    const isTrackedExpense = form.transaction_type === 'expense' || form.transaction_type === 'commitment'
    if (
      isTrackedExpense &&
      state.settings.notifications_enabled &&
      state.settings.notify_budget_alert !== false
    ) {
      const newSpent = d.weeklySpent + form.amount
      const newPct = d.weeklyBudget > 0 ? (newSpent / d.weeklyBudget) * 100 : 0
      if (prevPct < 90 && newPct >= 90) {
        supabase.functions.invoke('push-budget-alert').catch(() => {})
      }
    }
  }

  const panelW = typeof window !== 'undefined' ? Math.min(280, window.innerWidth) : 280
  const [windowW, setWindowW] = useState(typeof window !== 'undefined' ? window.innerWidth : 402)
  useEffect(() => {
    const handler = () => setWindowW(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  const W = windowW >= 768 ? Math.min(windowW * 0.6, 720) : 402

  return (
    <ThemeContext.Provider value={c}>
      <PWAPrompt />
      <UpdateToast />
      <div style={{
        minHeight: '100svh', width: '100%',
        background: dark ? '#0C0A07' : '#EDE7DD',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}>
        <div style={{ width: '100%', maxWidth: W, position: 'relative' }}>
          {/* Fixed Header — hidden when transactions page is open */}
          <div style={{
            position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: W, zIndex: 350,
            background: dark ? 'rgba(12,10,7,0.85)' : 'rgba(237,231,221,0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            padding: `env(safe-area-inset-top, 0px) 16px 0`,
            borderBottom: `1px solid ${c.faint}`,
            display: (txnsOpen || borrowingOpen || analyticsOpen || plantSheetOpen || savingsOpen || commitmentsOpen || cashflowOpen || projectsOpen) ? 'none' : 'block',
          }}>
            <Header dark={dark} onToggleTheme={() => setDark(v => !v)} userName={userName} userEmail={userEmail} synced={usingSupabase} onSignOut={() => supabase.auth.signOut()} onSettings={() => setSettingsOpen(v => !v)} onCategories={() => setCatsOpen(true)} notificationCount={notificationCount} onNotifications={() => { markNotificationsRead(); setNotificationsOpen(true) }} />
          </div>

          <div style={{
            background: c.bg, minHeight: '100svh',
            padding: `4px 16px calc(88px + env(safe-area-inset-bottom, 0px))`,
          }}>
            {/* Spacer to offset fixed header height */}
            <div style={{ height: 'calc(72px + env(safe-area-inset-top, 0px))' }} />

            {loading && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${c.accent}, ${c.heroB})`, zIndex: 999 }} />
            )}


            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {showReflectionBanner && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: c.surface,
                  border: `1px solid #16C98A33`,
                  borderLeft: '3px solid #16C98A',
                  borderRadius: 14, padding: '11px 14px',
                  cursor: 'pointer',
                }}
                  onClick={() => { setReflectionOpen(true); updateSettings({ last_reflection_date: todayStr }) }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: '#16C98A18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16C98A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Yesterday's Reflection</div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>See how yesterday went and grow today</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <button
                    onClick={e => { e.stopPropagation(); updateSettings({ last_reflection_date: todayStr }) }}
                    style={{ width: 26, height: 26, borderRadius: 999, background: c.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                    aria-label="Dismiss"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              )}
              <InsightCard state={state} d={d} />
              {dashboardSections
                .filter(s => s.visible)
                .map(s => {
                  let el: React.ReactNode = null
                  if (s.id.startsWith('custom__')) {
                    el = <CustomGroupSection section={s} state={state} />
                    return el ? <React.Fragment key={s.id}>{el}</React.Fragment> : null
                  }
                  switch (s.id as DashboardSectionId) {
                    case 'hero':
                      el = <><HeroWeekly d={d} settings={state.settings} categories={state.categories} groups={state.groups} transactions={state.transactions} onUpdateSettings={updateSettings} editOpen={budgetEditOpen} onEditClose={() => setBudgetEditOpen(false)} onEditOpen={() => setBudgetEditOpen(true)} /><RemindersBar state={state} onMarkPaid={(cm, recordExpense, accountId) => markCommitmentPaid(cm, recordExpense, accountId)} /><WealthSummaryCard state={state} onGoToSavings={() => { setSavingsAddOnOpen(false); setSavingsOpen(true) }} onGoToBorrowing={() => { setBorrowingAddOnOpen(false); setBorrowingOpen(true) }} />{state.budget_strategy_settings.budget_strategy !== 'none' && <BudgetStrategyCard state={state} d={d} onOpenSettings={() => setBudgetStrategySheetOpen(true)} />}</>
                      break
                    case 'affordability':
                      el = <><AffordabilityChecker state={state} d={d} settings={state.settings} transactions={state.transactions} onUpdateSettings={updateSettings} onSaveGoal={data => setPrefillGoal(data)} onAddPlannedExpense={addPlannedExpense} /><SavingsSuggestions state={state} d={d} autopilotEnabled={state.settings.autopilot_enabled ?? false} /></>
                      break
                    case 'daily_challenge':
                      el = <DailyChallengeCard state={state} d={d} onUpdateSettings={updateSettings} updateChallengeResult={updateChallengeResult} onOpenSalaryDateEdit={() => setBudgetEditOpen(true)} onOpenPlant={() => setPlantSheetOpen(true)} onSuccessDay={(amount) => { setChallengeWin({ amount }); setChallengeWinInput(String(Math.round(amount))) }} />
                      break
                    case 'metrics':
                      el = <div>
                        <SectionTitle action="Customize" onAction={() => setLayoutOpen(true)} onInfo={() => setMetricsInfoOpen(true)}>Your money</SectionTitle>
                        <MetricCards d={d} layout={layout} onEditBudget={() => setBudgetEditOpen(true)} onEditEmergencyFund={() => { setEmergencyInput(String(state.settings.emergency_fund)); setEmergencyEditOpen(true) }} commitmentItems={state.commitments.filter(c => c.is_active !== false && c.remaining > 0).map(c => ({ name: c.name, remaining: c.remaining }))} accountItems={state.accounts.filter(a => a.is_active).map(a => ({ name: a.name, balance: a.current_balance }))} infoOpen={metricsInfoOpen} onInfoClose={() => setMetricsInfoOpen(false)} />
                      </div>
                      break
                    case 'analytics':
                      el = <Analytics state={state} onSeeAll={() => setAnalyticsOpen(true)} />
                      break
                    case 'cashflow':
                      el = <CashFlowForecastCard state={state} d={d} onOpen={() => setCashflowOpen(true)} onSetup={() => setCashflowSetupOpen(true)} />
                      break
                    case 'accounts':
                      el = <AccountsSection state={state} onUpdateAccount={updateAccount} onAddAccount={addAccount} onDeleteAccount={deleteAccount} onAdjustBalance={adjustBalance} onAddTransaction={() => setSheetOpen(true)} />
                      break
                    case 'commitments':
                      el = <CommitmentsSection state={state} onSeeAll={() => { setCommitmentsAddOnOpen(false); setCommitmentsOpen(true) }} onAdd={() => { setCommitmentsAddOnOpen(true); setCommitmentsOpen(true) }} />
                      break
                    case 'savings':
                      el = (state.settings.track_savings ?? false) ? <SavingsSection state={state} onSeeAll={() => { setSavingsAddOnOpen(false); setSavingsOpen(true) }} onAdd={() => { setSavingsAddOnOpen(true); setSavingsOpen(true) }} /> : null
                      break
                    case 'borrowing':
                      el = (state.settings.track_borrowings ?? true) ? <BorrowingSection state={state} onSeeAll={() => { setBorrowingAddOnOpen(false); setBorrowingOpen(true) }} onAdd={() => { setBorrowingAddOnOpen(true); setBorrowingOpen(true) }} /> : null
                      break
                    case 'credit_cards':
                      el = (state.settings.track_credit_cards ?? false) ? <CreditCardsSection state={state} onAdd={addCreditCard} onUpdate={updateCreditCard} onDelete={deleteCreditCard} onPayBill={payCreditCardBill} onAdjustBalance={adjustCreditCardBalance} /> : null
                      break
                    case 'projects':
                      el = (state.settings.track_projects ?? false) ? <ProjectsDashboardCard projects={projectsSummary.activeProjects} sharedProjects={projectsSummary.sharedProjects} onSeeAll={() => { setProjectsAddOnOpen(false); setProjectsOpen(true) }} onAdd={() => { setProjectsAddOnOpen(true); setProjectsOpen(true) }} /> : null
                      break
                    case 'goals':
                      el = <GoalsSection
                        goals={state.goals}
                        contributions={state.goal_contributions}
                        d={d}
                        transactions={state.transactions}
                        settings={state.settings}
                        autopilotEnabled={state.settings.autopilot_enabled ?? false}
                        onAddGoal={addGoal}
                        onUpdateGoal={updateGoal}
                        onDeleteGoal={deleteGoal}
                        onAddSavings={addGoalSavings}
                        onUpdateSettings={updateSettings}
                        prefillGoal={prefillGoal}
                        onPrefillConsumed={() => setPrefillGoal(null)}
                      />
                      break
                    case 'recent_txns':
                      el = <RecentTxns state={state} onSeeAll={() => setTxnsOpen(true)} onEdit={t => { setDashEditTx(t); setTxnsOpen(true) }} onDelete={deleteTransaction} />
                      break
                  }
                  return el ? <React.Fragment key={s.id}>{el}</React.Fragment> : null
                })
              }
              <div style={{ textAlign: 'center', font: '600 11px Plus Jakarta Sans', color: c.muted, paddingTop: 4 }}>
                <span style={{ color: c.ink }}>Money</span><span style={{ color: '#16C98A' }}>Plant</span>{' · v'}{APP_VERSION}{' · '}{usingSupabase ? 'synced with Supabase' : 'local session data'}
              </div>
            </div>
          </div>

          {/* FAB */}
          {!chatOpen && (
            <div style={{ position: 'fixed', bottom: 0, width: '100%', maxWidth: W, pointerEvents: 'none', zIndex: 50 }}>
              <div style={{ position: 'relative', height: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}>
                <div style={{ pointerEvents: 'auto' }}>
                  <FAB onClick={() => setSheetOpen(true)} />
                </div>
              </div>
            </div>
          )}

          {/* Toast */}
          <div style={{
            position: 'fixed',
            bottom: `calc(${flash ? 100 : 70}px + env(safe-area-inset-bottom, 0px))`,
            left: '50%', transform: 'translateX(-50%)',
            width: `calc(min(100%, ${W}px) - 32px)`,
            opacity: flash ? 1 : 0,
            transition: 'all 0.35s cubic-bezier(0.32,0.72,0,1)',
            pointerEvents: 'none', zIndex: 80,
          }}>
            {flash && (
              <div style={{ background: c.ink, color: c.bg, borderRadius: 14, padding: '12px 16px', font: '700 13px Plus Jakarta Sans', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, background: c.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Glyph name="check" color="#fff" size={13} />
                </span>
                Added "{flash}"
              </div>
            )}
          </div>

          {/* Challenge Exclusion Toast */}
          <div style={{
            position: 'fixed',
            bottom: `calc(${excludePromptTxnId ? 112 : 80}px + env(safe-area-inset-bottom, 0px))`,
            left: '50%', transform: 'translateX(-50%)',
            width: `calc(min(100%, ${W}px) - 32px)`,
            opacity: excludePromptTxnId ? 1 : 0,
            transition: 'all 0.35s cubic-bezier(0.32,0.72,0,1)',
            pointerEvents: excludePromptTxnId ? 'auto' : 'none', zIndex: 85,
          }}>
            {excludePromptTxnId && (
              <div style={{ background: c.ink, color: c.bg, borderRadius: 14, padding: '12px 16px', font: '600 13px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
                <span>Large expense — exclude from today's challenge?</span>
                <button
                  onClick={() => { excludeChallengeTransaction(excludePromptTxnId); setExcludePromptTxnId(null) }}
                  style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '5px 12px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer', flexShrink: 0 }}
                >
                  Exclude
                </button>
              </div>
            )}
          </div>

          {/* Quick Add Sheet */}
          <div style={{ position: 'fixed', inset: 0, maxWidth: W, margin: '0 auto', pointerEvents: sheetOpen ? 'auto' : 'none', zIndex: 150 }}>
            <QuickAddSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSave={handleSave} state={state} onAddCategory={addCategory} autopilotEnabled={state.settings.autopilot_enabled ?? false} trackBorrowings={state.settings.track_borrowings ?? true} onUpdateSettings={updateSettings} onBusyChange={setAiProcessing} />
          </div>

          {/* AI Assist FAB + Chat */}
          {(state.settings.autopilot_enabled ?? false) && (<>
            {!sheetOpen && !chatOpen && <AIAssistFAB onOpen={() => setChatOpen(true)} containerWidth={W} busy={aiProcessing} />}
            <AIChatSheet open={chatOpen} onClose={() => setChatOpen(false)} state={state} d={d} onSave={handleSave} onUpdate={updateTransaction} onDelete={deleteTransaction} onUpdateSettings={updateSettings} onBusyChange={setAiProcessing} />
          </>)}

          {showOnboardingFlow && (
            <OnboardingFlow
              onAddAccount={addAccount}
              onUpdateSettings={updateSettings}
              onComplete={() => {
                setShowOnboardingFlow(false)
                setShowDashboardWelcome(true)
              }}
              userId={session.user.id}
            />
          )}

          {showDashboardWelcome && (
            <div style={{
              position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
              width: '100%', maxWidth: W, zIndex: 400,
              padding: '0 16px calc(16px + env(safe-area-inset-bottom, 0px))',
              animation: 'slideUp 0.4s cubic-bezier(0.32,0.72,0,1) both',
            }}>
              <div style={{
                background: '#1C1410',
                borderRadius: 18,
                padding: '18px 20px',
                display: 'flex', alignItems: 'flex-start', gap: 14,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: '#EDE7DD', marginBottom: 4 }}>
                    You're all set
                  </div>
                  <div style={{ font: '400 12.5px Plus Jakarta Sans', color: '#8A8178', lineHeight: 1.55 }}>
                    Add expenses as you spend. Ask Mint for insights anytime.
                  </div>
                </div>
                <button
                  onClick={() => setShowDashboardWelcome(false)}
                  style={{
                    background: 'none', border: 'none', color: '#8A8178',
                    font: '600 18px Plus Jakarta Sans', cursor: 'pointer',
                    padding: '0 2px', lineHeight: 1, marginTop: -2,
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Dim overlay: sits between main content and overlay pages, fades with swipe progress */}
          <div style={{
            position: 'fixed', inset: 0, zIndex: 99,
            background: `rgba(0,0,0,${(txnsOpen || borrowingOpen || plantSheetOpen || commitmentsOpen || cashflowOpen || projectsOpen) ? 0.4 * (1 - swipePct) : 0})`,
            pointerEvents: (txnsOpen || borrowingOpen || plantSheetOpen || commitmentsOpen || cashflowOpen || projectsOpen) ? 'auto' : 'none',
            transition: (swipePct > 0 && swipePct < 1) ? 'none' : 'background 0.28s cubic-bezier(0.32,0.72,0,1)',
          }} />

          {txnsOpen && (
            <TransactionsPage state={state} onDelete={deleteTransaction} onUpdate={updateTransaction} onClose={() => { setTxnsOpen(false); setDashEditTx(null) }} dark={dark} onToggleTheme={() => setDark(v => !v)} userName={userName} userEmail={userEmail} synced={usingSupabase} onSignOut={() => supabase.auth.signOut()} onSettings={() => setSettingsOpen(true)} onCategories={() => setCatsOpen(true)} onAddCategory={addCategory} onReversePayment={reversePayment} onDeleteSavings={deleteSavings} initialEditTx={dashEditTx} onSwipeProgress={setSwipePct} onAdd={() => setSheetOpen(true)} onToggleChallengeExclusion={toggleChallengeExclusion} allTransactionsLoaded={allTransactionsLoaded} loadingMore={loadingMore} onLoadMore={loadMoreTransactions} />
          )}

          {commitmentsOpen && (
            <CommitmentsPage state={state} d={d} onMarkPaid={(cm, recordExpense, accountId) => markCommitmentPaid(cm, recordExpense, accountId)} onAdd={addCommitment} onUpdate={updateCommitment} onDelete={deleteCommitment} onAddCategory={addCategory} onClose={() => { setCommitmentsOpen(false); setCommitmentsAddOnOpen(false) }} initialAddOpen={commitmentsAddOnOpen} />
          )}

          {borrowingOpen && (
            <BorrowingPage state={state} onAdd={addBorrowing} onUpdate={updateBorrowing} onDelete={deleteBorrowing} onPayment={recordBorrowingPayment} onAddCategory={addCategory} onClose={() => setBorrowingOpen(false)} initialAddOpen={borrowingAddOnOpen} dark={dark} onToggleTheme={() => setDark(v => !v)} userName={userName} userEmail={userEmail} synced={usingSupabase} onSignOut={() => supabase.auth.signOut()} onSwipeProgress={setSwipePct} />
          )}

          {projectsOpen && (
            <ProjectsListPage
              userId={session.user.id}
              userName={userName}
              onClose={() => { setProjectsOpen(false); setProjectsAddOnOpen(false) }}
              onSwipeProgress={setSwipePct}
              initialAddOpen={projectsAddOnOpen}
            />
          )}

          {savingsOpen && (
            <SavingsPage
              state={state}
              onClose={() => { setSavingsOpen(false); setSavingsAddOnOpen(false) }}
              onAdd={addSavings}
              onUpdate={updateSavings}
              onDelete={deleteSavings}
              onRecordContribution={recordContribution}
              onUpdateValue={updateSavingsValue}
              onRecordPayout={recordSavingsPayout}
              onRevertPayout={revertSavingsPayout}
              onAddCategory={addCategory}
              startAdd={savingsAddOnOpen}
            />
          )}

          {catsOpen && (
            <CategoriesPage
              state={state}
              onClose={() => setCatsOpen(false)}
              onAddGroup={addGroup}
              onUpdateGroup={updateGroup}
              onDeleteGroup={deleteGroup}
              onToggleGroupVisibility={toggleGroupVisibility}
              onAddCategory={addCategory}
              onUpdateCategory={updateCategory}
              onDeleteCategory={deleteCategory}
              onToggleCategoryVisibility={toggleCategoryVisibility}
            />
          )}

          {analyticsOpen && (
            <AnalyticsPage state={state} d={d} onClose={() => setAnalyticsOpen(false)} onUpdateSettings={updateSettings} />
          )}

          {cashflowOpen && (
            <CashFlowForecastPage state={state} d={d} onClose={() => setCashflowOpen(false)} onSetup={() => setCashflowSetupOpen(true)} onSwipeProgress={setSwipePct} onAddPlannedExpense={addPlannedExpense} onUpdatePlannedExpense={updatePlannedExpense} onDeletePlannedExpense={deletePlannedExpense} onAddCategory={addCategory} onUpdateForecastSettings={updateForecastSettings} />
          )}

          {cashflowSetupOpen && <CashFlowForecastSetup open onClose={() => setCashflowSetupOpen(false)} state={state} onUpdateSettings={updateSettings} onUpdateForecastSettings={updateForecastSettings} />}

          <DailyReflectionSheet
            open={reflectionOpen}
            onClose={() => setReflectionOpen(false)}
            state={state}
            d={d}
            onGoalContribution={async (goalId, amount) => { await addGoalSavings(goalId, amount, 'daily_challenge') }}
          />

          {layoutOpen && (
            <DashboardLayoutPage
              sections={dashboardSections}
              settings={state.settings}
              categories={state.categories}
              onUpdate={async (sections) => { await updateSettings({ dashboard_sections: sections }) }}
              onClose={() => setLayoutOpen(false)}
            />
          )}
        </div>

        <NotificationsSheet
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          pendingInvites={projectsSummary.pendingInvites}
          sharedProjects={projectsSummary.sharedProjects}
          onAccept={projectsSummary.acceptInvite}
          onDecline={projectsSummary.declineInvite}
          onViewProject={() => { setNotificationsOpen(false); setProjectsOpen(true) }}
          state={state}
          budgetPct={d.weeklyPct}
          budgetSpent={d.weeklySpent}
          budgetTotal={d.weeklyBudget}
          budgetPeriod={state.settings.budget_period ?? 'weekly'}
          showReflection={showReflectionBanner}
          onReflection={() => { setReflectionOpen(true); updateSettings({ last_reflection_date: todayStr }) }}
          onMarkPaid={(cm, recordExpense, accountId) => markCommitmentPaid(cm, recordExpense, accountId)}
        />

        {settingsOpen && (
          <>
            <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
            <SettingsPanel
              accent={accent} dark={dark} layout={layout}
              salaryDate={state.settings.salary_date}
              monthlySalary={state.settings.monthly_salary ?? null}
              trackCreditCards={state.settings.track_credit_cards ?? false}
              trackBorrowings={state.settings.track_borrowings ?? true}
              trackSavings={state.settings.track_savings ?? false}
              trackProjects={state.settings.track_projects ?? false}
              budgetStrategyEnabled={state.budget_strategy_settings.budget_strategy !== 'none'}
              challengeEnabled={state.settings.challenge_enabled ?? false}
              autopilotEnabled={state.settings.autopilot_enabled ?? false}
              aiRequestsUsed={state.settings.ai_requests_used ?? 0}
              aiRequestsResetAt={state.settings.ai_requests_reset_at ?? null}
              notificationsEnabled={state.settings.notifications_enabled ?? false}
              notifyDailyReminder={state.settings.notify_daily_reminder ?? true}
              notifyBudgetAlert={state.settings.notify_budget_alert ?? true}
              notifyCommitments={state.settings.notify_commitments ?? true}
              notifyWeeklySummary={state.settings.notify_weekly_summary ?? true}
              onAccent={setAccent} onDark={setDark} onLayout={setLayout}
              onSalaryDate={v => updateSettings({ salary_date: v })}
              onMonthlySalary={v => updateSettings({ monthly_salary: v })}
              onTrackCreditCards={v => updateSettings({ track_credit_cards: v })}
              onTrackBorrowings={v => updateSettings({ track_borrowings: v })}
              onTrackSavings={v => updateSettings({ track_savings: v })}
              onTrackProjects={v => updateSettings({ track_projects: v })}
              onBudgetStrategy={v => { updateBudgetStrategySettings({ budget_strategy: v ? 'balanced' : 'none' }); if (v) setBudgetStrategySheetOpen(true) }}
              onChallengeEnabled={v => updateSettings({ challenge_enabled: v })}
              onAutopilot={v => updateSettings({ autopilot_enabled: v })}
              onNotificationsEnabled={v => updateSettings({ notifications_enabled: v })}
              onNotifyDailyReminder={v => updateSettings({ notify_daily_reminder: v })}
              onNotifyBudgetAlert={v => updateSettings({ notify_budget_alert: v })}
              onNotifyCommitments={v => updateSettings({ notify_commitments: v })}
              onNotifyWeeklySummary={v => updateSettings({ notify_weekly_summary: v })}
              onDashboardLayout={() => { setSettingsOpen(false); setLayoutOpen(true) }}
            />
          </>
        )}

        <BudgetStrategySheet
          open={budgetStrategySheetOpen}
          onClose={() => setBudgetStrategySheetOpen(false)}
          budgetStrategy={state.budget_strategy_settings.budget_strategy}
          customNeedsPct={state.budget_strategy_settings.custom_needs_pct}
          customWantsPct={state.budget_strategy_settings.custom_wants_pct}
          customSavingsPct={state.budget_strategy_settings.custom_savings_pct}
          budgetStrategyBase={state.budget_strategy_settings.budget_strategy_base}
          onBudgetStrategyBase={v => updateBudgetStrategySettings({ budget_strategy_base: v })}
          onBudgetStrategy={async (strategy, customPcts) => {
            const patch: Partial<typeof state.budget_strategy_settings> = { budget_strategy: strategy }
            if (customPcts) {
              patch.custom_needs_pct = customPcts.needs
              patch.custom_wants_pct = customPcts.wants
              patch.custom_savings_pct = customPcts.savings
            }
            await updateBudgetStrategySettings(patch)
          }}
          onMapCategories={() => { setBudgetStrategySheetOpen(false); setStrategyMapperOpen(true) }}
        />

        <CategoryBucketMapper
          open={strategyMapperOpen}
          onClose={() => setStrategyMapperOpen(false)}
          categories={state.categories}
          groups={state.groups}
          onUpdateBucket={updateCategoryBucket}
        />

        {plantSheetOpen && <PlantPage open={plantSheetOpen} onClose={() => setPlantSheetOpen(false)} state={state} dark={dark} onToggleTheme={() => setDark(v => !v)} userName={userName} userEmail={userEmail} synced={usingSupabase} onSignOut={() => supabase.auth.signOut()} onSwipeProgress={setSwipePct} />}

        {/* Daily Challenge → Goal Contribution modal */}
        <BottomSheet open={!!challengeWin} onClose={() => setChallengeWin(null)} zIndex={500}>
          {challengeWin && (() => {
            const activeGoals = state.goals.filter(g => g.is_active && g.current_saved < g.goal_amount)
            const inputAmt = parseFloat(challengeWinInput)
            const validAmt = !isNaN(inputAmt) && inputAmt > 0 ? Math.round(inputAmt) : Math.round(challengeWin.amount)
            return (
              <>
                <div style={{ textAlign: 'center', marginBottom: 18 }}>
                  <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginBottom: 6 }}>
                    Great job today!
                  </div>
                  <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
                    You stayed{' '}
                    <span style={{ color: c.good, fontWeight: 700 }}>{fmt(Math.round(challengeWin.amount))}</span>{' '}
                    below today's target.
                  </div>
                </div>

                {/* Editable amount */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Amount to contribute</div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '700 14px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none' }}>₹</span>
                    <input
                      type="number" inputMode="decimal"
                      value={challengeWinInput}
                      onChange={e => setChallengeWinInput(e.target.value)}
                      onFocus={e => e.target.select()}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: c.surface2, border: `1.5px solid ${c.faint}`,
                        borderRadius: 11, padding: '11px 12px 11px 28px',
                        font: '700 16px Plus Jakarta Sans', color: c.ink, outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {activeGoals.length > 0 ? (
                  <>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                      Add to a goal
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                      {activeGoals.slice(0, 4).map(goal => {
                        const cfg = { purchase: '#EF4444', savings: '#10B981', event: '#F59E0B' }[goal.goal_type]
                        return (
                          <button
                            key={goal.id}
                            onClick={async () => {
                              await addGoalSavings(goal.id, validAmt, 'daily_challenge')
                              setChallengeWin(null)
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              background: cfg + '10', border: `1.5px solid ${cfg}30`,
                              borderRadius: 14, padding: '12px 16px',
                              font: '700 14px Plus Jakarta Sans', color: c.ink,
                              cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <span>{goal.name}</span>
                            <span style={{ font: '700 13px Plus Jakarta Sans', color: cfg }}>
                              +{fmt(validAmt)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, marginBottom: 14, lineHeight: 1.5, textAlign: 'center' }}>
                    Create your first goal to turn good habits into progress.
                  </div>
                )}
                <button
                  onClick={() => setChallengeWin(null)}
                  style={{ width: '100%', background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '12px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}
                >
                  Not Now
                </button>
              </>
            )
          })()}
        </BottomSheet>

        <BottomSheet open={emergencyEditOpen} onClose={() => setEmergencyEditOpen(false)} zIndex={300}>
              <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4, letterSpacing: '-0.02em' }}>Emergency Fund</div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 18 }}>Amount reserved and excluded from spendable balance</div>
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '700 14px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none' }}>₹</span>
                <input
                  type="number" inputMode="decimal" autoFocus
                  value={emergencyInput}
                  onChange={e => setEmergencyInput(e.target.value)}
                  onFocus={e => e.target.select()}
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      const v = parseFloat(emergencyInput)
                      if (!isNaN(v) && v >= 0) { setSavingEmergency(true); try { await updateSettings({ emergency_fund: v }); setEmergencyEditOpen(false) } catch (_) {} setSavingEmergency(false) }
                    }
                  }}
                  style={{ width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 13, padding: '13px 14px 13px 30px', font: '800 18px Plus Jakarta Sans', color: c.ink, outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEmergencyEditOpen(false)} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
                <button
                  disabled={savingEmergency}
                  onClick={async () => {
                    const v = parseFloat(emergencyInput)
                    if (isNaN(v) || v < 0) return
                    setSavingEmergency(true)
                    try { await updateSettings({ emergency_fund: v }); setEmergencyEditOpen(false) } catch (_) {}
                    setSavingEmergency(false)
                  }}
                  style={{ flex: 2, background: c.warn, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: savingEmergency ? 'not-allowed' : 'pointer', opacity: savingEmergency ? 0.7 : 1 }}
                >
                  {savingEmergency ? 'Saving...' : 'Save'}
                </button>
              </div>
        </BottomSheet>
      </div>
    </ThemeContext.Provider>
  )
}
