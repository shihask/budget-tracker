import { useState } from 'react'
import {
  BellRing,
  Bot,
  CalendarCheck,
  Check,
  CheckCircle2,
  PiggyBank,
  ReceiptText,
  Shield,
  ShieldCheck,
  Sprout,
  Target,
  TrendingUp,
  Wallet,
  X as XIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { version } from '../../package.json'
import { PrivacyPolicy, TermsOfService } from './LegalPages'
import { PlantSVG } from './PlantSVG'

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

const features = [
  { icon: Wallet,      title: 'Track Expenses',    desc: 'Log daily spending in seconds' },
  { icon: TrendingUp,  title: 'Smart Budgets',     desc: 'Weekly limits & AI categorization' },
  { icon: PiggyBank,   title: 'Savings & Goals',   desc: 'Watch your money grow over time' },
  { icon: Shield,      title: 'Private & Secure',  desc: 'Your data stays yours, always' },
] as const

const landingProblems = [
  'You do not know how much is safe to spend before the next salary.',
  'Bills, EMIs, credit cards, savings, and borrowings live in different places.',
  'Budget apps show charts, but not what decision to make today.',
] as const

const landingFeatures = [
  { icon: ReceiptText, title: 'Fast daily tracking', desc: 'Add income, expenses, transfers, and notes before you forget the small spends.' },
  { icon: CalendarCheck, title: 'Bills and commitments', desc: 'Track rent, EMIs, subscriptions, school fees, and recurring payments together.' },
  { icon: TrendingUp, title: 'Safe-to-spend budget', desc: 'See what remains after commitments, emergency money, and upcoming cash flow.' },
  { icon: PiggyBank, title: 'Savings and goals', desc: 'Follow SIPs, gold schemes, deposits, chit funds, goals, and progress in one place.' },
  { icon: Bot, title: 'AI money coach', desc: 'Get categorization, affordability checks, and plain-language insights when you need a second look.' },
  { icon: BellRing, title: 'Helpful reminders', desc: 'Get nudges for daily logs, due commitments, budget alerts, and weekly summaries.' },
] as const

const landingProof = [
  { label: 'Before spending', value: 'Know if it is safe' },
  { label: 'Every week', value: 'See where money went' },
  { label: 'Every month', value: 'Grow savings habits' },
] as const

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [legalPage, setLegalPage] = useState<LegalPage>(null)
  const [name, setName]             = useState('')
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const clearError = () => setError(null)

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
    // On success the browser navigates to the provider and back; the session
    // is restored automatically on return. Only reset loading on error.
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

  // ── Check email screen ────────────────────────────────────────────────────
  if (mode === 'check-email' || mode === 'forgot-sent') {
    const isForgot = mode === 'forgot-sent'
    return (
      <Screen>
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
            {isForgot
              ? `We sent a password reset link to`
              : `We sent a confirmation link to`}
            <br />
            <strong style={{ color: '#1C1410' }}>{email}</strong>
          </div>
          {!isForgot && (
            <div style={{ font: '600 13px Plus Jakarta Sans', color: '#9C938A', marginTop: 12 }}>
              Click the link in the email to activate your account.
            </div>
          )}
          <button
            onClick={() => setMode('login')}
            style={{ marginTop: 28, background: accent, color: '#fff', border: 'none', borderRadius: 14, width: '100%', padding: '15px', font: '700 15px Plus Jakarta Sans', cursor: 'pointer' }}
          >
            Back to Sign In
          </button>
        </div>
      </Screen>
    )
  }

  // ── Forgot password ───────────────────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <Screen>
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
        <TextBtn onClick={() => { setMode('login'); clearError() }}>← Back to Sign In</TextBtn>
      </Screen>
    )
  }

  // ── Login / Signup ────────────────────────────────────────────────────────
  const isSignup = mode === 'signup'

  return (
    <LandingScreen onLegal={setLegalPage}>
      <AuthCard>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="48" height="48" style={{ borderRadius: 14, flexShrink: 0 }}>
          <defs>
            <linearGradient id="abg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#16C98A"/>
              <stop offset="100%" stopColor="#0A7A56"/>
            </linearGradient>
          </defs>
          <rect width="100" height="100" rx="22.5" fill="url(#abg)"/>
          <circle cx="50" cy="64" r="25.5" fill="none" stroke="#FFFFFF" strokeWidth="5.2"/>
          <circle cx="50" cy="64" r="19.5" fill="none" stroke="#FFFFFF" strokeWidth="1.6" opacity="0.45"/>
          <text x="50" y="65.5" textAnchor="middle" dominantBaseline="central"
            fontFamily="'Plus Jakarta Sans', 'Montserrat', Arial, sans-serif" fontWeight="800" fontSize="30" fill="#FFFFFF">₹</text>
          <path d="M50 42 V 26" fill="none" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round"/>
          <path d="M49.4 33.5 C 41.6 33.5 36.2 29.1 34.3 21 C 42.1 21 47.5 25.4 49.4 33.5 Z" fill="#FFFFFF"/>
          <path d="M50.6 33.5 C 58.4 33.5 63.8 29.1 65.7 21 C 57.9 21 52.5 25.4 50.6 33.5 Z" fill="#FFFFFF"/>
          <g fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.42">
            <path d="M46.5 30.5 C 43.5 28 40.5 25.8 37.5 24.5"/>
            <path d="M53.5 30.5 C 56.5 28 59.5 25.8 62.5 24.5"/>
          </g>
        </svg>
        <div>
          <div style={{ font: '800 20px Plus Jakarta Sans', letterSpacing: '-0.02em' }}>
            <span style={{ color: '#1C1410' }}>Money</span><span style={{ color: '#16C98A' }}>Plant</span>
          </div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: '#9C938A' }}>Plan Smart. Grow Better.</div>
        </div>
      </div>

      {/* Features */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        {features.map(f => (
          <div key={f.title} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#F5F0EA', borderRadius: 12, padding: '10px 12px',
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <f.icon size={15} color={accent} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ font: '700 11.5px Plus Jakarta Sans', color: '#1C1410', lineHeight: 1.2 }}>{f.title}</div>
              <div style={{ font: '500 10px Plus Jakarta Sans', color: '#9C938A', lineHeight: 1.3, marginTop: 1 }}>{f.desc}</div>
            </div>
          </div>
        ))}
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

      {/* ── Social login ─────────────────────────────────────────────────────── */}
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
          <button onClick={() => setLegalPage('terms')} style={{ background: 'none', border: 'none', color: accent, font: '600 11px Plus Jakarta Sans', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Terms</button>
          {' '}and{' '}
          <button onClick={() => setLegalPage('privacy')} style={{ background: 'none', border: 'none', color: accent, font: '600 11px Plus Jakarta Sans', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Privacy Policy</button>.
          <br />We'll send a confirmation email to verify your account.
        </div>
      )}
      </AuthCard>
    </LandingScreen>
  )
}

// ── Small shared components ───────────────────────────────────────────────────

function LandingScreen({ children, onLegal }: { children: React.ReactNode; onLegal: (page: 'privacy' | 'terms') => void }) {
  return (
    <div className="mp-landing">
      <LeafWatermark />
      <header className="mp-landing__nav">
        <a className="mp-landing__brand" href="#top" aria-label="MoneyPlant home">
          <span className="mp-landing__brandmark"><Sprout size={20} /></span>
          <span><strong>Money</strong><b>Plant</b></span>
        </a>
        <nav className="mp-landing__links" aria-label="Landing navigation">
          <a href="#features">Features</a>
          <a href="#security">Privacy</a>
          <a href="#start">Start</a>
        </nav>
      </header>

      <main id="top" className="mp-landing__hero">
        <section className="mp-landing__story" aria-labelledby="landing-title">
          <div className="mp-landing__eyebrow">
            <Sprout size={15} />
            Personal finance that grows with your habits
          </div>
          <h1 id="landing-title">MoneyPlant</h1>
          <p className="mp-landing__lead">
            MoneyPlant helps you understand what you can safely spend today, what is already committed, and how your savings can keep growing.
          </p>

          <div className="mp-landing__plant-stage" aria-label="MoneyPlant growth preview">
            <div className="mp-landing__plant-copy">
              <span>Spend with clarity</span>
              <strong>Grow money habits one day at a time.</strong>
            </div>
            <PlantSVG stageIdx={6} viewBoxOverride="0 48 200 250" style={{ maxWidth: 240 }} />
          </div>

          <div className="mp-landing__actions">
            <a className="mp-landing__primary" href="#start">Create free account</a>
            <a className="mp-landing__secondary" href="#features">See how it helps</a>
          </div>

          <div className="mp-landing__proof">
            {landingProof.map(item => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <aside id="start" className="mp-landing__auth" aria-label="Sign in or create account">
          {children}
        </aside>
      </main>

      <section className="mp-landing__problems" aria-labelledby="problems-title">
        <div>
          <span className="mp-landing__section-label">The problem</span>
          <h2 id="problems-title">Most people do not need another spreadsheet.</h2>
        </div>
        <div className="mp-landing__problem-list">
          {landingProblems.map(problem => (
            <div key={problem}>
              <CheckCircle2 size={18} />
              <span>{problem}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mp-landing__features" aria-labelledby="features-title">
        <span className="mp-landing__section-label">How MoneyPlant helps</span>
        <h2 id="features-title">One calm place for daily money decisions.</h2>
        <div className="mp-landing__feature-grid">
          {landingFeatures.map(feature => (
            <article key={feature.title} className="mp-landing__feature">
              <div><feature.icon size={20} /></div>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="security" className="mp-landing__security" aria-labelledby="security-title">
        <div>
          <ShieldCheck size={24} />
          <span className="mp-landing__section-label">Built for trust</span>
          <h2 id="security-title">Your money data should feel private, clear, and under your control.</h2>
        </div>
        <p>
          MoneyPlant uses authenticated accounts, privacy-first legal pages, and clear feature controls. It is a personal finance tracker, not financial advice.
        </p>
      </section>

      <footer className="mp-landing__footer">
        <span>v{version}</span>
        <button onClick={() => onLegal('privacy')}>Privacy Policy</button>
        <button onClick={() => onLegal('terms')}>Terms of Service</button>
      </footer>
    </div>
  )
}

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: '100%',
      background: '#FDFAF7', borderRadius: 24, padding: '28px 24px',
      boxShadow: '0 18px 50px rgba(49, 35, 22, 0.12)',
      border: '1px solid rgba(133, 97, 64, 0.12)',
      position: 'relative', zIndex: 1,
    }}>
      {children}
    </div>
  )
}

function Screen({ children, onLegal }: { children: React.ReactNode; onLegal?: (page: 'privacy' | 'terms') => void }) {
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
        {children}
      </div>
      <div style={{ textAlign: 'center', marginTop: 12, position: 'relative', zIndex: 1 }}>
        <div style={{ font: '500 11px Plus Jakarta Sans', color: '#C4BCB4' }}>
          v{version}
        </div>
        {onLegal && (
          <div style={{ font: '500 11px Plus Jakarta Sans', color: '#C4BCB4', marginTop: 6, display: 'flex', justifyContent: 'center', gap: 6 }}>
            <button onClick={() => onLegal('privacy')} style={{ background: 'none', border: 'none', color: '#9C938A', font: '500 11px Plus Jakarta Sans', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
              Privacy Policy
            </button>
            <span style={{ color: '#D5CFC8' }}>|</span>
            <button onClick={() => onLegal('terms')} style={{ background: 'none', border: 'none', color: '#9C938A', font: '500 11px Plus Jakarta Sans', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
              Terms of Service
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

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
    // Session is still valid after updateUser — just dismiss reset screen, go to dashboard
    setTimeout(() => onDone(), 2000)
  }

  return (
    <Screen>
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
    </Screen>
  )
}
