import { useState, useEffect, useRef } from 'react'
import {
  BarChart3, Bell, Bot, Briefcase, CalendarCheck, Check,
  ChevronDown, Cloud, CloudOff, CreditCard, Flame, GraduationCap, LineChart,
  Lock, PiggyBank, Receipt, Repeat, Shield, ShieldCheck, Sprout,
  Star, Target, TrendingUp, Trophy, Users, Wallet, X as XIcon, Zap,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { version } from '../../package.json'
import { PrivacyPolicy, TermsOfService } from './LegalPages'

type Mode = 'login' | 'signup' | 'check-email' | 'forgot' | 'forgot-sent'
type LegalPage = 'privacy' | 'terms' | null

const accent = '#16C98A'

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#F5F0EA', border: '1.5px solid #E5DDD5',
  borderRadius: 13, padding: '14px 16px',
  font: '600 15px Plus Jakarta Sans', color: '#1C1410',
  outline: 'none', appearance: 'none',
}

const oauthBtn: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  background: '#fff', border: '1.5px solid #E5DDD5', borderRadius: 13,
  padding: '13px 16px', font: '700 15px Plus Jakarta Sans', color: '#1C1410',
  cursor: 'pointer',
}

// ── Data ──────────────────────────────────────────────────────────────────────

const heroBullets = [
  'Know what’s safe to spend today',
  'Never miss bills, EMIs or recurring payments',
  'See your future balance before payday',
] as const

const tourFeatures = [
  {
    id: 'challenge', icon: Flame,
    title: 'Daily Challenge & Plant Growth',
    desc: 'Get a personal daily spending target based on your income, bills and commitments. Stay under it, grow your streak, and watch your virtual MoneyPlant bloom from seed to full bloom as you build better money habits.',
    mock: 'challenge',
  },
  {
    id: 'forecast', icon: LineChart,
    title: 'Cash Flow Forecast',
    desc: 'See how your balance changes over the coming days after income, bills, savings, planned expenses and recurring payments.',
    mock: 'forecast',
  },
  {
    id: 'budget', icon: Target,
    title: 'Budget Strategy',
    desc: 'Plan spending across Needs, Wants and Savings with real progress tracking.',
    mock: 'budget',
  },
  {
    id: 'goals', icon: Trophy,
    title: 'Goals & Affordability',
    desc: 'Set savings goals for purchases, trips or milestones. Track contributions, see progress, and check if you can afford something before you buy it.',
    mock: 'goals',
  },
  {
    id: 'bills', icon: CalendarCheck,
    title: 'Bills & Commitments',
    desc: 'Track EMIs, subscriptions, school fees, rent and recurring payments in one place.',
    mock: 'bills',
  },
  {
    id: 'cards', icon: CreditCard,
    title: 'Credit Cards',
    desc: 'Track billed and unbilled amounts separately and know exactly what is due.',
    mock: 'cards',
  },
  {
    id: 'savings', icon: PiggyBank,
    title: 'Savings & Investments',
    desc: 'Manage SIPs, gold schemes, recurring deposits, chit funds and savings goals.',
    mock: 'savings',
  },
  {
    id: 'mintai', icon: Bot,
    title: 'Mint AI',
    desc: 'Ask questions about your money in natural language.',
    mock: 'mintai',
  },
] as const

const badges = [
  { icon: Flame, label: 'Daily Challenge' },
  { icon: Sprout, label: 'Plant Growth' },
  { icon: Trophy, label: 'Goal Tracking' },
  { icon: Receipt, label: 'Expense Tracking' },
  { icon: TrendingUp, label: 'Income Tracking' },
  { icon: LineChart, label: 'Cash Flow Forecast' },
  { icon: Target, label: 'Budget Planning' },
  { icon: CalendarCheck, label: 'Planned Expenses' },
  { icon: CreditCard, label: 'Credit Cards' },
  { icon: PiggyBank, label: 'Savings Goals' },
  { icon: Repeat, label: 'SIPs' },
  { icon: Star, label: 'Gold Schemes' },
  { icon: Users, label: 'Chit Funds' },
  { icon: Wallet, label: 'Borrowing' },
  { icon: BarChart3, label: 'Multiple Accounts' },
  { icon: Bell, label: 'Recurring Bills' },
  { icon: LineChart, label: 'Analytics' },
  { icon: CloudOff, label: 'Offline Support' },
  { icon: Cloud, label: 'Secure Cloud Sync' },
] as const

const personas = [
  { icon: Briefcase, title: 'Salaried Employees', desc: 'Know whether you’ll comfortably reach your next salary.' },
  { icon: Users, title: 'Families', desc: 'Plan bills, school fees, groceries and savings together.' },
  { icon: Zap, title: 'Freelancers', desc: 'Handle irregular income with forecasting.' },
  { icon: GraduationCap, title: 'Students', desc: 'Track spending and stay within budget.' },
] as const

const trustBadges = [
  { icon: Shield, label: 'No Ads' },
  { icon: Lock, label: 'Private by Default' },
  { icon: ShieldCheck, label: 'Secure Authentication' },
  { icon: CloudOff, label: 'Works Offline' },
  { icon: Cloud, label: 'Cloud Sync' },
  { icon: Wallet, label: 'No Bank Credentials' },
] as const

const galleryScreens = [
  { type: 'dashboard', label: 'Dashboard' },
  { type: 'challenge', label: 'Daily Challenge' },
  { type: 'forecast', label: 'Forecast' },
  { type: 'budget', label: 'Budget' },
  { type: 'goals', label: 'Goals' },
  { type: 'analytics', label: 'Analytics' },
  { type: 'mintai', label: 'Mint AI' },
  { type: 'savings', label: 'Savings' },
  { type: 'cards', label: 'Credit Cards' },
  { type: 'bills', label: 'Transactions' },
] as const

const faqItems = [
  { q: 'Is MoneyPlant free?', a: 'Yes, MoneyPlant is completely free to use. Create an account and start tracking your finances right away.' },
  { q: 'Does it work offline?', a: 'Yes. MoneyPlant works offline as a Progressive Web App. Your data syncs automatically when you’re back online.' },
  { q: 'Can I track multiple accounts?', a: 'Yes. You can create and manage multiple accounts like bank accounts, wallets, and cash to track balances separately.' },
  { q: 'Can I manage credit cards?', a: 'Yes. MoneyPlant lets you track billed and unbilled amounts for your credit cards and see exactly what is due.' },
  { q: 'Can I track recurring bills?', a: 'Yes. Add your EMIs, subscriptions, rent, school fees, and other recurring payments as commitments. MoneyPlant factors them into your cash flow forecast.' },
  { q: 'Can I track savings goals?', a: 'Yes. Track SIPs, gold schemes, recurring deposits, chit funds, and custom savings goals with progress tracking.' },
  { q: 'Is my data secure?', a: 'Yes. MoneyPlant uses authenticated accounts with Supabase, a trusted open-source platform. Your data is encrypted in transit and at rest, and only you can access it.' },
] as const

// ── Scroll reveal hook ────────────────────────────────────────────────────────

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) { el.classList.add('mp-reveal--visible'); return }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('mp-reveal--visible'); obs.disconnect() } },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useScrollReveal()
  return <div ref={ref} className={`mp-reveal ${className}`}>{children}</div>
}

// ── Main AuthPage ─────────────────────────────────────────────────────────────

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [showAuth, setShowAuth] = useState(false)
  const [legalPage, setLegalPage] = useState<LegalPage>(null)
  const [name, setName]             = useState('')
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const clearError = () => setError(null)

  const openAuth = (m: 'login' | 'signup') => {
    setMode(m); setShowAuth(true); clearError()
    setName(''); setEmail(''); setPassword(''); setConfirm('')
  }
  const closeAuth = () => { setShowAuth(false); setMode('login'); clearError() }

  useEffect(() => {
    if (showAuth) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [showAuth])

  if (legalPage === 'privacy') return <PrivacyPolicy onBack={() => setLegalPage(null)} />
  if (legalPage === 'terms') return <TermsOfService onBack={() => setLegalPage(null)} />

  const handleOAuth = async (provider: 'google') => {
    clearError(); setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true); clearError()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  const handleSignup = async () => {
    if (!name.trim() || !email || !password) return
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); clearError()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim() } },
    })
    if (error) {
      setError(error.message)
    } else if ((data.user?.identities?.length ?? 0) === 0) {
      setError('An account with this email already exists. Try signing in with Google instead.')
    } else {
      setMode('check-email')
    }
    setLoading(false)
  }

  const handleForgot = async () => {
    if (!email) return
    setLoading(true); clearError()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) setError(error.message)
    else setMode('forgot-sent')
    setLoading(false)
  }

  const onKey = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') action()
  }

  const isSignup = mode === 'signup'

  // ── Auth modal content ──────────────────────────────────────────────────────
  const renderAuthContent = () => {
    if (mode === 'check-email' || mode === 'forgot-sent') {
      const isForgot = mode === 'forgot-sent'
      return (
        <div style={{ textAlign: 'center', padding: '0 8px' }}>
          <div style={{ width: 72, height: 72, borderRadius: 999, background: accent + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <div style={{ font: '800 22px Plus Jakarta Sans', color: '#1C1410', marginBottom: 10 }}>
            {isForgot ? 'Reset link sent' : 'Check your email'}
          </div>
          <div style={{ font: '600 14px Plus Jakarta Sans', color: '#9C938A', lineHeight: 1.6 }}>
            {isForgot ? 'We sent a password reset link to' : 'We sent a confirmation link to'}
            <br />
            <strong style={{ color: '#1C1410' }}>{email}</strong>
          </div>
          {!isForgot && (
            <div style={{ font: '600 13px Plus Jakarta Sans', color: '#9C938A', marginTop: 12 }}>
              Click the link in the email to activate your account.
            </div>
          )}
          <button
            onClick={() => { setMode('login'); clearError() }}
            style={{ marginTop: 28, background: accent, color: '#fff', border: 'none', borderRadius: 14, width: '100%', padding: '15px', font: '700 15px Plus Jakarta Sans', cursor: 'pointer' }}
          >
            Back to Sign In
          </button>
        </div>
      )
    }

    if (mode === 'forgot') {
      return (
        <>
          <div style={{ font: '800 24px Plus Jakarta Sans', color: '#1C1410', marginBottom: 6 }}>Reset password</div>
          <div style={{ font: '600 13px Plus Jakarta Sans', color: '#9C938A', marginBottom: 24 }}>
            Enter your email and we'll send a reset link.
          </div>
          {error && <ErrorBox msg={error} />}
          <Field label="Email">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => onKey(e, handleForgot)}
              placeholder="you@example.com" autoComplete="email" style={inp} autoFocus />
          </Field>
          <PrimaryBtn loading={loading} onClick={handleForgot} disabled={!email}>
            Send Reset Link
          </PrimaryBtn>
          <TextBtn onClick={() => { setMode('login'); clearError() }}>&larr; Back to Sign In</TextBtn>
        </>
      )
    }

    return (
      <>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #16C98A, #0A7A56)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sprout size={20} color="#fff" />
          </div>
          <div>
            <div style={{ font: '800 18px Plus Jakarta Sans', letterSpacing: '-0.02em' }}>
              <span style={{ color: '#1C1410' }}>Money</span><span style={{ color: '#16C98A' }}>Plant</span>
            </div>
          </div>
        </div>

        {/* Toggle */}
        <div style={{ display: 'flex', background: '#EDE7DD', borderRadius: 14, padding: 4, gap: 4, marginBottom: 24 }}>
          {(['login', 'signup'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); clearError(); setName(''); setEmail(''); setPassword(''); setConfirm('') }} style={{
              flex: 1, border: 'none', borderRadius: 11, padding: '10px',
              font: '700 13px Plus Jakarta Sans',
              background: mode === m ? '#fff' : 'transparent',
              color: mode === m ? '#1C1410' : '#9C938A',
              cursor: 'pointer',
              boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              transition: 'all 0.15s',
            }}>
              {m === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {error && <ErrorBox msg={error} />}

        {isSignup && (
          <Field label="Your name">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Rahul Menon" autoComplete="off" style={inp} autoFocus />
          </Field>
        )}

        <Field label="Email">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={!isSignup ? e => onKey(e, handleLogin) : undefined}
            placeholder="you@example.com" autoComplete="email" style={inp}
            autoFocus={!isSignup} />
        </Field>

        <Field label="Password">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => onKey(e, isSignup ? handleSignup : handleLogin)}
            placeholder={isSignup ? 'Min. 6 characters' : '••••••••'}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            style={inp} />
        </Field>

        {isSignup && (
          <Field label="Confirm Password">
            <div style={{ position: 'relative' }}>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => onKey(e, handleSignup)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                style={{
                  ...inp,
                  borderColor: confirm.length > 0
                    ? confirm === password ? '#10B981' : '#EF4444'
                    : '#E5DDD5',
                }} />
              {confirm.length > 0 && (
                <div style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  font: '700 12px Plus Jakarta Sans',
                  color: confirm === password ? '#10B981' : '#EF4444',
                }}>
                  {confirm === password ? <><Check size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Match</> : <><XIcon size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> No match</>}
                </div>
              )}
            </div>
          </Field>
        )}

        {!isSignup && (
          <div style={{ textAlign: 'right', marginTop: -8, marginBottom: 16 }}>
            <button onClick={() => { setMode('forgot'); clearError() }} style={{
              background: 'none', border: 'none', color: accent,
              font: '600 13px Plus Jakarta Sans', cursor: 'pointer', padding: 0,
            }}>
              Forgot password?
            </button>
          </div>
        )}

        <PrimaryBtn
          loading={loading}
          onClick={isSignup ? handleSignup : handleLogin}
          disabled={isSignup ? !name || !email || !password || !confirm : !email || !password}
        >
          {isSignup ? 'Create Account' : 'Sign In'}
        </PrimaryBtn>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
          <div style={{ flex: 1, height: 1, background: '#E5DDD5' }} />
          <span style={{ font: '600 12px Plus Jakarta Sans', color: '#9C938A' }}>or</span>
          <div style={{ flex: 1, height: 1, background: '#E5DDD5' }} />
        </div>

        <button onClick={() => handleOAuth('google')} disabled={loading} style={oauthBtn}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          Continue with Google
        </button>

        {isSignup && (
          <div style={{ font: '500 11px Plus Jakarta Sans', color: '#9C938A', textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
            By signing up you agree to our{' '}
            <button onClick={() => { closeAuth(); setLegalPage('terms') }} style={{ background: 'none', border: 'none', color: accent, font: '600 11px Plus Jakarta Sans', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Terms</button>
            {' '}and{' '}
            <button onClick={() => { closeAuth(); setLegalPage('privacy') }} style={{ background: 'none', border: 'none', color: accent, font: '600 11px Plus Jakarta Sans', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Privacy Policy</button>.
            <br />We'll send a confirmation email to verify your account.
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <LandingScreen
        onSignIn={() => openAuth('login')}
        onSignUp={() => openAuth('signup')}
        onLegal={setLegalPage}
      />
      {showAuth && (
        <div className="mp-auth-overlay" onClick={e => { if (e.target === e.currentTarget) closeAuth() }}>
          <div className="mp-auth-modal">
            <button className="mp-auth-modal__close" onClick={closeAuth} aria-label="Close">
              <XIcon size={20} />
            </button>
            {renderAuthContent()}
          </div>
        </div>
      )}
    </>
  )
}

// ── Landing Screen ────────────────────────────────────────────────────────────

function LandingScreen({ onSignIn, onSignUp, onLegal }: {
  onSignIn: () => void
  onSignUp: () => void
  onLegal: (page: 'privacy' | 'terms') => void
}) {
  const [navStuck, setNavStuck] = useState(false)

  useEffect(() => {
    const onScroll = () => setNavStuck(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="mp-landing" id="top">
      <LeafWatermark />

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className={`mp-nav ${navStuck ? 'mp-nav--stuck' : ''}`}>
        <div className="mp-nav__inner">
          <a className="mp-nav__brand" href="#top" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            <span className="mp-nav__brandmark"><Sprout size={18} /></span>
            <span><strong>Money</strong><b>Plant</b></span>
          </a>
          <nav className="mp-nav__links" aria-label="Landing navigation">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#privacy">Privacy</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="mp-nav__auth">
            <button className="mp-nav__signin" onClick={onSignIn}>Sign In</button>
            <button className="mp-nav__signup" onClick={onSignUp}>Create Account</button>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="mp-hero" aria-labelledby="hero-title">
        <div className="mp-hero__content">
          <div className="mp-hero__eyebrow">
            <Sprout size={15} />
            Personal finance that grows with you
          </div>
          <h1 id="hero-title">Know Before<br />You Spend.</h1>
          <p className="mp-hero__sub">
            MoneyPlant predicts your future cash flow so you always know what you can safely spend before your next income. Track expenses, manage commitments, plan savings, and make confident money decisions.
          </p>
          <ul className="mp-hero__bullets">
            {heroBullets.map(b => (
              <li key={b}><Check size={16} strokeWidth={3} />{b}</li>
            ))}
          </ul>
          <div className="mp-hero__actions">
            <button className="mp-btn mp-btn--primary" onClick={onSignUp}>Create Free Account</button>
            <a className="mp-btn mp-btn--secondary" href="#how-it-works">See How It Works</a>
          </div>
        </div>
        <div className="mp-hero__visual" aria-hidden="true">
          <div className="mp-hero__stack">
            <PhoneFrame type="dashboard" className="mp-hero__phone mp-hero__phone--1" />
            <PhoneFrame type="forecast" className="mp-hero__phone mp-hero__phone--2" />
            <PhoneFrame type="budget" className="mp-hero__phone mp-hero__phone--3" />
          </div>
        </div>
      </section>

      {/* ── Why MoneyPlant ──────────────────────────────────────────────────── */}
      <Reveal>
        <section className="mp-why" id="how-it-works" aria-labelledby="why-title">
          <div className="mp-why__header">
            <h2 id="why-title">Most finance apps tell you where your money <em>went</em>.</h2>
            <p>MoneyPlant tells you where your money <em>is going</em>.</p>
          </div>
          <div className="mp-why__cards">
            <div className="mp-why__card mp-why__card--old">
              <h3>Traditional Expense Tracker</h3>
              <ul>
                <li>Records past expenses</li>
                <li>Monthly reports</li>
                <li>Static budgets</li>
              </ul>
            </div>
            <div className="mp-why__card mp-why__card--new">
              <h3>MoneyPlant</h3>
              <ul>
                <li>Predicts future cash flow</li>
                <li>Safe-to-spend guidance</li>
                <li>Budget planning</li>
                <li>Commitment tracking</li>
                <li>Financial forecasting</li>
              </ul>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── Product Tour ────────────────────────────────────────────────────── */}
      <section id="features" className="mp-tour" aria-labelledby="tour-title">
        <Reveal>
          <div className="mp-tour__header">
            <span className="mp-section-label">Product Tour</span>
            <h2 id="tour-title">Everything you need to manage money with confidence.</h2>
          </div>
        </Reveal>
        {tourFeatures.map((f, i) => (
          <Reveal key={f.id}>
            <div className={`mp-tour__item ${i % 2 !== 0 ? 'mp-tour__item--reverse' : ''}`}>
              <div className="mp-tour__text">
                <span className="mp-section-label"><f.icon size={16} /> {f.title}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
              <div className="mp-tour__visual">
                <PhoneFrame type={f.mock} />
              </div>
            </div>
          </Reveal>
        ))}
      </section>

      {/* ── Built for Real Life ──────────────────────────────────────────── */}
      <Reveal>
        <section className="mp-badges" aria-labelledby="badges-title">
          <span className="mp-section-label">Supported Features</span>
          <h2 id="badges-title">Built for Real Life</h2>
          <div className="mp-badges__grid">
            {badges.map(b => (
              <div key={b.label} className="mp-badge">
                <b.icon size={20} />
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── Who It's For ────────────────────────────────────────────────────── */}
      <Reveal>
        <section className="mp-personas" aria-labelledby="personas-title">
          <span className="mp-section-label">Who It&apos;s For</span>
          <h2 id="personas-title">Built for everyone who earns and spends.</h2>
          <div className="mp-personas__grid">
            {personas.map(p => (
              <div key={p.title} className="mp-persona">
                <div className="mp-persona__icon"><p.icon size={24} /></div>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── Privacy & Trust ─────────────────────────────────────────────────── */}
      <Reveal>
        <section id="privacy" className="mp-trust" aria-labelledby="trust-title">
          <div className="mp-trust__header">
            <ShieldCheck size={28} />
            <h2 id="trust-title">Your money data stays under your control.</h2>
          </div>
          <div className="mp-trust__badges">
            {trustBadges.map(b => (
              <div key={b.label} className="mp-trust__badge">
                <b.icon size={20} />
                <span>{b.label}</span>
              </div>
            ))}
          </div>
          <p className="mp-trust__note">
            MoneyPlant uses authenticated accounts, privacy-first policies, and clear feature controls.
            It is a personal finance tracker, not financial advice.
          </p>
        </section>
      </Reveal>

      {/* ── Screenshots Gallery ─────────────────────────────────────────────── */}
      <Reveal>
        <section className="mp-gallery" aria-labelledby="gallery-title">
          <span className="mp-section-label">See It in Action</span>
          <h2 id="gallery-title">Every screen, designed for clarity.</h2>
          <GalleryGrid />
        </section>
      </Reveal>

      {/* ── FAQ ─────────────────────────────────────────────────────────────── */}
      <Reveal>
        <section id="faq" className="mp-faq" aria-labelledby="faq-title">
          <span className="mp-section-label">FAQ</span>
          <h2 id="faq-title">Frequently Asked Questions</h2>
          <div className="mp-faq__list">
            {faqItems.map((item, i) => (
              <FaqItem key={i} question={item.q} answer={item.a} />
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── Final CTA ───────────────────────────────────────────────────────── */}
      <Reveal>
        <section className="mp-cta" aria-labelledby="cta-title">
          <h2 id="cta-title">Ready to know before you spend?</h2>
          <p>Join MoneyPlant and make smarter financial decisions every day.</p>
          <div className="mp-cta__actions">
            <button className="mp-btn mp-btn--primary mp-btn--lg" onClick={onSignUp}>Create Free Account</button>
            <a className="mp-btn mp-btn--secondary mp-btn--lg" href="#features">Explore Features</a>
          </div>
        </section>
      </Reveal>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="mp-footer">
        <span>v{version}</span>
        <button onClick={() => onLegal('privacy')}>Privacy Policy</button>
        <button onClick={() => onLegal('terms')}>Terms of Service</button>
      </footer>
    </div>
  )
}

// ── Gallery ───────────────────────────────────────────────────────────────────

function GalleryGrid() {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <>
      <div className="mp-gallery__grid">
        {galleryScreens.map(s => (
          <button key={s.type} className="mp-gallery__item" onClick={() => setSelected(s.type)}>
            <PhoneFrame type={s.type} className="mp-gallery__phone" />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="mp-gallery__modal" onClick={() => setSelected(null)}>
          <div className="mp-gallery__modal-inner" onClick={e => e.stopPropagation()}>
            <button className="mp-gallery__modal-close" onClick={() => setSelected(null)} aria-label="Close">
              <XIcon size={24} />
            </button>
            <PhoneFrame type={selected} className="mp-gallery__modal-phone" />
            <span className="mp-gallery__modal-label">
              {galleryScreens.find(s => s.type === selected)?.label}
            </span>
          </div>
        </div>
      )}
    </>
  )
}

// ── FAQ Accordion ─────────────────────────────────────────────────────────────

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`mp-faq__item ${open ? 'mp-faq__item--open' : ''}`}>
      <button className="mp-faq__q" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{question}</span>
        <ChevronDown size={18} />
      </button>
      <div className="mp-faq__a" aria-hidden={!open}>
        <p>{answer}</p>
      </div>
    </div>
  )
}

// ── Phone Frame + Mock Screens ────────────────────────────────────────────────

function PhoneFrame({ type, className = '' }: { type: string; className?: string }) {
  return (
    <div className={`mp-phone ${className}`} aria-hidden="true">
      <div className="mp-phone__notch" />
      <MockScreen type={type} />
    </div>
  )
}

function MockScreen({ type }: { type: string }) {
  const hdr = (
    <div className="mp-mock__hdr">
      <Sprout size={11} color={accent} />
      <span>MoneyPlant</span>
    </div>
  )

  switch (type) {
    case 'dashboard': return (
      <div className="mp-mock">
        {hdr}
        <div className="mp-mock__card mp-mock__card--green">
          <small>Safe to spend</small>
          <strong>₹12,450</strong>
        </div>
        <div className="mp-mock__bar"><div style={{ width: '68%', background: accent }} /></div>
        <div className="mp-mock__label">Recent</div>
        <div className="mp-mock__rows">
          <div><span className="mp-mock__dot" style={{ background: '#EF4444' }} /><span className="mp-mock__line" /><span className="mp-mock__amt">−₹340</span></div>
          <div><span className="mp-mock__dot" style={{ background: '#F59E0B' }} /><span className="mp-mock__line" /><span className="mp-mock__amt">−₹1,200</span></div>
          <div><span className="mp-mock__dot" style={{ background: accent }} /><span className="mp-mock__line" /><span className="mp-mock__amt">+₹45,000</span></div>
        </div>
      </div>
    )
    case 'challenge': return (
      <div className="mp-mock">
        {hdr}
        <div className="mp-mock__card mp-mock__card--green">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <small>Today's Challenge</small>
            <span style={{ fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 2 }}>🔥 7</span>
          </div>
          <strong>₹850 left</strong>
        </div>
        <div className="mp-mock__bar"><div style={{ width: '35%', background: '#F59E0B' }} /></div>
        <div className="mp-mock__label">Daily limit: ₹1,300</div>
        <div style={{ textAlign: 'center', margin: '6px 0 4px' }}>
          <svg width="40" height="50" viewBox="0 48 200 250" style={{ opacity: 0.9 }}>
            <path d="M73,252 L68,285 L132,285 L127,252 Z" fill="#B5581A" />
            <rect x="70" y="244" width="60" height="10" rx="5" fill="#D4784F" />
            <path d="M100,254 C100,200 100,170 100,130" stroke="#4E7A40" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <ellipse cx="85" cy="160" rx="15" ry="6" transform="rotate(-35,85,160)" fill="#8CC96A" />
            <ellipse cx="115" cy="175" rx="15" ry="6" transform="rotate(35,115,175)" fill="#5B9E4A" />
            <ellipse cx="88" cy="140" rx="12" ry="5" transform="rotate(-30,88,140)" fill="#C5E8A0" />
          </svg>
        </div>
        <div style={{ textAlign: 'center', fontSize: 7, fontWeight: 800, color: '#0a7a56' }}>Stage: Growing 🌿</div>
      </div>
    )
    case 'goals': return (
      <div className="mp-mock">
        {hdr}
        <div className="mp-mock__label" style={{ marginTop: 8 }}>My Goals</div>
        <div className="mp-mock__progress">
          <div style={{ background: '#F5F0EA', borderRadius: 8, padding: '6px 8px', marginBottom: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#1c1410' }}>New Laptop</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: accent }}>72%</span>
            </div>
            <div className="mp-mock__bar"><div style={{ width: '72%', background: accent }} /></div>
            <div style={{ fontSize: 7, color: '#9c938a', fontWeight: 600, marginTop: 2 }}>₹54,000 / ₹75,000</div>
          </div>
          <div style={{ background: '#F5F0EA', borderRadius: 8, padding: '6px 8px', marginBottom: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#1c1410' }}>Family Trip</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#3B82F6' }}>45%</span>
            </div>
            <div className="mp-mock__bar"><div style={{ width: '45%', background: '#3B82F6' }} /></div>
            <div style={{ fontSize: 7, color: '#9c938a', fontWeight: 600, marginTop: 2 }}>₹22,500 / ₹50,000</div>
          </div>
          <div style={{ background: '#F5F0EA', borderRadius: 8, padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#1c1410' }}>Emergency Fund</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#F59E0B' }}>30%</span>
            </div>
            <div className="mp-mock__bar"><div style={{ width: '30%', background: '#F59E0B' }} /></div>
            <div style={{ fontSize: 7, color: '#9c938a', fontWeight: 600, marginTop: 2 }}>₹30,000 / ₹1,00,000</div>
          </div>
        </div>
      </div>
    )
    case 'forecast': return (
      <div className="mp-mock">
        {hdr}
        <div className="mp-mock__card mp-mock__card--blue">
          <small>30-day forecast</small>
          <strong>₹8,200</strong>
        </div>
        <div className="mp-mock__chart">
          {[40, 60, 45, 75, 55, 80, 50].map((h, i) => (
            <div key={i} className="mp-mock__chart-bar" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="mp-mock__label">Upcoming</div>
        <div className="mp-mock__rows">
          <div><span className="mp-mock__dot" style={{ background: '#F59E0B' }} /><span className="mp-mock__line" /><span className="mp-mock__amt">Jul 3</span></div>
          <div><span className="mp-mock__dot" style={{ background: '#EF4444' }} /><span className="mp-mock__line" /><span className="mp-mock__amt">Jul 5</span></div>
        </div>
      </div>
    )
    case 'budget': return (
      <div className="mp-mock">
        {hdr}
        <div className="mp-mock__card mp-mock__card--amber">
          <small>Monthly budget</small>
          <strong>₹35,000</strong>
        </div>
        <div className="mp-mock__label">Allocation</div>
        <div className="mp-mock__progress">
          <div><span>Needs</span><div className="mp-mock__bar"><div style={{ width: '72%', background: '#3B82F6' }} /></div><span>72%</span></div>
          <div><span>Wants</span><div className="mp-mock__bar"><div style={{ width: '45%', background: '#F59E0B' }} /></div><span>45%</span></div>
          <div><span>Savings</span><div className="mp-mock__bar"><div style={{ width: '90%', background: accent }} /></div><span>90%</span></div>
        </div>
      </div>
    )
    case 'bills': return (
      <div className="mp-mock">
        {hdr}
        <div className="mp-mock__label" style={{ marginTop: 8 }}>Commitments</div>
        <div className="mp-mock__rows mp-mock__rows--bills">
          <div><span className="mp-mock__dot" style={{ background: '#EF4444' }} /><span className="mp-mock__text">Home Loan EMI</span><span className="mp-mock__amt">₹18,500</span></div>
          <div><span className="mp-mock__dot" style={{ background: '#F59E0B' }} /><span className="mp-mock__text">Netflix</span><span className="mp-mock__amt">₹649</span></div>
          <div><span className="mp-mock__dot" style={{ background: '#3B82F6' }} /><span className="mp-mock__text">School Fees</span><span className="mp-mock__amt">₹4,200</span></div>
          <div><span className="mp-mock__dot" style={{ background: accent }} /><span className="mp-mock__text">Electricity</span><span className="mp-mock__amt">₹1,800</span></div>
        </div>
      </div>
    )
    case 'cards': return (
      <div className="mp-mock">
        {hdr}
        <div className="mp-mock__cc">
          <div className="mp-mock__cc-chip" />
          <div className="mp-mock__cc-num">••••  4521</div>
          <div className="mp-mock__cc-row">
            <div><small>Billed</small><strong>₹12,300</strong></div>
            <div><small>Unbilled</small><strong>₹4,580</strong></div>
          </div>
        </div>
        <div className="mp-mock__label">Due: Jul 15</div>
        <div className="mp-mock__rows">
          <div><span className="mp-mock__dot" style={{ background: '#8B5CF6' }} /><span className="mp-mock__line" /><span className="mp-mock__amt">−₹2,400</span></div>
          <div><span className="mp-mock__dot" style={{ background: '#8B5CF6' }} /><span className="mp-mock__line" /><span className="mp-mock__amt">−₹899</span></div>
        </div>
      </div>
    )
    case 'savings': return (
      <div className="mp-mock">
        {hdr}
        <div className="mp-mock__card mp-mock__card--green">
          <small>Total savings</small>
          <strong>₹1,24,500</strong>
        </div>
        <div className="mp-mock__label">Goals</div>
        <div className="mp-mock__progress">
          <div><span>SIP</span><div className="mp-mock__bar"><div style={{ width: '60%', background: accent }} /></div><span>₹36K</span></div>
          <div><span>Gold</span><div className="mp-mock__bar"><div style={{ width: '80%', background: '#F59E0B' }} /></div><span>₹48K</span></div>
          <div><span>RD</span><div className="mp-mock__bar"><div style={{ width: '40%', background: '#3B82F6' }} /></div><span>₹24K</span></div>
        </div>
      </div>
    )
    case 'mintai': return (
      <div className="mp-mock">
        {hdr}
        <div className="mp-mock__label" style={{ marginTop: 8 }}>Mint AI</div>
        <div className="mp-mock__chat">
          <div className="mp-mock__bubble mp-mock__bubble--user">Can I afford a ₹5,000 purchase?</div>
          <div className="mp-mock__bubble mp-mock__bubble--ai">Based on your forecast, you have ₹12,450 safe to spend. A ₹5,000 purchase is comfortable.</div>
        </div>
      </div>
    )
    case 'analytics': return (
      <div className="mp-mock">
        {hdr}
        <div className="mp-mock__card mp-mock__card--blue">
          <small>This month</small>
          <strong>₹28,400</strong>
        </div>
        <div className="mp-mock__pie">
          <svg viewBox="0 0 36 36" width="100%" height="100%">
            <circle cx="18" cy="18" r="14" fill="none" stroke="#E5DDD5" strokeWidth="4" />
            <circle cx="18" cy="18" r="14" fill="none" stroke="#EF4444" strokeWidth="4" strokeDasharray="35 65" strokeDashoffset="25" />
            <circle cx="18" cy="18" r="14" fill="none" stroke="#F59E0B" strokeWidth="4" strokeDasharray="25 75" strokeDashoffset="60" />
            <circle cx="18" cy="18" r="14" fill="none" stroke={accent} strokeWidth="4" strokeDasharray="20 80" strokeDashoffset="85" />
          </svg>
        </div>
        <div className="mp-mock__legend">
          <span><span className="mp-mock__dot" style={{ background: '#EF4444' }} />Food</span>
          <span><span className="mp-mock__dot" style={{ background: '#F59E0B' }} />Travel</span>
          <span><span className="mp-mock__dot" style={{ background: accent }} />Bills</span>
        </div>
      </div>
    )
    default: return <div className="mp-mock">{hdr}</div>
  }
}

// ── Shared UI components ──────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ font: '700 11px Plus Jakarta Sans', color: '#9C938A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ background: '#FEE2E2', color: '#EF4444', borderRadius: 10, padding: '10px 14px', font: '600 13px Plus Jakarta Sans', marginBottom: 14 }}>
      {msg}
    </div>
  )
}

export function LeafWatermark() {
  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"
        aria-hidden="true"
        style={{
          position: 'absolute', top: -30, right: -40,
          width: 220, height: 176, opacity: 0.045,
          transform: 'rotate(15deg)',
          pointerEvents: 'none', zIndex: 0,
        }}
      >
        <path d="M50 42 V 26" fill="none" stroke="#16C98A" strokeWidth="3.4" strokeLinecap="round"/>
        <path d="M49.4 33.5 C 41.6 33.5 36.2 29.1 34.3 21 C 42.1 21 47.5 25.4 49.4 33.5 Z" fill="#16C98A"/>
        <path d="M50.6 33.5 C 58.4 33.5 63.8 29.1 65.7 21 C 57.9 21 52.5 25.4 50.6 33.5 Z" fill="#16C98A"/>
        <path d="M46.5 30.5 C 43.5 28 40.5 25.8 37.5 24.5" fill="none" stroke="#16C98A" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M53.5 30.5 C 56.5 28 59.5 25.8 62.5 24.5" fill="none" stroke="#16C98A" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <svg
        xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"
        aria-hidden="true"
        style={{
          position: 'absolute', bottom: -20, left: -50,
          width: 200, height: 160, opacity: 0.035,
          transform: 'rotate(-25deg)',
          pointerEvents: 'none', zIndex: 0,
        }}
      >
        <path d="M50 42 V 26" fill="none" stroke="#16C98A" strokeWidth="3.4" strokeLinecap="round"/>
        <path d="M49.4 33.5 C 41.6 33.5 36.2 29.1 34.3 21 C 42.1 21 47.5 25.4 49.4 33.5 Z" fill="#16C98A"/>
        <path d="M50.6 33.5 C 58.4 33.5 63.8 29.1 65.7 21 C 57.9 21 52.5 25.4 50.6 33.5 Z" fill="#16C98A"/>
        <path d="M46.5 30.5 C 43.5 28 40.5 25.8 37.5 24.5" fill="none" stroke="#16C98A" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M53.5 30.5 C 56.5 28 59.5 25.8 62.5 24.5" fill="none" stroke="#16C98A" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </>
  )
}

function PrimaryBtn({ children, onClick, loading, disabled }: { children: React.ReactNode; onClick: () => void; loading: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        width: '100%', background: (loading || disabled) ? '#9C938A' : accent,
        color: '#fff', border: 'none', borderRadius: 14, padding: '15px',
        font: '700 15px Plus Jakarta Sans', cursor: (loading || disabled) ? 'not-allowed' : 'pointer',
        marginTop: 4, transition: 'background 0.15s',
      }}
    >
      {loading ? 'Please wait…' : children}
    </button>
  )
}

function TextBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: '#9C938A', font: '600 13px Plus Jakarta Sans', cursor: 'pointer' }}>
      {children}
    </button>
  )
}

// ── Reset Password Page (shown after clicking email link) ─────────────────────

export function ResetPasswordPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [done, setDone]         = useState(false)

  const handleReset = async () => {
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    setDone(true)
    setLoading(false)
    setTimeout(() => onDone(), 2000)
  }

  return (
    <div style={{
      minHeight: '100svh', width: '100%',
      background: '#EDE7DD',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px))',
      boxSizing: 'border-box',
      position: 'relative', overflow: 'hidden',
    }}>
      <LeafWatermark />
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#FDFAF7', borderRadius: 24, padding: '28px 24px',
        boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
        position: 'relative', zIndex: 1,
      }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '0 8px' }}>
            <div style={{ width: 72, height: 72, borderRadius: 999, background: accent + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{ font: '800 22px Plus Jakarta Sans', color: '#1C1410', marginBottom: 10 }}>Password updated!</div>
            <div style={{ font: '600 14px Plus Jakarta Sans', color: '#9C938A', lineHeight: 1.6 }}>
              Your password has been updated. Taking you to your dashboard…
            </div>
          </div>
        ) : (
          <>
            <div style={{ font: '800 24px Plus Jakarta Sans', color: '#1C1410', marginBottom: 6 }}>Set new password</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: '#9C938A', marginBottom: 24 }}>
              Choose a strong password for your account.
            </div>
            {error && <ErrorBox msg={error} />}
            <Field label="New Password">
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                autoComplete="new-password"
                style={inp} autoFocus
              />
            </Field>
            <Field label="Confirm Password">
              <div style={{ position: 'relative' }}>
                <input
                  type="password" value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleReset() }}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  style={{
                    ...inp,
                    borderColor: confirm.length > 0
                      ? confirm === password ? '#10B981' : '#EF4444'
                      : '#E5DDD5',
                  }}
                />
                {confirm.length > 0 && (
                  <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', font: '700 12px Plus Jakarta Sans', color: confirm === password ? '#10B981' : '#EF4444' }}>
                    {confirm === password ? <><Check size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Match</> : <><XIcon size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> No match</>}
                  </div>
                )}
              </div>
            </Field>
            <PrimaryBtn loading={loading} onClick={handleReset} disabled={!password || !confirm}>
              Update Password
            </PrimaryBtn>
          </>
        )}
      </div>
    </div>
  )
}
