interface LeafProps { x: number; y: number; angle: number; rx?: number; ry?: number; color: string }
function Leaf({ x, y, angle, rx = 15, ry = 6, color }: LeafProps) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(${angle},${x},${y})`} fill={color} />
}

function Pot() {
  return (
    <>
      <path d="M73,252 L68,285 L132,285 L127,252 Z" fill="#B5581A" />
      <rect x="70" y="244" width="60" height="10" rx="5" fill="#D4784F" />
      <ellipse cx="100" cy="254" rx="27" ry="6" fill="#5C3C1E" />
    </>
  )
}

function Stem({ topY, bend = 0 }: { topY: number; bend?: number }) {
  const midY = (254 + topY) / 2
  return (
    <path
      d={`M100,254 C${100 + bend},${midY} ${100 - bend},${midY * 0.7 + topY * 0.3} 100,${topY}`}
      stroke="#4E7A40" strokeWidth="3.5" fill="none" strokeLinecap="round"
    />
  )
}

const G1 = '#C5E8A0'
const G2 = '#8CC96A'
const G3 = '#5B9E4A'
const G4 = '#3D7A30'

export const STAGE_VIEWBOX = [
  '30 228 140 70',
  '30 210 140 88',
  '22 185 156 118',
  '16 150 168 155',
  '12 115 176 190',
  ' 6  75 188 230',
  ' 6  45 188 260',
]

export const STAGE_LABELS = ['Seed', 'Sprout', 'First Leaves', 'Young Plant', 'Growing', 'Mature', 'Blooming']
export const STAGE_THRESHOLDS = [0, 1, 5, 15, 30, 60, 100]

export const NEXT_STAGE_REWARDS = [
  'Your first stem will emerge from the soil.',
  'Your plant grows its first pair of leaves.',
  'New branches begin to form.',
  'Your plant grows taller and wider.',
  'Strong branches spread outward.',
  'Flowers bloom at the top.',
  '',
]

export const STAGE_MESSAGES = [
  'Your MoneyPlant is waiting.\nComplete today\'s goal to sprout your first stem.',
  'Your first sprout emerged.\nKeep going to grow your first leaf.',
  'Your plant has its first leaves.\nConsistency is making it real.',
  'Young and establishing.\nYour plant is finding its shape.',
  'Growing strong.\nYour consistent habits are showing.',
  'Mature and flourishing.\nYou\'ve built real financial consistency.',
  'Blooming.\nYou\'ve grown your MoneyPlant.',
]

interface PlantSVGProps {
  stageIdx: number
  opacity?: number
  viewBoxOverride?: string
  style?: React.CSSProperties
}

export function PlantSVG({ stageIdx, opacity = 1, viewBoxOverride, style }: PlantSVGProps) {
  return (
    <svg
      viewBox={viewBoxOverride ?? STAGE_VIEWBOX[stageIdx]}
      style={{ opacity, display: 'block', width: '100%', maxWidth: 220, height: 'auto', ...style }}
    >
      <Pot />
      {stageIdx === 0 && <ellipse cx="100" cy="242" rx="8" ry="5" fill="#7B5E2A" />}
      {stageIdx >= 1 && (<><Stem topY={226} /><Leaf x={112} y={230} angle={-38} rx={10} ry={4.5} color={G1} /></>)}
      {stageIdx >= 2 && (<><Stem topY={200} /><Leaf x={86} y={237} angle={40} rx={14} ry={6} color={G2} /><Leaf x={114} y={218} angle={-40} rx={14} ry={6} color={G2} /><Leaf x={108} y={200} angle={-22} rx={10} ry={4.5} color={G1} /></>)}
      {stageIdx >= 3 && (<><Stem topY={168} bend={4} /><Leaf x={84} y={238} angle={42} rx={16} ry={6.5} color={G3} /><Leaf x={116} y={220} angle={-42} rx={16} ry={6.5} color={G3} /><Leaf x={83} y={198} angle={38} rx={14} ry={5.5} color={G2} /><Leaf x={117} y={180} angle={-38} rx={14} ry={5.5} color={G2} /><Leaf x={105} y={167} angle={-18} rx={10} ry={4} color={G1} /></>)}
      {stageIdx >= 4 && (<><Stem topY={132} bend={5} /><Leaf x={82} y={238} angle={44} rx={17} ry={7} color={G4} /><Leaf x={118} y={220} angle={-44} rx={17} ry={7} color={G3} /><Leaf x={80} y={200} angle={40} rx={15} ry={6} color={G3} /><Leaf x={120} y={182} angle={-40} rx={15} ry={6} color={G2} /><Leaf x={82} y={162} angle={36} rx={14} ry={5.5} color={G2} /><Leaf x={118} y={145} angle={-36} rx={13} ry={5} color={G1} /><Leaf x={104} y={132} angle={-14} rx={10} ry={4} color={G1} /></>)}
      {stageIdx >= 5 && (<><Stem topY={96} bend={6} /><path d="M100,175 C88,168 78,158 70,148" stroke="#4E7A40" strokeWidth="2.5" fill="none" strokeLinecap="round" /><path d="M100,148 C112,141 122,131 130,121" stroke="#4E7A40" strokeWidth="2.5" fill="none" strokeLinecap="round" /><Leaf x={82} y={238} angle={44} rx={18} ry={7.5} color={G4} /><Leaf x={118} y={218} angle={-44} rx={18} ry={7.5} color={G4} /><Leaf x={79} y={198} angle={40} rx={16} ry={6.5} color={G3} /><Leaf x={121} y={178} angle={-40} rx={16} ry={6.5} color={G3} /><Leaf x={68} y={148} angle={50} rx={14} ry={5.5} color={G3} /><Leaf x={62} y={138} angle={40} rx={12} ry={5} color={G2} /><Leaf x={130} y={120} angle={-50} rx={14} ry={5.5} color={G2} /><Leaf x={82} y={155} angle={38} rx={14} ry={5.5} color={G2} /><Leaf x={118} y={135} angle={-38} rx={13} ry={5} color={G2} /><Leaf x={104} y={96} angle={-12} rx={10} ry={4} color={G1} /></>)}
      {stageIdx >= 6 && (<><Stem topY={68} bend={6} /><path d="M100,110 C86,104 76,94 68,84" stroke="#4E7A40" strokeWidth="2" fill="none" strokeLinecap="round" /><Leaf x={82} y={238} angle={44} rx={18} ry={7.5} color={G4} /><Leaf x={118} y={218} angle={-44} rx={18} ry={7.5} color={G4} /><Leaf x={79} y={198} angle={40} rx={16} ry={6.5} color={G4} /><Leaf x={121} y={178} angle={-40} rx={16} ry={6.5} color={G3} /><Leaf x={68} y={148} angle={50} rx={14} ry={5.5} color={G3} /><Leaf x={62} y={138} angle={40} rx={12} ry={5} color={G3} /><Leaf x={130} y={120} angle={-50} rx={14} ry={5.5} color={G2} /><Leaf x={82} y={155} angle={38} rx={14} ry={5.5} color={G2} /><Leaf x={118} y={135} angle={-38} rx={13} ry={5} color={G2} /><Leaf x={66} y={84} angle={50} rx={13} ry={5} color={G2} /><Leaf x={104} y={68} angle={-12} rx={10} ry={4} color={G1} /><circle cx="100" cy="58" r="8" fill="#FFD970" opacity="0.92" /><circle cx="88" cy="54" r="6" fill="#FFB347" opacity="0.85" /><circle cx="112" cy="56" r="6" fill="#FFD970" opacity="0.82" /><circle cx="100" cy="58" r="3.5" fill="#E07020" /><circle cx="88" cy="54" r="2.5" fill="#E07020" /><circle cx="112" cy="56" r="2.5" fill="#E07020" /></>)}
    </svg>
  )
}
