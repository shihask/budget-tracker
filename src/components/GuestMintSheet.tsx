import type { CSSProperties } from 'react'
import { Sparkles, Tags, MessageCircle, Search, Wallet, Lock, type LucideIcon } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from './BottomSheet'

// What a guest sees on tapping the Mint button: guests can't use AI (the
// server refuses them), so this explains Mint and offers to save the account.

// The Mint mark's two shapes (public/mint-ai-logo.svg), on a 512 grid.
const LEAF_PATH = 'M101 395.49C236.782 395.49 330.786 318.895 363.861 177.89C228.078 177.89 134.075 254.485 101 395.49Z'
const VEIN_PATH = 'M119.93 377.33C187.33 296.93 259.29 245.87 354.43 186.33'
const SPARKLE_PATH = 'M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z'

// Watermark scatter, like the Affordability tile's: [kind, position, size, rotation, opacity].
const WATERMARKS: ['leaf' | 'sparkle', CSSProperties, number, number, number][] = [
  ['leaf',    { right: -40, top: -20 },   150, 14,  0.07],
  ['sparkle', { left: 18, top: 24 },      34,  -12, 0.16],
  ['sparkle', { left: 54, top: 96 },      20,  30,  0.12],
  ['leaf',    { left: -78, top: 350 },    130, -28, 0.06],
  ['sparkle', { right: 14, top: 400 },    30,  18,  0.12],
  ['sparkle', { left: '46%', top: 470 },  18,  45,  0.10],
  ['leaf',    { right: -44, bottom: -36 }, 120, 22, 0.06],
  ['sparkle', { left: 22, bottom: 40 },   22,  -20, 0.12],
]

function Watermark({ kind, style, size, rotate, opacity, color, veinColor }: { kind: 'leaf' | 'sparkle'; style: CSSProperties; size: number; rotate: number; opacity: number; color: string; veinColor: string }) {
  // The sparkle sits in one corner of the 512 grid; crop to it so `size` is the sparkle's own size.
  const viewBox = kind === 'sparkle' ? '356 115 58 70' : '0 0 512 512'
  return (
    <svg viewBox={viewBox} aria-hidden style={{ position: 'absolute', width: size, height: size, opacity, transform: `rotate(${rotate}deg)`, pointerEvents: 'none', ...style }}>
      {kind === 'leaf' ? <>
        <path d={LEAF_PATH} fill={color} />
        <path d={VEIN_PATH} stroke={veinColor} strokeWidth="12.288" strokeLinecap="round" />
      </> : <path d={SPARKLE_PATH} fill={color} />}
    </svg>
  )
}

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
      <div style={{ position: 'relative', overflow: 'hidden', padding: '0 4px 16px' }}>
        {WATERMARKS.map(([kind, style, size, rotate, opacity], i) => (
          <Watermark key={i} kind={kind} style={style} size={size} rotate={rotate} opacity={opacity} color={c.accent} veinColor={c.surface} />
        ))}
        <div style={{ position: 'relative' }}>
        {/* The one decorative use of the thinking loop (CLAUDE.md): an intro, where no AI request is ever pending. */}
        <div style={{
          width: 96, height: 96, borderRadius: '50%', margin: '0 auto 8px',
          background: `radial-gradient(circle, ${c.accent}33 0%, ${c.accent}14 55%, transparent 72%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 70, height: 70, borderRadius: '50%', background: c.surface, boxShadow: `0 0 0 1.5px ${c.accent}2E, 0 6px 18px ${c.accent}33`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/mint-thinking-loop.svg" width="68" height="68" alt="Mint AI" style={{ display: 'block' }} />
          </div>
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
      </div>
    </BottomSheet>
  )
}
