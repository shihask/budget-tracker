import { useState, useMemo, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ThemeContext } from '@/lib/theme-context'
import { makeColors } from '@/lib/tokens'
import { useSupabaseData } from '@/hooks/useSupabaseData'
import { derive } from '@/lib/data'
import type { Layout } from '@/types'

import { Header } from '@/components/Header'
import { HeroWeekly } from '@/components/HeroWeekly'
import { SectionTitle } from '@/components/SectionTitle'
import { MetricCards } from '@/components/MetricCards'
import { Analytics } from '@/components/Analytics'
import { AccountsSection } from '@/components/AccountsSection'
import { CommitmentsSection } from '@/components/CommitmentsSection'
import { BorrowingSection } from '@/components/BorrowingSection'
import { RenovationSection, RecentTxns } from '@/components/Sections'
import { FAB, QuickAddSheet } from '@/components/QuickAdd'
import { SettingsPanel } from '@/components/SettingsPanel'
import { TransactionsPage } from '@/components/TransactionsPage'
import { Glyph } from '@/components/Glyph'
import { PWAPrompt } from '@/components/PWAPrompt'
import { AuthPage } from '@/components/AuthPage'

// ── Root: only handles auth state ────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return (
    <div style={{ minHeight: '100svh', background: '#EDE7DD', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: 999, border: '3px solid #10B981', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (session === null) return <AuthPage />

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
  const [budgetEditOpen, setBudgetEditOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const { state, loading, usingSupabase, addTransaction, deleteTransaction, updateTransaction, updateSettings, addAccount, deleteAccount, adjustBalance, addBorrowing, updateBorrowing, deleteBorrowing, recordBorrowingPayment, addCommitment, updateCommitment, deleteCommitment, markCommitmentPaid } = useSupabaseData(session.user.id)
  const c = useMemo(() => makeColors(accent, dark), [accent, dark])
  const d = useMemo(() => derive(state), [state])

  const handleSave = async (form: Parameters<typeof addTransaction>[0]) => {
    await addTransaction(form)
    setFlash(form.description)
    setTimeout(() => setFlash(null), 2200)
  }

  const panelW = typeof window !== 'undefined' ? Math.min(280, window.innerWidth) : 280
  const W = 402

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
          <div style={{
            background: c.bg, minHeight: '100svh',
            padding: `4px 16px calc(130px + env(safe-area-inset-bottom, 0px))`,
          }}>
            <div style={{ height: 'calc(50px + env(safe-area-inset-top, 0px))' }} />
            <Header dark={dark} onToggleTheme={() => setDark(v => !v)} userName={userName} userEmail={userEmail} synced={usingSupabase} onSignOut={() => supabase.auth.signOut()} />

            {/* Settings gear */}
            <button onClick={() => setSettingsOpen(v => !v)} style={{
              position: 'fixed',
              top: 'calc(16px + env(safe-area-inset-top, 0px))',
              right: settingsOpen ? panelW + 16 : 16, zIndex: 300,
              width: 40, height: 40, borderRadius: 999,
              background: c.surface, border: `1px solid ${c.faint}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: c.cardShadow,
              transition: 'right 0.3s cubic-bezier(0.32,0.72,0,1)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>

            {loading && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${c.accent}, ${c.heroB})`, zIndex: 999 }} />
            )}


            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <HeroWeekly d={d} settings={state.settings} onUpdateSettings={updateSettings} editOpen={budgetEditOpen} onEditClose={() => setBudgetEditOpen(false)} />
              <div>
                <SectionTitle action="Customize" onAction={() => setSettingsOpen(true)}>Your money</SectionTitle>
                <MetricCards d={d} layout={layout} onEditBudget={() => setBudgetEditOpen(true)} />
              </div>
              <Analytics state={state} />
              <AccountsSection state={state} onAdjustBalance={adjustBalance} onAddAccount={addAccount} onDeleteAccount={deleteAccount} />
              <CommitmentsSection state={state} d={d} onMarkPaid={markCommitmentPaid} onAdd={addCommitment} onUpdate={updateCommitment} onDelete={deleteCommitment} />
              <BorrowingSection state={state} onAdd={addBorrowing} onUpdate={updateBorrowing} onDelete={deleteBorrowing} onPayment={recordBorrowingPayment} />
              <RenovationSection state={state} d={d} />
              <RecentTxns state={state} onSeeAll={() => setTxnsOpen(true)} />
              <div style={{ textAlign: 'center', font: '600 11px Plus Jakarta Sans', color: c.muted, paddingTop: 4 }}>
                BudgetTracker · {usingSupabase ? 'synced with Supabase' : 'local session data'}
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
            <QuickAddSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSave={handleSave} state={state} />
          </div>

          {txnsOpen && (
            <TransactionsPage state={state} onDelete={deleteTransaction} onUpdate={updateTransaction} onClose={() => setTxnsOpen(false)} />
          )}
        </div>

        {settingsOpen && (
          <>
            <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
            <SettingsPanel accent={accent} dark={dark} layout={layout} emergencyFund={state.settings.emergency_fund} salaryDate={state.settings.salary_date} onAccent={setAccent} onDark={setDark} onLayout={setLayout} onEmergencyFund={v => updateSettings({ emergency_fund: v })} onSalaryDate={v => updateSettings({ salary_date: v })} />
          </>
        )}
      </div>
    </ThemeContext.Provider>
  )
}
