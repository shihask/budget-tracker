// Logs and reviews the Flow takes for a shot. Every .mp4 in
// private/money-through-time/flow/<ep>/<shot>/ is a take: new ones are appended to shots.json
// (status "pending"), each gets five full-resolution review stills plus a contact strip, and
// anything that breaks the spec (not 9:16, not 24 fps, under 1080×1920, too short for in + duration,
// no audio) is printed as a warning. Takes are never edited or renamed.
//
//   node marketing/instagram/money-through-time/inspect-takes.mjs ep01 T01
//
// Review verdicts are written by hand in shots.json: takes[].status = approved | rejected, notes,
// and shot.approved = the file name (+ shot.in, the trim point).

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { cli, loadEpisode, saveEpisode, pick, paths, probe, run, shown, listTakes, takePath } from './lib.mjs'

const { ep, ids } = cli('inspect-takes.mjs <ep> [shot...]')
const data = loadEpisode(ep), p = paths(ep)
const AT = [0.1, 0.3, 0.5, 0.7, 0.9]

for (const shot of pick(data, ids)) {
  if (shot.black) continue
  const files = listTakes(p, shot)
  if (!files.length) { console.log(`${shot.id}: no takes yet — put the Flow downloads in ${shown(join(p.flow, shot.id))}`); continue }
  const review = join(p.out, 'review', shot.id); mkdirSync(review, { recursive: true })

  for (const file of files) {
    const src = takePath(p, shot, file), info = probe(src)
    let take = shot.takes.find(t => t.file === file)
    if (!take) shot.takes.push(take = { file, status: 'pending', notes: '' })
    Object.assign(take, info)

    const warn = []
    if (info.w * 16 !== info.h * 9) warn.push(`not 9:16 (${info.w}×${info.h})`)
    if (info.h < data.size[1]) warn.push(`below ${data.size[0]}×${data.size[1]} — will be upscaled`)
    if (Math.abs(info.fps - data.fps) > 0.01) warn.push(`${info.fps} fps, not ${data.fps}`)
    if (info.dur < shot.in + shot.duration) warn.push(`${info.dur}s is shorter than in ${shot.in} + ${shot.duration}s`)
    if (!info.audio) warn.push('no audio track')

    const base = file.replace(/\.mp4$/i, '')
    const stills = AT.map(f => {
      const png = join(review, `${base}-${Math.round(f * 100)}.png`)
      run(['-ss', (info.dur * f).toFixed(3), '-i', src, '-frames:v', '1', png], 'still')
      return png
    })
    const strip = join(review, `${base}-strip.jpg`)
    run([...stills.flatMap(s => ['-i', s]), '-filter_complex',
      `${stills.map((_, i) => `[${i}:v]scale=360:-2[s${i}]`).join(';')};${stills.map((_, i) => `[s${i}]`).join('')}hstack=inputs=${stills.length}`,
      '-frames:v', '1', '-q:v', '3', strip], 'contact strip')

    console.log(`${shot.id} ${file}: ${info.w}×${info.h} ${info.fps} fps ${info.dur}s ${info.audio ? 'audio' : 'silent'} · ${take.status}`)
    for (const w of warn) console.log(`   ! ${w}`)
    console.log(`   ${shown(strip)}`)
  }
}
saveEpisode(ep, data)
