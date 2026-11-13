// Season 2 stage: renderer, depth of field and the cinematic camera.
//
// Shots are keyframes on a timeline: { t, pos, look, lens, focus, cut? }.
//  - between two keys the camera eases (dolly, truck, crane, orbit-ish arcs via `via`);
//  - a key with `cut: true` is a hard cut: the previous shot holds until it, then jumps;
//  - lens is a focal length in mm on a 35 mm-style gauge (24 wide … 85+ close-up);
//  - focus is a world point (or the name of a tracked point); easing between two keys'
//    focus points is a rack focus. aperture sets how shallow the depth of field is.
// Everything is a function of t, so any frame renders the same on its own.

import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export function createStage({ width = 1080, height = 1920, canvas, background = '#E9D6B4' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1); renderer.setSize(width, height, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap
  renderer.localClippingEnabled = true

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(background)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture
  scene.environmentIntensity = .45

  const camera = new THREE.PerspectiveCamera(40, width / height, .05, 60)
  camera.filmGauge = 35

  const rt = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType })
  const composer = new EffectComposer(renderer, rt)
  composer.setPixelRatio(1); composer.setSize(width, height)
  composer.addPass(new RenderPass(scene, camera))
  const bokeh = new BokehPass(scene, camera, { focus: 4, aperture: .004, maxblur: .012 })
  composer.addPass(bokeh)
  composer.addPass(new OutputPass())

  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3()
  return {
    renderer, scene, camera, composer, bokeh,
    /** frame the camera: pos, look target, focal length (mm), focus point, aperture */
    frame({ pos, look, lens = 35, focus, aperture = .004, roll = 0 }) {
      camera.position.set(...pos); camera.up.set(Math.sin(roll), Math.cos(roll), 0); camera.lookAt(...look)
      camera.setFocalLength(lens); camera.updateProjectionMatrix()
      // BokehShader compares against view-space depth (along the lens axis), not straight-line
      // distance; using distance left off-centre subjects slightly soft at the end of a rack.
      const f = focus ?? look
      camera.getWorldDirection(fwd)
      bokeh.uniforms.focus.value = tmp.set(...f).sub(camera.position).dot(fwd)
      bokeh.uniforms.aperture.value = aperture
    },
    render(dof = true) { bokeh.enabled = dof; composer.render() },
    /** world point → CSS pixels on the 1080×1920 page (for bubbles that follow a head) */
    project(v) { tmp.copy(v).project(camera); return { x: (tmp.x + 1) / 2 * width, y: (1 - tmp.y) / 2 * height, behind: tmp.z > 1 } },
  }
}

/**
 * Register the page with render-s2.mjs. Opened through a local server without ?render,
 * it plays on a loop for preview. Sets REEL_READY once assets are loaded.
 */
export function bootS2(stage, render, duration, stills, { size } = {}) {
  const gl = stage.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info')
  window.REEL_GPU = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  Object.assign(window, { render, REEL_DURATION: duration, REEL_STILLS: stills, REEL_SIZE: size })
  if (location.search.includes('render')) { Promise.resolve(render(stills?.[0] ?? 0)).then(() => { window.REEL_READY = true }) }
  else { const t0 = performance.now(); const loop = async now => { await render(((now - t0) / 1000) % duration); requestAnimationFrame(loop) }; requestAnimationFrame(loop); window.REEL_READY = true }
}

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const easeInOut = k => k < .5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
const lerp3 = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k)
// quadratic bezier through an optional `via` point: lets a move arc (orbit / crane) instead of sliding
const bez3 = (a, via, b, k) => a.map((v, i) => (1 - k) ** 2 * v + 2 * (1 - k) * k * via[i] + k * k * b[i])

/**
 * Sample a shot list at time t. Keys are sorted by t. Returns { pos, look, lens, focus, aperture, roll }.
 * resolve(name) maps a named focus/look target (e.g. 'manuEyes') to a world point at time t.
 */
export function shotAt(keys, t, resolve = x => x) {
  const R = v => typeof v === 'string' ? resolve(v) : v
  let i = 0
  while (i < keys.length - 1 && t >= keys[i + 1].t) i++
  const a = keys[i], b = keys[i + 1]
  const A = { pos: R(a.pos), look: R(a.look), lens: a.lens ?? 35, focus: R(a.focus ?? a.look), aperture: a.aperture ?? .004, roll: a.roll ?? 0 }
  if (!b || b.cut) return shake(A, a, t)
  // a key may hold before its move starts: { t, hold } keeps a's framing for `hold` seconds
  const start = a.t + (a.hold ?? 0)
  const k = easeInOut(clamp((t - start) / Math.max(.001, b.t - start)))
  const B = { pos: R(b.pos), look: R(b.look), lens: b.lens ?? 35, focus: R(b.focus ?? b.look), aperture: b.aperture ?? .004, roll: b.roll ?? 0 }
  // focus can rack on its own schedule: b.rack = [startOffset, duration] within the move
  const fk = b.rack ? easeInOut(clamp((t - a.t - b.rack[0]) / b.rack[1])) : k
  return shake({
    pos: b.via ? bez3(A.pos, b.via, B.pos, k) : lerp3(A.pos, B.pos, k),
    look: lerp3(A.look, B.look, k),
    lens: A.lens + (B.lens - A.lens) * k,
    focus: lerp3(A.focus, B.focus, fk),
    aperture: A.aperture + (B.aperture - A.aperture) * k,
    roll: A.roll + (B.roll - A.roll) * k,
  }, a, t)
}

// subtle handheld drift; `shake` on a key adds a comic jolt amplitude
function shake(s, key, t) {
  const amp = (key.handheld ?? .004) + (key.shake ?? 0) * Math.exp(-(t - key.t) * 3)
  const n = (f, p) => Math.sin(t * f + p) * .6 + Math.sin(t * f * 2.3 + p * 1.7) * .4
  return { ...s, pos: [s.pos[0] + n(1.1, 0) * amp, s.pos[1] + n(1.3, 2) * amp, s.pos[2]], look: [s.look[0] + n(.9, 4) * amp * .6, s.look[1] + n(1.2, 1) * amp * .6, s.look[2]] }
}

/** Seekable video texture of a REAL app recording. In render mode every frame seeks exactly. */
export async function recordingTexture(src, { live = false } = {}) {
  const v = document.createElement('video')
  Object.assign(v, { src, muted: true, playsInline: true, loop: true, crossOrigin: 'anonymous', preload: 'auto' })
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('video failed: ' + src)) })
  // Each seeked frame is copied into a canvas: uploading the <video> element directly gave
  // zero-size textures on ANGLE/D3D11 in headless Chromium (black phone screen).
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
  const g = c.getContext('2d')
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false
  const draw = () => { g.drawImage(v, 0, 0, c.width, c.height); tex.needsUpdate = true }
  let at = -1
  if (live) { v.play(); const loop = () => { draw(); v.requestVideoFrameCallback(loop) }; v.requestVideoFrameCallback(loop) }
  return {
    tex, video: v, duration: v.duration,
    async seek(time) {
      if (live) return
      const target = Math.min(Math.max(0, time), v.duration - .04)
      if (Math.abs(target - at) < 1e-4) return
      at = target
      await new Promise(res => { v.onseeked = res; v.currentTime = target })
      draw()
    },
  }
}
