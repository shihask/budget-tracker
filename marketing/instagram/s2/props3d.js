// Season 2 props (premium-toy style, same materials as cast3d.js). Text never goes in 3D:
// labels and amounts are HTML tags placed by the episode from projected positions.

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mat, shadows } from './cast3d.js'

const rbox = (w, h, d, r, m) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), m)
const lathe = (pts, m, seg = 40) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), m)
const sphere = (r, m, seg = 24) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * .75)), m)
const group = (...k) => { const g = new THREE.Group(); k.forEach(o => g.add(o)); return g }
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}

export const JAR_COLORS = { needs: '#16A36E', wants: '#F28C28', savings: '#3B82F6' }

/** Low wooden coffee table; top surface at y = TOP. */
export function buildTable() {
  const wood = mat('#7A4A2A', { roughness: .4, clearcoat: .6, clearcoatRoughness: .25 })
  const top = rbox(1.6, .06, .72, .03, wood); top.position.y = .45
  const g = group(top)
  for (const [x, z] of [[-.7, -.28], [.7, -.28], [-.7, .28], [.7, .28]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.035, .028, .42, 12), wood); leg.position.set(x, .21, z); g.add(leg)
  }
  return { root: shadows(g), TOP: .48 }
}

/**
 * A glass jar with a coloured band and a stack of coins inside.
 * fill(k): 0…1 of the jar's height in coins. Returns { root, setFill, H, R }.
 */
export function buildJar(color) {
  const H = .36, R = .13
  const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: .92, thickness: .02, roughness: .04, ior: 1.45,
    clearcoat: 1, transparent: true, opacity: 1, side: THREE.DoubleSide, envMapIntensity: .9, attenuationColor: new THREE.Color('#e9fff6'), attenuationDistance: 2 })
  const prof = [[0, 0], [R - .01, 0], [R, .012], [R + .004, H * .5], [R - .002, H - .05], [R - .03, H - .02], [R - .028, H], [R - .02, H + .012], [R - .032, H + .012], [R - .04, H - .02], [R - .014, H - .05], [R - .008, H * .5], [R - .012, .014], [0, .012]]
  const jar = lathe(prof, glass, 48); jar.castShadow = true
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + .007, R + .007, .07, 48, 1, true), mat(color, { roughness: .45, clearcoat: .6, side: THREE.DoubleSide }))
  band.position.y = H * .62
  // coins: an instanced stack; each coin a little offset so it reads as a pile, not a tube
  const N = 46, coinGeo = new THREE.CylinderGeometry(.075, .075, .014, 28)
  const coinMat = mat('#E8B33A', { metalness: .85, roughness: .28, clearcoat: .5 })
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, N); coins.castShadow = true
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3()
  const place = i => { const a = i * 2.39996; e.set(Math.sin(i * 1.7) * .08, a, Math.cos(i * 2.3) * .08); q.setFromEuler(e)
    p.set(Math.cos(a) * .018, .02 + i * .0068, Math.sin(a) * .018); return m.compose(p, q, s) }
  for (let i = 0; i < N; i++) coins.setMatrixAt(i, place(i))
  coins.count = 0
  coins.frustumCulled = false  // bounds measured while empty would cull the stack forever
  const root = group(coins, jar, band)
  return {
    root, H, R, band,
    setFill(k) { coins.count = Math.round(Math.max(0, Math.min(1, k)) * N) },
  }
}

/** A toy house: "rent". */
export function buildHouse() {
  const wall = rbox(.13, .1, .11, .015, mat('#FFF4DF', { roughness: .6 }))
  wall.position.y = .05
  const roof = new THREE.Mesh(new THREE.ConeGeometry(.115, .08, 4), mat('#C2452D', { roughness: .45, clearcoat: .6 }))
  roof.rotation.y = Math.PI / 4; roof.position.y = .14
  const door = rbox(.03, .05, .01, .006, mat('#7A4A2A')); door.position.set(0, .03, .056)
  const win = rbox(.028, .028, .01, .004, mat('#8FD3F4', { roughness: .1 })); win.position.set(.04, .065, .056)
  return shadows(group(wall, roof, door, win))
}

/** Biryani in a brass handi: "a want". */
export function buildBiryani() {
  const brass = mat('#C99A3E', { metalness: .85, roughness: .3 })
  const pot = lathe([[0, 0], [.06, 0], [.085, .03], [.09, .06], [.075, .085], [.07, .09], [0, .09]], brass)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.072, .008, 8, 32), brass); rim.rotation.x = Math.PI / 2; rim.position.y = .09
  const rice = sphere(.07, mat('#FFF1C9', { roughness: .85 })); rice.scale.set(1, .55, 1); rice.position.y = .095
  const g = group(pot, rim, rice)
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = .02 + (i % 3) * .015
    const grain = sphere(.008, mat(i % 2 ? '#F2A33A' : '#E36B2C', { roughness: .7 }), 8); grain.scale.set(1.6, .6, .6)
    grain.position.set(Math.cos(a) * r, .125 + (i % 3) * -.006, Math.sin(a) * r); g.add(grain) }
  const leaf = sphere(.014, mat('#3E9B5C'), 10); leaf.scale.set(1.8, .4, 1); leaf.position.set(.01, .133, .005); g.add(leaf)
  return shadows(g)
}

/** A gold coin with a sprout on top: "savings, for tomorrow". */
export function buildSproutCoin() {
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .016, 32), mat('#E8B33A', { metalness: .85, roughness: .28 }))
  coin.rotation.x = Math.PI / 2; coin.position.y = .06
  const rupee = rbox(.03, .006, .02, .002, mat('#B9862A', { metalness: .8, roughness: .35 })); rupee.position.set(0, .07, .009)
  const green = mat('#3E9B5C', { roughness: .45, clearcoat: .5 })
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.004, .005, .05, 8), green); stem.position.y = .14
  const g = group(coin, rupee, stem)
  for (const sx of [-1, 1]) { const l = sphere(.022, green, 14); l.scale.set(1.5, .45, .9); l.position.set(sx * .022, .165, 0); l.rotation.z = sx * .45; g.add(l) }
  return shadows(g)
}

/** The shiny new-phone box with a swinging tag (no price: the script gives none). */
export function buildPhoneBox() {
  const art = canvasTex(256, 420, (g, w, h) => {
    g.fillStyle = '#F7F7F9'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#16181D'; g.beginPath(); g.roundRect(58, 56, 140, 270, 22); g.fill()
    const gr = g.createLinearGradient(66, 64, 190, 318); gr.addColorStop(0, '#5B8CFF'); gr.addColorStop(.5, '#B65BFF'); gr.addColorStop(1, '#FF7A59')
    g.fillStyle = gr; g.beginPath(); g.roundRect(66, 64, 124, 254, 16); g.fill()
    g.fillStyle = '#16181D'; g.font = '800 34px Plus Jakarta Sans, sans-serif'; g.textAlign = 'center'; g.fillText('NEW', w / 2, 380)
  })
  const box = new THREE.Mesh(new RoundedBoxGeometry(.13, .21, .045, 4, .008), [
    mat('#EDEDF1'), mat('#EDEDF1'), mat('#EDEDF1'), mat('#EDEDF1'), mat('#ffffff', { map: art, roughness: .25, clearcoat: 1 }), mat('#EDEDF1')])
  box.position.y = .105
  const tagPivot = new THREE.Group(); tagPivot.position.set(.065, .2, .024)
  const string = new THREE.Mesh(new THREE.CylinderGeometry(.0015, .0015, .05, 6), mat('#C9A86A')); string.position.y = -.025; tagPivot.add(string)
  const tag = rbox(.035, .05, .004, .006, mat('#E3463A', { roughness: .4, clearcoat: .8 })); tag.position.y = -.06; tagPivot.add(tag)
  const g = group(box, tagPivot)
  return { root: shadows(g), tagPivot }
}

/** A shopping bag: "a want". */
export function buildBag() {
  const body = rbox(.13, .14, .07, .012, mat('#E8577A', { roughness: .55 })); body.position.y = .07
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.035, .006, 8, 24, Math.PI), mat('#7A2440')); handle.position.y = .14
  return shadows(group(body, handle))
}

/** A cinema ticket: "a want". */
export function buildTicket() {
  const tex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#FFD25A'; g.fillRect(0, 0, w, h); g.fillStyle = '#E3A31A'; g.fillRect(0, 0, w, 18); g.fillRect(0, h - 18, w, 18)
    g.setLineDash([8, 8]); g.strokeStyle = '#B9821A'; g.lineWidth = 4; g.beginPath(); g.moveTo(w * .72, 0); g.lineTo(w * .72, h); g.stroke()
    g.fillStyle = '#7A4A10'; g.beginPath(); for (const [x, y] of [[60, 64]]) { g.arc(x, y, 22, 0, Math.PI * 2) } g.fill()
  })
  const t = new THREE.Mesh(new RoundedBoxGeometry(.16, .08, .006, 2, .004), [mat('#FFD25A'), mat('#FFD25A'), mat('#FFD25A'), mat('#FFD25A'), mat('#fff', { map: tex, roughness: .5 }), mat('#FFD25A')])
  t.position.y = .04
  return shadows(group(t))
}

/** The tiny seedling in a clay pot (EP01's last shot; it grows by EP06). grow: 0…1 */
export function buildSeedling() {
  const clay = mat('#B5562F', { roughness: .7, clearcoat: .1 })
  const pot = lathe([[0, 0], [.045, 0], [.06, .07], [.068, .075], [.068, .088], [.06, .088], [0, .085]], clay)
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(.057, .057, .006, 24), mat('#4A2E1E', { roughness: 1 })); soil.position.y = .084
  const green = mat('#4CB36A', { roughness: .4, clearcoat: .6 })
  const sprout = new THREE.Group(); sprout.position.y = .086
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.003, .004, .05, 8), green); stem.position.y = .025; sprout.add(stem)
  for (const sx of [-1, 1]) { const l = sphere(.016, green, 14); l.scale.set(1.6, .4, 1); l.position.set(sx * .016, .052, 0); l.rotation.z = sx * .5; sprout.add(l) }
  const g = group(pot, soil, sprout)
  return { root: shadows(g), sprout }
}

/**
 * EP06: the same clay pot, the seedling grown into a healthy money plant — heart-shaped leaves on
 * arching stems. `grow` (0…1) unfurls the leaves; `sway` is the group to rock gently.
 */
export function buildGrownPlant() {
  const clay = mat('#B5562F', { roughness: .7, clearcoat: .1 })
  const pot = lathe([[0, 0], [.045, 0], [.06, .07], [.068, .075], [.068, .088], [.06, .088], [0, .085]], clay)
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(.057, .057, .006, 24), mat('#4A2E1E', { roughness: 1 })); soil.position.y = .084
  const leafM = mat('#3E9B5C', { roughness: .45, clearcoat: .6 }), stemM = mat('#4C8A3A', { roughness: .6 })
  const heart = new THREE.Shape(); heart.moveTo(0, -.02); heart.bezierCurveTo(.03, .005, .026, .03, 0, .02); heart.bezierCurveTo(-.026, .03, -.03, .005, 0, -.02)
  const leafGeo = new THREE.ExtrudeGeometry(heart, { depth: .002, bevelEnabled: true, bevelSize: .002, bevelThickness: .002, bevelSegments: 2 })
  const sway = new THREE.Group(); sway.position.y = .086
  const leaves = []
  const STEMS = [[0, .2, 0], [.07, .16, .03], [-.07, .17, -.02], [.03, .13, -.07], [-.04, .12, .07]]
  STEMS.forEach(([x, h, z], i) => {
    const pts = [[0, 0, 0], [x * .3, h * .55, z * .3], [x, h, z]].map(p => new THREE.Vector3(...p))
    sway.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, .0035, 6), stemM))
    for (let j = 0; j < 3; j++) {
      const k = (j + 1) / 3, p = new THREE.CatmullRomCurve3(pts).getPoint(k)
      const l = new THREE.Mesh(leafGeo, leafM); l.position.copy(p)
      l.rotation.set(-.4 - j * .2, i * 1.3 + j * 2.1, (j % 2 ? .5 : -.5)); l.castShadow = true
      sway.add(l); leaves.push({ l, s: 1.3 + j * .25 })
    }
  })
  const g = group(pot, soil, sway)
  return {
    root: shadows(g), sway,
    grow(k) { leaves.forEach(({ l, s }, i) => l.scale.setScalar(Math.max(.001, s * Math.min(1, Math.max(0, k * 1.4 - i * .025))))) },
  }
}

/** Manu's open bifold wallet (EP02 hook): brown leather, two card edges peeking out. */
export function buildWallet() {
  const leather = mat('#6B3A1E', { roughness: .55, clearcoat: .35 }), inner = mat('#4E2914', { roughness: .7 })
  const half = sx => {
    const g = new THREE.Group()
    const shell = rbox(.1, .085, .008, .006, leather); shell.position.x = sx * .05; g.add(shell)
    const lining = rbox(.092, .078, .002, .002, inner); lining.position.set(sx * .05, 0, .005); g.add(lining)
    return g
  }
  const left = half(-1), right = half(1)
  left.rotation.y = .5; right.rotation.y = -.5   // opened
  ;['#3B82F6', '#E8B33A'].forEach((c, i) => {
    const card = rbox(.07, .045, .002, .003, mat(c, { roughness: .3, clearcoat: .8 })); card.position.set(-.052, .024 + i * .008, .008 + i * .002); left.add(card)
  })
  return shadows(group(left, right))
}

/** A single gold coin (falls out of the wallet). */
export function buildCoin() {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .007, 28), mat('#E8B33A', { metalness: .85, roughness: .28, clearcoat: .5 }))
  return shadows(group(c))
}

/**
 * A bill token: a coloured disc with a toy object on it (EP02's commitments).
 * kind: 'rent' (house) · 'emi' (scooter) · 'phone' · 'insurance' (shield). Labels are HTML.
 */
export function buildToken(kind, color) {
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(.075, .08, .022, 40), mat(color, { roughness: .35, clearcoat: .8 }))
  disc.position.y = .011
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.076, .006, 10, 40), mat('#ffffff', { roughness: .3, clearcoat: 1 }))
  rim.rotation.x = Math.PI / 2; rim.position.y = .022
  const g = group(disc, rim), top = new THREE.Group(); top.position.y = .022; g.add(top)
  const white = mat('#FFFDF7', { roughness: .45, clearcoat: .6 }), dark = mat('#2A2420', { roughness: .5 })
  if (kind === 'rent') { const h = buildHouse(); h.scale.setScalar(.85); top.add(h) }
  if (kind === 'emi') {  // a little scooter
    const body = mat(color, { roughness: .35, clearcoat: .9 }), tyre = mat('#22201E', { roughness: .6 })
    for (const x of [-.04, .04]) { const w = new THREE.Mesh(new THREE.TorusGeometry(.018, .008, 10, 24), tyre); w.position.set(x, .026, 0); top.add(w) }
    const deck = rbox(.075, .012, .03, .005, white); deck.position.set(0, .03, 0); top.add(deck)
    const back = rbox(.04, .035, .034, .012, body); back.position.set(-.03, .05, 0); top.add(back)
    const seat = rbox(.032, .01, .026, .005, dark); seat.position.set(-.03, .072, 0); top.add(seat)
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.005, .005, .07, 8), white); stem.position.set(.038, .065, 0); stem.rotation.z = -.25; top.add(stem)
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .045, 8), dark); bar.rotation.x = Math.PI / 2; bar.position.set(.047, .1, 0); top.add(bar)
    const lamp = sphere(.007, mat('#FFE9A8', { emissive: '#FFD970', emissiveIntensity: .6 }), 10); lamp.position.set(.05, .088, 0); top.add(lamp)
  }
  if (kind === 'phone') {  // a handset with a glowing screen and wi-fi arcs above it
    const p = new THREE.Group(); p.position.y = .06; p.rotation.x = -.15; top.add(p)
    p.add(rbox(.05, .095, .01, .007, mat('#1C1410', { roughness: .3, clearcoat: 1 })))
    const s = new THREE.Mesh(new THREE.PlaneGeometry(.043, .082), mat('#5BB8FF', { emissive: '#3B82F6', emissiveIntensity: .5, roughness: .2 })); s.position.z = .0055; p.add(s)
    for (let i = 0; i < 3; i++) {
      const a = new THREE.Mesh(new THREE.TorusGeometry(.01 + i * .009, .0028, 6, 20, Math.PI / 2), white)
      a.rotation.z = Math.PI / 4; a.position.set(0, .06, 0); p.add(a)
    }
  }
  if (kind === 'insurance') {  // a shield with a cross
    const sh = new THREE.Shape(); sh.moveTo(0, .05); sh.quadraticCurveTo(.025, .045, .042, .036); sh.lineTo(.04, -.005)
    sh.quadraticCurveTo(.034, -.04, 0, -.058); sh.quadraticCurveTo(-.034, -.04, -.04, -.005); sh.lineTo(-.042, .036); sh.quadraticCurveTo(-.025, .045, 0, .05)
    const shield = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .014, bevelEnabled: true, bevelSize: .004, bevelThickness: .004, bevelSegments: 3 }), mat(color, { roughness: .3, clearcoat: 1 }))
    shield.position.set(0, .068, -.007); top.add(shield)
    for (const [w, h] of [[.016, .046], [.046, .016]]) { const b = rbox(w, h, .006, .003, white); b.position.set(0, .07, .013); top.add(b) }
  }
  if (kind === 'school') {  // the school-fee envelope, standing, flap sealed with a dot
    const env = new THREE.Group(); env.position.y = .045; env.rotation.x = -.12; top.add(env)
    env.add(rbox(.095, .062, .008, .004, white))
    const flap = new THREE.Mesh(new THREE.CircleGeometry(.05, 3), mat('#ECE4D3', { roughness: .5 })); flap.rotation.z = -Math.PI / 2; flap.scale.set(.66, .95, 1); flap.position.set(0, .012, .0045); env.add(flap)
    const seal = sphere(.008, mat(color, { roughness: .35, clearcoat: .8 }), 12); seal.scale.z = .4; seal.position.set(0, -.006, .006); env.add(seal)
  }
  if (kind === 'onam') {  // a little pookalam: rings of petals
    const rings = [['#F5B700', .052], ['#F28C28', .04], ['#E23B4A', .028], ['#FFFDF7', .016]]
    rings.forEach(([c, r], i) => { const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .008, 28), mat(c, { roughness: .6 })); d.position.y = .006 + i * .005; top.add(d) })
    for (let i = 0; i < 8; i++) { const p = sphere(.009, mat('#7CC59A', { roughness: .6 }), 10); const a = i * Math.PI / 4; p.position.set(Math.cos(a) * .062, .008, Math.sin(a) * .062); p.scale.y = .5; top.add(p) }
  }
  return { root: shadows(g), top }
}

/** A short stack of gold coins: one "unit" of money on the table. */
export function buildCoinStack(n = 12) {
  const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(.034, .034, .009, 28), mat('#E8B33A', { metalness: .85, roughness: .28, clearcoat: .5 }), n)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3()
  for (let i = 0; i < n; i++) { e.set(0, i * 2.4, 0); q.setFromEuler(e); p.set(Math.sin(i * 1.9) * .003, .0045 + i * .0092, Math.cos(i * 2.7) * .003); coins.setMatrixAt(i, m.compose(p, q, s)) }
  coins.castShadow = true; coins.frustumCulled = false
  return group(coins)
}

/** A wall calendar: one day circled in red, a sticky note on it (scooter + shield sketch). No text: labels are HTML. */
export function buildWallCalendar() {
  const page = canvasTex(360, 480, (g, w, h) => {
    g.fillStyle = '#FFFDF7'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#C2452D'; g.fillRect(0, 0, w, 96)
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(110, 36, 140, 22)   // a "month" bar, not words
    const cw = (w - 16) / 7, top = 120, ch = (h - top - 16) / 5
    g.strokeStyle = '#E3D7C3'; g.lineWidth = 2
    for (let r = 0; r <= 5; r++) { g.beginPath(); g.moveTo(8, top + r * ch); g.lineTo(w - 8, top + r * ch); g.stroke() }
    for (let c = 0; c <= 7; c++) { g.beginPath(); g.moveTo(8 + c * cw, top); g.lineTo(8 + c * cw, h - 16); g.stroke() }
    g.fillStyle = '#B9AE9C'
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) g.fillRect(14 + c * cw, top + 8 + r * ch, 14, 8)   // day ticks
    g.strokeStyle = '#E3463A'; g.lineWidth = 7; g.beginPath(); g.ellipse(8 + 4.5 * cw, top + 3.5 * ch, cw * .62, ch * .58, -.1, 0, Math.PI * 2); g.stroke()
  })
  const board = rbox(.36, .48, .012, .006, mat('#ffffff', { roughness: .6 })); board.castShadow = true
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.35, .465), mat('#ffffff', { map: page, roughness: .7 })); face.position.z = .0065
  const nail = sphere(.008, mat('#8A8A8A', { metalness: .8, roughness: .3 }), 10); nail.position.set(0, .275, .006)
  const note = canvasTex(160, 160, (g, w, h) => {
    g.fillStyle = '#FFE16B'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#2A2420'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round'
    g.beginPath(); g.arc(44, 116, 16, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(116, 116, 16, 0, Math.PI * 2); g.stroke()   // scooter
    g.beginPath(); g.moveTo(44, 116); g.lineTo(72, 116); g.lineTo(98, 84); g.lineTo(112, 84); g.moveTo(98, 84); g.lineTo(116, 116); g.moveTo(50, 98); g.lineTo(82, 98); g.stroke()
    g.fillStyle = '#E3463A'; g.beginPath(); g.moveTo(60, 14); g.quadraticCurveTo(80, 16, 88, 22); g.lineTo(86, 44); g.quadraticCurveTo(80, 60, 60, 68)   // shield
    g.quadraticCurveTo(40, 60, 34, 44); g.lineTo(32, 22); g.quadraticCurveTo(40, 16, 60, 14); g.fill()
    g.fillStyle = '#fff'; g.fillRect(56, 26, 8, 30); g.fillRect(45, 37, 30, 8)
  })
  const sticky = new THREE.Mesh(new THREE.PlaneGeometry(.12, .12), mat('#ffffff', { map: note, roughness: .8, side: THREE.DoubleSide }))
  sticky.position.set(.1, -.07, .012); sticky.rotation.z = -.12
  return { root: group(board, face, nail, sticky), sticky }
}

/**
 * The same wall calendar with real dates (EP05: the salary cycle). Numerals are drawn on the page —
 * month names stay HTML. `show(page)` redraws only when the page state changes:
 *   { month: 0–11, year, fill: [from, to] | null, fillColor, ring: day | null, ringProg: 0–1,
 *     dot: day | null (salary), start: day | null (green "1st" mark), dim: day | null }
 * `flip(k)` lifts the previous page off the top hinge (k 0 → 1) for a page turn.
 */
export function buildDatedCalendar() {
  const W = 720, H = 960, TOP = 230, cw = (W - 32) / 7, ch = (H - TOP - 30) / 6
  const cell = (first, day) => { const i = first + day - 1; return [16 + (i % 7) * cw, TOP + 40 + Math.floor(i / 7) * ch] }
  function draw(g, s) {
    const first = new Date(s.year, s.month, 1).getDay(), days = new Date(s.year, s.month + 1, 0).getDate()
    g.fillStyle = '#FFFDF7'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#C2452D'; g.fillRect(0, 0, W, 190)
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(230, 72, 260, 44)   // the month bar (the name is an HTML tag)
    g.fillStyle = '#9A8F80'; g.font = '700 26px Plus Jakarta Sans, sans-serif'; g.textAlign = 'center'
    ;['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d, i) => g.fillText(d, 16 + i * cw + cw / 2, TOP + 22))
    if (s.fill) for (let d = s.fill[0]; d <= Math.min(s.fill[1], days); d++) {
      const [x, y] = cell(first, d); g.fillStyle = s.fillColor ?? 'rgba(22,163,110,.38)'; g.fillRect(x + 3, y + 3, cw - 6, ch - 6)
    }
    g.font = '800 44px Plus Jakarta Sans, sans-serif'
    for (let d = 1; d <= days; d++) {
      const [x, y] = cell(first, d)
      g.fillStyle = d === s.dim ? '#CFC6B8' : (first + d - 1) % 7 === 0 ? '#C2452D' : '#3A322C'
      g.fillText(String(d), x + cw / 2, y + ch / 2 + 15)
    }
    if (s.start) { const [x, y] = cell(first, s.start); g.strokeStyle = '#16A36E'; g.lineWidth = 8; g.beginPath(); g.arc(x + cw / 2, y + ch / 2, ch * .4, 0, Math.PI * 2); g.stroke() }
    if (s.dot) { const [x, y] = cell(first, s.dot); g.fillStyle = '#E8B33A'; g.beginPath(); g.arc(x + cw - 18, y + 18, 13, 0, Math.PI * 2); g.fill() }
    if (s.ring && s.ringProg > 0) {
      const [x, y] = cell(first, s.ring); g.strokeStyle = '#E3463A'; g.lineWidth = 9; g.lineCap = 'round'
      g.beginPath(); g.ellipse(x + cw / 2, y + ch / 2, cw * .5, ch * .46, -.12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2.1 * s.ringProg); g.stroke()
    }
  }
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8
  const old = document.createElement('canvas'); old.width = W; old.height = H
  const oldTex = new THREE.CanvasTexture(old); oldTex.colorSpace = THREE.SRGBColorSpace
  const board = rbox(.36, .48, .012, .006, mat('#ffffff', { roughness: .6 })); board.castShadow = true
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.35, .465), mat('#ffffff', { map: tex, roughness: .7 })); face.position.z = .0065
  const nail = sphere(.008, mat('#8A8A8A', { metalness: .8, roughness: .3 }), 10); nail.position.set(0, .275, .006)
  // the lifting page: hinged on the top edge, showing the previous month
  const hinge = new THREE.Group(); hinge.position.set(0, .2325, .008)
  const leaf = new THREE.Mesh(new THREE.PlaneGeometry(.35, .465), mat('#ffffff', { map: oldTex, roughness: .7, side: THREE.DoubleSide, transparent: true }))
  leaf.position.y = -.2325; hinge.add(leaf); hinge.visible = false
  let key = '', prev = null
  return {
    root: group(board, face, nail, hinge),
    /** world-space-ready local position of a day's cell centre on the current page */
    dayAt(s, day) {
      const first = new Date(s.year, s.month, 1).getDay(), [x, y] = cell(first, day)
      return [(x + cw / 2) / W * .35 - .175, .2325 - (y + ch / 2) / H * .465, .008]
    },
    show(s) {
      const k = JSON.stringify(s); if (k === key) return
      if (prev && prev.month !== s.month) { draw(old.getContext('2d'), prev); oldTex.needsUpdate = true }
      key = k; prev = s; draw(canvas.getContext('2d'), s); tex.needsUpdate = true
    },
    flip(k) {
      hinge.visible = k > 0 && k < 1
      hinge.rotation.x = -k * 2.9; leaf.material.opacity = 1 - Math.max(0, k - .6) / .4
    },
  }
}

/**
 * Manu's commuter motorbike (EP03), parked on its side stand. Faces +x; the near side is +z.
 * Returns { root, engine, exhaustTip, frontWheel, rearWheel }: the episode shakes `engine` on a
 * failed start and puffs smoke from `exhaustTip` (a world point via getWorldPosition).
 */
export function buildBike() {
  const paint = mat('#D8432F', { roughness: .32, clearcoat: .9, clearcoatRoughness: .15 })
  const black = mat('#1E1E22', { roughness: .55, clearcoat: .2 })
  const tyre = mat('#232325', { roughness: .85, clearcoat: 0 })
  const chrome = mat('#D7DCE0', { metalness: .9, roughness: .18 })
  const alloy = mat('#8C9198', { metalness: .7, roughness: .35 })
  const root = new THREE.Group()
  const R = .29, WB = 1.22   // wheel radius, wheelbase
  function wheel(x) {
    const w = new THREE.Group(); w.position.set(x, R, 0)
    w.add(new THREE.Mesh(new THREE.TorusGeometry(R - .045, .05, 14, 40), tyre))
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - .09, .014, 8, 36), alloy); w.add(rim)
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(.018, R - .1, .016), alloy); s.position.y = (R - .1) / 2; const a = group(s); a.rotation.z = i * Math.PI * 2 / 5; w.add(a) }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .09, 16), alloy); hub.rotation.x = Math.PI / 2; w.add(hub)
    root.add(w); return w
  }
  const rearWheel = wheel(-WB / 2), frontWheel = wheel(WB / 2)
  // front fork + mudguard + handlebar + headlight
  const fork = new THREE.Group(); fork.position.set(WB / 2, R, 0); fork.rotation.z = .42; root.add(fork)
  for (const z of [-.06, .06]) { const tube = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .62, 10), chrome); tube.position.set(0, .31, z); fork.add(tube) }
  const guard = new THREE.Mesh(new THREE.TorusGeometry(R + .01, .03, 8, 24, Math.PI * .7), paint); guard.rotation.z = Math.PI * .2; guard.scale.z = 1.6; fork.add(guard)
  const head = group(); head.position.set(0, .66, 0); fork.add(head)
  const lamp = sphere(.075, chrome); lamp.scale.set(.7, 1, 1); lamp.position.set(.06, 0, 0); head.add(lamp)
  const glass = sphere(.06, mat('#FFF6D6', { emissive: '#FFF1C0', emissiveIntensity: .25, roughness: .1 })); glass.scale.set(.4, .9, .9); glass.position.set(.115, 0, 0); head.add(glass)
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .62, 10), chrome); bar.rotation.x = Math.PI / 2; bar.position.set(-.04, .08, 0); head.add(bar)
  for (const z of [-.3, .3]) { const grip = new THREE.Mesh(new THREE.CylinderGeometry(.026, .026, .11, 12), black); grip.rotation.x = Math.PI / 2; grip.position.set(-.04, .08, z); head.add(grip) }
  for (const z of [-.2, .2]) { const m = sphere(.035, chrome); m.scale.set(.5, 1, 1); m.position.set(-.05, .3, z); head.add(m); const st = new THREE.Mesh(new THREE.CylinderGeometry(.007, .007, .22, 6), chrome); st.position.set(-.05, .19, z); head.add(st) }
  // tank, seat, side panel, tail
  const tank = sphere(.2, paint); tank.scale.set(1.35, .72, .78); tank.position.set(.2, .8, 0); root.add(tank)
  const stripe = sphere(.201, mat('#F4F1EA', { roughness: .3, clearcoat: .8 })); stripe.scale.set(1.36, .2, .79); stripe.position.set(.2, .79, 0); root.add(stripe)
  const seat = rbox(.6, .09, .26, .045, black); seat.position.set(-.3, .8, 0); seat.rotation.z = -.04; root.add(seat)
  const panel = rbox(.42, .2, .24, .05, paint); panel.position.set(-.3, .66, 0); root.add(panel)
  const tail = rbox(.24, .08, .18, .04, paint); tail.position.set(-.68, .82, 0); tail.rotation.z = .2; root.add(tail)
  const tl = rbox(.04, .05, .1, .015, mat('#E53935', { emissive: '#B71C1C', emissiveIntensity: .3 })); tl.position.set(-.8, .84, 0); root.add(tl)
  const rguard = new THREE.Mesh(new THREE.TorusGeometry(R + .01, .028, 8, 24, Math.PI * .55), black); rguard.position.set(-WB / 2, R, 0); rguard.rotation.z = Math.PI * .42; rguard.scale.z = 1.6; root.add(rguard)
  // frame spine + swingarm
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .75, 10), black); spine.position.set(.22, .6, 0); spine.rotation.z = -1.0; root.add(spine)
  for (const z of [-.08, .08]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .6, 8), black); arm.position.set(-.33, .38, z); arm.rotation.z = Math.PI / 2 - .2; root.add(arm) }
  const shock = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .36, 10), chrome); shock.position.set(-.5, .55, .1); shock.rotation.z = -.35; root.add(shock)
  // engine (the close-up's subject): cylinder block with fins, crankcase, kick lever
  const engine = new THREE.Group(); engine.position.set(.05, .42, 0); root.add(engine)
  const crank = rbox(.36, .2, .2, .07, alloy); engine.add(crank)
  const block = new THREE.Group(); block.position.set(.13, .14, 0); block.rotation.z = -.35; engine.add(block)
  for (let i = 0; i < 6; i++) { const fin = rbox(.17, .018, .2, .008, alloy); fin.position.y = i * .03; block.add(fin) }
  const cap = rbox(.1, .05, .12, .02, chrome); cap.position.y = .19; block.add(cap)
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, .03, 24), chrome); cover.rotation.x = Math.PI / 2; cover.position.set(-.04, -.01, .11); engine.add(cover)
  const kick = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .2, 8), chrome); kick.position.set(-.2, -.02, .13); kick.rotation.z = 1.1; engine.add(kick)
  // exhaust running back along the near side
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[.18, .5, .06], [.12, .26, .14], [-.25, .24, .15], [-.62, .33, .15]].map(p => new THREE.Vector3(...p))), 30, .028, 10), chrome)
  root.add(pipe)
  const muffler = new THREE.Mesh(new THREE.CylinderGeometry(.05, .04, .34, 16), chrome); muffler.rotation.z = Math.PI / 2 - .2; muffler.position.set(-.58, .33, .15); root.add(muffler)
  const exhaustTip = new THREE.Object3D(); exhaustTip.position.set(-.76, .36, .15); root.add(exhaustTip)
  // side stand: the bike leans a little towards the far side
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .32, 6), black); stand.position.set(-.1, .15, -.12); stand.rotation.x = .5; root.add(stand)
  root.rotation.x = -.06
  return { root: shadows(root), engine, exhaustTip, frontWheel, rearWheel }
}
