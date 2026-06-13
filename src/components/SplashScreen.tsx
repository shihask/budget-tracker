import { useEffect, useState } from 'react'
import { MintAnimation } from './MintAnimation'

const WORDS    = ['Know', 'Plan', 'Afford', 'Grow']
const FORM_MS  = 1200
const WORD_MS  = 900
const P2_START = FORM_MS + WORDS.length * WORD_MS   // ~4.8 s
const P2_HOLD  = 1600                                // brand reveal hold

interface Props {
  onContinue: () => void
  initialPhase?: 1 | 2 | 3
}

export function SplashScreen({ onContinue, initialPhase = 1 }: Props) {
  const [wordIdx, setWordIdx] = useState(-1)
  const [phase, setPhase]     = useState<1 | 2 | 3>(initialPhase)

  useEffect(() => {
    if (initialPhase !== 1) return
    const t: ReturnType<typeof setTimeout>[] = []
    WORDS.forEach((_, i) =>
      t.push(setTimeout(() => setWordIdx(i), FORM_MS + i * WORD_MS))
    )
    t.push(setTimeout(() => { setPhase(2); setWordIdx(-1) }, P2_START))
    t.push(setTimeout(() => setPhase(3), P2_START + P2_HOLD))
    return () => t.forEach(clearTimeout)
  }, [initialPhase])

  const handleClick = () => {
    if (phase === 1) setPhase(2)
    else if (phase === 2) setPhase(3)
    // phase 3: only the button calls onContinue; background tap does nothing
  }

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#EDE7DD',
        cursor: phase < 3 ? 'pointer' : 'default',
        userSelect: 'none', WebkitUserSelect: 'none',
        overflow: 'hidden',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
    >

      {/* ── Phases 1 & 2 — centered animation ───────────────────────── */}
      {phase < 3 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <MintAnimation variant="transform" size={164} style={{ borderRadius: '22.5%' }} />

          {/* Phase 1 — cycling word */}
          {phase === 1 && (
            <>
              <div style={{
                marginTop: 48, height: 56,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {wordIdx >= 0 && (
                  <span key={wordIdx} style={{
                    font: `800 42px Plus Jakarta Sans`,
                    letterSpacing: '-0.03em', color: '#1C1410',
                    animation: `mpWord ${WORD_MS}ms ease forwards`,
                  }}>
                    {WORDS[wordIdx]}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
                {WORDS.map((_, i) => (
                  <div key={i} style={{
                    width: 5, height: 5, borderRadius: 999,
                    background: i === wordIdx ? '#16C98A' : '#C8C0B4',
                    transition: 'background 0.3s',
                  }} />
                ))}
              </div>
            </>
          )}

          {/* Phase 2 — brand reveal */}
          {phase === 2 && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <div style={{
                font: '800 30px Plus Jakarta Sans', letterSpacing: '-0.025em',
                animation: 'mpFadeUp 0.6s ease both',
              }}>
                <span style={{ color: '#1C1410' }}>Money</span>
                <span style={{ color: '#16C98A' }}>Plant</span>
              </div>
              <div style={{
                marginTop: 16, font: '500 14px Plus Jakarta Sans', color: '#8A8178',
                animation: 'mpFadeUp 0.55s 0.35s ease both',
              }}>
                Plan Smart. Grow Better.
              </div>
              <div style={{
                marginTop: 24, font: '400 11px Plus Jakarta Sans', color: '#16C98A',
                letterSpacing: '0.02em',
                animation: 'mpFadeIn 0.5s 0.8s ease both',
              }}>
                Powered by Mint AI ✦
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Phase 3 — Welcome ────────────────────────────────────────── */}
      {phase === 3 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 32px',
          animation: 'mpFadeIn 0.4s ease both',
        }}>

          {/* Logo — smaller now that animation is done */}
          <div style={{ animation: 'mpFadeUp 0.45s ease both' }}>
            <MintAnimation variant="transform" size={96} style={{ borderRadius: '22.5%' }} />
          </div>

          {/* Brand */}
          <div style={{ textAlign: 'center', marginTop: 16, animation: 'mpFadeUp 0.45s 0.08s ease both' }}>
            <div style={{ font: '800 28px Plus Jakarta Sans', letterSpacing: '-0.025em' }}>
              <span style={{ color: '#1C1410' }}>Money</span>
              <span style={{ color: '#16C98A' }}>Plant</span>
            </div>
            <div style={{ marginTop: 5, font: '500 13px Plus Jakarta Sans', color: '#8A8178' }}>
              Plan Smart. Grow Better.
            </div>
          </div>

          {/* Divider */}
          <div style={{
            width: '55%', height: 1, background: '#D4CEC8',
            margin: '22px 0',
            animation: 'mpFadeIn 0.4s 0.18s ease both',
          }} />

          {/* Welcome text */}
          <div style={{ textAlign: 'center', animation: 'mpFadeUp 0.45s 0.22s ease both' }}>
            <div style={{
              font: '700 18px Plus Jakarta Sans',
              color: '#1C1410', marginBottom: 10,
            }}>
              Welcome! 🌱
            </div>
            <div style={{
              font: '500 14px Plus Jakarta Sans',
              color: '#8A8178', lineHeight: 1.7,
            }}>
              Your personal finance companion.
              <br />
              Let's set up your finances in under a minute.
            </div>
          </div>

          {/* Continue button */}
          <button
            onClick={e => { e.stopPropagation(); onContinue() }}
            style={{
              marginTop: 32,
              width: '100%', maxWidth: 320,
              padding: '15px',
              background: '#16C98A', color: '#fff',
              border: 'none', borderRadius: 14,
              font: '700 15px Plus Jakarta Sans',
              cursor: 'pointer', letterSpacing: '-0.01em',
              boxShadow: '0 4px 18px rgba(22,201,138,0.3)',
              animation: 'mpFadeUp 0.45s 0.32s ease both',
            }}
          >
            Continue
          </button>
        </div>
      )}

      <style>{`
        @keyframes mpWord {
          0%   { opacity: 0; transform: translateY(10px) }
          18%  { opacity: 1; transform: translateY(0) }
          78%  { opacity: 1; transform: translateY(0) }
          100% { opacity: 0; transform: translateY(-5px) }
        }
        @keyframes mpFadeUp {
          from { opacity: 0; transform: translateY(14px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes mpFadeIn {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
      `}</style>
    </div>
  )
}
