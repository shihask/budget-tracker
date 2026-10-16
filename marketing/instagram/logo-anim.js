// The MoneyPlant mark (public/pwa.svg), built piece by piece: tile → coin ring →
// ₹ → stem → leaves. Used by clip-*.html. Needs reel-kit.js (prog, easeOut, backOut…).
//
//   const logo = mountLogo(el)        // el gets the inline SVG
//   logo.render(t, start, speed)      // speed 1 = 2.2 s build; 2 = twice as fast

function mountLogo(el) {
  el.innerHTML = `
  <svg viewBox="0 0 100 100" width="100%" height="100%" style="overflow:visible">
    <defs>
      <linearGradient id="lgBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#16C98A"/><stop offset="100%" stop-color="#0A7A56"/></linearGradient>
      <linearGradient id="lgShine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="lgClip"><rect width="100" height="100" rx="22.5"/></clipPath>
    </defs>
    <g id="lgTile" style="transform-box:view-box;transform-origin:50px 50px">
      <rect width="100" height="100" rx="22.5" fill="url(#lgBg)"/>
      <g clip-path="url(#lgClip)"><rect id="lgShineBar" x="-60" y="-20" width="40" height="140" fill="url(#lgShine)" transform="rotate(20 50 50)"/></g>
      <circle id="lgRing" cx="50" cy="64" r="25.5" fill="none" stroke="#fff" stroke-width="5.2" stroke-linecap="round" transform="rotate(-90 50 64)"/>
      <circle id="lgRing2" cx="50" cy="64" r="19.5" fill="none" stroke="#fff" stroke-width="1.6" opacity="0"/>
      <text id="lgRupee" x="50" y="65.5" text-anchor="middle" dominant-baseline="central" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="800" font-size="30" fill="#fff" style="transform-box:view-box;transform-origin:50px 64px">₹</text>
      <path id="lgStem" d="M50 42 V 26" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>
      <path id="lgLeafL" d="M49.4 33.5 C 41.6 33.5 36.2 29.1 34.3 21 C 42.1 21 47.5 25.4 49.4 33.5 Z" fill="#fff" style="transform-box:view-box;transform-origin:49.4px 33.5px"/>
      <path id="lgLeafR" d="M50.6 33.5 C 58.4 33.5 63.8 29.1 65.7 21 C 57.9 21 52.5 25.4 50.6 33.5 Z" fill="#fff" style="transform-box:view-box;transform-origin:50.6px 33.5px"/>
      <g id="lgVeins" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity="0">
        <path d="M46.5 30.5 C 43.5 28 40.5 25.8 37.5 24.5"/><path d="M53.5 30.5 C 56.5 28 59.5 25.8 62.5 24.5"/>
      </g>
    </g>
  </svg>`
  const q = id => el.querySelector('#' + id)
  const RING = 2 * Math.PI * 25.5
  q('lgRing').setAttribute('stroke-dasharray', RING)
  q('lgStem').setAttribute('stroke-dasharray', 16)

  return {
    /** Build starting at `start`; returns when (absolute time) the mark is complete. */
    render(t, start, speed = 1) {
      const at = s => start + s / speed, d = s => s / speed
      const tile = backOut(prog(t, at(0), d(.55)))
      q('lgTile').style.opacity = prog(t, at(0), d(.2))
      q('lgTile').style.transform = `scale(${.55 + .45 * tile}) rotate(${(1 - easeOut(prog(t, at(0), d(.6)))) * -12}deg)`
      q('lgRing').setAttribute('stroke-dashoffset', RING * (1 - easeInOut(prog(t, at(.35), d(.7)))))
      q('lgRing2').setAttribute('opacity', .45 * prog(t, at(.9), d(.3)))
      const r = prog(t, at(.85), d(.4))
      q('lgRupee').style.opacity = r > 0 ? 1 : 0
      q('lgRupee').style.transform = `scale(${backOut(r)})`
      q('lgStem').setAttribute('stroke-dashoffset', 16 * (1 - easeOut(prog(t, at(1.15), d(.35)))))
      const l = prog(t, at(1.4), d(.5)), rr = prog(t, at(1.5), d(.5))
      q('lgLeafL').style.opacity = l > 0 ? 1 : 0
      q('lgLeafL').style.transform = `rotate(${(1 - backOut(l)) * 55}deg) scale(${backOut(l)})`
      q('lgLeafR').style.opacity = rr > 0 ? 1 : 0
      q('lgLeafR').style.transform = `rotate(${(1 - backOut(rr)) * -55}deg) scale(${backOut(rr)})`
      q('lgVeins').setAttribute('opacity', .42 * prog(t, at(1.85), d(.3)))
      q('lgShineBar').setAttribute('x', -60 + 220 * easeInOut(prog(t, at(1.9), d(.7))))
      return at(2.2)
    },
    /** Gentle idle after the build: leaves sway, tile breathes. */
    idle(t, from) {
      if (t < from) return
      const k = t - from, ramp = Math.min(1, k / .8)
      q('lgLeafL').style.transform = `rotate(${Math.sin(k * 2.2) * 4 * ramp}deg)`
      q('lgLeafR').style.transform = `rotate(${-Math.sin(k * 2.2 + .6) * 4 * ramp}deg)`
      return 1 + .02 * Math.sin(k * 1.9) * ramp
    },
  }
}
