// Manu & Maaman, Season 1: the one definition of the cast and the home set, so every
// episode draws the same characters (the character bible's main rule). Load after reel-kit.js.
//
//   mountCast($('world'))            → home set + Manu + Maaman inside the episode's <svg>
//   mintSvg()                        → Mint's face, for a phone screen
//   poseManu(t, {...}) / poseMaaman(t, {...}) / poseMint(t, {...}) / animateHome(t)
//   makeBubbles(LINES) + renderDialogue(t, LINES, NARRATION, bubbles, xOf)
//
// Characters are drawn around a local origin: head centre ≈ (0, 60), feet ≈ y 590.
// Pose is a pure function of t like the rest of the reel, so frames are reproducible.

const SKIN_MANU = '#D9A07A', SKIN_MAAMAN = '#B97A50', INK = '#2B1D12'

const HOME_SVG = `
<defs>
  <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7E8CF"/><stop offset="1" stop-color="#EBD2AA"/></linearGradient>
  <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B14A33"/><stop offset="1" stop-color="#8A3323"/></linearGradient>
  <linearGradient id="view" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ED8F2"/><stop offset="1" stop-color="#D8F1E2"/></linearGradient>
  <linearGradient id="brass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B8862B"/><stop offset=".5" stop-color="#F0C75E"/><stop offset="1" stop-color="#A97A22"/></linearGradient>
  <clipPath id="winClip"><rect x="620" y="580" width="340" height="400"/></clipPath>
</defs>
<rect width="1080" height="1920" fill="url(#wall)"/>
<rect width="1080" height="86" fill="#E3C79C"/><rect y="86" width="1080" height="10" fill="#D2B386"/>
<!-- ceiling fan -->
<rect x="754" y="96" width="12" height="70" fill="#8C8C8C"/>
<ellipse cx="760" cy="176" rx="46" ry="20" fill="#9A9A9A"/>
<g id="fanBlades" transform="translate(760 182)"><ellipse rx="190" ry="11" fill="#B3B3B3"/></g>
<!-- window: wooden frame, grill, palms outside, green shutters -->
<rect x="566" y="560" width="54" height="440" rx="6" fill="#3E7D5A"/><rect x="960" y="560" width="54" height="440" rx="6" fill="#3E7D5A"/>
<path d="M572 600 h42 M572 660 h42 M572 720 h42 M572 780 h42 M572 840 h42 M572 900 h42 M572 960 h42 M966 600 h42 M966 660 h42 M966 720 h42 M966 780 h42 M966 840 h42 M966 900 h42 M966 960 h42" stroke="#2F6447" stroke-width="8"/>
<g clip-path="url(#winClip)">
  <rect x="620" y="580" width="340" height="400" fill="url(#view)"/>
  <path d="M600 900 Q 720 840 840 880 T 1000 870 V 1000 H 600Z" fill="#7CC59A"/>
  <g id="palmOut">
    <path d="M700 1000 C 696 900 712 830 736 760" stroke="#7A5232" stroke-width="12" fill="none"/>
    <g fill="#2F9E5B"><path d="M736 760 q -70 -16 -110 24 q 64 -6 110 -24"/><path d="M736 760 q 64 -36 122 0 q -64 -12 -122 0"/><path d="M736 760 q -24 -64 -88 -76 q 40 36 88 76"/><path d="M736 760 q 36 -70 100 -70 q -52 30 -100 70"/></g>
  </g>
  <use href="#palmOut" transform="translate(150 60) scale(.8)"/>
  <g id="cloudOut" fill="#fff" opacity=".9"><ellipse rx="50" ry="18"/><ellipse cx="26" cy="-12" rx="32" ry="20"/></g>
</g>
<rect x="608" y="566" width="368" height="428" fill="none" stroke="#7A4A26" stroke-width="26"/>
<path d="M676 580 V 980 M736 580 V 980 M796 580 V 980 M856 580 V 980 M916 580 V 980" stroke="#5E3A1D" stroke-width="7"/>
<path d="M620 780 H 960" stroke="#7A4A26" stroke-width="14"/>
<rect x="590" y="990" width="404" height="26" rx="6" fill="#6B3E1F"/>
<!-- money plant in a bottle on the sill -->
<g transform="translate(900 992)">
  <rect x="-18" y="-70" width="36" height="70" rx="12" fill="#BFE6D6" opacity=".85"/><rect x="-8" y="-86" width="16" height="20" fill="#BFE6D6" opacity=".85"/>
  <path d="M0 -84 C -30 -120 -60 -100 -70 -60 C -76 -20 -60 20 -70 60" stroke="#2F7D4F" stroke-width="5" fill="none"/>
  <g fill="#3FAE6A"><path d="M-40 -110 q -26 -6 -30 18 q 24 4 30 -18"/><path d="M-70 -50 q -26 0 -24 24 q 22 -2 24 -24"/><path d="M-66 20 q -24 6 -16 28 q 20 -8 16 -28"/><path d="M8 -100 q 24 -16 36 6 q -22 12 -36 -6"/></g>
</g>
<!-- wall clock -->
<g transform="translate(200 690)">
  <circle r="70" fill="#7A4A26"/><circle r="58" fill="#FFFDF6"/>
  <path d="M0 -50 V -42 M50 0 H 42 M0 50 V 42 M-50 0 H -42" stroke="#7A4A26" stroke-width="6"/>
  <path id="clockMin" d="M0 6 V -44" stroke="#2B1D12" stroke-width="5" stroke-linecap="round"/>
  <path id="clockHr" d="M0 4 V -28" stroke="#2B1D12" stroke-width="8" stroke-linecap="round" transform="rotate(60)"/>
  <circle r="6" fill="#2B1D12"/>
</g>
<!-- framed family photo -->
<g transform="translate(380 760)"><rect x="-62" y="-80" width="124" height="150" rx="6" fill="#7A4A26"/><rect x="-50" y="-68" width="100" height="126" fill="#CFE3D6"/>
  <circle cx="-16" cy="-20" r="16" fill="#9C6B48"/><circle cx="18" cy="-14" r="14" fill="#9C6B48"/><path d="M-40 58 Q -16 0 6 58 M4 58 Q 18 8 42 58" fill="#4F7FA8"/></g>
<!-- floor: red oxide -->
<rect y="1250" width="1080" height="670" fill="url(#floor)"/>
<rect y="1236" width="1080" height="20" fill="#6E2619"/>
<path d="M0 1420 Q 540 1380 1080 1430" stroke="#C9644A" stroke-width="18" fill="none" opacity=".3"/>
<!-- sofa behind the cast -->
<g transform="translate(470 1040)">
  <rect x="0" y="0" width="610" height="180" rx="40" fill="#2F6F73"/>
  <rect x="0" y="150" width="610" height="90" rx="26" fill="#285E62"/>
  <rect x="-30" y="80" width="80" height="170" rx="30" fill="#24555A"/>
  <path d="M200 20 V 150 M400 20 V 150" stroke="#285E62" stroke-width="8"/>
  <rect x="30" y="240" width="22" height="34" fill="#4A2E1E"/><rect x="560" y="240" width="22" height="34" fill="#4A2E1E"/>
</g>
<!-- nilavilakku (brass lamp) -->
<g transform="translate(80 1330)">
  <ellipse cx="0" cy="0" rx="44" ry="12" fill="url(#brass)"/>
  <rect x="-8" y="-150" width="16" height="150" fill="url(#brass)"/>
  <ellipse cx="0" cy="-150" rx="40" ry="12" fill="url(#brass)"/>
  <path id="flame" d="M0 -196 Q 12 -176 0 -160 Q -12 -176 0 -196Z" fill="#FFB020"/>
  <circle id="glow" cy="-176" r="40" fill="#FFD36B" opacity=".25"/>
</g>
<!-- rug -->
<ellipse cx="560" cy="1720" rx="470" ry="90" fill="#C99A3E" opacity=".55"/>
<ellipse cx="560" cy="1720" rx="410" ry="64" fill="none" stroke="#8E6A22" stroke-width="6" stroke-dasharray="18 14" opacity=".5"/>`

const MANU_SVG = `
<g id="manu">
  <ellipse id="manuShadow" cx="0" cy="590" rx="120" ry="18" fill="rgba(0,0,0,.22)"/>
  <g id="manuJump">
    <rect x="-62" y="350" width="56" height="236" rx="20" fill="#2E3440"/><rect x="6" y="350" width="56" height="236" rx="20" fill="#2E3440"/>
    <rect x="-68" y="572" width="66" height="24" rx="11" fill="#4A2E1E"/><rect x="2" y="572" width="66" height="24" rx="11" fill="#4A2E1E"/>
    <rect x="-95" y="150" width="190" height="212" rx="50" fill="#8EC3EA"/>
    <rect x="-92" y="344" width="184" height="16" rx="6" fill="#1E2228"/><rect x="-12" y="342" width="24" height="20" rx="4" fill="#B9A06A"/>
    <path d="M0 176 V 340" stroke="#6FA6D3" stroke-width="5"/>
    <circle cx="0" cy="214" r="4.5" fill="#fff"/><circle cx="0" cy="268" r="4.5" fill="#fff"/><circle cx="0" cy="320" r="4.5" fill="#fff"/>
    <rect x="26" y="200" width="42" height="42" rx="6" fill="none" stroke="#6FA6D3" stroke-width="4"/>
    <path d="M-40 146 L -2 152 L -24 194 Z M40 146 L 2 152 L 24 194 Z" fill="#B5DAF5" stroke="#6FA6D3" stroke-width="3" stroke-linejoin="round"/>
    <path d="M-30 152 L -6 262 M30 152 L 6 262" stroke="#0A7A56" stroke-width="7" stroke-linecap="round"/>
    <g transform="translate(0 258)"><rect x="-26" y="0" width="52" height="68" rx="7" fill="#fff" stroke="#C9D3DC" stroke-width="3"/>
      <rect x="-26" y="0" width="52" height="15" rx="6" fill="#0A7A56"/><rect x="-16" y="22" width="16" height="20" rx="3" fill="#C9D3DC"/>
      <path d="M4 26 h14 M4 34 h10 M-16 52 h32 M-16 59 h22" stroke="#9AA6B1" stroke-width="3"/></g>
    <g id="manuArmL">
      <rect x="-118" y="175" width="44" height="152" rx="22" fill="#8EC3EA"/><rect x="-118" y="300" width="44" height="14" fill="#6FA6D3"/>
      <circle cx="-96" cy="334" r="24" fill="${SKIN_MANU}"/>
    </g>
    <g id="manuArm">
      <rect x="74" y="175" width="44" height="150" rx="22" fill="#8EC3EA"/><rect x="74" y="298" width="44" height="14" fill="#6FA6D3"/>
      <g transform="translate(70 232)"><rect x="0" y="0" width="56" height="96" rx="12" fill="#1C1410"/><rect x="6" y="10" width="44" height="74" rx="6" fill="#16C98A"/></g>
      <circle cx="96" cy="326" r="24" fill="${SKIN_MANU}"/>
    </g>
    <rect x="-22" y="118" width="44" height="40" fill="${SKIN_MANU}"/>
    <ellipse cx="-86" cy="64" rx="13" ry="20" fill="#C98A5E"/><ellipse cx="86" cy="64" rx="13" ry="20" fill="#C98A5E"/>
    <ellipse cx="0" cy="60" rx="86" ry="96" fill="${SKIN_MANU}"/>
    <path d="M-88 44 Q -98 -64 0 -66 Q 98 -64 88 44 Q 84 -4 62 -16 Q 34 -4 4 -24 Q -34 -2 -66 -12 Q -84 0 -88 44" fill="#1E1814"/>
    <path d="M-30 -60 Q 10 -94 64 -52 Q 30 -58 -30 -60" fill="#1E1814"/>
    <g id="manuEyes">
      <ellipse cx="-30" cy="52" rx="16" ry="18" fill="#fff"/><ellipse cx="30" cy="52" rx="16" ry="18" fill="#fff"/>
      <g id="manuPupils"><circle cx="-29" cy="54" r="9.5" fill="${INK}"/><circle cx="31" cy="54" r="9.5" fill="${INK}"/>
        <circle cx="-26" cy="50" r="3" fill="#fff"/><circle cx="34" cy="50" r="3" fill="#fff"/></g>
    </g>
    <path id="manuHappy" d="M-44 56 Q -30 38 -16 56 M16 56 Q 30 38 44 56" stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round" opacity="0"/>
    <path id="manuBrows" d="M-50 22 q 20 -10 40 0 M10 22 q 20 -10 40 0" stroke="#1E1814" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M2 68 q -9 20 5 24" stroke="#B7835F" stroke-width="5" fill="none" stroke-linecap="round"/>
    <g id="manuBlush" opacity="0"><ellipse cx="-54" cy="94" rx="18" ry="10" fill="#E8857A"/><ellipse cx="54" cy="94" rx="18" ry="10" fill="#E8857A"/></g>
    <path id="manuMouth" d="M-22 112 Q 0 130 22 112" stroke="#5A2E1E" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path id="manuSweat" d="M84 -6 q 12 18 0 26 q -12 -8 0 -26Z" fill="#8FD3F4" stroke="#5BB6E0" stroke-width="2" opacity="0"/>
  </g>
</g>`

const MAAMAN_SVG = `
<g id="maaman">
  <ellipse cx="0" cy="590" rx="124" ry="18" fill="rgba(0,0,0,.22)"/>
  <g id="maamanBob">
    <rect x="-48" y="572" width="38" height="18" rx="8" fill="#5A3B26"/><rect x="10" y="572" width="38" height="18" rx="8" fill="#5A3B26"/>
    <rect x="-80" y="326" width="160" height="254" rx="18" fill="#FBF8F0"/>
    <rect x="-80" y="548" width="160" height="12" fill="#D4A93A"/>
    <path d="M30 330 L 22 578" stroke="#E5DCC8" stroke-width="6"/><path d="M38 330 L 31 560" stroke="#D4A93A" stroke-width="5"/>
    <path d="M-100 196 Q -104 150 -50 148 H 50 Q 104 150 100 196 L 106 330 Q 106 366 70 366 H -70 Q -106 366 -106 330 Z" fill="#FFFFFF" stroke="#E6DFD2" stroke-width="3"/>
    <path d="M0 176 V 360" stroke="#E6DFD2" stroke-width="4"/>
    <circle cx="0" cy="214" r="4.5" fill="#DCD3C2"/><circle cx="0" cy="264" r="4.5" fill="#DCD3C2"/><circle cx="0" cy="314" r="4.5" fill="#DCD3C2"/>
    <rect x="-66" y="202" width="42" height="44" rx="5" fill="none" stroke="#E0D8C8" stroke-width="4"/><rect x="-56" y="188" width="7" height="28" rx="3" fill="#2F5DA8"/>
    <path d="M-34 146 L 0 196 L 34 146" fill="#EDE5D6"/>
    <g id="maamanArmL">
      <rect x="-124" y="172" width="44" height="100" rx="22" fill="#FFFFFF" stroke="#E6DFD2" stroke-width="3"/>
      <rect x="-120" y="256" width="36" height="64" rx="18" fill="${SKIN_MAAMAN}"/><circle cx="-102" cy="326" r="24" fill="${SKIN_MAAMAN}"/>
    </g>
    <g id="maamanArm">
      <rect x="80" y="172" width="44" height="100" rx="22" fill="#FFFFFF" stroke="#E6DFD2" stroke-width="3"/>
      <rect x="84" y="256" width="36" height="64" rx="18" fill="${SKIN_MAAMAN}"/><circle cx="102" cy="326" r="24" fill="${SKIN_MAAMAN}"/>
    </g>
    <rect x="-24" y="116" width="48" height="42" fill="${SKIN_MAAMAN}"/>
    <ellipse cx="-88" cy="64" rx="13" ry="21" fill="#A86C44"/><ellipse cx="88" cy="64" rx="13" ry="21" fill="#A86C44"/>
    <ellipse cx="0" cy="60" rx="88" ry="98" fill="${SKIN_MAAMAN}"/>
    <path d="M-88 30 Q -92 -58 0 -56 Q 92 -58 88 30 Q 80 -14 40 -22 Q 0 -14 -40 -22 Q -80 -14 -88 30" fill="#1E1A17"/>
    <path d="M-26 -52 Q -34 -32 -56 -22" stroke="#4A423C" stroke-width="5" fill="none"/>
    <path d="M-90 30 Q -92 0 -80 -16 L -72 34 Z M90 30 Q 92 0 80 -16 L 72 34 Z" fill="#B3B0AC"/>
    <path d="M-30 4 q 30 -8 60 0" stroke="#A5683F" stroke-width="3" fill="none" opacity=".7"/>
    <g id="maamanEyes">
      <ellipse cx="-30" cy="50" rx="13" ry="14" fill="#fff"/><ellipse cx="30" cy="50" rx="13" ry="14" fill="#fff"/>
      <g id="maamanPupils"><circle cx="-29" cy="52" r="8" fill="${INK}"/><circle cx="31" cy="52" r="8" fill="${INK}"/>
        <circle cx="-27" cy="49" r="2.5" fill="#fff"/><circle cx="33" cy="49" r="2.5" fill="#fff"/></g>
    </g>
    <path id="maamanHappy" d="M-42 54 Q -30 40 -18 54 M18 54 Q 30 40 42 54" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round" opacity="0"/>
    <path d="M-50 60 l -8 6 M50 60 l 8 6" stroke="#9A5F3A" stroke-width="3" stroke-linecap="round"/>
    <path id="maamanBrows" d="M-50 24 q 20 -10 40 -2 M10 22 q 20 -8 40 2" stroke="#1E1A17" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M2 64 q -12 26 6 30" stroke="#94593A" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path id="maamanMouth" d="M-14 124 Q 0 134 14 124" stroke="#5A2E1E" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M-50 104 Q -26 84 0 96 Q 26 84 50 104 Q 30 116 0 108 Q -30 116 -50 104" fill="#1E1A17"/>
  </g>
</g>`

const MINT_INNER = `
<circle r="122" fill="#fff" opacity=".55"/>
<g id="mintBody">
  <path transform="translate(-232 -287)" d="M101 395.49C236.782 395.49 330.786 318.895 363.861 177.89C228.078 177.89 134.075 254.485 101 395.49Z" fill="#16C98A"/>
  <path transform="translate(-232 -287)" opacity=".5" d="M119.93 377.33C150 341 180 312 212 287" stroke="#F8F8F8" stroke-width="12" stroke-linecap="round"/>
  <g id="mintEyes"><ellipse cx="-14" cy="-8" rx="11" ry="15" fill="#0B3B2A"/><ellipse cx="34" cy="-22" rx="11" ry="15" fill="#0B3B2A"/>
    <circle cx="-10" cy="-13" r="4" fill="#fff"/><circle cx="38" cy="-27" r="4" fill="#fff"/></g>
  <path id="mintMouth" d="M0 22 Q 16 34 34 14" stroke="#0B3B2A" stroke-width="7" fill="none" stroke-linecap="round"/>
  <ellipse cx="-32" cy="22" rx="12" ry="7" fill="#0E9E6B" opacity=".6"/><ellipse cx="58" cy="2" rx="12" ry="7" fill="#0E9E6B" opacity=".6"/>
</g>`

function mountCast(svg) { svg.insertAdjacentHTML('beforeend', HOME_SVG + MANU_SVG + MAAMAN_SVG) }
const mintSvg = () => `<svg viewBox="-130 -130 260 260" xmlns="http://www.w3.org/2000/svg"><g id="mint">${MINT_INNER}</g></svg>`

const attr = (id, a, v) => $(id).setAttribute(a, v)
const blinkAt = (t, offset, period) => ((t + offset) % period < .12) ? .12 : 1
const mouthFlap = t => Math.sin(t * 21) > 0

const BROWS = {
  neutral: 'M-50 22 q 20 -10 40 0 M10 22 q 20 -10 40 0',
  raised: 'M-50 8 q 20 -14 40 -4 M10 4 q 20 -10 40 4',
  worried: 'M-50 28 q 20 -4 40 -16 M10 12 q 20 4 40 16',
  determined: 'M-50 16 Q -30 18 -12 26 M12 26 Q 30 18 50 16',
  knowing: 'M-50 24 q 20 -6 40 0 M10 6 q 20 -14 40 0',
}
const MANU_MOODS = {
  smile: { brows: 'neutral', mouth: ['M-22 112 Q 0 130 22 112', 'none'] },
  grin: { brows: 'raised', mouth: ['M-30 106 Q 0 156 30 106 Z', '#5A2E1E'], eye: 1.08 },
  dreamy: { brows: 'raised', mouth: ['M-30 106 Q 0 156 30 106 Z', '#5A2E1E'], happy: true },
  shocked: { brows: 'raised', mouth: ['M-12 116 a12 16 0 1 0 24 0 a12 16 0 1 0 -24 0', '#5A2E1E'], eye: 1.3 },
  worried: { brows: 'worried', mouth: ['M-20 124 Q 0 110 20 124', 'none'] },
  embarrassed: { brows: 'worried', mouth: ['M-21 118 q 7 -7 14 0 q 7 7 14 0 q 7 -7 14 0', 'none'], eye: .85, blush: 1, sweat: 1 },
  determined: { brows: 'determined', mouth: ['M-26 108 Q 0 132 26 108', 'none'], eye: .95 },
  interested: { brows: 'raised', mouth: ['M-16 114 Q 0 124 16 114', 'none'], eye: 1.05 },
}
const MAAMAN_MOODS = {
  smile: { brows: 'neutral', mouth: ['M-16 122 Q 0 134 16 122', 'none'] },
  amused: { brows: 'neutral', mouth: ['M-18 120 Q 0 138 18 120', 'none'], happy: true },
  knowing: { brows: 'knowing', mouth: ['M-14 124 Q 4 132 18 120', 'none'], eye: .7 },
  laugh: { brows: 'raised', mouth: ['M-20 116 Q 0 148 20 116 Z', '#5A2E1E'], happy: true },
}

function eyes(prefix, t, { eye = 1, happy = false, look = [0, 0], blink }) {
  const s = happy ? 0 : eye * blink, sx = Math.max(1, eye)
  attr(prefix + 'Eyes', 'transform', `translate(0 ${52 * (1 - s)}) scale(${sx} ${s})`)
  attr(prefix + 'Happy', 'opacity', happy ? 1 : 0)
  attr(prefix + 'Pupils', 'transform', `translate(${look[0]} ${look[1]})`)
}

/** Manu. mood: a MANU_MOODS key; talking flaps the mouth; jump lifts him (px);
 *  phone 0..1 raises the phone arm; fist 0..1 pumps the left arm. */
function poseManu(t, { x = 760, y = 1150, mood = 'smile', talking = false, jump = 0, phone = 0, fist = 0, look = [0, 0], bob = 4 } = {}) {
  const m = MANU_MOODS[mood]
  attr('manu', 'transform', `translate(${x} ${y + Math.sin(t * 3) * bob})`)
  attr('manuJump', 'transform', `translate(0 ${-jump})`)
  attr('manuShadow', 'transform', `translate(0 ${-Math.sin(t * 3) * bob}) scale(${1 - jump / 600} 1)`)
  attr('manuShadow', 'transform-origin', '0 590')
  eyes('manu', t, { eye: m.eye ?? 1, happy: m.happy, look, blink: blinkAt(t, 0, 3.1) })
  attr('manuBrows', 'd', BROWS[m.brows])
  const mouth = talking && mood !== 'dreamy'
    ? (mouthFlap(t) ? ['M-22 108 Q 0 142 22 108 Z', '#5A2E1E'] : ['M-20 113 Q 0 124 20 113', 'none'])
    : m.mouth
  attr('manuMouth', 'd', mouth[0]); attr('manuMouth', 'fill', mouth[1])
  attr('manuBlush', 'opacity', m.blush ? .75 : 0)
  attr('manuSweat', 'opacity', m.sweat ? 1 : 0)
  attr('manuSweat', 'transform', `translate(0 ${m.sweat ? (t * 30) % 24 : 0})`)
  attr('manuArm', 'transform', `rotate(${-70 * phone} 96 180)`)
  attr('manuArmL', 'transform', `rotate(${(150 + Math.sin(t * 14) * 8) * fist} -96 180)`)
}

/** Maaman. point 0..1 raises his right arm to the overlay above; pat 0..1 reaches
 *  across to Manu's shoulder (stand him ~280 px left of Manu) and pats. */
function poseMaaman(t, { x = 290, y = 1180, mood = 'smile', talking = false, point = 0, pat = 0, look = [0, 0], bob = 3 } = {}) {
  const m = MAAMAN_MOODS[mood]
  attr('maaman', 'transform', `translate(${x} ${y})`)
  attr('maamanBob', 'transform', `translate(0 ${Math.sin(t * 2.6 + 1) * bob})`)
  eyes('maaman', t, { eye: m.eye ?? 1, happy: m.happy && !talking, look, blink: blinkAt(t, 1.4, 3.7) })
  attr('maamanBrows', 'd', BROWS[m.brows])
  const mouth = talking && mouthFlap(t) ? ['M-15 120 Q 0 144 15 120 Z', '#5A2E1E'] : m.mouth
  attr('maamanMouth', 'd', mouth[0]); attr('maamanMouth', 'fill', mouth[1])
  const patAngle = -92 + Math.sin(t * 12) * 7
  attr('maamanArm', 'transform', `rotate(${-125 * point + patAngle * pat} 102 182)`)
}

function poseMint(t, { talking = false, happy = false } = {}) {
  attr('mint', 'transform', `translate(0 ${Math.sin(t * 2.4) * 6}) rotate(${Math.sin(t * 1.7) * 5})`)
  const s = happy ? .3 : blinkAt(t, 2.1, 3.3)
  attr('mintEyes', 'transform', `translate(0 ${-15 * (1 - s)}) scale(1 ${s})`)
  const mouth = happy ? ['M-4 18 Q 16 46 40 12 Z', '#0B3B2A']
    : talking && mouthFlap(t) ? ['M0 18 Q 16 42 36 12 Z', '#0B3B2A'] : ['M0 22 Q 16 34 34 14', 'none']
  attr('mintMouth', 'd', mouth[0]); attr('mintMouth', 'fill', mouth[1])
}

function animateHome(t) {
  attr('fanBlades', 'transform', `translate(760 182) scale(${Math.cos(t * 9)} 1)`)
  attr('clockMin', 'transform', `rotate(${t * 6})`)
  attr('flame', 'transform', `translate(0 -160) scale(${1 + Math.sin(t * 13) * .06} ${1 + Math.sin(t * 9) * .1}) translate(0 160)`)
  attr('glow', 'opacity', .22 + Math.sin(t * 7) * .05)
  attr('cloudOut', 'transform', `translate(${(t * 10) % 440 + 600} 640)`)
}

// ---- dialogue ----------------------------------------------------------------------------
// LINES: { who: 'manu' | 'maaman' | 'mint', a, b, ml, en, bubble?: false }
// Malayalam goes in the speech bubble, English in the subtitle. bubble: false keeps the
// subtitle and the mouth movement but no bubble (when an overlay fills the bubble's space);
// Mint's lines never get a stage bubble — they're shown on the phone by the episode.

/** Pop in at a, fade out at b. */
function popWindow(el, t, a, b, from = .5) {
  const p = backOut(prog(t, a, .35))
  el.style.opacity = Math.min(prog(t, a, .2), 1 - prog(t, b - .25, .25))
  el.style.transform = `scale(${from + (1 - from) * p})`
}
const speaking = (lines, who, t) => lines.some(l => l.who === who && t >= l.a + .1 && t < l.b - .3)

function makeBubbles(lines) {
  return lines.map(l => {
    if (l.who === 'mint' || l.bubble === false) return null
    const el = document.createElement('div')
    el.className = 'bubble'; el.textContent = l.ml
    $('bubbles').appendChild(el); return el
  })
}

/** xOf(who, t) → the speaker's x on stage, so a bubble follows a character who has moved. */
function renderDialogue(t, lines, narration, bubbles, xOf) {
  lines.forEach((l, i) => {
    const el = bubbles[i]; if (!el) return
    popWindow(el, t, l.a, l.b)
    if (el.style.opacity <= 0) return
    const x = xOf(l.who, t), w = el.offsetWidth
    const left = clamp(x - w / 2, 50, 1080 - 50 - w)
    el.style.left = left + 'px'
    el.style.setProperty('--tail', clamp(x - left, 60, w - 60) + 'px')
    el.style.transformOrigin = `${clamp(x - left, 60, w - 60)}px 100%`
  })
  const cue = [...lines, ...narration].find(c => t >= c.a && t < c.b)
  $('sub').textContent = cue ? cue.en : ''
  $('sub').style.opacity = cue ? Math.min(prog(t, cue.a, .15), 1 - prog(t, cue.b - .15, .15)) : 0
}
