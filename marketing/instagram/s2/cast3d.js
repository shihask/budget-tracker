// Manu & Maaman, Season 2 ("Manu's First Budget"): the 3D cast, set and props.
// Premium-toy style: soft rounded shapes, painted-on faces wrapped onto the head, vinyl
// clearcoat. Colours are Season 1's (toon-cast.js) so the 3D cast is the same people.
//
// Everything is posed from (t, state) only, never from the previous frame, so any frame
// renders the same on its own (render-s2.mjs steps time frame by frame).
// Units: 1 ≈ 1 m-ish; floor is y = 0, characters face +z.

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

export const C = {
  skinManu: '#D9A07A', skinMaaman: '#B97A50', ink: '#2B1D12',
  manuShirt: '#8EC3EA', manuShirtDark: '#6FA6D3', manuCollar: '#B5DAF5', trousers: '#2E3440',
  shoes: '#4A2E1E', belt: '#1E2228', buckle: '#B9A06A', lanyard: '#0A7A56', hairManu: '#1E1814',
  maamanShirt: '#FBFAF6', mundu: '#F6F1E4', kasavu: '#D4A93A', hairMaaman: '#1E1A17', grey: '#B3B0AC',
  sandal: '#5A3B26', pen: '#2F5DA8', mouth: '#5A2E1E', blush: '#E8857A',
  mint: '#16C98A', mintDark: '#0E9E6B', mintInk: '#0B3B2A', brand: '#0A7A56',
}

// ── small builders ───────────────────────────────────────────────────────────
export const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial({
  color, roughness: .5, clearcoat: .3, clearcoatRoughness: .45, ...o,
})
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o }
const sphere = (r, m, seg = 32) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * .75)), m)
const capsule = (r, len, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 10, 20), m)
const rbox = (w, h, d, r, m) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 5, r), m)
const group = (...kids) => { const g = new THREE.Group(); kids.forEach(k => g.add(k)); return g }
const tube = (pts, r, m) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 24, r, 8), m)

export function shadows(root, cast = true, receive = true) {
  root.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive } })
  return root
}

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const mix = (a, b, k) => a + (b - a) * k
const ease = k => k * k * (3 - 2 * k)
/** 0→1 over [a, a + d], eased */
export const ramp = (t, a, d) => ease(clamp((t - a) / d))
/** blink: 1 open, dips to ~0 briefly every `every` seconds */
export const blinkAt = (t, phase, every = 3.6) => {
  const k = ((t + phase) % every) / .16
  return k < 1 ? 1 - Math.sin(k * Math.PI) * .95 : 1
}
/** mouth flap while talking: syllable-ish rhythm, deterministic */
export const flap = t => clamp(.5 + .5 * Math.sin(t * 17) * Math.sin(t * 5.3 + 1) + .15 * Math.sin(t * 31))

// ── painted face parts, wrapped onto the head ellipsoid ──────────────────────
// The head is a sphere of radius R scaled by (1, SY, SZ). A flat 2D shape drawn at face
// height y0 is bent onto that surface so it never floats off the cheeks in a side view.
function wrapOnto(geo, R, SY, SZ, y0, lift) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + y0
    const k = 1 - (x / R) ** 2 - (y / (R * SY)) ** 2
    p.setXYZ(i, x, y, SZ * R * Math.sqrt(Math.max(k, 0)) + lift)
  }
  p.needsUpdate = true; geo.computeVertexNormals(); return geo
}
function surfaceZ(R, SY, SZ, x, y) { return SZ * R * Math.sqrt(Math.max(1 - (x / R) ** 2 - (y / (R * SY)) ** 2, 0)) }

// smile: −1 frown … +1 big smile; open: 0 closed … 1 wide; w: half-width
function mouthShape(w, smile, open, round) {
  const s = new THREE.Shape()
  if (round) {  // explicit points: a closed ellipse curve repeats its first point and can triangulate badly
    const h = .012 + open * .05, n = 32
    return { s: new THREE.Shape(Array.from({ length: n }, (_, i) => new THREE.Vector2(Math.cos(i / n * Math.PI * 2) * w, Math.sin(i / n * Math.PI * 2) * h - h * .55))) }
  }
  const top = -smile * .028, bot = top - .011 - open * .075
  s.moveTo(-w, 0); s.quadraticCurveTo(0, top * 2, w, 0); s.quadraticCurveTo(0, bot * 2, -w, 0)
  return { s, top, bot }
}
function teethShape(w, smile, open) {
  const top = -smile * .028, depth = Math.min(.022, .006 + open * .03)
  const s = new THREE.Shape()
  s.moveTo(-w * .86, -.002); s.quadraticCurveTo(0, top * 2 - .004, w * .86, -.002)
  s.quadraticCurveTo(0, top * 2 - depth * 2, -w * .86, -.002)
  return s
}

// ── characters ───────────────────────────────────────────────────────────────
/*  Moods → face parameters. brow: lift (m); tilt (+ = inner ends up, worried; − = inner down,
    determined); eye: open scale; squint (happy closed eyes); pupil size; blush; mouth. */
const FACE = {
  neutral:     { smile: .25, open: 0,   w: .085, brow: 0,    tilt: 0,    eye: 1,    pupil: 1,   blush: 0 },
  smile:       { smile: .8,  open: 0,   w: .09,  brow: .006, tilt: .05,  eye: 1,    pupil: 1,   blush: 0 },
  grin:        { smile: 1,   open: .38, w: .1,   brow: .016, tilt: .08,  eye: 1.06, pupil: 1,   blush: .25, teeth: 1 },
  excited:     { smile: 1,   open: .55, w: .095, brow: .026, tilt: .1,   eye: 1.16, pupil: 1.1, blush: .35, teeth: 1 },
  shocked:     { round: 1, smile: -.15,open: .85, w: .045, brow: .036, tilt: .18,  eye: 1.24, pupil: .72, blush: 0 },
  worried:     { smile: -.55,open: .06, w: .075, brow: .012, tilt: .42,  eye: 1.02, pupil: .92, blush: 0 },
  embarrassed: { smile: .05, open: .04, w: .06,  brow: .008, tilt: .34,  eye: .94,  pupil: 1,   blush: 1, look: [0, -.4] },
  determined:  { smile: .45, open: 0,   w: .085, brow: -.006,tilt: -.22, eye: .9,   pupil: 1,   blush: 0 },
  // Maaman's set (never angry, never shaming)
  amused:      { smile: .9,  open: .08, w: .085, brow: .01,  tilt: .05,  eye: .82,  pupil: 1,   blush: 0, browAsym: .02 },
  knowing:     { smile: .55, open: 0,   w: .07,  brow: .004, tilt: -.05, eye: .72,  pupil: 1,   blush: 0, browAsym: .03 },
  laugh:       { smile: 1,   open: .65, w: .1,   brow: .02,  tilt: .1,   eye: 1,    pupil: 1,   blush: .2, squint: 1, teeth: 1 },
  concerned:   { smile: -.2, open: 0,   w: .07,  brow: .01,  tilt: .3,   eye: .95,  pupil: 1,   blush: 0 },
  surprised:   { round: 1, smile: .2,  open: .4,  w: .04,  brow: .03,  tilt: .12,  eye: 1.15, pupil: .85, blush: 0 },
}
export const MOODS = Object.keys(FACE)

function buildHead(spec) {
  const { R, SY, SZ, skin, ears } = spec
  const m = { skin: mat(skin, { roughness: .55, clearcoat: .15 }), ink: mat(C.ink, { roughness: .3, clearcoat: .8 }),
    white: mat('#ffffff', { roughness: .25, clearcoat: .8 }), mouth: mat(C.mouth, { roughness: 1, clearcoat: 0, specularIntensity: 0, envMapIntensity: 0, side: THREE.DoubleSide })  /* matte: no highlight inside an open mouth */,
    teeth: mat('#FFFDF6', { roughness: .35, side: THREE.DoubleSide }),
    blush: mat(C.blush, { transparent: true, opacity: 0, roughness: .8, clearcoat: 0, depthWrite: false }),
    brow: mat(spec.browColor, { roughness: .6, clearcoat: .1 }) }
  const head = new THREE.Group()
  const skull = sphere(R, m.skin, 48); skull.scale.set(1, SY, SZ); head.add(skull)
  // ears
  for (const sx of [-1, 1]) { const e = sphere(R * .24, m.skin, 20); e.scale.set(.55, 1, .8); e.position.set(sx * R * .98, -R * .05, -R * .05); head.add(e) }
  // nose
  const nose = sphere(R * .13, m.skin, 20); nose.scale.set(1, .9, .8)
  nose.position.set(0, -R * .12, surfaceZ(R, SY, SZ, 0, -R * .12) + R * .02); head.add(nose)

  // eyes: white + pupil + highlight, each in a group that squashes to blink
  const eyes = []
  const ey = R * .1, ex = R * .34
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * ex, ey, surfaceZ(R, SY, SZ, sx * ex, ey) - R * .07)
    const w = sphere(R * spec.eyeR, m.white, 24); w.scale.set(.9, 1.05, .55); g.add(w)
    const pupil = new THREE.Group()
    const p = sphere(R * spec.eyeR * .6, m.ink, 20); p.scale.set(1, 1, .5); pupil.add(p)
    const hl = sphere(R * spec.eyeR * .2, m.white, 12); hl.position.set(R * .03, R * .035, R * spec.eyeR * .32); pupil.add(hl)
    pupil.position.z = R * spec.eyeR * .5; g.add(pupil)
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R * spec.eyeR * .72, R * .022, 8, 24, Math.PI), m.ink)
    arc.position.copy(g.position); arc.position.z += R * .055; arc.visible = false
    head.add(g, arc); eyes.push({ g, pupil, arc, sx })
  }
  // brows
  const brows = [-1, 1].map(sx => {
    const b = capsule(R * .045, R * .26, m.brow); b.rotation.z = Math.PI / 2
    const g = new THREE.Group(); g.add(b); head.add(g); return { g, sx }
  })
  // blush
  for (const sx of [-1, 1]) {
    const geo = new THREE.CircleGeometry(R * .14, 24).scale(1, .6, 1).translate(sx * R * .5, 0, 0)
    const o = new THREE.Mesh(wrapOnto(geo, R, SY, SZ, -R * .2, R * .006), m.blush); o.renderOrder = 2; head.add(o)
  }
  const mouthY = -R * .42
  const mouth = new THREE.Mesh(new THREE.BufferGeometry(), m.mouth); head.add(mouth)
  const teeth = new THREE.Mesh(new THREE.BufferGeometry(), m.teeth); head.add(teeth)

  let last = ''
  function face(f, t, talking, blink, look = [0, 0]) {
    // blend talking into the mouth
    const open = clamp(f.open + (talking ? flap(t) * (.35 + .3 * (1 - f.open)) : 0))
    const key = [f.smile, open, f.w, f.teeth, f.round].map(v => (v ?? 0).toFixed(3)).join()
    if (key !== last) {
      last = key
      const w = f.w * R / .3
      const { s } = mouthShape(w, f.smile, open, f.round)
      mouth.geometry.dispose(); mouth.geometry = wrapOnto(new THREE.ShapeGeometry(s, 16), R, SY, SZ, mouthY, R * .022)  // lift > chord sag (w²/2R), or skin shows through
      teeth.geometry.dispose()
      teeth.geometry = f.teeth && !f.round && open > .12 ? wrapOnto(new THREE.ShapeGeometry(teethShape(w, f.smile, open), 16), R, SY, SZ, mouthY, R * .028) : new THREE.BufferGeometry()
    }
    const squint = f.squint ?? 0
    const l = f.look ?? look
    for (const e of eyes) {
      e.g.scale.y = Math.max(.06, f.eye * blink * (1 - squint * .82))
      e.g.scale.x = 1 + squint * .08
      e.pupil.scale.setScalar(f.pupil)
      e.pupil.position.x = l[0] * R * .07; e.pupil.position.y = l[1] * R * .07
      e.g.visible = squint < .6; e.arc.visible = !e.g.visible
    }
    for (const b of brows) {
      const asym = (f.browAsym ?? 0) * (b.sx > 0 ? 1 : -.4)
      const y = ey + R * .3 + f.brow * R / .3 + asym * R / .3, x = b.sx * ex * 1.02
      b.g.position.set(x, y, surfaceZ(R, SY, SZ, x, y) + R * .02)
      b.g.rotation.z = -b.sx * f.tilt
      b.g.rotation.y = b.sx * .35
    }
    m.blush.opacity = f.blush * .55
  }
  return { head, face, m, R }
}

/**
 * The shared toy body. `spec` decides who it is. Returns { root, pose(t, state) }.
 * state: { mood, talking, blink phase, look:[x,y] (eyes), headTurn, headTilt, nod,
 *          armL:{raise, out, elbow}, armR:{...}, bob, jump, lean }
 */
function buildPerson(spec) {
  const root = new THREE.Group()
  const body = new THREE.Group(); root.add(body)
  const H = spec.hip  // hip height
  const parts = {}

  // legs + shoes (Manu) or mundu + sandals (Maaman)
  if (spec.mundu) {
    const prof = [[0, 0], [.33, 0], [.345, .03], [.33, .3], [.315, .6], [.3, H + .02], [0, H + .02]].map(([x, y]) => new THREE.Vector2(x, y))
    const mundu = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), mat(C.mundu, { roughness: .7, clearcoat: .05, sheen: .6, sheenColor: new THREE.Color('#fff6e0') }))
    mundu.position.y = .02; body.add(mundu)
    const kasavu = new THREE.Mesh(new THREE.CylinderGeometry(.341, .346, .05, 48, 1, true), mat(C.kasavu, { metalness: .55, roughness: .35 }))
    kasavu.position.y = .1; body.add(kasavu)
    // the front fold with its gold edge
    const fold = rbox(.03, H - .08, .02, .01, mat(C.kasavu, { metalness: .55, roughness: .35 }))
    fold.position.set(.12, H / 2 + .06, .3); fold.rotation.x = -.04; body.add(fold)
    for (const sx of [-1, 1]) { const f = rbox(.13, .05, .24, .02, mat(C.sandal)); f.position.set(sx * .11, .025, .12); body.add(f)
      const toe = sphere(.045, mat(spec.skin, { roughness: .55, clearcoat: .15 })); toe.scale.set(1.2, .6, 1); toe.position.set(sx * .11, .065, .2); body.add(toe) }
  } else {
    const pant = mat(C.trousers, { roughness: .75, clearcoat: .05 })
    for (const sx of [-1, 1]) {
      const leg = capsule(.105, H - .26, pant); leg.position.set(sx * .13, H / 2 + .07, 0); body.add(leg)
      const shoe = rbox(.18, .1, .3, .045, mat(C.shoes, { roughness: .4, clearcoat: .6 })); shoe.position.set(sx * .13, .05, .05); body.add(shoe)
    }
  }

  // torso
  const shirt = mat(spec.shirt, { roughness: .62, clearcoat: .08, sheen: .3 })
  const torso = rbox(spec.torsoW, spec.torsoH, .4, .17, shirt)
  torso.position.y = spec.torsoY; body.add(torso)
  parts.torso = torso
  const chestZ = .2

  if (!spec.mundu) {
    // belt + buckle
    const belt = rbox(spec.torsoW + .005, .06, .405, .03, mat(C.belt, { roughness: .4, clearcoat: .6 })); belt.position.y = spec.torsoY - spec.torsoH / 2 + .05; body.add(belt)
    const buckle = rbox(.07, .055, .02, .01, mat(C.buckle, { metalness: .7, roughness: .3 })); buckle.position.set(0, belt.position.y, chestZ + .005); body.add(buckle)
  }
  // placket + buttons
  const placket = rbox(.025, spec.torsoH - .14, .01, .005, mat(spec.shirtDark, { roughness: .7 })); placket.position.set(0, spec.torsoY + .02, chestZ + .002); body.add(placket)
  for (let i = 0; i < 3; i++) { const b = sphere(.014, mat(spec.button, { roughness: .3 }), 12); b.scale.z = .5; b.position.set(0, spec.torsoY + .16 - i * .15, chestZ + .01); body.add(b) }
  // pocket
  const pocket = rbox(.12, .12, .012, .015, mat(spec.shirtDark, { roughness: .7 })); pocket.position.set(spec.pocketX, spec.torsoY + .1, chestZ - .002); body.add(pocket)
  if (spec.pen) { const pen = capsule(.012, .1, mat(C.pen, { roughness: .3, clearcoat: .8 })); pen.position.set(spec.pocketX - .03, spec.torsoY + .17, chestZ + .01); body.add(pen) }
  // collar
  const collarM = mat(spec.collar, { roughness: .6 })
  for (const sx of [-1, 1]) {
    const c = rbox(.15, .07, .03, .015, collarM); c.position.set(sx * .075, spec.torsoY + spec.torsoH / 2 - .03, chestZ - .04)
    c.rotation.set(-.5, 0, sx * .5); body.add(c)
  }
  const backCollar = rbox(.26, .07, .05, .02, collarM); backCollar.position.set(0, spec.torsoY + spec.torsoH / 2 - .01, -.1); backCollar.rotation.x = .35; body.add(backCollar)
  // ID card on a lanyard (Manu)
  if (spec.idCard) {
    const lan = mat(C.lanyard, { roughness: .6 })
    for (const sx of [-1, 1]) body.add(tube([[sx * .1, spec.torsoY + .29, chestZ - .07], [sx * .08, spec.torsoY + .2, chestZ + .015], [sx * .02, spec.torsoY - .02, chestZ + .03]], .011, lan))
    const card = group(rbox(.11, .15, .012, .012, mat('#ffffff', { roughness: .3, clearcoat: .9 })))
    const head = rbox(.112, .035, .014, .008, mat(C.brand)); head.position.y = .058; card.add(head)
    const photo = rbox(.035, .04, .014, .004, mat('#C9D3DC')); photo.position.set(-.025, .01, .001); card.add(photo)
    for (let i = 0; i < 2; i++) { const l = rbox(.05 - i * .015, .008, .014, .003, mat('#9AA6B1')); l.position.set(.02 - i * .006, .02 - i * .016, .001); card.add(l) }
    card.position.set(0, spec.torsoY - .1, chestZ + .035); card.rotation.x = -.06; body.add(card); parts.card = card
  }

  // neck + head on a pivot (nod / tilt / turn)
  const skinM = mat(spec.skin, { roughness: .55, clearcoat: .15 })
  const neckTop = spec.torsoY + spec.torsoH / 2
  const neck = mesh(new THREE.CylinderGeometry(.085, .095, .14, 24), skinM, 0, neckTop + .01, 0); body.add(neck)
  const headPivot = new THREE.Group(); headPivot.position.y = neckTop + .05; body.add(headPivot)
  const H3 = buildHead(spec.head)
  H3.head.position.y = spec.head.R * spec.head.SY * .93; headPivot.add(H3.head)
  spec.hair(H3.head, spec.head)

  // arms: shoulder ball → upper arm → elbow ball → forearm → wrist → mitten hand (thumb + index finger)
  const hemM = mat(spec.shirtDark, { roughness: .7 })
  function arm(sx) {
    const shoulder = new THREE.Group(); shoulder.position.set(sx * (spec.torsoW / 2 + .02), spec.torsoY + spec.torsoH / 2 - .1, 0); body.add(shoulder)
    shoulder.add(sphere(.08, shirt, 24))  // fills the gap to the torso's rounded edge when the arm lifts
    const ELBOW = .3, WRIST = .29
    if (spec.halfSleeve) {
      // a real half sleeve: a short flared sleeve with a hem over a bare upper arm
      const ua = capsule(.064, ELBOW - .06, skinM); ua.position.y = -ELBOW / 2; shoulder.add(ua)
      const sleeveM = shirt.clone(); sleeveM.side = THREE.DoubleSide
      shoulder.add(mesh(new THREE.CylinderGeometry(.08, .092, .19, 24, 1, true), sleeveM, 0, -.085, 0))
      const hem = mesh(new THREE.TorusGeometry(.09, .009, 8, 28), hemM, 0, -.18, 0); hem.rotation.x = Math.PI / 2; shoulder.add(hem)
    } else {
      const ua = capsule(.075, ELBOW - .07, shirt); ua.position.y = -ELBOW / 2; shoulder.add(ua)
    }
    const elbow = new THREE.Group(); elbow.position.y = -ELBOW; shoulder.add(elbow)
    elbow.add(sphere(spec.halfSleeve ? .064 : .074, spec.halfSleeve ? skinM : shirt, 20))  // no kink when it bends
    if (spec.halfSleeve) {
      // bare forearm: one smooth capsule that melts into the palm, so no rings at the wrist
      const fa = capsule(.056, WRIST - .07, skinM); fa.scale.set(1, 1, .92); fa.position.y = -WRIST / 2 - .01; elbow.add(fa)
    } else {
      const fa = new THREE.Mesh(new THREE.CylinderGeometry(.071, .066, WRIST - .03, 20), shirt); fa.position.y = -(WRIST - .03) / 2; elbow.add(fa)
      elbow.add(mesh(new THREE.CylinderGeometry(.071, .071, .04, 20), hemM, 0, -WRIST + .035, 0))   // cuff
      elbow.add(mesh(new THREE.CylinderGeometry(.045, .048, .05, 16), skinM, 0, -WRIST + .005, 0))  // wrist
    }

    // the hand hangs from the wrist; its palm faces the body (-sx) and the thumb points forward (+z)
    const hand = new THREE.Group(); hand.position.y = -WRIST; elbow.add(hand)
    const palm = sphere(.068, skinM, 24); palm.scale.set(.72, 1.08, 1.0); palm.position.y = -.065; hand.add(palm)
    const knuckles = sphere(.06, skinM, 20); knuckles.scale.set(.7, .8, .95); knuckles.position.set(0, -.115, -.004); hand.add(knuckles)
    const thumb = new THREE.Group(); thumb.position.set(-sx * .012, -.04, .05); hand.add(thumb)
    const th = capsule(.021, .045, skinM); th.position.y = -.03; thumb.add(th)
    const index = new THREE.Group(); index.position.set(0, -.14, .02); hand.add(index)
    const ix = capsule(.019, .065, skinM); ix.position.y = -.045; index.add(ix)
    // grip: the palm centre, where props are held (the same point the old ball hand sat on)
    const grip = new THREE.Object3D(); grip.position.y = -.07; hand.add(grip)
    return { shoulder, elbow, wrist: hand, hand: grip, thumb, index, knuckles, sx }
  }
  const armL = arm(-1), armR = arm(1)  // armR is on +x (screen right when facing camera)

  shadows(root)
  const blinkPhase = spec.blinkPhase

  /* arm state: raise (forward/up), out (sideways, negative = across the body), elbow (bend),
     across (swings the bent forearm in towards the chest), hand: 'relaxed' | 'point' | 'thumb' | 'fist' */
  const HAND = {
    relaxed: { thumb: [.35, 0, .25], index: false },
    point:   { thumb: [1.2, 0, .9], index: true },
    thumb:   { thumb: [-.2, 0, 1.6], index: false, curl: true },
    fist:    { thumb: [1.0, 0, .9], index: false, curl: true },
  }
  function poseArm(a, s = {}, t) {
    const out = (s.out ?? .1) * a.sx, raise = s.raise ?? 0, elbow = s.elbow ?? .12
    // across: turn the upper arm about its own axis so the elbow bend points inwards
    a.shoulder.rotation.set(-raise, (s.twist ?? 0) - a.sx * (s.across ?? 0), out, 'XZY')
    a.elbow.rotation.set(-elbow, 0, 0)
    const h = HAND[s.hand ?? 'relaxed']
    a.thumb.rotation.set(h.thumb[0], h.thumb[1], -a.sx * h.thumb[2])
    a.index.visible = h.index
    a.knuckles.scale.y = h.curl ? .62 : .8
    a.wrist.rotation.set(s.wrist ?? 0, 0, 0)
  }

  function pose(t, s = {}) {
    const f = { ...FACE[s.mood ?? 'neutral'] }
    if (s.blend) { const g = FACE[s.blend[0]]; for (const k in g) if (typeof g[k] === 'number') f[k] = mix(f[k] ?? 0, g[k], s.blend[1]) }
    const breath = Math.sin(t * 2.1 + blinkPhase) * .006
    body.position.y = breath + (s.jump ?? 0)
    body.rotation.x = s.lean ?? 0
    torso.scale.set(1, 1 + breath * 1.5, 1)
    headPivot.rotation.set((s.nod ?? 0) + Math.sin(t * 1.3 + blinkPhase) * .015, (s.headTurn ?? 0), (s.headTilt ?? 0) + (s.talking ? Math.sin(t * 4.1) * .03 : 0))
    H3.face(f, t, s.talking, blinkAt(t, blinkPhase), s.look ?? [0, 0])
    poseArm(armL, s.armL, t); poseArm(armR, s.armR, t)
    root.position.x = s.x ?? root.position.x
    if (s.z !== undefined) root.position.z = s.z
    if (s.turn !== undefined) root.rotation.y = s.turn
  }
  return { root, pose, headPivot, head: H3.head, armL, armR, parts, R: spec.head.R }
}

function manuHair(head, { R, SY, SZ }) {
  const m = mat(C.hairManu, { roughness: .45, clearcoat: .5 })
  // crown: tilted back so the forehead shows and the back reaches lower
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 48, 32, 0, Math.PI * 2, 0, 1.08), m)
  cap.scale.set(1, SY, SZ); cap.rotation.x = -.5; cap.position.y = R * .03; head.add(cap)
  // back and sides down to the nape, leaving the face and ears clear
  const back = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 40, 24, Math.PI - .45, Math.PI + .9, .3, 1.32), m)
  back.scale.set(1, SY, SZ); head.add(back)
  const nape = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 40, 24, Math.PI + .25, Math.PI - .5, 1.2, 1.0), m)
  nape.scale.set(1, SY, SZ); head.add(nape)
  // the quiff
  const q = sphere(R * .42, m, 24); q.scale.set(1.5, .6, 1); q.position.set(R * .12, R * SY * .9, R * .45); q.rotation.z = -.25; head.add(q)
  const q2 = sphere(R * .3, m, 20); q2.scale.set(1.4, .55, 1); q2.position.set(-R * .35, R * SY * .82, R * .5); q2.rotation.z = .3; head.add(q2)
  // sideburns
  for (const sx of [-1, 1]) { const sb = capsule(R * .06, R * .16, m); sb.position.set(sx * R * .9, R * .1, R * .18); head.add(sb) }
}

function maamanHair(head, { R, SY, SZ }) {
  // Black hair that greys softly toward the temples: per-vertex colour, no hard patch edges.
  const m = mat('#ffffff', { roughness: .45, clearcoat: .45, vertexColors: true })
  const black = new THREE.Color(C.hairMaaman), grey = new THREE.Color(C.grey)
  const temples = [-1, 1].map(sx => new THREE.Vector3(sx * R * .95, R * .2, R * .3))
  const tint = mesh => {
    const p = mesh.geometry.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3(), c = new THREE.Color()
    mesh.updateMatrix()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrix)
      const d = Math.min(...temples.map(tp => tp.distanceTo(v))) / R
      const w = 1 - Math.min(1, Math.max(0, (d - .14) / .3))
      c.copy(black).lerp(grey, w * w * (3 - 2 * w)); col.set([c.r, c.g, c.b], i * 3)
    }
    mesh.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }
  // a fuller crown than Manu's: the hairline sits lower on the forehead
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 48, 32, 0, Math.PI * 2, 0, 1.2), m)
  cap.scale.set(1, SY, SZ); cap.rotation.x = -.28; cap.position.y = R * .03; tint(cap); head.add(cap)
  const back = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 48, 32, Math.PI - .4, Math.PI + .8, .3, 1.25), m)
  back.scale.set(1, SY, SZ); tint(back); head.add(back)
  const nape = new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 40, 24, Math.PI + .3, Math.PI - .6, 1.15, .95), m)
  nape.scale.set(1, SY, SZ); tint(nape); head.add(nape)
  // moustache: S1's thick curved shape (toon-cast.js), sculpted and bent onto the face
  const ms = new THREE.Shape(), u = R / 88
  ms.moveTo(0, -4 * u)
  ms.bezierCurveTo(10 * u, -1 * u, 22 * u, 3 * u, 32 * u, -2 * u)
  ms.bezierCurveTo(40 * u, -6 * u, 46 * u, -12 * u, 50 * u, -17 * u)
  ms.bezierCurveTo(38 * u, -19 * u, 18 * u, -13 * u, 0, -9 * u)
  ms.bezierCurveTo(-18 * u, -13 * u, -38 * u, -19 * u, -50 * u, -17 * u)
  ms.bezierCurveTo(-46 * u, -12 * u, -40 * u, -6 * u, -32 * u, -2 * u)
  ms.bezierCurveTo(-22 * u, 3 * u, -10 * u, -1 * u, 0, -4 * u)
  const mg = new THREE.ExtrudeGeometry(ms, { depth: R * .015, bevelEnabled: true, bevelThickness: R * .03, bevelSize: R * .012, bevelSegments: 5, curveSegments: 24 })
  const my = -R * .2, pz = mg.attributes.position, z0 = surfaceZ(R, SY, SZ, 0, my)
  for (let i = 0; i < pz.count; i++) pz.setZ(i, pz.getZ(i) + surfaceZ(R, SY, SZ, pz.getX(i), my + pz.getY(i)) - z0)
  mg.computeVertexNormals()
  const mous = new THREE.Mesh(mg, mat(C.hairMaaman, { roughness: .5, clearcoat: .4 })); mous.position.set(0, my, z0 - R * .005); head.add(mous)
  // forehead crease, faint
  const crease = new THREE.Mesh(wrapOnto(new THREE.PlaneGeometry(R * .5, R * .018), R, SY, SZ, R * .5, R * .004), mat('#A5683F', { transparent: true, opacity: .55, roughness: .8, clearcoat: 0 }))
  head.add(crease)
}

export function buildManu() {
  return buildPerson({
    hip: .82, torsoW: .62, torsoH: .62, torsoY: 1.12, shirt: C.manuShirt, shirtDark: C.manuShirtDark, collar: C.manuCollar,
    button: '#ffffff', pocketX: .16, idCard: true, skin: C.skinManu, blinkPhase: .3,
    head: { R: .3, SY: 1.08, SZ: .97, skin: C.skinManu, eyeR: .2, browColor: C.hairManu },
    hair: manuHair,
  })
}
export function buildMaaman() {
  return buildPerson({
    hip: .9, torsoW: .7, torsoH: .66, torsoY: 1.16, shirt: C.maamanShirt, shirtDark: '#E6DFD2', collar: '#EDE5D6',
    button: '#DCD3C2', pocketX: -.18, pen: true, halfSleeve: true, mundu: true, skin: C.skinMaaman, blinkPhase: 1.7,
    head: { R: .31, SY: 1.06, SZ: .97, skin: C.skinMaaman, eyeR: .17, browColor: C.hairMaaman },
    hair: maamanHair,
  })
}

// ── Mint: the leaf from MoneyPlant's logo, as a small vinyl toy ───────────────
export function buildMint() {
  const root = new THREE.Group()
  const body = new THREE.Group(); root.add(body)
  // The S1/brand leaf outline (toon-cast.js MINT_INNER), recentred and scaled to ~0.5 tall.
  const s = new THREE.Shape(), k = 1 / 430, ox = 232, oy = 287
  const P = (x, y) => [(x - ox) * k, -(y - oy) * k]
  s.moveTo(...P(101, 395.49))
  s.bezierCurveTo(...P(236.782, 395.49), ...P(330.786, 318.895), ...P(363.861, 177.89))
  s.bezierCurveTo(...P(228.078, 177.89), ...P(134.075, 254.485), ...P(101, 395.49))
  const geo = new THREE.ExtrudeGeometry(s, { depth: .05, bevelEnabled: true, bevelThickness: .03, bevelSize: .022, bevelSegments: 6, curveSegments: 40 })
  geo.translate(0, 0, -.025)
  // brand green, glossy but not washed out (no sheen; softer environment reflection)
  const leafM = mat(C.mint, { roughness: .32, clearcoat: .7, clearcoatRoughness: .2, envMapIntensity: .55 })
  const leaf = new THREE.Mesh(geo, leafM)
  // the logo's leaf is diagonal; tilt it most of the way upright so it can stand, keeping the lean
  const LEAF_TILT = .3
  const blade = group(leaf); blade.rotation.z = LEAF_TILT; blade.position.x = .09  // lower tip over the feet
  const leafG = group(blade); leafG.position.y = .36; body.add(leafG)
  // midrib: from the base toward the middle only, like the logo, so it stays off the face
  blade.add(tube([[-.27, -.215, .057], [-.17, -.14, .061], [-.1, -.08, .06]], .008, mat('#F2FFF8', { roughness: .4, transparent: true, opacity: .8 })))
  // face on the leaf's front
  const ink = mat(C.mintInk, { roughness: .25, clearcoat: 1 }), white = mat('#ffffff', { roughness: .2 })
  const face = new THREE.Group(); face.position.set(.085, .0, .062); leafG.add(face)
  const eyes = [-1, 1].map(sx => {
    const g = new THREE.Group(); g.position.set(sx * .045, .025, 0)
    const e = sphere(.024, ink, 20); e.scale.set(.8, 1.1, .45); g.add(e)
    const h = sphere(.008, white, 10); h.position.set(.007, .01, .01); g.add(h)
    face.add(g); return g
  })
  const mouth = new THREE.Mesh(new THREE.BufferGeometry(), mat(C.mintInk, { roughness: .4, side: THREE.DoubleSide })); face.add(mouth)
  for (const sx of [-1, 1]) { const c = sphere(.016, mat(C.mintDark, { transparent: true, opacity: .55 }), 12); c.scale.set(1.3, .7, .3); c.position.set(sx * .085, -.012, -.004); face.add(c) }
  // stem + tiny feet so it can stand on the screen
  const dark = mat(C.mintDark, { roughness: .35, clearcoat: .8 })
  const stem = tube([[0, .08, 0], [-.01, .04, .005], [0, 0, 0]], .012, dark); body.add(stem)
  const feet = [-1, 1].map(sx => { const f = sphere(.026, dark, 16); f.scale.set(1.2, .6, 1.5); f.position.set(sx * .035, .015, .01); body.add(f); return f })
  // tiny arms
  const arms = [-1, 1].map(sx => { const a = capsule(.013, .06, dark); a.position.set(.09 + sx * .155, .33, .06); a.rotation.z = sx * .9; body.add(a); return a })
  shadows(root)

  let last = ''
  function pose(t, st = {}) {
    const mood = st.mood ?? 'happy'
    const talk = st.talking ? flap(t) : 0
    const happy = { happy: [.9, .1], excited: [1, .45], thinking: [.2, 0], wow: [0, .6] }[mood] ?? [.9, .1]
    const open = clamp(happy[1] + talk * .5)
    const key = happy[0].toFixed(2) + open.toFixed(3)
    if (key !== last) {
      last = key
      const sm = new THREE.Shape(), w = mood === 'wow' ? .02 : .04, top = -happy[0] * .02, bot = top - .006 - open * .04
      sm.moveTo(-w, -.035); sm.quadraticCurveTo(0, -.035 + top * 2, w, -.035); sm.quadraticCurveTo(0, -.035 + bot * 2, -w, -.035)
      mouth.geometry.dispose(); mouth.geometry = new THREE.ShapeGeometry(sm, 12)
    }
    const b = blinkAt(t, .9, 3.1)
    eyes.forEach((e, i) => { e.scale.y = b * (mood === 'excited' ? 1.15 : 1); e.position.y = .025 + (mood === 'thinking' ? .006 : 0)
      e.children[0].position.x = (st.look?.[0] ?? (mood === 'thinking' ? .2 : 0)) * .01 })
    const hop = mood === 'excited' ? Math.abs(Math.sin(t * 7)) * .05 : 0
    body.position.y = Math.sin(t * 2.6) * .008 + hop
    leafG.rotation.z = Math.sin(t * 1.9) * .05 + (st.talking ? Math.sin(t * 6) * .03 : 0)
    leafG.rotation.y = st.turnLeaf ?? 0
    arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * (.9 + (mood === 'excited' ? .6 + Math.sin(t * 9 + i) * .3 : Math.sin(t * 2 + i) * .1)) })
    if (st.turn !== undefined) root.rotation.y = st.turn
  }
  return { root, pose }
}

// ── the phone: a real MoneyPlant recording plays on its screen ────────────────
// Screen texture comes from the caller (a video or image texture of a REAL recording).
export function buildPhone(screenTex, { h = .3 } = {}) {
  const w = h * .48, d = h * .055
  const root = new THREE.Group()
  const shell = rbox(w, h, d, d * .48, mat('#1C1410', { roughness: .3, clearcoat: 1, metalness: .2 }))
  root.add(shell)
  const sw = w * .9, sh = sw * 16 / 9
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }))
  scr.position.z = d / 2 + .0006; root.add(scr)
  // camera dot
  const cam = sphere(h * .008, mat('#111', { roughness: .1 }), 10); cam.position.set(0, h * .47, d / 2 + .001); cam.scale.z = .3; root.add(cam)
  shadows(shell)
  return { root, screen: scr, sw, sh, d }
}

/** Clip a group's materials to the phone screen rectangle, so Mint stays "inside" the phone. */
export function clipToScreen(target, phone) {
  const planes = [0, 1, 2, 3].map(() => new THREE.Plane())
  target.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.clippingPlanes = planes } })
  const n = new THREE.Vector3(), p = new THREE.Vector3()
  return function update() {
    phone.root.updateMatrixWorld(true)
    const m = phone.screen.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(m)
    const hw = phone.sw / 2, hh = phone.sh / 2
    const defs = [[[1, 0, 0], [-hw, 0, 0]], [[-1, 0, 0], [hw, 0, 0]], [[0, 1, 0], [0, -hh, 0]], [[0, -1, 0], [0, hh, 0]]]
    defs.forEach(([nn, pp], i) => { n.set(...nn).applyMatrix3(nm).normalize(); p.set(...pp).applyMatrix4(m); planes[i].setFromNormalAndCoplanarPoint(n, p) })
  }
}

// ── the Kerala living room ───────────────────────────────────────────────────
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}

export function buildHome({ door = false } = {}) {
  const root = new THREE.Group()
  const anim = {}
  const wallM = mat('#F3E2C0', { roughness: .85, clearcoat: 0 })
  // D is deep enough that wide shots never see past the floor
  const W = 10, D = 14, HT = 3.4, winX = 1.5, winW = 1.7, winB = 1.05, winT = 2.5

  // red-oxide floor, polished
  const floorTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#A3402B'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${60 + Math.random() * 40},10,0,${Math.random() * .08})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3) }
    g.strokeStyle = 'rgba(70,20,10,.35)'; g.lineWidth = 2
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke() }
  })
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(5, 3.5)
  // low env reflection: a glossy floor mirrors the environment's light panels as glare near the camera
  const floor = mesh(new THREE.PlaneGeometry(W, D), mat('#ffffff', { map: floorTex, roughness: .3, clearcoat: .55, clearcoatRoughness: .2, envMapIntensity: .25 }))
  floor.rotation.x = -Math.PI / 2; floor.position.z = D / 2 - 3; floor.receiveShadow = true; root.add(floor)

  // back wall with a window opening (four slabs around it)
  const bz = -3
  const slab = (x0, x1, y0, y1) => { const s = mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, .12), wallM, (x0 + x1) / 2, (y0 + y1) / 2, bz); s.receiveShadow = true; s.castShadow = true; root.add(s) }
  // door (EP03 on): an open front door left of the clock-to-photo gap, onto the front yard and gate
  const DOOR = door ? { x0: -2.0, x1: -.9, top: 2.25 } : null
  if (DOOR) { slab(-W / 2, DOOR.x0, 0, HT); slab(DOOR.x1, winX - winW / 2, 0, HT); slab(DOOR.x0, DOOR.x1, DOOR.top, HT) }
  else slab(-W / 2, winX - winW / 2, 0, HT)
  slab(winX + winW / 2, W / 2, 0, HT)
  slab(winX - winW / 2, winX + winW / 2, 0, winB); slab(winX - winW / 2, winX + winW / 2, winT, HT)
  // skirting + a painted dado band (in two runs either side of the door)
  const skirtM = mat('#7A3B22', { roughness: .5 }), dadoM = mat('#E8D2A8', { roughness: .85, clearcoat: 0 })
  for (const [x0, x1] of DOOR ? [[-W / 2, DOOR.x0], [DOOR.x1, W / 2]] : [[-W / 2, W / 2]]) {
    root.add(mesh(new THREE.BoxGeometry(x1 - x0, .14, .03), skirtM, (x0 + x1) / 2, .07, bz + .075))
    const dado = mesh(new THREE.BoxGeometry(x1 - x0, .9, .02), dadoM, (x0 + x1) / 2, .55, bz + .07); dado.receiveShadow = true; root.add(dado)
  }
  // side walls (only seen in wide shots)
  for (const sx of [-1, 1]) { const s = mesh(new THREE.BoxGeometry(.12, HT, D), wallM, sx * W / 2, HT / 2, D / 2 - 3); s.receiveShadow = true; root.add(s) }
  // the ceiling gets only bounce light; a little emissive keeps it cream instead of muddy brown
  const ceil = mesh(new THREE.BoxGeometry(W, .1, D), mat('#F1E2C4', { roughness: .9, clearcoat: 0, emissive: '#F1E2C4', emissiveIntensity: .32 }), 0, HT, D / 2 - 3); root.add(ceil)

  // window: wooden frame, shutters, grill, and the garden outside
  const wood = mat('#6B3E22', { roughness: .45, clearcoat: .5 })
  const fr = (w, h, x, y) => { const b = rbox(w, h, .16, .02, wood); b.position.set(x, y, bz + .02); root.add(b) }
  fr(winW + .16, .1, winX, winT); fr(winW + .2, .1, winX, winB); fr(.1, winT - winB, winX - winW / 2, (winT + winB) / 2); fr(.1, winT - winB, winX + winW / 2, (winT + winB) / 2)
  fr(.06, winT - winB, winX, (winT + winB) / 2)
  const sill = rbox(winW + .4, .06, .32, .02, wood); sill.position.set(winX, winB - .02, bz + .14); root.add(sill)
  for (let i = 1; i < 9; i++) { const x = winX - winW / 2 + i * winW / 9; const bar = mesh(new THREE.CylinderGeometry(.012, .012, winT - winB, 8), mat('#2B2B2B', { metalness: .6, roughness: .4 }), x, (winT + winB) / 2, bz - .02); root.add(bar) }
  // open shutters, green like a Kerala tharavad
  const shutM = mat('#3E7D5A', { roughness: .55, clearcoat: .3 })
  for (const sx of [-1, 1]) {
    const sh = rbox(winW / 2, winT - winB, .05, .02, shutM)
    sh.position.set(winX + sx * (winW / 2 + winW / 4 + .06), (winT + winB) / 2, bz + .1); root.add(sh)
    for (let j = 0; j < 6; j++) { const sl = mesh(new THREE.BoxGeometry(winW / 2 - .12, .025, .02), mat('#2F6447'), sh.position.x, winB + .18 + j * .22, bz + .135); root.add(sl) }
  }
  // the doorway: wooden frame, a door leaf swung open against the inside wall, a step, and outside
  // a laterite front yard with a low compound wall and an open gate (where Manu's bike is parked)
  if (DOOR) {
    const dw = DOOR.x1 - DOOR.x0, dx = (DOOR.x0 + DOOR.x1) / 2
    fr(.1, DOOR.top, DOOR.x0, DOOR.top / 2); fr(.1, DOOR.top, DOOR.x1, DOOR.top / 2); fr(dw + .2, .12, dx, DOOR.top + .02)
    const leaf = rbox(dw - .06, DOOR.top - .06, .05, .02, wood); leaf.position.set(DOOR.x0 - (dw - .06) / 2 + .02, DOOR.top / 2, bz + .12); root.add(leaf)
    for (const y of [.55, 1.6]) { const p = rbox(dw - .3, .6, .02, .02, mat('#5A321B', { roughness: .5 })); p.position.set(leaf.position.x, y, bz + .15); root.add(p) }
    const step = rbox(dw + .3, .08, .5, .02, mat('#8E8A80', { roughness: .8 })); step.position.set(dx, .04, bz - .3); root.add(step)
    const yard = mesh(new THREE.PlaneGeometry(W, 6.5), mat('#C98B5B', { roughness: .95, clearcoat: 0, map: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#C98B5B'; g.fillRect(0, 0, w, h)
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${90 + Math.random() * 60},40,20,${Math.random() * .12})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3) }
    }) }))
    yard.rotation.x = -Math.PI / 2; yard.position.set(0, .002, bz - 3.25); yard.receiveShadow = true; root.add(yard)
    const wallYM = mat('#E9DCC4', { roughness: .85, clearcoat: 0 }), capM = mat('#B9A88C', { roughness: .8 })
    const gz = -5.6, gw = 1.5, gx = dx
    for (const [x0, x1] of [[-W / 2, gx - gw / 2], [gx + gw / 2, W / 2]]) {
      const w = mesh(new THREE.BoxGeometry(x1 - x0, .95, .2), wallYM, (x0 + x1) / 2, .475, gz); w.castShadow = w.receiveShadow = true; root.add(w)
      root.add(mesh(new THREE.BoxGeometry(x1 - x0, .06, .26), capM, (x0 + x1) / 2, .98, gz))
    }
    for (const sx of [-1, 1]) { const p = rbox(.3, 1.25, .3, .03, wallYM); p.position.set(gx + sx * (gw / 2 + .05), .625, gz); p.castShadow = true; root.add(p) }
    // the gate, swung open outwards (clear of the bike parked inside): a black steel frame with bars
    const gm = mat('#2B2B2B', { metalness: .6, roughness: .4 })
    const gate = new THREE.Group(); gate.position.set(gx - gw / 2, 0, gz); gate.rotation.y = 1.25; root.add(gate)
    gate.add(mesh(new THREE.BoxGeometry(gw - .05, .04, .04), gm, gw / 2, .2, 0)); gate.add(mesh(new THREE.BoxGeometry(gw - .05, .04, .04), gm, gw / 2, 1.0, 0))
    for (let i = 0; i <= 8; i++) gate.add(mesh(new THREE.CylinderGeometry(.012, .012, .84, 6), gm, .04 + i * (gw - .12) / 8, .6, 0))
    // a hibiscus by the wall for colour
    const bush = new THREE.Group(); bush.position.set(gx - 2.1, 0, gz + .45); root.add(bush)
    for (const [x, y, z, r] of [[0, .35, 0, .38], [.3, .5, .05, .3], [-.28, .45, .1, .3]]) { const b = sphere(r, mat('#3F8F4E', { roughness: .8 }), 20); b.position.set(x, y, z); bush.add(b) }
    for (const [x, y, z] of [[.1, .72, .25], [-.25, .62, .32], [.38, .6, .28]]) { const f = sphere(.05, mat('#E23B4A', { roughness: .5 }), 12); f.position.set(x, y, z); bush.add(f) }
    shadows(bush)
  }
  // outside: sky, hills, palms (out of focus most of the time)
  const sky = mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ map: canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9DD7F2'); gr.addColorStop(.6, '#D8F0F2'); gr.addColorStop(1, '#F6EFD8'); g.fillStyle = gr; g.fillRect(0, 0, w, h)
  }), toneMapped: false }), winX, 2.2, -8); root.add(sky)
  if (DOOR) { sky.position.set(0, 3, -15); sky.scale.set(2.4, 1.8, 1) }  // behind the pushed-back hills
  const hillM = mat('#7FBF83', { roughness: 1, clearcoat: 0 })
  for (const [x, s] of [[-1, 3.2], [3.5, 2.6], [1.2, 2]]) { const hill = sphere(s, hillM, 32); hill.scale.set(1.6, .45, 1); hill.position.set(x, 0, DOOR ? -11.5 : -7); root.add(hill) }  // with the door open they sit behind the yard
  const palm = (x, z, h, lean) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.z = lean
    const trunk = tube([[0, 0, 0], [.05, h * .5, 0], [.18, h, 0]], .07, mat('#8A6A48', { roughness: .9 })); g.add(trunk)
    const crown = new THREE.Group(); crown.position.set(.18, h, 0); g.add(crown)
    for (let i = 0; i < 9; i++) {
      const fr = tube([[0, 0, 0], [.5, .25, 0], [1.05, -.2, 0]], .045, mat('#3F8F4E', { roughness: .8 }))
      fr.scale.set(1, 1, 3); fr.rotation.y = i * Math.PI * 2 / 9; crown.add(fr)
    }
    root.add(g); return crown
  }
  anim.palms = [palm(winX - .6, -5.2, 3.4, .06), palm(winX + 1.1, -6, 3.9, -.08), palm(winX - 1.8, -6.5, 3.1, .1)]

  // ceiling fan
  const fan = new THREE.Group(); fan.position.set(-.2, HT - .45, -.6)
  fan.add(mesh(new THREE.CylinderGeometry(.02, .02, .4, 8), mat('#9A9A9A', { metalness: .7, roughness: .3 }), 0, .22, 0))
  fan.add(mesh(new THREE.CylinderGeometry(.12, .1, .1, 24), mat('#B3B3B3', { metalness: .6, roughness: .3 })))
  const blades = new THREE.Group(); fan.add(blades)
  for (let i = 0; i < 3; i++) { const b = rbox(.75, .015, .13, .006, mat('#C9C9C9', { metalness: .4, roughness: .35 })); b.position.x = .45; const arm = group(b); arm.rotation.y = i * Math.PI * 2 / 3; blades.add(arm) }
  shadows(fan, true, false); root.add(fan); anim.fan = blades

  // teal sofa against the wall
  const teal = mat('#2F6E73', { roughness: .7, clearcoat: .1, sheen: .5, sheenColor: new THREE.Color('#7fc7c4') })
  const sofa = new THREE.Group(); sofa.position.set(.9, 0, -2.15)  // clear of the windowsill behind it
  const sb = (w, h, d, x, y, z) => { const b = rbox(w, h, d, .08, teal); b.position.set(x, y, z); sofa.add(b) }
  sb(2.4, .42, .9, 0, .32, 0); sb(2.4, .7, .26, 0, .75, -.34); sb(.26, .62, .9, -1.2, .45, 0); sb(.26, .62, .9, 1.2, .45, 0)
  sb(1.05, .16, .7, -.55, .6, .05); sb(1.05, .16, .7, .55, .6, .05)
  for (const sx of [-1, 1]) { const l = mesh(new THREE.CylinderGeometry(.04, .03, .12, 10), wood, sx * 1.1, .06, .35); sofa.add(l) }
  const cushion = rbox(.38, .36, .14, .07, mat('#F2B52C', { roughness: .8, sheen: .5 })); cushion.position.set(-.85, .82, -.18); cushion.rotation.z = .2; sofa.add(cushion)
  shadows(sofa); root.add(sofa)

  // nilavilakku: the brass lamp, lit
  const brass = mat('#C99A3E', { metalness: .85, roughness: .28, clearcoat: .3 })
  const lampProf = [[0, 0], [.22, 0], [.22, .03], [.12, .06], [.05, .1], [.04, .7], [.07, .74], [.2, .8], [.21, .83], [.05, .85], [.03, .95], [.06, 1.0], [0, 1.02]].map(([x, y]) => new THREE.Vector2(x, y))
  const lamp = new THREE.Mesh(new THREE.LatheGeometry(lampProf, 40), brass); lamp.position.set(-3.1, 0, -1.9); shadows(lamp); root.add(lamp)
  const flameM = new THREE.MeshBasicMaterial({ color: '#FFB020', toneMapped: false })
  const flames = [0, 1, 2, 3, 4].map(i => { const a = i * Math.PI * 2 / 5; const f = sphere(.025, flameM, 12); f.scale.set(1, 2, 1); f.position.set(-3.1 + Math.cos(a) * .17, .88, -1.9 + Math.sin(a) * .17); root.add(f); return f })
  const lampLight = new THREE.PointLight('#FFB45A', 3.5, 4, 1.6); lampLight.position.set(-3.1, 1.0, -1.9); root.add(lampLight)
  anim.flames = flames; anim.lampLight = lampLight

  // wall clock
  const clock = new THREE.Group(); clock.position.set(-2.5, 2.35, bz + .08)
  clock.add(mesh(new THREE.CylinderGeometry(.24, .24, .05, 40), wood).rotateX(Math.PI / 2))
  const face = mesh(new THREE.CylinderGeometry(.205, .205, .052, 40), mat('#FFFDF6', { roughness: .4 })); face.rotation.x = Math.PI / 2; face.position.z = .004; clock.add(face)
  const hand = (len, w) => { const g = new THREE.Group(); const b = mesh(new THREE.BoxGeometry(w, len, .01), mat(C.ink)); b.position.y = len / 2; g.add(b); g.position.z = .035; clock.add(g); return g }
  anim.hourHand = hand(.11, .02); anim.minHand = hand(.16, .012)
  shadows(clock); root.add(clock)

  // family photo
  const photo = new THREE.Group(); photo.position.set(-.3, 1.95, bz + .07)
  photo.add(rbox(.62, .48, .04, .015, wood))
  const pic = mesh(new THREE.PlaneGeometry(.52, .38), mat('#fff', { roughness: .3, clearcoat: .8, map: canvasTex(256, 190, (g, w, h) => {
    g.fillStyle = '#CFE3D6'; g.fillRect(0, 0, w, h); g.fillStyle = '#7CC59A'; g.beginPath(); g.moveTo(0, h); g.lineTo(w * .35, h * .35); g.lineTo(w * .6, h * .7); g.lineTo(w * .8, h * .45); g.lineTo(w, h); g.fill()
    g.fillStyle = '#3E7D5A'; g.beginPath(); g.moveTo(w * .2, h); g.lineTo(w * .45, h * .55); g.lineTo(w * .7, h); g.fill()
  }) }), 0, 0, .021); photo.add(pic); shadows(photo); root.add(photo)

  // money plant in a glass bottle on the sill (the show's quiet mascot)
  const bottle = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.06, 0], [.065, .02], [.065, .16], [.03, .22], [.022, .28], [0, .28]].map(([x, y]) => new THREE.Vector2(x, y)), 24),
    mat('#CFEFE3', { transparent: true, opacity: .45, roughness: .05, clearcoat: 1 }))
  bottle.position.set(winX + .55, winB + .01, bz + .16); root.add(bottle)
  const vineM = mat('#3E9B5C', { roughness: .5, clearcoat: .4 })
  const vine = tube([[0, .26, 0], [-.05, .45, .02], [-.18, .6, .06], [-.35, .55, .1], [-.42, .38, .12]], .006, vineM)
  vine.position.copy(bottle.position); root.add(vine)
  for (const [x, y, z, r] of [[-.05, .45, .02, .3], [-.18, .6, .06, -.4], [-.35, .55, .1, .6], [-.42, .4, .12, -.2], [.02, .33, .01, .8]]) {
    const l = sphere(.045, vineM, 16); l.scale.set(1, .55, .25); l.rotation.z = r; l.position.set(bottle.position.x + x, bottle.position.y + y, bottle.position.z + z); l.castShadow = true; root.add(l)
  }

  // the rug in the middle of the room
  const rug = mesh(new THREE.CylinderGeometry(1.7, 1.7, .015, 64), mat('#B07A3E', { roughness: .95, clearcoat: 0, sheen: .6, sheenColor: new THREE.Color('#f3c98a') }), 0, .008, .2)
  rug.scale.z = .62; rug.receiveShadow = true; root.add(rug)
  const ring = mesh(new THREE.TorusGeometry(1.45, .025, 6, 80), mat('#8C5A2A', { roughness: 1 }), 0, .017, .2); ring.rotation.x = Math.PI / 2; ring.scale.y = .62; root.add(ring)

  function animate(t) {
    anim.fan.rotation.y = t * 5
    anim.flames.forEach((f, i) => { const k = 1 + .15 * Math.sin(t * 13 + i * 1.7) + .1 * Math.sin(t * 7.3 + i); f.scale.set(1, 2 * k, 1) })
    anim.lampLight.intensity = 3.5 + .5 * Math.sin(t * 11) * Math.sin(t * 4.7)
    anim.minHand.rotation.z = -t * .4 - 1.2; anim.hourHand.rotation.z = -t * .033 - 2.6
    anim.palms.forEach((c, i) => { c.rotation.z = Math.sin(t * .9 + i) * .04; c.rotation.x = Math.sin(t * .7 + i * 2) * .03 })
  }
  return { root, animate, window: { x: winX, y: (winB + winT) / 2, z: bz }, door: DOOR && { x: (DOOR.x0 + DOOR.x1) / 2, z: bz, gateZ: -5.6 } }
}

/** Warm Kerala daylight: sun through the window, sky fill, a rim, soft shadows. */
export function lightRoom(scene, { sunFrom = [4, 5.5, -6], target = [0, 1, 0] } = {}) {
  const hemi = new THREE.HemisphereLight('#FFF1D6', '#7A3524', .9); scene.add(hemi)
  const sun = new THREE.DirectionalLight('#FFE0B2', 3.2)
  sun.position.set(...sunFrom); sun.target.position.set(...target); scene.add(sun, sun.target)
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 6; sun.shadow.blurSamples = 16
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -3, near: .5, far: 20 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02
  const key = new THREE.DirectionalLight('#FFF4E6', 1.5); key.position.set(-3, 4, 6); key.target.position.set(...target); scene.add(key, key.target)
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 8; key.shadow.blurSamples = 16
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -2, near: .5, far: 20 }); key.shadow.bias = -.0004; key.shadow.normalBias = .02
  const rim = new THREE.DirectionalLight('#CFE8FF', 1.6); rim.position.set(2, 3, -4); scene.add(rim)
  return { hemi, sun, key, rim }
}
