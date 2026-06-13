import { useEffect, useState } from 'react'
import { MintAnimation } from './MintAnimation'

const WORDS    = ['Know', 'Plan', 'Afford', 'Grow']
const FORM_MS  = 1200
const WORD_MS  = 900
const P2_START = FORM_MS + WORDS.length * WORD_MS   // ~4.8 s
const P2_HOLD  = 1800                                // brand reveal hold

interface Props { onContinue: () => void }

export function SplashScreen({ onContinue }: Props) {
  const [wordIdx, setWordIdx] = useState(-1)
  const [phase, setPhase]     = useState<1 | 2 | 3>(1)

  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = []
    WORDS.forEach((_, i) =>
      t.push(setTimeout(() => setWordIdx(i), FORM_MS + i * WORD_MS))
    )
    t.push(setTimeout(() => { setPhase(2); setWordIdx(-1) }, P2_START))
    t.push(setTimeout(() => setPhase(3), P2_START + P2_HOLD))
    return () => t.forEach(clearTimeout)
  }, [])

  const handleClick = () => {
    if (phase === 1) setPhase(2)
    else if (phase === 2) setPhase(3)
    else onContinue()
  }

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#EDE7DD',
        cursor: 'pointer',
        userSelect: 'none', WebkitUserSelect: 'none',
        overflow: 'hidden',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
    >
      {/* ── Top block — logo + words (phase 1) or brand (phase 2+) ─── */}
      {/* In phase 3 it translates upward so its bottom lands at 50%+30px */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        top: '50%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        transform: phase === 3
          ? 'translateY(calc(-100% + 30px))'   // bottom sits 30 px below half-point
          : 'translateY(-50%)',                 // perfectly centred
        transition: phase === 3
          ? 'transform 0.72s cubic-bezier(0.32, 0.72, 0, 1)'
          : 'none',
      }}>
        <MintAnimation variant="transform" size={164} style={{ borderRadius: '22.5%' }} />

        {/* Phase 1 — cycling word (fixed-size slot keeps height consistent) */}
        <div style={{
          marginTop: 48, height: 56,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {phase === 1 && wordIdx >= 0 && (
            <span key={wordIdx} style={{
              font: `800 42px Plus Jakarta Sans`,
              letterSpacing: '-0.03em',
              color: '#1C1410',
              animation: `mpWord ${WORD_MS}ms ease forwards`,
            }}>
              {WORDS[wordIdx]}
            </span>
          )}
        </div>

        {/* Phase 1 — progress dots (fixed-size slot) */}
        <div style={{ height: 21, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {phase === 1 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {WORDS.map((_, i) => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: 999,
                  background: i === wordIdx ? '#16C98A' : '#C8C0B4',
                  transition: 'background 0.3s',
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Phase 2 + 3 — brand reveal */}
        {phase >= 2 && (
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <div style={{
              font: '800 30px Plus Jakarta Sans',
              letterSpacing: '-0.025em',
              animation: phase === 2 ? 'mpFadeUp 0.6s ease both' : 'none',
            }}>
              <span style={{ color: '#1C1410' }}>Money</span>
              <span style={{ color: '#16C98A' }}>Plant</span>
            </div>
            <div style={{
              marginTop: 18,
              font: '500 14px Plus Jakarta Sans',
              color: '#8A8178',
              animation: phase === 2 ? 'mpFadeUp 0.55s 0.4s ease both' : 'none',
            }}>
              Plan Smart. Grow Better.
            </div>
            <div style={{
              marginTop: 28,
              font: '400 11px Plus Jakarta Sans',
              color: '#16C98A',
              letterSpacing: '0.02em',
              animation: phase === 2 ? 'mpFadeIn 0.5s 0.9s ease both' : 'none',
            }}>
              Powered by Mint AI ✦
            </div>
          </div>
        )}
      </div>

      {/* ── Welcome block — fades in below the top block in phase 3 ─── */}
      {phase === 3 && (
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          top: '50%',
          transform: 'translateY(56px)',   // 56 px below the mid-point
          padding: '0 36px',
          textAlign: 'center',
          animation: 'mpFadeUp 0.55s 0.45s ease both',
        }}>
          <div style={{
            font: '800 23px Plus Jakarta Sans',
            letterSpacing: '-0.025em',
            color: '#1C1410',
            marginBottom: 10,
          }}>
            Welcome to{' '}
            <span style={{ color: '#16C98A' }}>MoneyPlant</span>
          </div>
          <div style={{
            font: '500 13.5px Plus Jakarta Sans',
            color: '#8A8178',
            lineHeight: 1.68,
          }}>
            Your personal finance companion.
            <br />
            Let's set up your finances in under a minute.
          </div>

          {/* Tap hint */}
          <div style={{
            marginTop: 48,
            font: '500 12px Plus Jakarta Sans',
            color: '#B8B0A8',
            letterSpacing: '0.02em',
            animation: 'mpPulse 2s 1s ease-in-out infinite',
          }}>
            Tap anywhere to continue
          </div>
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
        @keyframes mpPulse {
          0%, 100% { opacity: 0.32 }
          50%      { opacity: 1 }
        }
      `}</style>
    </div>
  )
}
