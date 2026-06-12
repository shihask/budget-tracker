import { useEffect, useRef } from 'react'

/* ============================================================================
   MoneyPlant ⇄ Mint AI brand animations — ported from the brand-system file.
   variant="transform" : logo-forms → boomerangs MoneyPlant ⇄ Mint (splash/onboarding)
   variant="thinking"  : Mint leaf + orb→sparkle loop (~1.7s) for AI "thinking"
   Pure SVG + requestAnimationFrame, no dependencies. Each instance self-contained.
   ============================================================================ */

/* ---- exact logo geometry ---- */
const LEFT_LEAF_D  = 'M49.4 33.5 C 41.6 33.5 36.2 29.1 34.3 21 C 42.1 21 47.5 25.4 49.4 33.5 Z'
const RIGHT_LEAF_D = 'M50.6 33.5 C 58.4 33.5 63.8 29.1 65.7 21 C 57.9 21 52.5 25.4 50.6 33.5 Z'
const SPARKLE_D    = 'M 0 -8 C 0.55 -3.2 1.15 -1.35 6.4 0 C 1.15 1.35 0.55 3.2 0 8 C -0.55 3.2 -1.15 1.35 -6.4 0 C -1.15 -1.35 -0.55 -3.2 0 -8 Z'
const ORB_PATH_D   = 'M50 64 L50.6 33.5 C 52.5 25.4 57.9 21 65.7 21'
const RIB_D        = 'M30 70 C 44 56 58 44 72 33'
const LEFT_VEIN_D  = 'M48.6 32.4 C 43.6 30 39 26.4 35.2 21.7'
const RIGHT_VEIN_D = 'M51.4 32.4 C 56.4 30 61 26.4 64.8 21.7'
const STEM_D       = 'M50 42 V 26'

const TIP        = { x: 65.7, y: 21 }
const SPARK_HOME = { x: 84, y: 22 }
const MINT_TX = -147.71, MINT_TY = -39.65, MINT_S = 3.4
const LEAF_ROOT = { x: 50, y: 33.5 }

/* ---- easing ---- */
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ph = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
const io = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
const oc = (t: number) => 1 - Math.pow(1 - t, 3)
const backOut = (t: number) => { const c = 2.0; t -= 1; return 1 + t * t * ((c + 1) * t + c) }
const bump = (p: number, a: number, b: number) => { const k = ph(p, a, b); return Math.sin(k * Math.PI) }

let UID = 0
type Inst = Record<string, any>

function buildXform(container: HTMLElement): Inst {
  const u = 'x' + (UID++)
  container.innerHTML = `
  <svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"
       style="display:block;border-radius:22.5%;box-shadow:0 14px 40px rgba(16,50,38,.22);overflow:visible;">
    <defs>
      <linearGradient id="${u}bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#16C98A"/><stop offset="100%" stop-color="#0A7A56"/>
      </linearGradient>
      <radialGradient id="${u}orb" cx="38%" cy="34%" r="68%">
        <stop offset="0%" stop-color="#FFFFFF"/><stop offset="38%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#FFFFFF"/>
      </radialGradient>
      <radialGradient id="${u}glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.9"/>
        <stop offset="55%" stop-color="#FFFFFF" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="${u}spk" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#FFFFFF"/>
      </linearGradient>
      <clipPath id="${u}clip"><rect width="100" height="100" rx="22.5"/></clipPath>
      <filter id="${u}soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.7"/></filter>
      <filter id="${u}softlg" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.2"/></filter>
    </defs>
    <g clip-path="url(#${u}clip)">
      <rect width="100" height="100" fill="url(#${u}bg)"/>
      <circle class="js-cglow" cx="50" cy="64" r="26" fill="url(#${u}glow)" opacity="0"/>
      <g class="js-coin">
        <circle cx="50" cy="64" r="25.5" fill="none" stroke="#FFFFFF" stroke-width="5.2"/>
        <circle cx="50" cy="64" r="19.5" fill="none" stroke="#FFFFFF" stroke-width="1.6" opacity="0.45"/>
      </g>
      <g class="js-rupee" transform="translate(50,65.5)">
        <text x="0" y="0" text-anchor="middle" dominant-baseline="central"
              font-family="'Plus Jakarta Sans',system-ui,sans-serif" font-weight="800" font-size="30" fill="#FFFFFF">&#8377;</text>
      </g>
      <path class="js-stem" d="${STEM_D}" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round"/>
      <path class="js-stemlit" d="${STEM_D}" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" opacity="0" filter="url(#${u}soft)"/>
      <g class="js-lleaf"><path d="${LEFT_LEAF_D}" fill="#FFFFFF"/><path d="${LEFT_VEIN_D}" fill="none" stroke="#0E9268" stroke-width="0.85" stroke-linecap="round"/></g>
      <g class="js-rglow" opacity="0"><path d="${RIGHT_LEAF_D}" fill="#FFFFFF" filter="url(#${u}softlg)"/></g>
      <g class="js-rleaf"><path d="${RIGHT_LEAF_D}" fill="#FFFFFF"/><path d="${RIGHT_VEIN_D}" fill="none" stroke="#0E9268" stroke-width="0.85" stroke-linecap="round"/></g>
      <path class="js-orbpath" d="${ORB_PATH_D}" fill="none" stroke="none"/>
      <path class="js-trail" d="${ORB_PATH_D}" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" opacity="0" filter="url(#${u}soft)"/>
      <g class="js-orb" opacity="0">
        <circle r="6.4" fill="url(#${u}glow)"/><circle r="3.0" fill="url(#${u}orb)"/>
        <circle cx="-0.9" cy="-1.0" r="1.0" fill="#FFFFFF" opacity="0.85"/>
      </g>
      <g class="js-spark" opacity="0">
        <path d="${SPARKLE_D}" fill="url(#${u}glow)" transform="scale(1.9)" opacity="0.7"/>
        <path d="${SPARKLE_D}" fill="url(#${u}spk)"/>
      </g>
    </g>
  </svg>`
  const q = (s: string) => container.querySelector(s) as any
  const I: Inst = {
    cglow: q('.js-cglow'), coin: q('.js-coin'), rupee: q('.js-rupee'),
    stem: q('.js-stem'), stemlit: q('.js-stemlit'), lleaf: q('.js-lleaf'),
    rglow: q('.js-rglow'), rleaf: q('.js-rleaf'),
    orb: q('.js-orb'), orbpath: q('.js-orbpath'), trail: q('.js-trail'), spark: q('.js-spark'),
  }
  I.orbLen = I.orbpath.getTotalLength()
  I.stemLen = I.stem.getTotalLength()
  I.stem.setAttribute('stroke-dasharray', I.stemLen)
  I.stemlit.setAttribute('stroke-dasharray', I.stemLen)
  I.trailLen = I.orbLen
  I.trail.setAttribute('stroke-dasharray', I.trailLen)
  return I
}

function unfoldLeaf(g: any, k: number, dir: number) {
  const e = backOut(clamp01(k))
  const sc = Math.max(0.001, e)
  const rot = (1 - e) * 26 * -dir
  g.setAttribute('transform', `translate(${LEAF_ROOT.x},${LEAF_ROOT.y}) rotate(${rot.toFixed(2)}) scale(${sc.toFixed(4)}) translate(${-LEAF_ROOT.x},${-LEAF_ROOT.y})`)
  g.setAttribute('opacity', clamp01(k * 1.4).toFixed(3))
}

function setFormation(I: Inst, f: number) {
  I.cglow.setAttribute('opacity', (bump(f, 0.0, 0.62) * 0.85).toFixed(3))
  const cs = backOut(ph(f, 0.08, 0.52)), cop = ph(f, 0.08, 0.30)
  I.coin.setAttribute('transform', `translate(50,64) scale(${Math.max(cs, 0.001).toFixed(4)}) translate(-50,-64)`)
  I.coin.setAttribute('opacity', cop.toFixed(3))
  const rk = ph(f, 0.42, 0.66)
  I.rupee.setAttribute('transform', `translate(50,65.5) scale(${(0.55 + 0.45 * backOut(rk)).toFixed(4)})`)
  I.rupee.setAttribute('opacity', rk.toFixed(3))
  const sk = oc(ph(f, 0.46, 0.72))
  I.stem.setAttribute('stroke-dashoffset', (I.stemLen * (1 - sk)).toFixed(2))
  I.stem.setAttribute('opacity', (sk > 0 ? 1 : 0))
  I.stemlit.setAttribute('opacity', (bump(f, 0.46, 0.78) * 0.5).toFixed(3))
  I.stemlit.setAttribute('stroke-dashoffset', (I.stemLen * (1 - sk)).toFixed(2))
  unfoldLeaf(I.lleaf, ph(f, 0.60, 0.96), -1)
  unfoldLeaf(I.rleaf, ph(f, 0.64, 1.00), +1)
  I.rglow.setAttribute('opacity', 0); I.orb.setAttribute('opacity', 0)
  I.trail.setAttribute('opacity', 0); I.spark.setAttribute('opacity', 0)
}

function setMorph(I: Inst, m: number) {
  I.coin.setAttribute('transform', 'translate(50,64) scale(1) translate(-50,-64)')
  I.stem.setAttribute('stroke-dashoffset', 0)
  I.lleaf.setAttribute('transform', `translate(${LEAF_ROOT.x},${LEAF_ROOT.y}) rotate(0) scale(1) translate(${-LEAF_ROOT.x},${-LEAF_ROOT.y})`)
  const dis = clamp01((m - 0.56) / 0.30), bodyOp = (1 - dis).toFixed(3)
  I.coin.setAttribute('opacity', bodyOp); I.stem.setAttribute('opacity', bodyOp); I.lleaf.setAttribute('opacity', bodyOp)
  const melt = io(ph(m, 0.0, 0.12))
  let rupOp = 1 - melt; const rupSc = 1 - 0.85 * melt
  if (m > 0.5) rupOp = Math.min(rupOp, 1 - dis)
  I.rupee.setAttribute('transform', `translate(50,65.5) scale(${Math.max(rupSc, 0.001).toFixed(4)})`)
  I.rupee.setAttribute('opacity', clamp01(rupOp).toFixed(3))
  const gm = io(clamp01((m - 0.55) / 0.45))
  I.rleaf.setAttribute('transform', `translate(${lerp(0, MINT_TX, gm).toFixed(3)},${lerp(0, MINT_TY, gm).toFixed(3)}) scale(${lerp(1, MINT_S, gm).toFixed(4)})`)
  I.rglow.setAttribute('transform', I.rleaf.getAttribute('transform'))
  const BIRTH: [number, number] = [0.02, 0.14], TRAVEL: [number, number] = [0.14, 0.52], ABSORB: [number, number] = [0.52, 0.62]
  let orbOp = 0, orbSc = 1, travelT = 0
  if (m < BIRTH[0]) { orbOp = 0 }
  else if (m < BIRTH[1]) { orbOp = io(ph(m, BIRTH[0], BIRTH[1])); orbSc = 1 + 0.22 * bump(m, BIRTH[0], BIRTH[1]) }
  else if (m < TRAVEL[1]) { orbOp = 1; travelT = io(ph(m, TRAVEL[0], TRAVEL[1])) }
  else if (m < ABSORB[1]) { const k = ph(m, ABSORB[0], ABSORB[1]); travelT = 1; orbOp = 1 - k; orbSc = 1 + k * 1.3 }
  const pt = I.orbpath.getPointAtLength(travelT * I.orbLen)
  I.orb.setAttribute('transform', `translate(${pt.x.toFixed(2)},${pt.y.toFixed(2)}) scale(${orbSc.toFixed(3)})`)
  I.orb.setAttribute('opacity', orbOp.toFixed(3))
  const litVisible = m > BIRTH[0] && m < 0.66
  I.trail.setAttribute('stroke-dashoffset', (I.trailLen * (1 - travelT)).toFixed(2))
  I.trail.setAttribute('opacity', (litVisible ? 0.55 * clamp01(travelT * 4) * (1 - clamp01((m - 0.56) / 0.10)) : 0).toFixed(3))
  I.stemlit.setAttribute('stroke-dashoffset', 0)
  I.stemlit.setAttribute('opacity', (litVisible ? 0.6 * clamp01(travelT * 3) * (1 - dis) : 0).toFixed(3))
  const POP: [number, number] = [0.52, 0.64]
  let sOp = 0, sSc = 0, sx = TIP.x, sy = TIP.y
  if (m >= POP[0] && m < POP[1]) { const k = ph(m, POP[0], POP[1]); sOp = clamp01(k * 2); sSc = 0.5 * backOut(k) }
  else if (m >= POP[1]) { sOp = 1; sx = lerp(TIP.x, SPARK_HOME.x, gm); sy = lerp(TIP.y, SPARK_HOME.y, gm); sSc = lerp(0.5, 1, gm) }
  I.spark.setAttribute('transform', `translate(${sx.toFixed(2)},${sy.toFixed(2)}) rotate(0) scale(${Math.max(sSc, 0.001).toFixed(3)})`)
  I.spark.setAttribute('opacity', sOp.toFixed(3))
  const glowAmt = clamp01((m - 0.50) / 0.14) * (0.6 + 0.4 * (1 - gm))
  I.rglow.setAttribute('opacity', (0.55 * glowAmt).toFixed(3))
}

function buildThink(container: HTMLElement): Inst {
  const u = 't' + (UID++)
  container.innerHTML = `
  <svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"
       style="display:block;border-radius:22.5%;overflow:visible;">
    <defs>
      <radialGradient id="${u}orb" cx="38%" cy="34%" r="68%"><stop offset="0%" stop-color="#16C98A"/><stop offset="38%" stop-color="#16C98A"/><stop offset="100%" stop-color="#16C98A"/></radialGradient>
      <radialGradient id="${u}glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#16C98A" stop-opacity="0.9"/><stop offset="55%" stop-color="#16C98A" stop-opacity="0.3"/><stop offset="100%" stop-color="#16C98A" stop-opacity="0"/></radialGradient>
      <linearGradient id="${u}spk" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#16C98A"/><stop offset="100%" stop-color="#9DE5CC"/></linearGradient>
      <clipPath id="${u}clip"><rect width="100" height="100" rx="22.5"/></clipPath>
    </defs>
    <g clip-path="url(#${u}clip)">
      <rect width="100" height="100" fill="#111111"/>
      <g class="js-breathe">
        <g transform="translate(-147.71,-39.65) scale(3.4)"><path d="${RIGHT_LEAF_D}" fill="#16C98A"/></g>
        <path class="js-rib" d="${RIB_D}" fill="none" stroke="#16C98A" stroke-width="2.2" stroke-linecap="round" opacity="0.35"/>
        <path class="js-orbpath" d="M30 70 C 44 56 58 44 72 33 C 75 30 78 27 79 27" fill="none" stroke="none"/>
        <g class="js-orb" opacity="0"><circle r="6" fill="url(#${u}glow)"/><circle r="2.7" fill="url(#${u}orb)"/><circle cx="-0.8" cy="-0.9" r="0.9" fill="#9DE5CC" opacity="0.85"/></g>
        <g class="js-spark" opacity="0"><path d="${SPARKLE_D}" fill="url(#${u}glow)" transform="scale(1.9)" opacity="0.7"/><path d="${SPARKLE_D}" fill="url(#${u}spk)"/></g>
      </g>
    </g>
  </svg>`
  const q = (s: string) => container.querySelector(s) as any
  const I: Inst = { breathe: q('.js-breathe'), orb: q('.js-orb'), spark: q('.js-spark'), orbpath: q('.js-orbpath') }
  I.orbLen = I.orbpath.getTotalLength()
  return I
}

const T_BASE = { x: 24.3, y: 74.3 }
const T_SPARK = { x: 79, y: 27 }
function setThink(I: Inst, p: number) {
  const br = 1 + 0.018 * Math.sin(p * Math.PI * 2 - Math.PI / 2)
  I.breathe.setAttribute('transform', `translate(${T_BASE.x},${T_BASE.y}) scale(${br.toFixed(4)}) translate(${-T_BASE.x},${-T_BASE.y})`)
  const IN: [number, number] = [0.00, 0.10], TRAVEL: [number, number] = [0.10, 0.55], POP: [number, number] = [0.55, 0.66], TWINKLE: [number, number] = [0.66, 0.82], FADE: [number, number] = [0.82, 0.95]
  let orbOp = 0, orbSc = 1, tt = 0
  if (p < TRAVEL[0]) { orbOp = io(ph(p, IN[0], IN[1])) * 0.95 }
  else if (p < TRAVEL[1]) { orbOp = 1; tt = io(ph(p, TRAVEL[0], TRAVEL[1])) }
  else if (p < POP[1]) { const k = ph(p, POP[0], POP[1]); tt = 1; orbOp = 1 - k; orbSc = 1 + k * 1.3 }
  const pt = I.orbpath.getPointAtLength(tt * I.orbLen)
  I.orb.setAttribute('transform', `translate(${pt.x.toFixed(2)},${pt.y.toFixed(2)}) scale(${orbSc.toFixed(3)})`)
  I.orb.setAttribute('opacity', orbOp.toFixed(3))
  let sOp = 0, sSc = 0, rot = 0
  if (p >= POP[0] && p < TWINKLE[0]) { const k = ph(p, POP[0], POP[1]); sOp = clamp01(k * 2); sSc = backOut(k) }
  else if (p >= TWINKLE[0] && p < FADE[0]) { const k = ph(p, TWINKLE[0], TWINKLE[1]); sOp = 1; const tw = Math.sin(k * Math.PI * 2); sSc = 1 + 0.16 * tw * tw * Math.sin(k * Math.PI); rot = 10 * Math.sin(k * Math.PI * 2) }
  else if (p >= FADE[0]) { const k = io(ph(p, FADE[0], FADE[1])); sOp = 1 - k; sSc = 1 - 0.4 * k }
  I.spark.setAttribute('transform', `translate(${T_SPARK.x},${T_SPARK.y}) rotate(${rot.toFixed(2)}) scale(${Math.max(sSc, 0.001).toFixed(3)})`)
  I.spark.setAttribute('opacity', sOp.toFixed(3))
}

function boomerangM(loopT: number, F: number, H: number) {
  const P = 2 * F + 2 * H
  const t = loopT % P
  if (t < F) return io(t / F)
  if (t < F + H) return 1
  if (t < 2 * F + H) return io(1 - (t - F - H) / F)
  return 0
}

interface Props {
  variant: 'transform' | 'thinking' | 'hybrid'
  size?: number
  style?: React.CSSProperties
}

export function MintAnimation({ variant, size = 64, style }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    let raf = 0
    const start = performance.now()
    const formSeconds = 1.45, forwardSeconds = 1.9, holdSeconds = 0.5, thinkSeconds = 1.7

    try {
      if (variant === 'transform') {
        const I = buildXform(container)
        const loop = (now: number) => {
          const elapsed = (now - start) / 1000
          if (elapsed < formSeconds) setFormation(I, clamp01(elapsed / formSeconds))
          else setMorph(I, boomerangM(elapsed - formSeconds, forwardSeconds, holdSeconds))
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)

      } else if (variant === 'thinking') {
        const I = buildThink(container)
        const loop = (now: number) => {
          setThink(I, ((now / 1000) / thinkSeconds) % 1)
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)

      } else {
        // hybrid: formation → morph-to-Mint once → cross-fade into thinking loop
        const morphEnd = formSeconds + forwardSeconds
        const FADE = 0.28

        container.style.position = 'relative'
        const d1 = document.createElement('div')
        const d2 = document.createElement('div')
        d1.style.cssText = 'position:absolute;inset:0'
        d2.style.cssText = 'position:absolute;inset:0;opacity:0'
        container.appendChild(d1)
        container.appendChild(d2)

        const XI = buildXform(d1)
        let TI: Inst | null = null
        let crossfaded = false

        const loop = (now: number) => {
          const elapsed = (now - start) / 1000

          if (!crossfaded) {
            if (elapsed < formSeconds) {
              setFormation(XI, clamp01(elapsed / formSeconds))
            } else if (elapsed < morphEnd) {
              setMorph(XI, clamp01((elapsed - formSeconds) / forwardSeconds))
            } else {
              // Lock xform at m=1 (pure Mint leaf), then cross-fade to thinking tile
              setMorph(XI, 1)
              crossfaded = true
              TI = buildThink(d2)
              d2.style.transition = `opacity ${FADE}s ease`
              d2.style.opacity = '1'
              // Fade out xform tile slightly after thinking tile starts rendering
              setTimeout(() => { d1.style.transition = `opacity ${FADE}s ease`; d1.style.opacity = '0' }, 80)
            }
          }

          if (TI) setThink(TI, ((now / 1000) / thinkSeconds) % 1)
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
      }
    } catch (_) { /* SVG path measuring may fail in SSR/test — degrade gracefully */ }

    return () => { cancelAnimationFrame(raf); container.innerHTML = ''; container.style.position = '' }
  }, [variant])

  return <div ref={ref} style={{ width: size, height: size, ...style }} aria-hidden="true" />
}
