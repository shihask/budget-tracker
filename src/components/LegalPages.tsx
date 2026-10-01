import { ArrowLeft } from 'lucide-react'
import { LeafWatermark } from './AuthPage'
import { version } from '../../package.json'

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

const link: React.CSSProperties = {
  color: accent, textDecoration: 'underline', fontWeight: 700,
}

const EFFECTIVE_DATE = 'October 1, 2026'
const CONTACT_EMAIL = 'hello@moneyplant.online'
const WEBSITE_URL = 'moneyplant.online'

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
          <strong>Account details.</strong> Your <strong>email address</strong> and, optionally, your
          <strong> name</strong>. If you sign in with Google, we receive your Google profile name and email.
        </div>
        <div style={p}>
          <strong>Financial data you enter.</strong> Accounts, transactions, categories, budgets, bills
          and commitments, credit cards, borrowings, savings, goals, life events and shared projects.
        </div>
        <div style={p}>
          <strong>Files you upload.</strong> Receipt photos, shared-project attachments, and bank
          statements you import.
        </div>
        <div style={p}>
          <strong>Bank-linked data, only if you connect a bank.</strong> Your mobile number and the
          account and transaction data your bank shares with your consent (see section 4).
        </div>
        <div style={p}>
          <strong>Technical data.</strong> A push-notification subscription for your device if you turn
          notifications on, and counts of how much you use AI features.
        </div>

        <div style={h2}>2. How We Use Your Data</div>
        <div style={p}>
          Your data is used only to run the features you use: tracking, budgeting, analytics,
          forecasting, reminders and notifications, and AI assistance. We do not sell or rent your
          data, we do not show ads, and we do not share your data with anyone for marketing.
        </div>

        <div style={h2}>3. AI Features (Mint AI)</div>
        <div style={p}>
          Some features send data to a third-party AI provider, <strong>Groq</strong>, to generate a
          response. What is sent depends on the feature:
        </div>
        <div style={p}>
          • <strong>Auto-categorization</strong> (Autopilot): the description you type, plus your category names<br />
          • <strong>Mint AI chat and insights</strong> (affordability, analytics, goals, the Mint coach): a summary of the
          figures the answer needs, such as amounts, balances, category totals and upcoming bills<br />
          • <strong>Receipt scanning</strong> (Autopilot): the receipt photo<br />
          • <strong>Statement import</strong>: the statement file you upload<br />
          • <strong>Life event suggestions</strong> (Autopilot): descriptions, dates, categories and amounts of recent expenses
        </div>
        <div style={p}>
          Chat, insights and statement import run when you ask. The Mint coach runs when you open the
          Grow page. Autopilot features run automatically while Autopilot is on, and you can turn it off
          at any time in Settings. We never send your email address or password to the AI provider.
          AI use is limited to 100 requests per day.
        </div>
        <div style={p}>
          For each AI request we log the feature used, the model that answered and the amount of usage,
          so we can manage limits and costs. These logs are deleted after 30 days.
        </div>

        <div style={h2}>4. Bank Linking</div>
        <div style={p}>
          Bank linking uses India's regulated <strong>Account Aggregator</strong> framework, through Setu
          and Finvu. It happens only if you choose to connect a bank and approve the consent request.
          MoneyPlant never sees or stores your bank username or password.
        </div>
        <div style={p}>
          With your consent, we fetch deposit-account transactions for up to the previous 12 months and
          then check for new ones once a day. Consent lasts up to 12 months. You can disconnect at any
          time in the app or revoke consent with your Account Aggregator. After you disconnect, no new
          data is fetched; transactions already imported stay in your account unless you delete them.
        </div>

        <div style={h2}>5. Who Can See Your Data</div>
        <div style={p}>
          Your data is stored in a <strong>Supabase</strong> (PostgreSQL) database with row-level
          security, so other users cannot see it. The exceptions:
        </div>
        <div style={p}>
          • <strong>Shared projects</strong>: anything you add to a shared project is visible to its members.
          If you invite someone, we send them an email with your invitation.<br />
          • <strong>Administrators</strong>: for support, a small number of authorized administrators can see
          account-level details (email, feature settings, AI usage and record counts). They cannot see your
          transactions from the admin tools, and every admin change is logged.
        </div>
        <div style={p}>
          We use these service providers to run MoneyPlant: Supabase (database, sign-in and file storage),
          Vercel (hosting and analytics), Groq (AI), Brevo (sign-in and account emails), Resend
          (invitation emails), Google (if you sign in
          with Google), and Setu and Finvu (bank linking, if you use it).
        </div>

        <div style={h2}>6. Security</div>
        <div style={p}>
          All connections use HTTPS/TLS encryption in transit. Access to your data requires you to be
          signed in, and the database enforces per-user access rules.
        </div>

        <div style={h2}>7. Cookies & Local Storage</div>
        <div style={p}>
          We use local storage on your device for your sign-in session, app preferences, offline app
          files, recently loaded data so the app can open offline, transactions you add while offline
          (until you save them to your account), and a few small caches (for example, recent AI answers
          so they don't need to be requested again). We do not use advertising or tracking cookies.
        </div>

        <div style={h2}>8. Analytics</div>
        <div style={p}>
          We use privacy-friendly, cookie-free analytics (Vercel Analytics and Speed Insights) to understand
          overall usage and app performance. They do not identify you personally.
        </div>

        <div style={h2}>9. How Long We Keep Data</div>
        <div style={p}>
          We keep your data while your account is active. Bank statement files are deleted once an import
          finishes, or after 7 days of inactivity if the import is abandoned. AI request logs are deleted
          after 30 days. Receipts and attachments are kept until you remove them.
        </div>

        <div style={h2}>10. Your Rights</div>
        <div style={p}>
          You can edit or delete individual records in the app at any time, and export your transactions
          to CSV. To delete your account and all its data, email <strong>{CONTACT_EMAIL}</strong>; we will
          remove it within 30 days.
        </div>

        <div style={h2}>11. Changes</div>
        <div style={p}>
          We may update this policy. Significant changes will be communicated within the app.
          Continued use after changes constitutes acceptance.
        </div>

        <div style={h2}>12. Contact</div>
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
          forecast your cash flow and visualize your spending. <strong>It is not a financial advisor,
          bank, or investment platform.</strong> Any insights or suggestions are informational only.
        </div>
        <div style={p}>
          Forecasts, "safe to spend" figures and affordability checks are estimates based on the data
          you have entered and may be wrong. Please check important decisions against your actual
          bank balances.
        </div>

        <div style={h2}>3. AI Features</div>
        <div style={p}>
          Mint AI answers, auto-categorization, receipt and statement reading, and life event
          suggestions are generated automatically and can be inaccurate. Review what AI fills in
          before relying on it. AI features have usage limits and may be changed or paused.
        </div>

        <div style={h2}>4. Bank Linking</div>
        <div style={p}>
          If you connect a bank, data is shared through India's Account Aggregator framework under a
          consent you approve and can revoke. Bank data can be delayed, incomplete or duplicated; you
          can review, edit or delete imported transactions. MoneyPlant cannot move money or make
          payments from your accounts.
        </div>

        <div style={h2}>5. Your Account</div>
        <div style={p}>
          You are responsible for keeping your login credentials secure. You must provide accurate
          information when signing up. One account per person.
        </div>

        <div style={h2}>6. Acceptable Use</div>
        <div style={p}>
          Do not use MoneyPlant for illegal activity, attempt to access other users' data, or
          deliberately overload the service. Only invite people to shared projects who expect to hear
          from you. We reserve the right to suspend accounts that violate these terms.
        </div>

        <div style={h2}>7. Your Data</div>
        <div style={p}>
          You own all data you enter into MoneyPlant. We do not claim any rights over your financial
          data. Anything you add to a shared project is visible to that project's members. See our
          Privacy Policy for how we handle your data.
        </div>

        <div style={h2}>8. Service Availability</div>
        <div style={p}>
          We strive to keep MoneyPlant available 24/7 but do not guarantee uninterrupted service.
          We may perform maintenance or updates that temporarily affect availability.
        </div>

        <div style={h2}>9. Limitation of Liability</div>
        <div style={p}>
          MoneyPlant is provided "as is" without warranties. We are not liable for any financial
          decisions you make based on information in the app, data loss due to circumstances beyond
          our control, or indirect or consequential damages of any kind.
        </div>

        <div style={h2}>10. Termination</div>
        <div style={p}>
          You may stop using MoneyPlant at any time and ask us to delete your account by emailing
          {' '}<strong>{CONTACT_EMAIL}</strong>. We may terminate accounts that violate these terms,
          with notice where practical.
        </div>

        <div style={h2}>11. Changes</div>
        <div style={p}>
          We may update these terms. Continued use after changes constitutes acceptance. We will
          notify you of significant changes within the app.
        </div>

        <div style={h2}>12. Contact</div>
        <div style={p}>
          Questions about these terms? Contact us at <strong>{CONTACT_EMAIL}</strong>.
        </div>
      </div>
    </div>
  )
}

export function AboutPage({ onBack }: { onBack: () => void }) {
  return (
    <div style={wrap}>
      <LeafWatermark />
      <div style={card}>
        <button onClick={onBack} style={backBtn}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={h1}>About MoneyPlant</div>
        <div style={updated}>Know Before You Spend.</div>

        <div style={p}>
          MoneyPlant predicts your future cash flow so you always know what you can safely spend
          before your next income. Track expenses, manage commitments, plan savings, and make
          confident money decisions — without complicated spreadsheets.
        </div>

        <div style={h2}>Who It's For</div>
        <div style={p}>
          MoneyPlant is built for salaried employees planning around payday, families coordinating
          bills and shared expenses, freelancers managing variable income, and students staying
          within budget.
        </div>

        <div style={h2}>Version</div>
        <div style={p}>v{version}</div>

        <div style={h2}>Website</div>
        <div style={p}>
          <a href={`https://${WEBSITE_URL}`} target="_blank" rel="noopener noreferrer" style={link}>
            {WEBSITE_URL}
          </a>
        </div>

        <div style={h2}>Disclaimer</div>
        <div style={p}>
          MoneyPlant is a personal finance tracking tool. It is not a financial advisor, bank, or
          investment platform. Any insights or suggestions are informational only.
        </div>
      </div>
    </div>
  )
}

export function ContactPage({ onBack }: { onBack: () => void }) {
  return (
    <div style={wrap}>
      <LeafWatermark />
      <div style={card}>
        <button onClick={onBack} style={backBtn}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={h1}>Support & Contact</div>
        <div style={updated}>Need help with MoneyPlant?</div>

        <div style={h2}>Email Support</div>
        <div style={p}>
          <a href={`mailto:${CONTACT_EMAIL}`} style={link}>{CONTACT_EMAIL}</a>
        </div>
        <div style={p}>
          • Questions about your account<br />
          • Report a bug<br />
          • Suggest a feature
        </div>

        <div style={p}>We do our best to respond as soon as possible.</div>
      </div>
    </div>
  )
}
