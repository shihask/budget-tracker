import { useEffect, useState } from 'react'
import { MintAnimation } from './MintAnimation'

const WORDS    = ['Know', 'Plan', 'Afford', 'Grow']
const FORM_MS  = 1200                               // formation settles
const WORD_MS  = 900                                // each word on-screen
const P2_START = FORM_MS + WORDS.length * WORD_MS  // ~4.8 s
const P2_HOLD  = 1800                               // brand reveal hold

interface Props { onDone: () => void }

export function SplashScreen({ onDone }: Props) {
  const [wordIdx, setWordIdx] = useState(-1)
  const [phase, setPhase]     = useState<1 | 2>(1)

  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = []

    WORDS.forEach((_, i) =>
      t.push(setTimeout(() => setWordIdx(i), FORM_MS + i * WORD_MS))
    )

    t.push(setTimeout(() => { setPhase(2); setWordIdx(-1) }, P2_START))
    t.push(setTimeout(onDone, P2_START + P2_HOLD))

    return () => t.forEach(clearTimeout)
  }, [onDone])

  return (
    <div
      onClick={onDone}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#EDE7DD',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      <MintAnimation variant="transform" size={164} style={{ borderRadius: '22.5%' }} />

      {/* Phase 1 — cycling words */}
      <div style={{ marginTop: 48, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {phase === 1 && wordIdx >= 0 && (
          <span
            key={wordIdx}
            style={{
              font: '800 42px Plus Jakarta Sans',
              letterSpacing: '-0.03em',
              color: '#1C1410',
              animation: `mpWord ${WORD_MS}ms ease forwards`,
            }}
          >
            {WORDS[wordIdx]}
          </span>
        )}
      </div>

      {/* Progress dots */}
      {phase === 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
          {WORDS.map((_, i) => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: 999,
              background: i === wordIdx ? '#16C98A' : '#C8C0B4',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
      )}

      {/* Phase 2 — brand reveal */}
      {phase === 2 && (
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <div style={{
            font: '800 30px Plus Jakarta Sans',
            letterSpacing: '-0.025em',
            animation: 'mpFadeUp 0.6s ease both',
          }}>
            <span style={{ color: '#1C1410' }}>Money</span>
            <span style={{ color: '#16C98A' }}>Plant</span>
          </div>
          <div style={{
            marginTop: 20,
            font: '500 14px Plus Jakarta Sans',
            color: '#8A8178',
            animation: 'mpFadeUp 0.55s 0.4s ease both',
          }}>
            Plan Smart. Grow Better.
          </div>
          <div style={{
            marginTop: 32,
            font: '400 11px Plus Jakarta Sans',
            color: '#16C98A',
            letterSpacing: '0.01em',
            animation: 'mpFadeIn 0.5s 0.9s ease both',
          }}>
            Powered by Mint AI ✦
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
      `}</style>
    </div>
  )
}
