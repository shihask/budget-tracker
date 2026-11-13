// Cuts the approved Flow takes into a finished vertical video:
//   conform (1080×1920, 24 fps, yuv420p) → hard cuts → overlay layer (overlay-render.mjs) →
//   take ambience + narration + ambience beds → two-pass loudness to -14 LUFS / -1 dBTP → H.264 + AAC.
// Reads <ep>/shots.json only; the takes in private/ are never modified.
//
//   node marketing/instagram/money-through-time/assemble.mjs ep01 T01 --name=T01-test
//   node marketing/instagram/money-through-time/assemble.mjs ep01 T01 --placeholder   (test pattern for
//       any shot without an approved take — checks the pipeline before Flow; file says PLACEHOLDER)
//   node marketing/instagram/money-through-time/assemble.mjs ep01 T01 --test --name=T01-test   (one shot with
//       its test-only subtitles/narration, shots.json → tests.T01; render the overlay with --test too)
//
// Output: out/money-through-time/<ep>/<name>.mp4 + three stills. Prints the measured loudness.

import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { cli, loadEpisode, selection, cutLength, takePath, paths, privateRoot, probe, run, report, shown, fail } from './lib.mjs'

const { ep, ids, flags } = cli('assemble.mjs <ep> [shot...] [--name=x] [--placeholder] [--test]')
const data = loadEpisode(ep), p = paths(ep), { shots, lines, ambience } = selection(data, ids, flags)
const [W, H] = data.size, FPS = data.fps
const total = cutLength(shots)
const name = (flags.name ?? `${ep}-${ids.join('-') || 'full'}`) + (flags.placeholder ? '-PLACEHOLDER' : '')
mkdirSync(p.out, { recursive: true })

// ── inputs ──
const inputs = [], graph = [], warn = []
let n = 0
const add = (...a) => { inputs.push(...a); return n++ }

// Per shot (shots.json): `black: true` = a black slug of `duration`, no take. `hold` = seconds the
// last frame is frozen after the footage; `dissolve` = cross-fade from the previous shot (overlaps
// it); `fade: { in, out }` = from/to black; `zoom` + `focus: [x, y]` (0–1) = punch-in; `grade` =
// ffmpeg eq options. None of these crop, cover or blur a region — a watermark stays as delivered.
shots.forEach((s, i) => {
  const len = s.duration + (s.hold ?? 0)
  const tail = [`fps=${FPS}`, 'setsar=1', 'format=yuv420p']
  if (s.hold) tail.push(`tpad=stop_mode=clone:stop_duration=${s.hold}`)
  if (s.fade?.in) tail.push(`fade=t=in:st=0:d=${s.fade.in}`)
  if (s.fade?.out) tail.push(`fade=t=out:st=${+(len - s.fade.out).toFixed(4)}:d=${s.fade.out}`)
  tail.push('settb=AVTB')
  if (s.black) {
    graph.push(`color=c=black:s=${W}x${H}:r=${FPS}:d=${len},${tail.join(',')}[v${i}]`, `anullsrc=r=48000:cl=stereo,atrim=0:${len}[a${i}]`)
    return
  }
  const file = s.approved && takePath(p, s, s.approved)
  const real = file && existsSync(file)
  if (!real && !flags.placeholder) fail(`${s.id}: no approved take${s.approved ? ` (${shown(file)} missing)` : ''} — set shots.json → approved, or pass --placeholder`)
  if (real && probe(file).dur + 1e-3 < s.in + s.duration) fail(`${s.id}: ${s.approved} is ${probe(file).dur}s, shorter than in ${s.in} + duration ${s.duration}`)
  const k = real ? add('-i', file) : add('-f', 'lavfi', '-t', String(s.in + s.duration), '-i', `testsrc2=s=${W}x${H}:r=${FPS}`)
  if (!real) warn.push(`${s.id}: PLACEHOLDER test pattern`)
  const look = [
    ...(s.zoom > 1 ? [`crop=iw/${s.zoom}:ih/${s.zoom}:(iw-iw/${s.zoom})*${s.focus?.[0] ?? 0.5}:(ih-ih/${s.zoom})*${s.focus?.[1] ?? 0.5}`, `scale=${W}:${H}:flags=lanczos`] : []),
    ...(s.grade ? [`eq=${Object.entries(s.grade).map(([k, v]) => `${k}=${v}`).join(':')}`] : []),
  ]
  graph.push(`[${k}:v]trim=start=${s.in}:duration=${s.duration},setpts=PTS-STARTPTS,`
    + `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},${[...look, ...tail].join(',')}[v${i}]`)
  const keep = real && s.audio?.keep && probe(file).audio
  graph.push(keep
    ? `[${k}:a]atrim=start=${s.in}:duration=${s.duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${s.audio.gain ?? 1},apad,atrim=0:${len}[a${i}]`
    : `anullsrc=r=48000:cl=stereo,atrim=0:${len}[a${i}]`)
})
// join in order: a dissolve is xfade/acrossfade over the overlap, anything else a hard cut
let at = shots[0].duration + (shots[0].hold ?? 0)
graph.push('[v0]null[jv0]', '[a0]anull[ja0]')
for (let i = 1; i < shots.length; i++) {
  const d = shots[i].dissolve
  graph.push(d
    ? `[jv${i - 1}][v${i}]xfade=transition=fade:duration=${d}:offset=${+(at - d).toFixed(4)}[jv${i}]`
    : `[jv${i - 1}][v${i}]concat=n=2:v=1:a=0[jv${i}]`)
  graph.push(d ? `[ja${i - 1}][a${i}]acrossfade=d=${d}[ja${i}]` : `[ja${i - 1}][a${i}]concat=n=2:v=0:a=1[ja${i}]`)
  at += shots[i].duration + (shots[i].hold ?? 0) - (d ?? 0)
}
graph.push(`[jv${shots.length - 1}]null[base]`, `[ja${shots.length - 1}]anull[bed]`)

const overlay = join(p.out, 'overlay.mov')
if (!existsSync(overlay)) fail(`no overlay layer — run: node marketing/instagram/money-through-time/overlay-render.mjs ${ep} ${ids.join(' ')}`)
if (Math.abs(probe(overlay).dur - total) > 1.5 / FPS) fail(`overlay.mov is ${probe(overlay).dur}s, the cut is ${total}s — re-run overlay-render.mjs with the same shots`)
const ov = add('-i', overlay)
graph.push(`[${ov}:v]format=rgba[ov]`, `[base][ov]overlay=0:0:eof_action=pass,format=yuv420p[vout]`)

// narration: lines[i].voice at lines[i].a; ambience beds: { file (under private/money-through-time), at, gain }
const mix = ['[bed]']
lines.filter(l => l.a < total).forEach((l, i) => {
  const f = join(p.voice, l.voice)
  if (!existsSync(f)) { warn.push(`no narration: ${shown(f)} missing`); return }
  const k = add('-i', f)
  graph.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(l.a * 1000)}:all=1[n${i}]`); mix.push(`[n${i}]`)
})
// a bed that began before this run is trimmed by the part already played
ambience.filter(b => b.at < total && b.at + probe(join(privateRoot, b.file)).dur > 0).forEach((b, i) => {
  const k = add('-i', join(privateRoot, b.file))
  const place = b.at < 0 ? `atrim=start=${-b.at},asetpts=PTS-STARTPTS` : `adelay=${Math.round(b.at * 1000)}:all=1`
  graph.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${b.gain ?? 1},${place}[b${i}]`); mix.push(`[b${i}]`)
})
graph.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0,apad,atrim=0:${total}[aout]`)

// ── 1. picture + raw mix ──
const mkv = join(p.out, `${name}.mix.mkv`), mp4 = join(p.out, `${name}.mp4`)
run([...inputs, '-filter_complex', graph.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', String(total),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'pcm_s16le', mkv], 'assemble')

// ── 2. loudness, two-pass (single-pass loudnorm drifts on short clips) ──
const TARGET = 'I=-14:TP=-1:LRA=11'
const m = JSON.parse(report(['-i', mkv, '-map', '0:a', '-af', `loudnorm=${TARGET}:print_format=json`, '-f', 'null', '-']).match(/\{[^{}]*"input_i"[^{}]*\}/)[0])
const silent = !(Number(m.input_i) > -70)   // "-inf" on a silent mix: nothing to normalise
const af = silent ? [] : ['-af', `loudnorm=${TARGET}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`]
run(['-i', mkv, '-map', '0:v', '-map', '0:a', '-c:v', 'copy', ...af, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', mp4], 'loudness')
rmSync(mkv, { force: true })

// ── 3. measure what was delivered, stills ──
const r = report(['-i', mp4, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-']).split('Summary:').pop()
const lufs = r.match(/I:\s+(-?[\d.]+|-inf) LUFS/)?.[1], peak = r.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/)?.[1]
const stillsDir = join(p.out, 'stills'); mkdirSync(stillsDir, { recursive: true })
for (const t of [1, total / 2, total - 0.5]) run(['-ss', t.toFixed(2), '-i', mp4, '-frames:v', '1', join(stillsDir, `${name}-${t.toFixed(1)}.png`)], 'still')

const out = probe(mp4)
console.log(`${shown(mp4)} · ${out.w}×${out.h} ${out.fps} fps ${out.dur}s · ${silent ? 'silent mix' : `${lufs} LUFS, true peak ${peak} dBTP`}`)
for (const w of warn) console.log(`   ! ${w}`)
