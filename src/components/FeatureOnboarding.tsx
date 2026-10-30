import React, { useState, useEffect, useRef } from 'react'
import {
  Tags, Tag, MessageCircle, Search, PenLine, Wallet, FileText, Plane, TrendingUp,
  Settings, Check, X, ArrowUp, ArrowRight, IndianRupee, CreditCard, WalletCards, ChevronDown, Plus,
  HandCoins, Users, Info, ChartColumnIncreasing, ChartLine, Coins, CalendarDays, Landmark, PiggyBank, CircleCheck,
  PartyPopper, Target, Scale, ReceiptText, UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { keywordCategoryName } from '@/lib/categorize'
import { sanitizeAmountInput } from '@/lib/amountExpression'
import { DEFAULT_BILL_DAY, DEFAULT_DUE_DAY } from '@/lib/credit-card'

type FeatureKey = 'track_credit_cards' | 'track_borrowings' | 'track_savings' | 'track_projects' | 'autopilot_enabled' | 'notifications_enabled'

interface FeaturePage {
  key: FeatureKey
  label: string
  subtitle: string
  description: string
  defaultOn: boolean
  featured?: boolean
  Icon: ({ size }: { size: number }) => React.JSX.Element
}

function SparkleIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.88 5.8 5.62.82-4.06 3.96.96 5.6L12 16.9l-5.02 2.63.96-5.6L3.88 9.62l5.62-.82z"/>
    </svg>
  )
}

function CreditCardIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}

function UsersIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function TrendingUpIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  )
}

function SuitcaseIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <path d="M2 13h20"/>
    </svg>
  )
}

function BellIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

const PAGES: FeaturePage[] = [
  {
    key: 'autopilot_enabled',
    label: 'Mint AI',
    subtitle: "MoneyPlant's core feature",
    description: 'Mint reads what you type and categorizes automatically — "tea 20" becomes Tea & Snacks instantly.\n\nAsk it anything: "how much did I spend on food this month?" Get answers in seconds. Spot patterns before they become bad habits.',
    defaultOn: true,
    featured: true,
    Icon: SparkleIcon,
  },
  {
    key: 'track_credit_cards',
    label: 'Credit Card Tracking',
    subtitle: 'Know what you owe',
    description: 'Have a credit card? Keep those spends completely separate from cash.\n\nSee your outstanding balance update in real-time — so you always know what you owe before the bill lands.',
    defaultOn: false,
    Icon: CreditCardIcon,
  },
  {
    key: 'track_borrowings',
    label: 'Lend & Borrow',
    subtitle: 'Never lose track',
    description: 'Lent ₹500 to a friend? Borrowed from family? Track every rupee you\'ve given or received.\n\nSee at a glance who owes you — and who you owe.',
    defaultOn: false,
    Icon: UsersIcon,
  },
  {
    key: 'track_savings',
    label: 'Savings & Investments',
    subtitle: 'Watch your wealth grow',
    description: 'Track your SIPs, gold schemes, recurring deposits and fixed deposits — all in one dedicated section.\n\nRecord each contribution, see your total corpus, and keep savings completely separate from daily expenses.',
    defaultOn: false,
    Icon: TrendingUpIcon,
  },
  {
    key: 'track_projects',
    label: 'Projects',
    subtitle: 'Split costs, stay in sync',
    description: 'Organize and split shared expenses across trips, events, and group activities.\n\nCreate a project for a trip, event or shared goal — invite friends or family, log costs as they happen, and see who owes what, all in one place.',
    defaultOn: false,
    Icon: SuitcaseIcon,
  },
  {
    key: 'notifications_enabled',
    label: 'Smart Reminders',
    subtitle: 'Never forget to track your spending',
    description: 'Life gets busy — MoneyPlant keeps you on track.\n\n• Salary day nudge to log your income\n• Due date alerts for bills & commitments\n• Budget limit warning before you overspend\n• Weekly spending summary every Sunday\n• Daily reminder to log today\'s expenses',
    defaultOn: false,
    Icon: BellIcon,
  },
]

/** The optional first card from the Credit Card page — raw field text; OnboardingFlow converts and saves it. */
export interface CardDraft {
  name: string
  credit_limit: string
  bill_day: string
  due_day: string
  outstanding: string
}

const EMPTY_CARD: CardDraft = { name: '', credit_limit: '', bill_day: '', due_day: '', outstanding: '' }

/** The custom pages (Mint AI, Credit Cards) stay phone-width on a desktop screen. */
const PAGE_MAX_WIDTH = 560

interface Props {
  /** Named cards only, and only when the user said Yes — otherwise empty. */
  onComplete: (features: Record<FeatureKey, boolean>, cards: CardDraft[]) => void
  onBack: () => void
}

function LargeToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 56, height: 32, borderRadius: 16,
        background: on ? '#16C98A' : '#C8C2BB',
        border: 'none', cursor: 'pointer',
        position: 'relative', flexShrink: 0,
        transition: 'background 0.25s ease',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 4, left: on ? 28 : 4,
        width: 24, height: 24, borderRadius: 12,
        background: '#fff',
        transition: 'left 0.25s ease',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
      }} />
    </button>
  )
}

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7"/>
    </svg>
  )
}

const MINT_FEATURES: { Icon: LucideIcon; title: string; detail: string }[] = [
  { Icon: Tags, title: 'Auto-categorizes your expenses', detail: '"petrol 500" lands in Fuel, no picking from lists' },
  { Icon: MessageCircle, title: 'Answers your money questions', detail: '"How much is free to spend before payday?"' },
  { Icon: Search, title: 'Finds any transaction', detail: '"When did I pay the plumber?" or "find swiggy in August"' },
  { Icon: PenLine, title: 'Edits by just asking', detail: '"Change fuel 500 to 300" or "delete tea 20"' },
  { Icon: Wallet, title: 'Checks if you can afford it', detail: 'Weighs upcoming bills before you buy' },
  { Icon: FileText, title: 'Imports bank statements', detail: 'Upload a PDF and Mint reads the transactions' },
  { Icon: Plane, title: 'Notices trips & life events', detail: 'Groups a trip or wedding\'s spending for you' },
  { Icon: TrendingUp, title: 'Spots patterns & savings opportunities', detail: 'Flags spending spikes and suggests ways to save' },
]

const DEMO_EXAMPLES = ['Tea 20', 'Petrol 500', 'Groceries 1200']

interface DemoResult { description: string; category: string | null; amount: number }

// "tea 20" → Tea / Tea & Snacks / ₹20. The last number is the amount, the rest
// the description. Local keyword table only — no AI before the user has data.
function parseDemo(raw: string): DemoResult | null {
  const nums = raw.match(/\d[\d,]*(?:\.\d+)?/g)
  if (!nums) return null
  const last = nums[nums.length - 1]
  const at = raw.lastIndexOf(last)
  const amount = Number(last.replace(/,/g, ''))
  const description = (raw.slice(0, at) + raw.slice(at + last.length)).replace(/\s+/g, ' ').trim()
  if (!amount || !description) return null
  return {
    description: description[0].toUpperCase() + description.slice(1),
    category: keywordCategoryName(description),
    amount,
  }
}

const ink = '#1C1410'
const muted = '#8A8178'
const deepGreen = '#0A7A56'
const card: React.CSSProperties = {
  background: '#FBF8F4', borderRadius: 20,
  border: '1px solid #E6DFD5', padding: 18,
  marginBottom: 14, textAlign: 'left',
}

function MintHeroArt() {
  const bubble = (text: string, style: React.CSSProperties, delay: number) => (
    <div style={{
      position: 'absolute', ...style,
      background: '#E3F4EC', border: '1px solid rgba(22,201,138,0.35)',
      color: deepGreen, font: '700 11px "Plus Jakarta Sans"',
      padding: '5px 9px', borderRadius: 10, whiteSpace: 'nowrap',
      boxShadow: '0 2px 6px rgba(28,20,16,0.06)',
      animation: `foFloat 3.2s ease-in-out ${delay}s infinite`,
    }}>
      {text}
    </div>
  )
  return (
    <div aria-hidden style={{ position: 'relative', width: 132, height: 128, flexShrink: 0 }}>
      <img
        src="/mint-ai-logo.svg" alt="" width={76} height={76}
        style={{
          position: 'absolute', left: 30, top: 38, display: 'block',
          borderRadius: 22, boxShadow: '0 10px 24px rgba(28,20,16,0.22)',
        }}
      />
      {bubble('Tea 20', { left: 0, top: 10 }, 0)}
      {bubble('Petrol 500', { right: 0, top: 0 }, 0.8)}
      {bubble('Groceries 1200', { right: -4, bottom: 6 }, 1.6)}
    </div>
  )
}

function MintAIPage() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<DemoResult | null>(null)
  const [tried, setTried] = useState(false)
  const timers = useRef<number[]>([])

  const stopIntro = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  const submit = (value: string) => {
    stopIntro()
    setText(value)
    setResult(parseDemo(value))
    setTried(true)
  }

  const reset = (value: string) => {
    stopIntro()
    setText(value)
    setResult(null)
    setTried(false)
  }

  // Types the first example once, then shows what Mint understood. Any tap or
  // keystroke from the user cancels it.
  useEffect(() => {
    const target = DEMO_EXAMPLES[0].toLowerCase()
    for (let i = 1; i <= target.length; i++) {
      timers.current.push(window.setTimeout(() => setText(target.slice(0, i)), 500 + i * 110))
    }
    timers.current.push(window.setTimeout(() => submit(target), 500 + target.length * 110 + 600))
    return stopIntro
  }, [])

  const activeChip = DEMO_EXAMPLES.find(e => e.toLowerCase() === text.trim().toLowerCase())

  return (
    <div style={{ width: '100%', maxWidth: PAGE_MAX_WIDTH, textAlign: 'left' }}>
      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 4px 18px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 12px "Plus Jakarta Sans"', color: '#0FAF75', letterSpacing: '0.1em' }}>MEET</div>
          <div style={{ font: '800 34px "Plus Jakarta Sans"', letterSpacing: '-0.03em', lineHeight: 1.1, marginTop: 2 }}>
            <span style={{ color: deepGreen }}>Mint</span> <span style={{ color: ink }}>AI</span>
          </div>
          <div style={{ font: '600 14px "Plus Jakarta Sans"', color: '#5C534B', marginTop: 4 }}>
            Your personal money assistant
          </div>
          <div style={{ font: '400 13px "Plus Jakarta Sans"', color: muted, lineHeight: 1.55, marginTop: 10 }}>
            Just type naturally. Mint understands, categorizes and helps you manage your money.
          </div>
        </div>
        <MintHeroArt />
      </div>

      {/* Try it yourself */}
      <div style={card}>
        <div style={{ font: '800 18px "Plus Jakarta Sans"', color: ink, letterSpacing: '-0.01em' }}>Try it yourself</div>
        <div style={{ font: '400 13px "Plus Jakarta Sans"', color: muted, marginTop: 3, marginBottom: 14 }}>
          Type an expense like you normally would.
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {DEMO_EXAMPLES.map(ex => {
            const active = ex === activeChip
            return (
              <button
                key={ex}
                onClick={() => submit(ex.toLowerCase())}
                style={{
                  padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
                  border: `1.5px solid ${active ? '#16C98A' : '#E0D9D0'}`,
                  background: active ? 'rgba(22,201,138,0.08)' : '#fff',
                  color: active ? deepGreen : ink,
                  font: '600 13px "Plus Jakarta Sans"',
                }}
              >
                {ex}
              </button>
            )
          })}
        </div>

        <form
          onSubmit={e => { e.preventDefault(); submit(text) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#fff', borderRadius: 14,
            border: '1.5px solid #E0D9D0', padding: '6px 6px 6px 14px',
          }}
        >
          <input
            value={text}
            onChange={e => reset(e.target.value)}
            placeholder='e.g. "lunch 150"'
            enterKeyHint="send"
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              font: '600 15px "Plus Jakarta Sans"', color: ink, padding: '6px 0',
            }}
          />
          {text && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => reset('')}
              style={{
                width: 24, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: '#E9E3DB', color: muted, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          )}
          <div style={{ width: 1, alignSelf: 'stretch', background: '#EDE7DD', margin: '4px 2px' }} />
          <button
            type="submit"
            aria-label="Send"
            style={{
              width: 38, height: 38, borderRadius: 19, border: 'none', cursor: 'pointer',
              background: '#16C98A', color: '#fff', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ArrowUp size={19} strokeWidth={2.5} />
          </button>
        </form>

        {tried && !result && (
          <div style={{ font: '500 12px "Plus Jakarta Sans"', color: muted, marginTop: 10 }}>
            Add a description and an amount, like "lunch 150".
          </div>
        )}

        {result && (
          <div style={{
            marginTop: 12, borderRadius: 14, overflow: 'hidden',
            border: '1.5px solid rgba(22,201,138,0.3)',
            animation: 'foFadeUp 0.3s ease both',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', background: 'rgba(22,201,138,0.08)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 16, background: '#16C98A', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Check size={18} strokeWidth={3} />
              </div>
              <div>
                <div style={{ font: '800 15px "Plus Jakarta Sans"', color: deepGreen }}>Mint understood!</div>
                <div style={{ font: '400 12px "Plus Jakarta Sans"', color: muted, marginTop: 1 }}>Here's how it will be saved:</div>
              </div>
            </div>
            <div style={{ padding: '4px 14px', background: '#fff' }}>
              {([
                [FileText, 'Description', result.description],
                [Tag, 'Category', result.category ?? 'Mint suggests one'],
                [IndianRupee, 'Amount', `₹${result.amount.toLocaleString('en-IN')}`],
              ] as const).map(([Icon, lbl, val], i, arr) => (
                <div key={lbl} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderBottom: i < arr.length - 1 ? '1px solid #EDE7DD' : 'none',
                }}>
                  <Icon size={16} style={{ color: ink, flexShrink: 0 }} />
                  <span style={{ font: '500 13px "Plus Jakarta Sans"', color: muted, flex: 1 }}>{lbl}</span>
                  <span style={{
                    font: '700 13px "Plus Jakarta Sans"',
                    color: lbl === 'Category' && !result.category ? muted : ink,
                    textAlign: 'right',
                  }}>
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* What else Mint does */}
      <div style={card}>
        <div style={{ font: '800 17px "Plus Jakarta Sans"', color: ink, letterSpacing: '-0.01em', marginBottom: 14 }}>
          Mint can also help you with
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MINT_FEATURES.map(({ Icon, title, detail }) => (
            <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                background: 'rgba(22,201,138,0.12)', color: deepGreen,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: '700 13px "Plus Jakarta Sans"', color: ink }}>{title}</div>
                <div style={{ font: '400 12px "Plus Jakarta Sans"', color: muted, lineHeight: 1.45, marginTop: 1 }}>{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Turned on — the off switch lives in Settings */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 14, flexShrink: 0,
          background: 'rgba(22,201,138,0.12)', color: deepGreen,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Settings size={22} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '700 14px "Plus Jakarta Sans"', color: ink }}>Mint AI is on</div>
          <div style={{ font: '400 12px "Plus Jakarta Sans"', color: muted, lineHeight: 1.5, marginTop: 2 }}>
            You can turn it off anytime in Settings. Even if you do, you can still track expenses manually.
          </div>
        </div>
      </div>
    </div>
  )
}

type CardChoice = 'yes' | 'no' | null

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${s}`
}

/** Typed any card field except the name — a name-less form can't create a card, so it's an error, not a skip. */
const cardDetailsWithoutName = (d: CardDraft) =>
  !d.name.trim() && !!(d.credit_limit || d.bill_day || d.due_day || d.outstanding)

function CardField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{
      display: 'block', background: '#FBF8F4', borderRadius: 14,
      border: '1px solid #E6DFD5', padding: '9px 14px 10px', marginBottom: 10,
      position: 'relative', minWidth: 0,
    }}>
      <div style={{ font: '600 12px "Plus Jakarta Sans"', color: muted, marginBottom: 2 }}>{label}</div>
      {children}
    </label>
  )
}

const fieldInput: React.CSSProperties = {
  width: '100%', border: 'none', outline: 'none', background: 'transparent', padding: 0,
  font: '600 15px "Plus Jakarta Sans"', color: ink,
}

function AmountInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ font: '600 15px "Plus Jakarta Sans"', color: value ? ink : '#B0A9A1' }}>₹</span>
      <input
        value={value}
        onChange={e => onChange(sanitizeAmountInput(e.target.value))}
        inputMode="decimal"
        placeholder={placeholder}
        style={fieldInput}
      />
    </div>
  )
}

function DaySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...fieldInput, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', color: value ? ink : '#B0A9A1', paddingRight: 18 }}
      >
        <option value="">Select day</option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
          <option key={d} value={String(d)}>{ordinal(d)} of month</option>
        ))}
      </select>
      <ChevronDown size={15} style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', color: muted, pointerEvents: 'none' }} />
    </div>
  )
}

/** Icon, title and lines that open the Credit Card and Lend & Borrow pages. */
const INDIGO = '#5B54C9'

function PageHeader({ Icon, title, tagline, taglineAccent = false, description, indigo = false }: {
  Icon: LucideIcon; title: string; tagline: string; taglineAccent?: boolean; description: string
  /** Shared Projects' own colour, so it doesn't read as one of the personal-money pages. */
  indigo?: boolean
}) {
  return (
    <div style={{ textAlign: 'center', padding: '4px 8px 18px', borderBottom: '1px solid #E0D9D0', marginBottom: 18 }}>
      <div style={{
        width: 56, height: 56, borderRadius: 18, margin: '0 auto 14px',
        background: indigo ? 'rgba(91,84,201,0.12)' : 'rgba(22,201,138,0.12)', color: indigo ? INDIGO : deepGreen,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={26} />
      </div>
      <div style={{ font: '800 24px "Plus Jakarta Sans"', color: ink, letterSpacing: '-0.025em' }}>{title}</div>
      <div style={{ font: '600 14px "Plus Jakarta Sans"', color: indigo ? INDIGO : taglineAccent ? '#0FAF75' : '#5C534B', marginTop: 6 }}>{tagline}</div>
      <div style={{ font: '400 13px "Plus Jakarta Sans"', color: muted, lineHeight: 1.55, marginTop: 6 }}>{description}</div>
    </div>
  )
}

/** One answer row. `radio` = pick one (dot); `check` = choose all that apply (tick). */
function ChoiceRow({ selected, onClick, Icon, title, detail, kind = 'radio' }: {
  selected: boolean; onClick: () => void; Icon: LucideIcon; title: string; detail: string; kind?: 'radio' | 'check'
}) {
  return (
    <button
      role={kind === 'radio' ? 'radio' : 'checkbox'}
      aria-checked={selected}
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        background: selected ? 'rgba(22,201,138,0.07)' : '#FBF8F4',
        border: `1.5px solid ${selected ? '#16C98A' : '#E6DFD5'}`,
        borderRadius: 16, padding: '14px 16px', marginBottom: 10, cursor: 'pointer',
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      <Icon size={20} style={{ color: selected ? deepGreen : muted, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '700 15px "Plus Jakarta Sans"', color: ink }}>{title}</div>
        <div style={{ font: '400 12px "Plus Jakarta Sans"', color: muted, marginTop: 1 }}>{detail}</div>
      </div>
      <div style={{
        width: 20, height: 20, borderRadius: 10, flexShrink: 0, boxSizing: 'border-box',
        border: `2px solid ${selected ? '#16C98A' : '#C8C2BB'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && (kind === 'radio'
          ? <div style={{ width: 10, height: 10, borderRadius: 5, background: '#16C98A' }} />
          : <Check size={12} strokeWidth={3.5} style={{ color: '#16C98A' }} />)}
      </div>
    </button>
  )
}

// The tiles mirror SavingsType (sip, gold, rd, fd, ppf_nps, chit) — 'custom' is left out.
const SAVINGS_KINDS: { Icon: LucideIcon; label: string }[] = [
  { Icon: ChartLine, label: 'SIP / MF' },
  { Icon: Coins, label: 'Gold' },
  { Icon: CalendarDays, label: 'RD' },
  { Icon: Landmark, label: 'FD' },
  { Icon: PiggyBank, label: 'PPF / NPS' },
  { Icon: Users, label: 'Chit / Kuri' },
]

const SAVINGS_BENEFITS = [
  'Track every contribution',
  'Monitor your accumulated corpus',
  'Keep savings separate from daily expenses',
]

/** "Feature name / Enabled / change in Settings" + the real switch — Savings and Shared Projects. */
function PreferenceCard({ title, on, onChange }: { title: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      background: '#FBF8F4', borderRadius: 16, padding: '14px 16px',
      border: `1.5px solid ${on ? 'rgba(22,201,138,0.35)' : '#E6DFD5'}`,
      transition: 'border-color 0.25s',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '700 15px "Plus Jakarta Sans"', color: ink }}>{title}</div>
        <div style={{ font: '600 12px "Plus Jakarta Sans"', color: on ? '#0FAF75' : muted, marginTop: 2, transition: 'color 0.25s' }}>
          {on ? 'Enabled' : 'Disabled'}
        </div>
        <div style={{ font: '400 12px "Plus Jakarta Sans"', color: muted, marginTop: 4 }}>You can change this anytime in Settings.</div>
      </div>
      <LargeToggle on={on} onChange={onChange} />
    </div>
  )
}

// Each tile is something a project already supports: trips/events/plans are what people
// create them for; "Shared Goals" is the project target + budget breakdown.
const PROJECT_KINDS: { Icon: LucideIcon; title: string; detail: string; bg: string; fg: string }[] = [
  { Icon: Plane, title: 'Group Trips', detail: 'Travel with friends', bg: '#E6EAF7', fg: '#4A5FB0' },
  { Icon: PartyPopper, title: 'Events', detail: 'Weddings & parties', bg: '#F5E6EC', fg: '#B84D76' },
  { Icon: Users, title: 'Group Plans', detail: 'Shared activities', bg: '#E2EEE5', fg: '#2F7F52' },
  { Icon: Target, title: 'Shared Goals', detail: 'Plan expenses together', bg: '#F4EDDA', fg: '#9A7A24' },
]

const PROJECT_BENEFITS: { Icon: LucideIcon; text: string }[] = [
  { Icon: ReceiptText, text: 'Record shared expenses' },
  { Icon: UserPlus, text: 'Invite friends and family' },
  { Icon: Scale, text: 'See who owes whom' },
]

function SharedProjectsPage({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ width: '100%', maxWidth: PAGE_MAX_WIDTH, textAlign: 'left' }}>
      <PageHeader
        Icon={Users} title="Shared Projects" indigo
        tagline="Make plans together, track expenses together."
        description="Create shared spaces for trips, weddings and group activities. Know who paid, what was spent and who owes what."
      />

      <div style={{ ...card, padding: 14, marginBottom: 16 }}>
        <div style={{ font: '700 16px "Plus Jakarta Sans"', color: ink, margin: '2px 2px 12px' }}>What can you organize?</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {PROJECT_KINDS.map(({ Icon, title, detail, bg, fg }) => (
            <div key={title} style={{ background: bg, borderRadius: 14, padding: '12px 12px 13px' }}>
              <Icon size={18} style={{ color: fg }} />
              <div style={{ font: '700 14px "Plus Jakarta Sans"', color: ink, marginTop: 8 }}>{title}</div>
              <div style={{ font: '400 12px "Plus Jakarta Sans"', color: muted, marginTop: 2 }}>{detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18, padding: '0 2px' }}>
        {PROJECT_BENEFITS.map(({ Icon, text }) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon size={17} style={{ color: INDIGO, flexShrink: 0 }} />
            <span style={{ font: '500 14px "Plus Jakarta Sans"', color: ink }}>{text}</span>
          </div>
        ))}
      </div>

      <PreferenceCard title="Shared Projects" on={on} onChange={onChange} />
    </div>
  )
}

function SavingsInvestPage({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ width: '100%', maxWidth: PAGE_MAX_WIDTH, textAlign: 'left' }}>
      <PageHeader
        Icon={ChartColumnIncreasing} title="Savings & Investments"
        tagline="Make your money grow." taglineAccent
        description="Keep track of your SIPs, gold schemes, deposits and other contributions in one place."
      />

      <div style={{ font: '700 16px "Plus Jakarta Sans"', color: ink, marginBottom: 12 }}>What can you track?</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 10px', marginBottom: 20 }}>
        {SAVINGS_KINDS.map(({ Icon, label }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: 'rgba(22,201,138,0.12)', color: deepGreen,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={20} />
            </div>
            <span style={{ font: '600 12px "Plus Jakarta Sans"', color: muted, textAlign: 'center' }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {SAVINGS_BENEFITS.map(b => (
          <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CircleCheck size={17} style={{ color: '#16C98A', flexShrink: 0 }} />
            <span style={{ font: '500 14px "Plus Jakarta Sans"', color: ink }}>{b}</span>
          </div>
        ))}
      </div>

      <PreferenceCard title="Savings & Investments" on={on} onChange={onChange} />
    </div>
  )
}

function LendBorrowPage({ lend, borrow, onLend, onBorrow, onBoth }: {
  lend: boolean; borrow: boolean
  onLend: () => void; onBorrow: () => void; onBoth: () => void
}) {
  return (
    <div style={{ width: '100%', maxWidth: PAGE_MAX_WIDTH, textAlign: 'left' }}>
      <PageHeader
        Icon={HandCoins} title="Lend & Borrow"
        tagline="Keep track of every rupee." taglineAccent
        description="Money lent to friends? Borrowed from family? Keep everything organized."
      />

      <div role="group" aria-label="What describes you?">
        <div style={{ font: '700 16px "Plus Jakarta Sans"', color: ink }}>What describes you?</div>
        <div style={{ font: '400 12px "Plus Jakarta Sans"', color: muted, marginTop: 2, marginBottom: 12 }}>Choose all that apply.</div>
        <ChoiceRow kind="check" selected={lend} onClick={onLend}
          Icon={HandCoins} title="I lend money" detail="Track money others owe me" />
        <ChoiceRow kind="check" selected={borrow} onClick={onBorrow}
          Icon={Wallet} title="I borrow money" detail="Track money I owe others" />
        <ChoiceRow kind="check" selected={lend && borrow} onClick={onBoth}
          Icon={Users} title="Both" detail="I lend and borrow money" />
      </div>

      <div style={{
        marginTop: 6, display: 'flex', gap: 10, alignItems: 'flex-start',
        background: 'rgba(22,201,138,0.07)', border: '1px solid rgba(22,201,138,0.25)',
        borderRadius: 16, padding: '12px 14px',
      }}>
        <Info size={17} style={{ color: deepGreen, flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ font: '700 14px "Plus Jakarta Sans"', color: ink }}>You can add details later</div>
          <div style={{ font: '400 12px "Plus Jakarta Sans"', color: muted, lineHeight: 1.5, marginTop: 2 }}>
            No need to enter amounts or people's names now. You can start tracking whenever you need.
          </div>
        </div>
      </div>
    </div>
  )
}

function CardFields({ card, onChange, showNameError }: {
  card: CardDraft
  onChange: (patch: Partial<CardDraft>) => void
  showNameError: boolean
}) {
  return (<>
    <CardField label="Bank / Card name">
      <input
        value={card.name}
        onChange={e => onChange({ name: e.target.value })}
        placeholder="e.g. Axis Bank Visa"
        autoComplete="off"
        style={fieldInput}
      />
    </CardField>
    {showNameError && (
      <div style={{ font: '600 12px "Plus Jakarta Sans"', color: '#D64545', margin: '-4px 2px 10px' }}>
        Add the card name, or clear the other fields to skip it.
      </div>
    )}
    <CardField label="Credit limit (optional)">
      <AmountInput value={card.credit_limit} onChange={v => onChange({ credit_limit: v })} placeholder="Enter amount" />
    </CardField>
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <CardField label="Bill day (optional)">
          <DaySelect value={card.bill_day} onChange={v => onChange({ bill_day: v })} />
        </CardField>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <CardField label="Due day (optional)">
          <DaySelect value={card.due_day} onChange={v => onChange({ due_day: v })} />
        </CardField>
      </div>
    </div>
    <CardField label="Current outstanding (optional)">
      <AmountInput value={card.outstanding} onChange={v => onChange({ outstanding: v })} placeholder="What you owe on it today" />
    </CardField>
  </>)
}

function CreditCardPage({ choice, onChoice, cards, onCard, onAddCard, onRemoveCard, showErrors }: {
  choice: CardChoice
  onChoice: (c: Exclude<CardChoice, null>) => void
  cards: CardDraft[]
  onCard: (index: number, patch: Partial<CardDraft>) => void
  onAddCard: () => void
  onRemoveCard: (index: number) => void
  showErrors: boolean
}) {
  const canAddCard = !!cards[cards.length - 1]?.name.trim()
  return (
    <div style={{ width: '100%', maxWidth: PAGE_MAX_WIDTH, textAlign: 'left' }}>
      <PageHeader
        Icon={CreditCard} title="Credit Card Tracking"
        tagline="Stay on top of what you owe."
        description="Track credit card spending separately and never lose sight of upcoming payments."
      />

      <div role="radiogroup" aria-label="Do you have a credit card?">
        <div style={{ font: '700 16px "Plus Jakarta Sans"', color: ink, marginBottom: 12 }}>Do you have a credit card?</div>
        <ChoiceRow
          selected={choice === 'yes'} onClick={() => onChoice('yes')}
          Icon={CreditCard} title="Yes, I have a credit card" detail="I want to track my card spending."
        />
        <ChoiceRow
          selected={choice === 'no'} onClick={() => onChoice('no')}
          Icon={WalletCards} title="No, not yet" detail="I'll add one if I get a card later."
        />
      </div>

      {choice === 'yes' && (
        <div style={{ marginTop: 12, animation: 'foFadeUp 0.3s ease both' }}>
          <div style={{ font: '700 16px "Plus Jakarta Sans"', color: ink }}>
            {cards.length > 1 ? 'Add your cards' : 'Add your card'} <span style={{ color: muted, fontWeight: 500 }}>(optional)</span>
          </div>
          <div style={{ font: '400 12px "Plus Jakarta Sans"', color: muted, marginTop: 2, marginBottom: 12 }}>
            Add as many as you use, or more later from Credit Cards.
          </div>

          {cards.map((card, i) => (
            <div key={i} style={cards.length > 1 ? {
              border: '1px solid #E0D9D0', borderRadius: 18, padding: '12px 12px 2px', marginBottom: 12,
            } : undefined}>
              {cards.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 10px' }}>
                  <span style={{ font: '700 13px "Plus Jakarta Sans"', color: ink }}>Card {i + 1}</span>
                  <button
                    onClick={() => onRemoveCard(i)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      display: 'flex', alignItems: 'center', gap: 4,
                      font: '600 12px "Plus Jakarta Sans"', color: muted,
                    }}
                  >
                    <X size={14} /> Remove
                  </button>
                </div>
              )}
              <CardFields card={card} onChange={patch => onCard(i, patch)} showNameError={showErrors && cardDetailsWithoutName(card)} />
            </div>
          ))}

          {/* Only after the newest card has a name — a name is what makes it a card, so no stacking empty forms */}
          <button
            onClick={onAddCard}
            disabled={!canAddCard}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: 'none', border: `1.5px dashed ${canAddCard ? '#C8C2BB' : '#DDD6CD'}`, borderRadius: 14,
              padding: '12px', marginBottom: 12, cursor: canAddCard ? 'pointer' : 'default',
              font: '700 14px "Plus Jakarta Sans"', color: canAddCard ? deepGreen : '#B0A9A1',
              transition: 'color 0.2s, border-color 0.2s',
            }}
          >
            <Plus size={16} strokeWidth={2.5} /> Add another card
          </button>

          <div style={{ font: '400 12px "Plus Jakarta Sans"', color: muted, lineHeight: 1.5, padding: '0 2px' }}>
            Without dates, the bill is set for the {ordinal(DEFAULT_BILL_DAY)} and due on the {ordinal(DEFAULT_DUE_DAY)}. You can change them on the card anytime.
            <br />Never enter your full card number, CVV or PIN.
          </div>
        </div>
      )}

      {choice === 'no' && (
        <div style={{
          marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-start',
          background: 'rgba(22,201,138,0.07)', border: '1px solid rgba(22,201,138,0.25)',
          borderRadius: 16, padding: '14px 16px', animation: 'foFadeUp 0.3s ease both',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 16, background: '#16C98A', color: '#fff', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={17} strokeWidth={3} />
          </div>
          <div>
            <div style={{ font: '700 14px "Plus Jakarta Sans"', color: deepGreen }}>No credit card? No problem!</div>
            <div style={{ font: '400 13px "Plus Jakarta Sans"', color: muted, lineHeight: 1.55, marginTop: 3 }}>
              You can start tracking your credit cards anytime. Just enable Credit Card Tracking from Settings when you get one.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function FeatureOnboarding({ onComplete, onBack }: Props) {
  const [page, setPage] = useState(0)
  const [done, setDone] = useState(false)
  const [enabled, setEnabled] = useState<Record<FeatureKey, boolean>>(
    () => Object.fromEntries(PAGES.map(f => [f.key, f.defaultOn])) as Record<FeatureKey, boolean>
  )

  const cur = PAGES[page]
  const isLast = page === PAGES.length - 1
  const on = enabled[cur.key]

  // Credit cards ask Yes/No instead of a switch; no answer counts as No (tracking stays off).
  const [cardChoice, setCardChoice] = useState<CardChoice>(null)
  const [cards, setCards] = useState<CardDraft[]>([EMPTY_CARD])
  const [showCardErrors, setShowCardErrors] = useState(false)
  const isCardPage = cur.key === 'track_credit_cards'

  // Lend & Borrow: two independent answers feeding the one track_borrowings setting —
  // on if either is picked, off if neither. Which side isn't stored.
  const [lends, setLends] = useState(false)
  const [borrows, setBorrows] = useState(false)
  const isLendPage = cur.key === 'track_borrowings'
  const isSavingsPage = cur.key === 'track_savings'
  const isProjectsPage = cur.key === 'track_projects'
  const customPage = cur.featured || isCardPage || isLendPage || isSavingsPage || isProjectsPage
  const setLendBorrow = (lend: boolean, borrow: boolean) => {
    setLends(lend); setBorrows(borrow)
    setEnabled(prev => ({ ...prev, track_borrowings: lend || borrow }))
  }

  const handleBack = () => page === 0 ? onBack() : setPage(p => p - 1)
  const handleNext = () => {
    if (isCardPage && cardChoice === 'yes' && cards.some(cardDetailsWithoutName)) { setShowCardErrors(true); return }
    if (isLast) setDone(true)
    else setPage(p => p + 1)
  }
  const setOn = (v: boolean) => setEnabled(prev => ({ ...prev, [cur.key]: v }))
  const chooseCard = (c: Exclude<CardChoice, null>) => {
    setCardChoice(c)
    setEnabled(prev => ({ ...prev, track_credit_cards: c === 'yes' }))
  }
  const editCard = (index: number, patch: Partial<CardDraft>) =>
    setCards(prev => prev.map((c, i) => i === index ? { ...c, ...patch } : c))
  const addCard = () => setCards(prev => [...prev, EMPTY_CARD])
  const removeCard = (index: number) => setCards(prev => prev.filter((_, i) => i !== index))

  if (done) return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#EDE7DD',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      padding: '0 32px',
      animation: 'foFadeUp 0.4s ease both',
    }}>
      {/* Check mark */}
      <div style={{
        width: 72, height: 72, borderRadius: 24,
        background: '#1C1410',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 28,
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16C98A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>

      <div style={{ font: '800 26px "Plus Jakarta Sans"', color: '#1C1410', letterSpacing: '-0.025em', marginBottom: 10, textAlign: 'center' }}>
        Setup Complete
      </div>
      <div style={{ font: '600 15px "Plus Jakarta Sans"', color: '#16C98A', marginBottom: 16, textAlign: 'center' }}>
        MoneyPlant is ready.
      </div>
      <div style={{ font: '400 14px "Plus Jakarta Sans"', color: '#8A8178', lineHeight: 1.7, textAlign: 'center', maxWidth: 280, marginBottom: 44 }}>
        Your accounts, budget and preferences have been configured.
      </div>

      <button
        onClick={() => onComplete(enabled, cardChoice === 'yes' ? cards.filter(c => c.name.trim()) : [])}
        style={{
          width: '100%', maxWidth: 320, padding: '16px',
          background: '#1C1410', color: '#EDE7DD',
          border: 'none', borderRadius: 16,
          font: '700 15px "Plus Jakarta Sans"',
          cursor: 'pointer', letterSpacing: '-0.01em',
        }}
      >
        Go to Dashboard
      </button>

      <style>{`
        @keyframes foFadeUp {
          from { opacity: 0; transform: translateY(16px) }
          to   { opacity: 1; transform: translateY(0) }
        }
      `}</style>
    </div>
  )

  const iconBg = cur.featured && on
    ? 'linear-gradient(135deg, #0FAF75, #16C98A)'
    : on ? 'rgba(22,201,138,0.12)' : '#E4DDD5'
  const iconColor = cur.featured && on ? '#fff' : on ? '#16C98A' : '#9C9188'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#EDE7DD',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: `calc(14px + env(safe-area-inset-top,0px)) 20px 0`,
        gap: 0,
      }}>
        <button
          onClick={handleBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#8A8178', padding: '8px',
            display: 'flex', alignItems: 'center', gap: 4,
            font: '600 13px "Plus Jakarta Sans"',
          }}
        >
          <BackArrow /> Back
        </button>

        {/* Progress dots */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 6 }}>
          {PAGES.map((_, i) => (
            <div key={i} style={{
              height: 6, borderRadius: 999,
              width: i === page ? 22 : 6,
              background: i <= page ? '#16C98A' : '#D4CEC8',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* Step counter — same width as the back button keeps the dots centred */}
        <div style={{ width: 72, textAlign: 'right', padding: '8px', font: '600 13px "Plus Jakarta Sans"', color: '#8A8178' }}>
          {page + 1} of {PAGES.length}
        </div>
      </div>

      {/* Page content — key forces remount + animation on page change */}
      <div
        key={page}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: customPage ? 'flex-start' : 'center',
          padding: cur.featured ? '16px 16px 16px' : customPage ? '16px 20px 16px' : '0 32px 16px',
          textAlign: 'center',
          overflowY: 'auto', overscrollBehavior: 'contain',
          animation: 'foFadeUp 0.32s ease both',
        }}
      >
        {cur.featured ? <MintAIPage /> : isProjectsPage ? (
          <SharedProjectsPage on={on} onChange={setOn} />
        ) : isSavingsPage ? (
          <SavingsInvestPage on={on} onChange={setOn} />
        ) : isLendPage ? (
          <LendBorrowPage
            lend={lends} borrow={borrows}
            onLend={() => setLendBorrow(!lends, borrows)}
            onBorrow={() => setLendBorrow(lends, !borrows)}
            onBoth={() => setLendBorrow(!(lends && borrows), !(lends && borrows))}
          />
        ) : isCardPage ? (
          <CreditCardPage
            choice={cardChoice}
            onChoice={chooseCard}
            cards={cards}
            onCard={editCard}
            onAddCard={addCard}
            onRemoveCard={removeCard}
            showErrors={showCardErrors}
          />
        ) : (<>
          {/* Icon */}
          <div style={{
            width: 76, height: 76, borderRadius: 24,
            background: iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: iconColor,
            marginBottom: 24,
            transition: 'all 0.3s ease',
          }}>
            <cur.Icon size={30} />
          </div>

          {/* Label */}
          <div style={{
            font: '800 26px "Plus Jakarta Sans"',
            color: '#1C1410', letterSpacing: '-0.025em', marginBottom: 5,
          }}>
            {cur.label}
          </div>

          {/* Subtitle */}
          <div style={{
            font: '600 13px "Plus Jakarta Sans"',
            color: '#8A8178',
            marginBottom: 20,
          }}>
            {cur.subtitle}
          </div>

          {/* Description */}
          <div style={{
            font: '400 14px "Plus Jakarta Sans"',
            color: '#8A8178', lineHeight: 1.72,
            marginBottom: 36, maxWidth: 320,
            whiteSpace: 'pre-line',
          }}>
            {cur.description}
          </div>

          {/* Toggle + status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: '#FBF8F4', borderRadius: 16,
            padding: '14px 20px',
            border: `1.5px solid ${on ? 'rgba(22,201,138,0.3)' : '#E0D9D0'}`,
            transition: 'border-color 0.25s',
          }}>
            <LargeToggle on={on} onChange={setOn} />
            <div style={{ textAlign: 'left' }}>
              <div style={{
                font: '700 14px "Plus Jakarta Sans"',
                color: on ? '#16C98A' : '#1C1410',
                transition: 'color 0.25s',
              }}>
                {on ? 'Enabled' : 'Disabled'}
              </div>
              <div style={{ font: '400 12px "Plus Jakarta Sans"', color: '#B0A9A1', marginTop: 1 }}>
                {on ? 'Tap to turn off' : 'Tap to enable'}
              </div>
            </div>
          </div>
        </>)}
      </div>

      {/* Footer */}
      <div style={{
        padding: `0 20px calc(28px + env(safe-area-inset-bottom,0px))`,
      }}>
        <button
          onClick={handleNext}
          style={{
            width: '100%', maxWidth: PAGE_MAX_WIDTH, margin: '0 auto', padding: '16px',
            background: '#1C1410', color: '#EDE7DD',
            border: 'none', borderRadius: 16,
            font: '700 15px "Plus Jakarta Sans"',
            cursor: 'pointer', letterSpacing: '-0.01em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {isLast ? "Let's go" : <>Continue <ArrowRight size={18} strokeWidth={2.5} /></>}
        </button>
      </div>

      <style>{`
        @keyframes foFadeUp {
          from { opacity: 0; transform: translateY(16px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes foFloat {
          0%, 100% { translate: 0 0 }
          50%      { translate: 0 -4px }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="foFloat"] { animation: none !important }
        }
      `}</style>
    </div>
  )
}
