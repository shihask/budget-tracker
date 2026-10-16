// Edits the founder-story reel's scene 5 "MoneyPlant is born" (~11 s) from rendered pieces:
// clip-reveal → app dashboard → Quick Add → wealth/savings → Mint AI, crossfaded, sped up where
// the real interaction is longer than the beat, with a rising tone into the app and a chime.
//
//   node marketing/instagram/render-reel.mjs clip-reveal
//   node marketing/instagram/record-app.mjs
//   FFMPEG=… node marketing/instagram/cut-scene5.mjs     → out/founder-scene5-born.mp4

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const out = join(dirname(fileURLToPath(import.meta.url)), 'out')
const FFMPEG = process.env.FFMPEG || 'ffmpeg'

// [file, from, to, speed] — times in the source clip
const SEGS = [
  ['clip-reveal.mp4',   0,   2.4, 1],     // mark builds, tile zooms to green
  ['app-dashboard.mp4', .5,  3.0, 1],     // green hero → Budget Health
  ['app-quickadd.mp4',  1.0, 6.8, 2],     // + → "Evening chai 40" → Save → "Added"
  ['app-savings.mp4',   .2,  3.0, 1.5],   // Wealth Summary: savings & investments, lent out
  ['app-mint.mp4',      .4,  8.0, 2.7],   // Mint → Financial status card + AI insight
]
const FADE = [.25, .3, .3, .3]          // between consecutive segments

const lens = SEGS.map(([, a, b, s]) => (b - a) / s)
const chains = SEGS.map(([, a, b, s], i) =>
  `[${i}:v]trim=${a}:${b},setpts=(PTS-STARTPTS)/${s},fps=30,setsar=1,format=yuv420p[v${i}]`)
let prev = 'v0', acc = lens[0]
for (let i = 1; i < SEGS.length; i++) {
  acc -= FADE[i - 1]
  const lbl = i === SEGS.length - 1 ? 'vout' : `x${i}`
  chains.push(`[${prev}][v${i}]xfade=transition=fade:duration=${FADE[i - 1]}:offset=${acc.toFixed(3)}[${lbl}]`)
  prev = lbl
  acc += lens[i]
}
const total = acc

// Sound: a soft digital rise as the tile zooms into the app, then a chime when the dashboard lands.
const rise = `aevalsrc='0.16*sin(2*PI*(380*t+520*t*t))*(t/0.8)*(1-t/0.9)':d=0.9:s=44100`
const chime = `aevalsrc='0.2*(sin(2*PI*1318.5*t)+0.6*sin(2*PI*1975.5*t)+0.3*sin(2*PI*2637*t))*exp(-3.2*t)':d=1.6:s=44100`
const n = SEGS.length
chains.push(
  `[${n}:a]afade=t=in:d=0.2,adelay=1550:all=1[a0]`,
  `[${n + 1}:a]afade=t=in:d=0.01,adelay=2400:all=1[a1]`,
  `[a0][a1]amix=inputs=2:normalize=0,apad,atrim=0:${total.toFixed(3)}[aout]`,
)

const args = ['-y', '-v', 'error',
  ...SEGS.flatMap(([f]) => ['-i', join(out, f)]),
  '-f', 'lavfi', '-i', rise, '-f', 'lavfi', '-i', chime,
  '-filter_complex', chains.join(';'), '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', join(out, 'founder-scene5-born.mp4')]
const r = spawnSync(FFMPEG, args, { stdio: 'inherit' })
if (r.status !== 0) process.exit(1)
console.log(`out/founder-scene5-born.mp4  (${total.toFixed(1)} s)`)
