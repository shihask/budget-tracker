import { Sprout, Sparkles, Tags, MessageCircle, Search, Wallet, Lock, type LucideIcon } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from './BottomSheet'

// What a guest sees on tapping the Mint button: guests can't use AI (the
// server refuses them), so this explains Mint and offers to save the account.
const CAPABILITIES: { Icon: LucideIcon; label: string }[] = [
  { Icon: Tags,          label: 'Automatically categorize expenses' },
  { Icon: MessageCircle, label: 'Ask questions about your money' },
  { Icon: Search,        label: 'Find transactions instantly' },
  { Icon: Wallet,        label: 'Check whether you can afford something' },
]

interface Props {
  open: boolean
  onClose: () => void
  onSave: () => void
}

export function GuestMintSheet({ open, onClose, onSave }: Props) {
  const c = useTheme()

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false} zIndex={205}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: '#1C1410', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <Sprout size={22} color={c.accent} />
        </div>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ font: '800 21px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Meet Mint AI</div>
          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.accent, marginTop: 6 }}>Your personal money assistant</div>
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 8 }}>More than expense tracking. A smarter way to manage your money.</div>
        </div>

        <div style={{ background: c.surface, borderRadius: 16, padding: 12, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>You ask Mint</span>
            <span style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, background: c.accentSoft, borderRadius: 999, padding: '2px 8px' }}>Example</span>
          </div>
          <div style={{ background: c.surface2, borderRadius: 10, padding: '10px 12px', font: '500 13px Plus Jakarta Sans', color: c.ink }}>
            How much did I spend on food this month?
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '12px 0 8px', font: '600 12px Plus Jakarta Sans', color: c.accent }}>
            <Sparkles size={14} /> Mint answers
          </div>
          <div style={{ background: c.accentSoft, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ font: '700 17px Plus Jakarta Sans', color: c.accent, marginBottom: 6 }}>₹4,250</div>
            <div style={{ font: '500 11px Plus Jakarta Sans', color: c.sub, lineHeight: 1.5 }}>
              Your food spending this month.<br />You can explore your transactions and spending patterns with me!
            </div>
          </div>
        </div>

        <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>With Mint, you can:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
          {CAPABILITIES.map(({ Icon, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, font: '500 13px Plus Jakarta Sans', color: c.ink }}>
              <Icon size={15} color={c.accent} style={{ flexShrink: 0 }} /> {label}
            </div>
          ))}
        </div>

        <div style={{ background: c.accentSoft, borderRadius: 14, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>
            <Lock size={14} /> Unlock Mint AI
          </div>
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, lineHeight: 1.5, marginBottom: 6 }}>
            Create a free account to activate Mint and keep your existing guest entries.
          </div>
          <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
            Your expense tracking works even without Mint. You can turn off Mint anytime in Settings.
          </div>
        </div>

        <button
          onClick={onSave}
          style={{ width: '100%', border: 'none', borderRadius: 12, padding: 14, background: '#1C1410', color: '#FBF8F4', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
        >
          Create free account →
        </button>
        <button
          onClick={onClose}
          style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', color: c.muted, font: '600 13px Plus Jakarta Sans', cursor: 'pointer' }}
        >
          Not now
        </button>
      </div>
    </BottomSheet>
  )
}
