import { ArrowLeft } from 'lucide-react'
import { LeafWatermark } from './AuthPage'

const accent = '#16C98A'

const wrap: React.CSSProperties = {
  minHeight: '100svh', width: '100%',
  background: '#EDE7DD',
  fontFamily: 'Plus Jakarta Sans, sans-serif',
  padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px))',
  boxSizing: 'border-box',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  position: 'relative', overflow: 'hidden',
}

const card: React.CSSProperties = {
  width: '100%', maxWidth: 600,
  background: '#FDFAF7', borderRadius: 24, padding: '28px 24px',
  boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
  position: 'relative', zIndex: 1,
}

const h1: React.CSSProperties = {
  font: '800 22px Plus Jakarta Sans', color: '#1C1410', margin: '0 0 4px',
}

const updated: React.CSSProperties = {
  font: '600 12px Plus Jakarta Sans', color: '#9C938A', marginBottom: 24,
}

const h2: React.CSSProperties = {
  font: '700 15px Plus Jakarta Sans', color: '#1C1410', margin: '24px 0 8px',
}

const p: React.CSSProperties = {
  font: '500 13.5px/1.7 Plus Jakarta Sans', color: '#5C544C', margin: '0 0 12px',
}

const backBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'none', border: 'none', color: accent,
  font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
  padding: 0, marginBottom: 20,
}

const EFFECTIVE_DATE = 'June 26, 2025'
const CONTACT_EMAIL = 'budgettrackee@gmail.com'

export function PrivacyPolicy({ onBack }: { onBack: () => void }) {
  return (
    <div style={wrap}>
      <LeafWatermark />
      <div style={card}>
        <button onClick={onBack} style={backBtn}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={h1}>Privacy Policy</div>
        <div style={updated}>Effective: {EFFECTIVE_DATE}</div>

        <div style={h2}>1. What We Collect</div>
        <div style={p}>
          When you create an account, we collect your <strong>email address</strong> and, optionally,
          your <strong>name</strong>. If you sign in with Google, we receive your Google profile name and email.
        </div>
        <div style={p}>
          All financial data you enter (transactions, categories, budgets, savings goals) is stored
          securely and is accessible only to you.
        </div>

        <div style={h2}>2. How We Use Your Data</div>
        <div style={p}>
          Your data is used solely to power the features you interact with: budgeting, analytics,
          AI-assisted categorization, and forecasting. We do not sell, rent, or share your personal
          or financial data with any third party for marketing purposes.
        </div>

        <div style={h2}>3. AI Categorization</div>
        <div style={p}>
          If you enable the Autopilot feature, transaction descriptions (not amounts) are sent to a
          third-party AI service (Groq) to suggest categories. This is capped at 100 requests per
          month and can be disabled at any time in Settings.
        </div>

        <div style={h2}>4. Data Storage & Security</div>
        <div style={p}>
          Your data is stored in a <strong>Supabase</strong> (PostgreSQL) database with row-level
          security — each user can only access their own data. All connections use HTTPS/TLS encryption
          in transit.
        </div>

        <div style={h2}>5. Cookies & Local Storage</div>
        <div style={p}>
          We use minimal cookies and local storage for authentication sessions and PWA functionality.
          We do not use advertising or tracking cookies.
        </div>

        <div style={h2}>6. Analytics</div>
        <div style={p}>
          We use privacy-friendly, cookie-free analytics (Vercel Analytics) to understand aggregate
          usage patterns. No personally identifiable information is collected by our analytics.
        </div>

        <div style={h2}>7. Your Rights</div>
        <div style={p}>
          You can export or delete your data at any time. To request full account deletion, contact
          us at <strong>{CONTACT_EMAIL}</strong>. We will remove all your data within 30 days.
        </div>

        <div style={h2}>8. Changes</div>
        <div style={p}>
          We may update this policy. Significant changes will be communicated within the app.
          Continued use after changes constitutes acceptance.
        </div>

        <div style={h2}>9. Contact</div>
        <div style={p}>
          Questions? Reach us at <strong>{CONTACT_EMAIL}</strong>.
        </div>
      </div>
    </div>
  )
}

export function TermsOfService({ onBack }: { onBack: () => void }) {
  return (
    <div style={wrap}>
      <LeafWatermark />
      <div style={card}>
        <button onClick={onBack} style={backBtn}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={h1}>Terms of Service</div>
        <div style={updated}>Effective: {EFFECTIVE_DATE}</div>

        <div style={h2}>1. Acceptance</div>
        <div style={p}>
          By creating an account or using MoneyPlant, you agree to these terms. If you do not agree,
          please do not use the service.
        </div>

        <div style={h2}>2. What MoneyPlant Is</div>
        <div style={p}>
          MoneyPlant is a personal finance tracking tool. It helps you record expenses, set budgets,
          and visualize your spending. <strong>It is not a financial advisor, bank, or investment
          platform.</strong> Any insights or suggestions are informational only.
        </div>

        <div style={h2}>3. Your Account</div>
        <div style={p}>
          You are responsible for keeping your login credentials secure. You must provide accurate
          information when signing up. One account per person.
        </div>

        <div style={h2}>4. Acceptable Use</div>
        <div style={p}>
          Do not use MoneyPlant for illegal activity, attempt to access other users' data, or
          deliberately overload the service. We reserve the right to suspend accounts that violate
          these terms.
        </div>

        <div style={h2}>5. Your Data</div>
        <div style={p}>
          You own all data you enter into MoneyPlant. We do not claim any rights over your financial
          data. See our Privacy Policy for how we handle it.
        </div>

        <div style={h2}>6. Service Availability</div>
        <div style={p}>
          We strive to keep MoneyPlant available 24/7 but do not guarantee uninterrupted service.
          We may perform maintenance or updates that temporarily affect availability.
        </div>

        <div style={h2}>7. Limitation of Liability</div>
        <div style={p}>
          MoneyPlant is provided "as is" without warranties. We are not liable for any financial
          decisions you make based on information in the app, data loss due to circumstances beyond
          our control, or indirect or consequential damages of any kind.
        </div>

        <div style={h2}>8. Termination</div>
        <div style={p}>
          You may delete your account at any time. We may terminate accounts that violate these terms,
          with notice where practical.
        </div>

        <div style={h2}>9. Changes</div>
        <div style={p}>
          We may update these terms. Continued use after changes constitutes acceptance. We will
          notify you of significant changes within the app.
        </div>

        <div style={h2}>10. Contact</div>
        <div style={p}>
          Questions about these terms? Contact us at <strong>{CONTACT_EMAIL}</strong>.
        </div>
      </div>
    </div>
  )
}
