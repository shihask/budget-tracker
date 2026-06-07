import React, { useState, useMemo, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ThemeContext } from '@/lib/theme-context'
import { makeColors } from '@/lib/tokens'
import { useSupabaseData } from '@/hooks/useSupabaseData'
import { derive } from '@/lib/data'
import type { Layout, DashboardSectionId } from '@/types'
import { DEFAULT_DASHBOARD_SECTIONS } from '@/types'

import { Header } from '@/components/Header'
import { HeroWeekly } from '@/components/HeroWeekly'
import { SectionTitle } from '@/components/SectionTitle'
import { MetricCards } from '@/components/MetricCards'
import { Analytics } from '@/components/Analytics'
import { AccountsSection } from '@/components/AccountsSection'
import { CommitmentsSection } from '@/components/CommitmentsSection'
import { BorrowingSection } from '@/components/BorrowingSection'
import { BorrowingPage } from '@/components/BorrowingPage'
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
import { BottomSheet } from '@/components/BottomSheet'
import { DashboardLayoutPage } from '@/components/DashboardLayoutPage'

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
  const [txnsOpen, setTxnsOpen] = useState(false)
  const [borrowingOpen, setBorrowingOpen] = useState(false)
  const [catsOpen, setCatsOpen] = useState(false)
  const [budgetEditOpen, setBudgetEditOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [emergencyEditOpen, setEmergencyEditOpen] = useState(false)
  const [emergencyInput, setEmergencyInput] = useState('')
  const [savingEmergency, setSavingEmergency] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [dashEditTx, setDashEditTx] = useState<import('@/types').Transaction | null>(null)
  const [swipePct, setSwipePct] = useState(0)

  const { state, loading, usingSupabase, addTransaction, deleteTransaction, updateTransaction, updateSettings, addAccount, deleteAccount, adjustBalance, addGroup, updateGroup, deleteGroup, addCategory, updateCategory, deleteCategory, addCreditCard, updateCreditCard, deleteCreditCard, payCreditCardBill, addBorrowing, updateBorrowing, deleteBorrowing, recordBorrowingPayment, reversePayment, addCommitment, updateCommitment, deleteCommitment, markCommitmentPaid } = useSupabaseData(session.user.id)
  const c = useMemo(() => makeColors(accent, dark), [accent, dark])
  const d = useMemo(() => derive(state), [state])

  const handleSave = async (form: Parameters<typeof addTransaction>[0]) => {
    await addTransaction(form)
    setFlash(form.description)
    setTimeout(() => setFlash(null), 2200)
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
            width: '100%', maxWidth: W, zIndex: 200,
            background: dark ? 'rgba(12,10,7,0.85)' : 'rgba(237,231,221,0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            padding: `env(safe-area-inset-top, 0px) 16px 0`,
            borderBottom: `1px solid ${c.faint}`,
            display: (txnsOpen || borrowingOpen) ? 'none' : 'block',
          }}>
            <Header dark={dark} onToggleTheme={() => setDark(v => !v)} userName={userName} userEmail={userEmail} synced={usingSupabase} onSignOut={() => supabase.auth.signOut()} onSettings={() => setSettingsOpen(v => !v)} onCategories={() => setCatsOpen(true)} />
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
              {(state.settings.dashboard_sections ?? DEFAULT_DASHBOARD_SECTIONS)
                .filter(s => s.visible)
                .map(s => {
                  let el: React.ReactNode = null
                  if (s.id.startsWith('custom__')) {
                    el = <CustomGroupSection section={s} state={state} />
                    return el ? <React.Fragment key={s.id}>{el}</React.Fragment> : null
                  }
                  switch (s.id as DashboardSectionId) {
                    case 'hero':
                      el = <HeroWeekly d={d} settings={state.settings} onUpdateSettings={updateSettings} editOpen={budgetEditOpen} onEditClose={() => setBudgetEditOpen(false)} onEditOpen={() => setBudgetEditOpen(true)} />
                      break
                    case 'affordability':
                      el = <AffordabilityChecker d={d} settings={state.settings} />
                      break
                    case 'metrics':
                      el = <div>
                        <SectionTitle action="Customize" onAction={() => setSettingsOpen(true)}>Your money</SectionTitle>
                        <MetricCards d={d} layout={layout} onEditBudget={() => setBudgetEditOpen(true)} onEditEmergencyFund={() => { setEmergencyInput(String(state.settings.emergency_fund)); setEmergencyEditOpen(true) }} commitmentItems={state.commitments.filter(c => c.is_active !== false && c.remaining > 0).map(c => ({ name: c.name, remaining: c.remaining }))} accountItems={state.accounts.filter(a => a.is_active).map(a => ({ name: a.name, balance: a.current_balance }))} />
                      </div>
                      break
                    case 'analytics':
                      el = <Analytics state={state} />
                      break
                    case 'accounts':
                      el = <AccountsSection state={state} onAdjustBalance={adjustBalance} onAddAccount={addAccount} onDeleteAccount={deleteAccount} />
                      break
                    case 'commitments':
                      el = <CommitmentsSection state={state} d={d} onMarkPaid={(cm, recordExpense, accountId) => markCommitmentPaid(cm, recordExpense, accountId)} onAdd={addCommitment} onUpdate={updateCommitment} onDelete={deleteCommitment} onAddCategory={addCategory} />
                      break
                    case 'borrowing':
                      el = (state.settings.track_borrowings ?? true) ? <BorrowingSection state={state} onSeeAll={() => setBorrowingOpen(true)} /> : null
                      break
                    case 'credit_cards':
                      el = (state.settings.track_credit_cards ?? false) ? <CreditCardsSection state={state} onAdd={addCreditCard} onUpdate={updateCreditCard} onDelete={deleteCreditCard} onPayBill={payCreditCardBill} /> : null
                      break
                    case 'recent_txns':
                      el = <RecentTxns state={state} onSeeAll={() => setTxnsOpen(true)} onEdit={t => { setDashEditTx(t); setTxnsOpen(true) }} onDelete={deleteTransaction} />
                      break
                  }
                  return el ? <React.Fragment key={s.id}>{el}</React.Fragment> : null
                })
              }
              <div style={{ textAlign: 'center', font: '600 11px Plus Jakarta Sans', color: c.muted, paddingTop: 4 }}>
                MoneyPilot · {usingSupabase ? 'synced with Supabase' : 'local session data'}
              </div>
            </div>
          </div>

          {/* FAB */}
          <div style={{ position: 'fixed', bottom: 0, width: '100%', maxWidth: W, pointerEvents: 'none', zIndex: 50 }}>
            <div style={{ position: 'relative', height: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}>
              <div style={{ pointerEvents: 'auto' }}>
                <FAB onClick={() => setSheetOpen(true)} />
              </div>
            </div>
          </div>

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

          {/* Quick Add Sheet */}
          <div style={{ position: 'fixed', inset: 0, maxWidth: W, margin: '0 auto', pointerEvents: sheetOpen ? 'auto' : 'none', zIndex: 60 }}>
            <QuickAddSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSave={handleSave} state={state} onAddCategory={addCategory} />
          </div>

          {/* Dim overlay: sits between main content and overlay pages, fades with swipe progress */}
          <div style={{
            position: 'fixed', inset: 0, zIndex: 99,
            background: `rgba(0,0,0,${(txnsOpen || borrowingOpen) ? 0.4 * (1 - swipePct) : 0})`,
            pointerEvents: 'none',
            transition: (swipePct > 0 && swipePct < 1) ? 'none' : 'background 0.28s cubic-bezier(0.32,0.72,0,1)',
          }} />

          {txnsOpen && (
            <TransactionsPage state={state} onDelete={deleteTransaction} onUpdate={updateTransaction} onClose={() => { setTxnsOpen(false); setDashEditTx(null) }} dark={dark} onToggleTheme={() => setDark(v => !v)} userName={userName} userEmail={userEmail} synced={usingSupabase} onSignOut={() => supabase.auth.signOut()} onSettings={() => setSettingsOpen(true)} onCategories={() => setCatsOpen(true)} onAddCategory={addCategory} onReversePayment={reversePayment} initialEditTx={dashEditTx} onSwipeProgress={setSwipePct} />
          )}

          {borrowingOpen && (
            <BorrowingPage state={state} onAdd={addBorrowing} onUpdate={updateBorrowing} onDelete={deleteBorrowing} onPayment={recordBorrowingPayment} onAddCategory={addCategory} onClose={() => setBorrowingOpen(false)} dark={dark} onToggleTheme={() => setDark(v => !v)} userName={userName} userEmail={userEmail} synced={usingSupabase} onSignOut={() => supabase.auth.signOut()} onSwipeProgress={setSwipePct} />
          )}

          {catsOpen && (
            <CategoriesPage
              state={state}
              onClose={() => setCatsOpen(false)}
              onAddGroup={addGroup}
              onUpdateGroup={updateGroup}
              onDeleteGroup={deleteGroup}
              onAddCategory={addCategory}
              onUpdateCategory={updateCategory}
              onDeleteCategory={deleteCategory}
            />
          )}

          {layoutOpen && (
            <DashboardLayoutPage
              sections={state.settings.dashboard_sections ?? DEFAULT_DASHBOARD_SECTIONS}
              settings={state.settings}
              categories={state.categories}
              onUpdate={async (sections) => { await updateSettings({ dashboard_sections: sections }) }}
              onClose={() => setLayoutOpen(false)}
            />
          )}
        </div>

        {settingsOpen && (
          <>
            <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
            <SettingsPanel accent={accent} dark={dark} layout={layout} salaryDate={state.settings.salary_date} trackCreditCards={state.settings.track_credit_cards ?? false} trackBorrowings={state.settings.track_borrowings ?? true} onAccent={setAccent} onDark={setDark} onLayout={setLayout} onSalaryDate={v => updateSettings({ salary_date: v })} onTrackCreditCards={v => updateSettings({ track_credit_cards: v })} onTrackBorrowings={v => updateSettings({ track_borrowings: v })} onDashboardLayout={() => { setSettingsOpen(false); setLayoutOpen(true) }} />
          </>
        )}

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
