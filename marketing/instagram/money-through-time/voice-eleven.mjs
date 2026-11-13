// Generates an episode's narration with ElevenLabs (Eleven v3). Copied from ../s2/voice-eleven.mjs
// and pointed at this series: reads <ep>/screenplay.md's "Voice lines" list, one clip per line,
//   1. Narrator — `[calm] …Malayalam…`
// and writes private/money-through-time/voice/<ep>/01.mp3, 02.mp3 … (shots.json → lines[].voice).
//
//   ELEVENLABS_API_KEY and VOICE_NARRATOR=<voice id> in the repo's .env.local / .env.reels (git-ignored)
//   node marketing/instagram/money-through-time/voice-eleven.mjs ep01 [--only=1] [--force]
//   node marketing/instagram/money-through-time/voice-eleven.mjs ep01 --sample   (the "Pronunciation
//       samples" list → voice/<ep>/samples/S1.mp3 …, narrator voice, never used in the edit)
//
// The narrator is a NEW voice, deliberately not Maaman's (Manikandan). There is no default: the
// script stops until VOICE_NARRATOR is set. Existing clips are kept unless --force or --only.
// After each clip it measures where the speech ends (trailing silence excluded) and writes the
// subtitle end, shots.json → lines[].b = a + speech end + HOLD, for the line using that file.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { cli, here, paths, probe, report, loadEpisode, saveEpisode, fail, shown } from './lib.mjs'

const HOLD = 0.3   // subtitle stays this long after the last word

const repo = join(here, '..', '..', '..')
const env = Object.fromEntries(['.env', '.env.reels', '.env.local'].filter(f => existsSync(join(repo, f))).flatMap(f =>
  readFileSync(join(repo, f), 'utf8').split(/\r?\n/).map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean).map(m => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')])))
const { ep, flags } = cli('voice-eleven.mjs <ep> [--only=1,4] [--force]')
const KEY = process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY
if (!KEY) fail('ELEVENLABS_API_KEY is not set (repo .env.local or .env.reels)')
const only = typeof flags.only === 'string' ? flags.only.split(',').map(Number) : null

const voiceId = who => process.env[`VOICE_${who.toUpperCase()}`] || env[`VOICE_${who.toUpperCase()}`]
  || fail(`VOICE_${who.toUpperCase()} is not set — choose the ${who} voice in ElevenLabs and put its id in .env.local`)

// "1. Narrator — `text`" (a trailing *(note)* after the backticks is ignored); samples are "- S1 — `text`"
const md = readFileSync(join(here, ep, 'screenplay.md'), 'utf8').split(/\r?\n/)
const lines = flags.sample
  ? md.map(l => l.match(/^\s*-\s*(S\d+)\s*[—-]\s*`([^`]+)`/)).filter(Boolean).map(m => ({ n: m[1], who: 'narrator', text: m[2] }))
  : md.map(l => l.match(/^\s*(\d+)\.\s*(\w+)\s*[—-]\s*`([^`]+)`/)).filter(Boolean).map(m => ({ n: Number(m[1]), who: m[2].toLowerCase(), text: m[3] }))
if (!lines.length) fail(`no ${flags.sample ? '"- S1 — `text`" samples' : '"N. Who — `text`" voice lines'} in ${ep}/screenplay.md`)

// Speech end = start of the trailing silence (ElevenLabs pads the end), else the file length.
const speechEnd = file => {
  const dur = probe(file).dur, s = report(['-i', file, '-af', 'silencedetect=noise=-40dB:d=0.2', '-f', 'null', '-'])
  const starts = [...s.matchAll(/silence_start: ([\d.]+)/g)].map(m => Number(m[1]))
  const ends = [...s.matchAll(/silence_end: ([\d.]+)/g)].map(m => Number(m[1]))
  // the last silence is trailing if it never ends, or ends at EOF (ffmpeg versions differ)
  const trailing = starts.length && (ends.length < starts.length || ends.at(-1) >= dur - 0.05)
  return trailing ? Math.min(starts.at(-1), dur) : dur
}

const out = flags.sample ? join(paths(ep).voice, 'samples') : paths(ep).voice; mkdirSync(out, { recursive: true })
const data = loadEpisode(ep)
for (const l of lines) {
  const file = join(out, flags.sample ? `${l.n}.mp3` : `${String(l.n).padStart(2, '0')}.mp3`)
  const make = flags.sample ? !existsSync(file) || flags.force : only ? only.includes(l.n) : !existsSync(file) || flags.force
  if (make) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId(l.who)}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: l.text, model_id: 'eleven_v3' }),
    })
    if (!r.ok) fail(`text-to-speech → ${r.status} ${(await r.text()).slice(0, 300)}`)
    writeFileSync(file, Buffer.from(await r.arrayBuffer()))
  } else if (!existsSync(file)) continue
  const end = +speechEnd(file).toFixed(2)
  console.log(`${l.n}: ${make ? 'made' : 'kept'} · ${probe(file).dur} s, speech ends ${end} s → ${shown(file)}`)
  if (flags.sample) continue
  const line = data.lines.find(x => x.voice === `${String(l.n).padStart(2, '0')}.mp3`)
  if (!line) { console.log(`   ! no shots.json line uses this clip`); continue }
  line.b = +(line.a + end + HOLD).toFixed(2)
  const total = data.shots.reduce((s, x) => s + x.duration, 0)
  console.log(`   subtitle ${line.a}–${line.b} s${line.b > total ? `  ! runs past the ${total} s cut` : ''}`)
}
if (!flags.sample) saveEpisode(ep, data)
