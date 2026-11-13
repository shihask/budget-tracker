// Shared by the Money Through Time scripts: paths, ffmpeg, probing, the episode's shots.json.
// Nothing here is imported from ../s2 — this series keeps its own copies, as S2 did from S1.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { createRequire } from 'node:module'

export const here = dirname(fileURLToPath(import.meta.url))
export const site = join(here, '..')                                   // marketing/instagram
export const privateRoot = join(site, 'private', 'money-through-time')  // git-ignored: takes, refs, voice
export const outRoot = join(site, 'out', 'money-through-time')
export const ffmpeg = process.env.FFMPEG || createRequire(import.meta.url)('ffmpeg-static')
export const shown = p => relative(site, p).replaceAll('\\', '/')

export const paths = ep => ({
  json: join(here, ep, 'shots.json'),
  flow: join(privateRoot, 'flow', ep),
  voice: join(privateRoot, 'voice', ep),
  out: join(outRoot, ep),
})

export const loadEpisode = ep => JSON.parse(readFileSync(paths(ep).json, 'utf8'))
export const saveEpisode = (ep, data) => writeFileSync(paths(ep).json, JSON.stringify(data, null, 2) + '\n')

// `node x.mjs ep01 T01 T02 --flag` → { ep, ids, flags }. No ids = every shot.
export function cli(usage) {
  const args = process.argv.slice(2), pos = args.filter(a => !a.startsWith('--'))
  if (!pos.length) { console.error(`usage: ${usage}`); process.exit(1) }
  const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => {
    const [k, v] = a.slice(2).split('='); return [k, v ?? true]
  }))
  return { ep: pos[0], ids: pos.slice(1), flags }
}
// A selection is a run of consecutive shots, in order (01A 01B …, or 02A 02B 02C on its own).
export const pick = (data, ids) => {
  if (!ids.length) return data.shots
  const k = data.shots.findIndex(s => s.id === ids[0]), run = k < 0 ? [] : data.shots.slice(k, k + ids.length)
  if (run.map(s => s.id).join() !== ids.join()) fail(`select consecutive shots, in order: ${data.shots.map(s => s.id).join(' ')}`)
  return run
}
// Length of a cut: each shot is on screen for duration + hold; a dissolve overlaps the previous shot.
export const cutLength = shots => +shots.reduce((s, x, i) => s + x.duration + (x.hold ?? 0) - (i ? x.dissolve ?? 0 : 0), 0).toFixed(4)
// Where a shot starts on the episode timeline.
const startOf = (data, shot) => {
  const k = data.shots.indexOf(shot)
  return k <= 0 ? 0 : +(cutLength(data.shots.slice(0, k)) - (shot.dissolve ?? 0)).toFixed(4)
}

// A take lives in flow/<ep>/<shot>/<file>, or directly in flow/<ep>/ when downloaded there (never moved).
export const takePath = (p, shot, file) => existsSync(join(p.flow, shot.id, file)) ? join(p.flow, shot.id, file) : join(p.flow, file)
export const listTakes = (p, shot) => {
  const dir = join(p.flow, shot.id), own = existsSync(dir) ? readdirSync(dir).filter(f => /\.mp4$/i.test(f)) : []
  const loose = existsSync(p.flow) ? readdirSync(p.flow).filter(f => new RegExp(`^${shot.id}([._ -].*)?\\.mp4$`, 'i').test(f)) : []
  return [...new Set([...own, ...loose])].sort()
}

// What a render uses: the shots plus the subtitles/cards/ambience laid over them. Production entries
// are in episode time and are shifted to the run, so 02A 02B 02C renders from 0 with its own lines;
// a line that starts before the run (its voice would be cut) is left out. `--test` renders ONE shot
// with its test-only entries, shots.json → tests.<shot> (local time), never part of the episode.
export const selection = (data, ids, flags) => {
  if (!flags.test) {
    const shots = pick(data, ids), off = startOf(data, shots[0])
    const shift = x => ({ ...x, a: +(x.a - off).toFixed(4), b: +(x.b - off).toFixed(4) })
    return {
      shots, offset: off,
      lines: data.lines.map(shift).filter(l => l.a >= 0),
      cards: data.cards.map(shift).filter(c => c.b > 0).map(c => ({ ...c, a: Math.max(0, c.a) })),
      ambience: data.ambience.map(b => ({ ...b, at: +(b.at - off).toFixed(4) })),
    }
  }
  const t = ids.length === 1 && data.tests?.[ids[0]]
  if (!t) fail(`--test needs exactly one shot with a shots.json → tests entry: ${Object.keys(data.tests ?? {}).join(' ') || 'none'}`)
  return { shots: data.shots.filter(s => s.id === ids[0]), offset: 0, lines: t.lines ?? [], cards: t.cards ?? [], ambience: t.ambience ?? [] }
}

export function fail(msg) { console.error(msg); process.exit(1) }

export function run(args, what = 'ffmpeg') {
  const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] })
  if (r.status !== 0) fail(`${what} failed`)
}
// Runs ffmpeg for its stderr report (probe, loudnorm, ebur128).
export const report = args => spawnSync(ffmpeg, ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 }).stderr

// ffmpeg -i is enough to probe (ffmpeg-static ships no ffprobe).
export function probe(file) {
  const s = report(['-i', file])
  const d = s.match(/Duration: (\d+):(\d+):([\d.]+)/), v = s.match(/Video: .*?, (\d{2,5})x(\d{2,5})[ ,].*?([\d.]+) fps/)
  return {
    dur: d ? +(d[1] * 3600 + d[2] * 60 + Number(d[3])).toFixed(3) : 0,
    w: v ? Number(v[1]) : 0, h: v ? Number(v[2]) : 0, fps: v ? Number(v[3]) : 0,
    audio: /Stream #\S+.*Audio:/.test(s),
  }
}
