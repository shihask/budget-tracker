// Shared timing helpers for every reel-*.html.
//
// A reel is a pure function of time: its render(t) sets every element's style
// from t alone, so render-reel.mjs can step it frame by frame and the video is
// identical on every run. Call boot(render, duration) at the end of the page.

const $ = id => document.getElementById(id)
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const prog = (t, start, dur) => clamp((t - start) / dur)
const easeOut = p => 1 - Math.pow(1 - p, 3)
const easeInOut = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
const backOut = p => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2) }
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN')

/** Element enters at `start`: fade + rise by `dist` px over `dur` s. */
function rise(el, t, start, dur = .5, dist = 60) {
  const p = easeOut(prog(t, start, dur))
  el.style.opacity = p
  el.style.transform = `translateY(${(1 - p) * dist}px)`
}

/** Element shown only from `start` (display none before), then rises in.
 *  For things that must not take up layout space before they appear. */
function appear(el, t, start, dur = .45, dist = 50, display = 'flex') {
  el.style.display = t >= start ? display : 'none'
  rise(el, t, start, dur, dist)
}

/** Scene visible over [a, b]. Only the incoming scene fades and slides in; the
 *  outgoing one stays opaque underneath (later scenes are later in the DOM, so
 *  they paint on top). Fading both over the black body gave muddy grey frames. */
function scene(el, t, a, b, fade = .35) {
  const pin = a <= 0 ? 1 : easeInOut(prog(t, a - fade / 2, fade))
  el.style.display = t >= a - fade / 2 && t < b + fade / 2 ? 'flex' : 'none'
  el.style.opacity = pin
  el.style.transform = `translateX(${(1 - pin) * 80}px)`
}

/** Typewriter: the first `n` characters of `text` as time runs from start to start+dur. */
function typed(text, t, start, dur) {
  return text.slice(0, Math.floor(text.length * prog(t, start, dur)))
}

/** The green end card (logo pops, then name, tagline, pill), from `start` to the end. */
function endCard(section, t, start, duration) {
  scene(section, t, start, duration + 1)
  const q = sel => section.querySelector(sel)
  const lp = backOut(prog(t, start + .1, .6))
  q('.logo').style.opacity = prog(t, start + .1, .25)
  q('.logo').style.transform = `scale(${.6 + .4 * lp})`
  rise(q('.name'), t, start + .4); rise(q('.tagline'), t, start + .65); rise(q('.pill'), t, start + 1)
}

/** Register the reel. Opened directly it plays on a loop for preview;
 *  render-reel.mjs adds ?render and drives window.render itself. */
function boot(render, duration, stills) {
  window.render = render
  window.REEL_DURATION = duration
  window.REEL_STILLS = stills
  if (!location.search.includes('render')) {
    const t0 = performance.now()
    const loop = now => { render(((now - t0) / 1000) % duration); requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
  } else {
    render(0)
  }
}
