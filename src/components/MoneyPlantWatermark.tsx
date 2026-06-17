export function MoneyPlantWatermark({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 200 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">

        {/* Pot body */}
        <path strokeWidth="1.8" d="M67 298 L61 270 L139 270 L133 298 Z" />
        {/* Pot rim */}
        <ellipse cx="100" cy="268" rx="40" ry="6" strokeWidth="1.6" />
        {/* Pot soil line */}
        <path strokeWidth="1" d="M68 263 Q100 268 132 263" />

        {/* Main stem */}
        <path strokeWidth="2" d="M100 262 C99 248 96 234 93 220 C90 206 88 192 87 178 C86 164 87 152 89 138 C91 124 93 112 91 98 C89 84 87 74 89 60" />

        {/* Vine: right mid */}
        <path strokeWidth="1.5" d="M93 224 C108 217 123 210 136 200 C149 190 158 180 162 168" />
        {/* Vine: left mid */}
        <path strokeWidth="1.5" d="M88 180 C74 172 60 163 48 153 C36 143 28 132 24 120" />
        {/* Vine: right upper */}
        <path strokeWidth="1.5" d="M90 140 C104 130 116 119 124 107 C132 95 136 83 133 71" />
        {/* Vine: left upper */}
        <path strokeWidth="1.5" d="M90 102 C77 94 65 85 56 74 C47 63 44 52 46 40" />
        {/* Vine: top right */}
        <path strokeWidth="1.5" d="M90 66 C100 56 110 48 116 36" />

        {/* ── Leaves ─────────────────────────────────────────────────────────── */}
        {/* Each leaf: heart-shaped Pothos outline + midrib, centered at origin   */}

        {/* Leaf at end of right mid vine */}
        <g transform="translate(162,160) rotate(38)">
          <path strokeWidth="1.5" d="M0,22 C-4,18 -16,10 -16,1 C-16,-10 -8,-18 0,-20 C8,-18 16,-10 16,1 C16,10 4,18 0,22 Z" />
          <path strokeWidth="0.9" d="M0,22 L0,-20" />
        </g>

        {/* Leaf mid right mid vine */}
        <g transform="translate(138,198) rotate(22)">
          <path strokeWidth="1.5" d="M0,18 C-3,15 -13,8 -13,0 C-13,-9 -7,-15 0,-17 C7,-15 13,-9 13,0 C13,8 3,15 0,18 Z" />
          <path strokeWidth="0.9" d="M0,18 L0,-17" />
        </g>

        {/* Leaf at end of left mid vine */}
        <g transform="translate(24,118) rotate(-42)">
          <path strokeWidth="1.5" d="M0,22 C-4,18 -16,10 -16,1 C-16,-10 -8,-18 0,-20 C8,-18 16,-10 16,1 C16,10 4,18 0,22 Z" />
          <path strokeWidth="0.9" d="M0,22 L0,-20" />
        </g>

        {/* Leaf mid left mid vine */}
        <g transform="translate(50,151) rotate(-30)">
          <path strokeWidth="1.5" d="M0,18 C-3,15 -13,8 -13,0 C-13,-9 -7,-15 0,-17 C7,-15 13,-9 13,0 C13,8 3,15 0,18 Z" />
          <path strokeWidth="0.9" d="M0,18 L0,-17" />
        </g>

        {/* Leaf at end of right upper vine */}
        <g transform="translate(133,69) rotate(25)">
          <path strokeWidth="1.5" d="M0,22 C-4,18 -16,10 -16,1 C-16,-10 -8,-18 0,-20 C8,-18 16,-10 16,1 C16,10 4,18 0,22 Z" />
          <path strokeWidth="0.9" d="M0,22 L0,-20" />
        </g>

        {/* Leaf mid right upper vine */}
        <g transform="translate(116,106) rotate(14)">
          <path strokeWidth="1.5" d="M0,18 C-3,15 -13,8 -13,0 C-13,-9 -7,-15 0,-17 C7,-15 13,-9 13,0 C13,8 3,15 0,18 Z" />
          <path strokeWidth="0.9" d="M0,18 L0,-17" />
        </g>

        {/* Leaf at end of left upper vine */}
        <g transform="translate(46,38) rotate(-35)">
          <path strokeWidth="1.5" d="M0,22 C-4,18 -16,10 -16,1 C-16,-10 -8,-18 0,-20 C8,-18 16,-10 16,1 C16,10 4,18 0,22 Z" />
          <path strokeWidth="0.9" d="M0,22 L0,-20" />
        </g>

        {/* Leaf mid left upper vine */}
        <g transform="translate(60,72) rotate(-24)">
          <path strokeWidth="1.5" d="M0,18 C-3,15 -13,8 -13,0 C-13,-9 -7,-15 0,-17 C7,-15 13,-9 13,0 C13,8 3,15 0,18 Z" />
          <path strokeWidth="0.9" d="M0,18 L0,-17" />
        </g>

        {/* Leaf at end of top vine */}
        <g transform="translate(116,34) rotate(20)">
          <path strokeWidth="1.5" d="M0,18 C-3,15 -13,8 -13,0 C-13,-9 -7,-15 0,-17 C7,-15 13,-9 13,0 C13,8 3,15 0,18 Z" />
          <path strokeWidth="0.9" d="M0,18 L0,-17" />
        </g>

        {/* Leaf on main stem upper */}
        <g transform="translate(90,62) rotate(-10)">
          <path strokeWidth="1.5" d="M0,18 C-3,15 -13,8 -13,0 C-13,-9 -7,-15 0,-17 C7,-15 13,-9 13,0 C13,8 3,15 0,18 Z" />
          <path strokeWidth="0.9" d="M0,18 L0,-17" />
        </g>

        {/* Leaf on main stem lower */}
        <g transform="translate(87,176) rotate(6)">
          <path strokeWidth="1.5" d="M0,22 C-4,18 -16,10 -16,1 C-16,-10 -8,-18 0,-20 C8,-18 16,-10 16,1 C16,10 4,18 0,22 Z" />
          <path strokeWidth="0.9" d="M0,22 L0,-20" />
        </g>

      </g>
    </svg>
  )
}
