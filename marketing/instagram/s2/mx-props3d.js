// Money Experiments (S01) props: the shop counter, cash and UPI. Same premium-toy materials as
// cast3d.js / props3d.js (Season 2 files are imported, never edited). Text never goes in 3D:
// amounts and labels are HTML tags placed by the episode from projected positions.
// Notes and the QR code are generic on purpose: no real currency artwork, no payment-app branding.

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mat, shadows } from './cast3d.js'

const rbox = (w, h, d, r, m) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), m)
const sphere = (r, m, seg = 24) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * .75)), m)
const group = (...k) => { const g = new THREE.Group(); k.forEach(o => g.add(o)); return g }
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}

/**
 * A Kerala tea shop (chaya kada), seen from behind the counter: characters face +z, so the
 * counter sits between Manu (z ≈ 0) and the camera (z > 1).
 * Behind Manu: the street (road, a low wall, two shopfronts, palms). Above the camera side: the
 * shop's striped awning edge, which frames close shots. Counter top at y = TOP, front face at z = Z.
 */
export function buildShop() {
  const root = new THREE.Group()
  const TOP = 1.0, Z = .62
  // the street floor and road
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mat('#C9B48E', { roughness: .95, clearcoat: 0 }))
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground)
  const road = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.4), mat('#5B5754', { roughness: .9, clearcoat: 0 }))
  road.rotation.x = -Math.PI / 2; road.position.set(0, .002, -2.6); road.receiveShadow = true; root.add(road)
  for (let i = -6; i <= 6; i++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(.6, .07), mat('#F3E9D2', { roughness: .8 })); d.rotation.x = -Math.PI / 2; d.position.set(i * 1.4, .004, -2.6); root.add(d) }
  // across the road: a low compound wall and two toy shopfronts
  const wall = rbox(14, .7, .2, .04, mat('#E8D9BC', { roughness: .85 })); wall.position.set(0, .35, -4.3); root.add(wall)
  const fronts = [[-2.4, '#7FB7A4', '#F2B52C'], [1.6, '#E6A07A', '#3B82F6'], [5.2, '#B9A7D9', '#16A36E']]
  for (const [x, c, sh] of fronts) {
    const b = rbox(2.6, 2.4, 1.2, .08, mat(c, { roughness: .8 })); b.position.set(x, 1.2, -5.4); root.add(b)
    const shutter = rbox(1.5, 1.2, .05, .02, mat(sh, { roughness: .6 })); shutter.position.set(x, .75, -4.78); root.add(shutter)
    const roof = rbox(2.8, .12, 1.4, .04, mat('#A3402B', { roughness: .7 })); roof.position.set(x, 2.45, -5.3); root.add(roof)
  }
  // coconut palms
  const trunkM = mat('#8A6A48', { roughness: .8 }), frondM = mat('#3E9A5B', { roughness: .6, clearcoat: .3 })
  for (const [x, z, s] of [[-4.6, -3.7, 1], [3.6, -3.9, .9], [-.6, -6.6, 1.1]]) {
    const p = new THREE.Group(); p.position.set(x, 0, z); p.scale.setScalar(s)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.07, .11, 3.6, 10), trunkM); trunk.position.y = 1.8; trunk.rotation.z = .06; p.add(trunk)
    for (let i = 0; i < 7; i++) {
      const f = sphere(.5, frondM, 14); f.scale.set(1.5, .12, .35)
      const a = i / 7 * Math.PI * 2; f.position.set(Math.cos(a) * .55 + .1, 3.55 - .12, Math.sin(a) * .55); f.rotation.set(0, -a, -.45); p.add(f)
    }
    root.add(p)
  }

  // the counter: a wooden bench with a glass snack case on the left
  const wood = mat('#8B5A33', { roughness: .45, clearcoat: .5, clearcoatRoughness: .3 })
  const top = rbox(2.4, .06, .62, .02, wood); top.position.set(0, TOP - .03, Z); root.add(top)
  const front = rbox(2.36, TOP - .06, .05, .02, mat('#6E4426', { roughness: .55 })); front.position.set(0, (TOP - .06) / 2, Z - .27); root.add(front)
  const band = rbox(2.38, .08, .055, .02, mat('#16A36E', { roughness: .4, clearcoat: .6 })); band.position.set(0, TOP - .14, Z - .27); root.add(band)
  // glass case with snack jars (left)
  const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: .9, roughness: .05, thickness: .01, transparent: true, opacity: .35 })
  const caseG = rbox(.62, .3, .42, .02, glass); caseG.position.set(-.72, TOP + .15, Z); root.add(caseG)
  const snackC = ['#F2B52C', '#E8577A', '#F28C28', '#C98A3A']
  snackC.forEach((c, i) => {
    const s = sphere(.045, mat(c, { roughness: .6 }), 14); s.scale.y = .6; s.position.set(-.92 + i * .13, TOP + .05, Z + (i % 2 ? .06 : -.06)); root.add(s)
  })
  // a brass tea urn behind the counter's right side
  const brass = mat('#D9A441', { metalness: .8, roughness: .28, clearcoat: .6 })
  const urn = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, .34, 28), brass); urn.position.set(.98, TOP + .17, Z - .12); root.add(urn)
  const lid = sphere(.11, brass, 24); lid.scale.y = .45; lid.position.set(.98, TOP + .34, Z - .12); root.add(lid)
  const tap = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .08, 10), brass); tap.rotation.x = Math.PI / 2; tap.position.set(.98, TOP + .06, Z + .0); root.add(tap)
  // the cash tray (centre-left, near the edge)
  const tray = rbox(.24, .025, .16, .01, mat('#3B3530', { roughness: .5, clearcoat: .4 })); tray.position.set(-.18, TOP + .012, Z + .14); root.add(tray)

  // awning edge, high above the camera side (frames the top of close shots)
  const stripes = canvasTex(512, 64, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#FFF6E0' : '#E23B4A'; g.fillRect(i * w / 8, 0, w / 8, h) } })
  const awn = new THREE.Mesh(new THREE.BoxGeometry(3.6, .06, 1.1), [mat('#E23B4A'), mat('#E23B4A'), mat('#fff', { map: stripes }), mat('#fff', { map: stripes }), mat('#E23B4A'), mat('#E23B4A')])
  awn.position.set(0, 2.55, Z + .2); awn.rotation.x = -.18; root.add(awn)
  for (let i = 0; i < 9; i++) {  // scalloped valance
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .03, 20, 1, false, 0, Math.PI), mat(i % 2 ? '#FFF6E0' : '#E23B4A', { roughness: .7 }))
    sc.rotation.set(Math.PI / 2, 0, Math.PI); sc.position.set(-1.6 + i * .4, 2.48, Z + .76); root.add(sc)
  }
  // bunches of bananas hanging at the awning's left corner (every kada has them)
  const banana = mat('#F2C94C', { roughness: .5, clearcoat: .4 })
  for (let i = 0; i < 6; i++) { const b = sphere(.05, banana, 12); b.scale.set(.5, 1.6, .5); b.position.set(-1.35 + (i % 3) * .06, 2.15 - Math.floor(i / 3) * .1, Z + .55); b.rotation.z = (i % 3 - 1) * .3; root.add(b) }

  shadows(root)
  ground.castShadow = road.castShadow = false
  return { root, TOP, Z, tray: [-.18, TOP + .025, Z + .14] }
}

/** Sky and street daylight for the shop (the living room's lightRoom, aimed at the counter). */
export const SHOP_BACKGROUND = '#BFE3F2'

/** One generic rupee note (no real artwork): lavender paper, a darker band, a pale watermark oval. */
const NOTE_TEX = () => canvasTex(256, 120, (g, w, h) => {
  g.fillStyle = '#B7A6D6'; g.fillRect(0, 0, w, h)
  g.fillStyle = '#9A86C2'; g.fillRect(0, h * .12, w, h * .1); g.fillRect(0, h * .78, w, h * .1)
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(w * .74, h * .5, w * .1, h * .26, 0, 0, Math.PI * 2); g.fill()
  g.strokeStyle = '#7E6AA8'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12)
  g.fillStyle = '#7E6AA8'; g.beginPath(); g.arc(w * .24, h * .5, h * .18, 0, Math.PI * 2); g.fill()
})
let noteMat = null
export function buildNote() {
  noteMat ??= mat('#ffffff', { map: NOTE_TEX(), roughness: .8, clearcoat: .05 })
  const n = new THREE.Mesh(new THREE.BoxGeometry(.13, .0016, .062), noteMat)
  n.castShadow = true
  return n
}

/**
 * Manu's open wallet, facing the viewer: notes fan up out of the pocket, so you can see how many
 * are left. setNotes(k) shows k of N (the fan thins as cash leaves).
 */
export function buildCashWallet(N = 12) {
  const leather = mat('#6B3A1E', { roughness: .55, clearcoat: .35 }), inner = mat('#4E2914', { roughness: .7 })
  const root = new THREE.Group()
  const back = rbox(.16, .1, .012, .01, leather); root.add(back)
  const lining = rbox(.15, .09, .003, .003, inner); lining.position.z = .007; root.add(lining)
  const pocket = rbox(.162, .056, .014, .01, leather); pocket.position.set(0, -.024, .02); root.add(pocket)
  const stitch = rbox(.15, .004, .002, .001, mat('#C99A6A', { roughness: .6 })); stitch.position.set(0, .0, .0275); root.add(stitch)
  const notes = []
  for (let i = 0; i < N; i++) {
    const n = buildNote(); n.rotation.order = 'ZXY'; n.rotation.x = Math.PI / 2   // stand it up, then fan it in the wallet's plane
    const k = i / (N - 1) - .5   // −.5 … .5 across the fan
    n.rotation.z = -k * .55; n.position.set(k * .07, .03 - Math.abs(k) * .012, .009 + i * .0008)
    root.add(n); notes.push(n)
  }
  shadows(root)
  // the fan thins from both ends toward the middle, so what's left stays centred
  const order = notes.map((_, i) => i).sort((a, b) => Math.abs(b - (N - 1) / 2) - Math.abs(a - (N - 1) / 2))
  return { root, notes, setNotes(k) { order.forEach((idx, j) => { notes[idx].visible = j >= N - k }) } }
}

/** A counter QR stand: a small acrylic easel with a generic QR-like pattern (not a real code). */
export function buildQrStand() {
  const tex = canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#16A36E'; g.fillRect(0, 0, w, 54); g.fillRect(0, h - 40, w, 40)
    const ox = 28, oy = 72, cell = 10, n = 20
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    g.fillStyle = '#1C1410'
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (rnd() > .52) g.fillRect(ox + x * cell, oy + y * cell, cell, cell)
    for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {   // the three finder squares
      g.fillStyle = '#ffffff'; g.fillRect(ox + fx * cell - 4, oy + fy * cell - 4, 7 * cell + 8, 7 * cell + 8)
      g.fillStyle = '#1C1410'; g.fillRect(ox + fx * cell, oy + fy * cell, 7 * cell, 7 * cell)
      g.fillStyle = '#ffffff'; g.fillRect(ox + (fx + 1) * cell, oy + (fy + 1) * cell, 5 * cell, 5 * cell)
      g.fillStyle = '#1C1410'; g.fillRect(ox + (fx + 2) * cell, oy + (fy + 2) * cell, 3 * cell, 3 * cell)
    }
  })
  const card = new THREE.Mesh(new RoundedBoxGeometry(.12, .15, .006, 2, .006), [mat('#16A36E'), mat('#16A36E'), mat('#16A36E'), mat('#16A36E'), mat('#fff', { map: tex, roughness: .4, clearcoat: .8 }), mat('#ECE4D3')])
  card.position.set(0, .078, 0); card.rotation.x = -.18
  const foot = rbox(.12, .01, .07, .004, mat('#DDE7E2', { roughness: .2, clearcoat: 1 })); foot.position.set(0, .005, -.02)
  return shadows(group(card, foot))
}

/** A glass of chaya: clear glass, milky tea, a little froth. */
export function buildTeaGlass() {
  const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: .85, roughness: .05, thickness: .01, transparent: true, opacity: .45 })
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(.03, .024, .085, 24, 1, true), glass); cup.position.y = .0425
  const tea = new THREE.Mesh(new THREE.CylinderGeometry(.028, .023, .07, 24), mat('#C8874E', { roughness: .4, clearcoat: .6 })); tea.position.y = .036
  const froth = new THREE.Mesh(new THREE.CylinderGeometry(.028, .028, .008, 24), mat('#F1DDBF', { roughness: .8 })); froth.position.y = .074
  return shadows(group(cup, tea, froth))
}

/** A banana-chips / pazhampori paper packet. */
export function buildSnackPack() {
  const bag = rbox(.09, .12, .035, .012, mat('#F2B52C', { roughness: .6, clearcoat: .2 })); bag.position.y = .06
  const band = rbox(.092, .026, .037, .006, mat('#E23B4A', { roughness: .5 })); band.position.y = .09
  const crimp = rbox(.094, .014, .02, .004, mat('#E8A82A', { roughness: .6 })); crimp.position.y = .124
  return shadows(group(bag, band, crimp))
}

/** A red petrol can: "fuel". */
export function buildFuelCan() {
  const red = mat('#D7263D', { roughness: .35, clearcoat: .8 })
  const body = rbox(.1, .13, .06, .014, red); body.position.y = .065
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.022, .007, 8, 20, Math.PI), red); handle.position.set(-.015, .13, 0)
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(.008, .011, .04, 10), mat('#2A2420', { roughness: .4 })); spout.position.set(.035, .145, 0); spout.rotation.z = -.5
  return shadows(group(body, handle, spout))
}

/** A grocery bag: a cloth bag with a leafy top and a milk packet peeking out. */
export function buildGroceryBag() {
  const bag = rbox(.14, .15, .08, .02, mat('#E9DCC0', { roughness: .85 })); bag.position.y = .075
  const greens = sphere(.04, mat('#4CB36A', { roughness: .6 }), 14); greens.scale.set(1.3, .8, .9); greens.position.set(-.03, .16, 0)
  const milk = rbox(.04, .06, .03, .008, mat('#ffffff', { roughness: .4, clearcoat: .6 })); milk.position.set(.035, .165, 0); milk.rotation.z = -.15
  const stripe = rbox(.142, .02, .082, .006, mat('#16A36E', { roughness: .7 })); stripe.position.y = .11
  return shadows(group(bag, greens, milk, stripe))
}

/** The phone's own screens, drawn here (not a payment app's): a plain home screen with a salary
 *  notification card, a scanner viewfinder, and a big green "paid" tick. Amounts stay HTML. */
export function phoneScreens() {
  const S = (draw) => canvasTex(540, 960, draw)
  const wall = (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0A7A56'); gr.addColorStop(1, '#16C98A'); g.fillStyle = gr; g.fillRect(0, 0, w, h) }
  const home = S((g, w, h) => {
    wall(g, w, h)
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.roundRect(30, 120, w - 60, 150, 28); g.fill()
    g.fillStyle = '#16A36E'; g.beginPath(); g.roundRect(56, 150, 90, 90, 20); g.fill()
    g.fillStyle = '#fff'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('₹', 101, 197)
    g.fillStyle = '#D9E6DF'; g.fillRect(170, 168, 250, 22); g.fillRect(170, 210, 180, 18)
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.roundRect(62 + (i % 4) * 110, 560 + Math.floor(i / 4) * 130, 84, 84, 22); g.fill() }
  })
  const scan = S((g, w, h) => {
    g.fillStyle = '#1C1410'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#16C98A'; g.lineWidth = 14; g.lineCap = 'round'
    const x0 = 110, y0 = 300, s = 320, k = 70
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x0 + s, y0, -1, 1], [x0, y0 + s, 1, -1], [x0 + s, y0 + s, -1, -1]]) {
      g.beginPath(); g.moveTo(x + dx * k, y); g.lineTo(x, y); g.lineTo(x, y + dy * k); g.stroke()
    }
    g.fillStyle = 'rgba(22,201,138,.55)'; g.fillRect(x0 + 20, y0 + s * .55, s - 40, 6)
  })
  const paid = S((g, w, h) => {
    g.fillStyle = '#16A36E'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, h * .42, 130, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#16A36E'; g.lineWidth = 30; g.lineCap = 'round'; g.lineJoin = 'round'
    g.beginPath(); g.moveTo(w / 2 - 62, h * .42 + 4); g.lineTo(w / 2 - 14, h * .42 + 52); g.lineTo(w / 2 + 70, h * .42 - 46); g.stroke()
    g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.roundRect(150, h * .62, w - 300, 26, 13); g.fill()
  })
  return { home, scan, paid }
}

// ── EP02 (Save First vs Save Later) ──

/** A dinner plate: a white plate with a biryani mound, a curry bowl and a lemon wedge. */
export function buildDinnerPlate() {
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(.1, .085, .014, 40), mat('#FFFFFF', { roughness: .25, clearcoat: .9 })); plate.position.y = .007
  const rice = sphere(.055, mat('#F2D48A', { roughness: .7 }), 20); rice.scale.y = .55; rice.position.set(-.015, .022, 0)
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.032, .024, .03, 24), mat('#D9A441', { metalness: .7, roughness: .3 })); bowl.position.set(.05, .03, .03)
  const curry = new THREE.Mesh(new THREE.CylinderGeometry(.029, .029, .004, 24), mat('#C2452D', { roughness: .4, clearcoat: .6 })); curry.position.set(.05, .044, .03)
  const lemon = sphere(.016, mat('#F2D43C', { roughness: .5 }), 12); lemon.scale.set(1.3, .7, 1); lemon.position.set(.03, .02, -.05)
  return shadows(group(plate, rice, bowl, curry, lemon))
}

/** An online-sale parcel: a cardboard box with tape and a generic label (no store branding). */
export function buildParcel() {
  const box = rbox(.15, .1, .11, .01, mat('#C9965E', { roughness: .85 })); box.position.y = .05
  const tape = rbox(.152, .102, .025, .004, mat('#E3C08A', { roughness: .5, clearcoat: .4 })); tape.position.y = .05
  const label = rbox(.05, .002, .035, .002, mat('#FFFFFF', { roughness: .6 })); label.position.set(-.04, .101, .02)
  return shadows(group(box, tape, label))
}

/** A lid for props3d's jar (R = .13, H = .36): sits on the neck at y = H + .012 when closed. */
export function buildJarLid(color = '#3B82F6') {
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(.118, .118, .03, 40), mat(color, { roughness: .35, clearcoat: .8 })); lid.position.y = .015
  const knob = sphere(.03, mat(color, { roughness: .3, clearcoat: .9 }), 18); knob.scale.y = .6; knob.position.y = .034
  return shadows(group(lid, knob))
}
