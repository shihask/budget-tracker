// Generates an episode's voice clips with ElevenLabs (Eleven v3), instead of pasting each line
// into the website. Reads the screenplay's "Voice lines" list — one line per clip, in the form
//   1. Maaman — `[warmly] …text…`
// and writes private/voice/<dir>/01.mp3, 02.mp3 … (the numbering REEL_VOICE expects).
//
//   ELEVENLABS_API_KEY in the repo's .env.local (put there by `elevenlabs onboard`; git-ignored —
//   .env itself is tracked, so never there)
//   node marketing/instagram/s2/voice-eleven.mjs mx-ep01-screenplay.md mx-ep01 [--only=3,7] [--force]
//
// Voice ids: VOICE_<WHO>=<id> in the env wins, then VOICE_IDS below, then a lookup by name among the
// account's voices (Manu = Adhira, Maaman = Manikandan, Mint = Aisyah).
// Existing clips are kept unless --force or --only names them. Prints each clip's length.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const env = Object.fromEntries(['.env', '.env.reels', '.env.local'].filter(f => existsSync(join(repo, f))).flatMap(f =>
  readFileSync(join(repo, f), 'utf8').split(/\r?\n/).map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean).map(m => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')])))
const KEY = process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY
const args = process.argv.slice(2), [screenplay, dir] = args.filter(a => !a.startsWith('--'))
if (!screenplay || !dir) { console.error('usage: voice-eleven.mjs <screenplay.md> <voice dir> [--only=1,4] [--force]'); process.exit(1) }
if (!KEY) { console.error('ELEVENLABS_API_KEY is not set (run `npx @elevenlabs/cli onboard`; it writes .env.local)'); process.exit(1) }
const only = args.find(a => a.startsWith('--only='))?.split('=')[1].split(',').map(Number)
const force = args.includes('--force')
const VOICE_NAMES = { manu: 'Adhira', maaman: 'Manikandan', mint: 'Aisyah' }
const VOICE_IDS = { maaman: 'Eclv6jJwMbGUhEki9Bro' }   // chosen by the user, 2026-11-10

// "1. Maaman — `text`" (a trailing *(note)* after the backticks is ignored)
const lines = readFileSync(join(here, screenplay), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*(\d+)\.\s*(\w+)\s*[—-]\s*`([^`]+)`/)).filter(Boolean)
  .map(m => ({ n: Number(m[1]), who: m[2].toLowerCase(), text: m[3] }))
if (!lines.length) { console.error(`no "N. Who — \`text\`" voice lines in ${screenplay}`); process.exit(1) }

const api = async (path, init = {}) => {
  const r = await fetch('https://api.elevenlabs.io' + path, { ...init, headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', ...init.headers } })
  if (!r.ok) throw new Error(`${path.split('?')[0]} → ${r.status} ${(await r.text()).slice(0, 300)}`)
  return r
}
let voices = null   // listed only when a voice has no id
const voiceId = async who => {
  const id = process.env[`VOICE_${who.toUpperCase()}`] || env[`VOICE_${who.toUpperCase()}`] || VOICE_IDS[who]
  if (id) return id
  voices ??= (await (await api('/v1/voices')).json()).voices
  const name = VOICE_NAMES[who], v = voices.find(v => v.name.toLowerCase().startsWith(name?.toLowerCase()))
  if (!v) throw new Error(`voice "${name ?? who}" isn't in this ElevenLabs account — add it from the Voice Library, or set VOICE_${who.toUpperCase()}`)
  return v.voice_id
}

const out = join(here, '..', 'private', 'voice', dir); mkdirSync(out, { recursive: true })
const ffmpeg = process.env.FFMPEG || createRequire(import.meta.url)('ffmpeg-static')
const length = f => {
  const m = spawnSync(ffmpeg, ['-i', f], { encoding: 'utf8' }).stderr.match(/Duration: (\d+):(\d+):([\d.]+)/)
  return m ? m[1] * 3600 + m[2] * 60 + Number(m[3]) : 0
}

for (const l of lines) {
  const file = join(out, `${String(l.n).padStart(2, '0')}.mp3`)
  if (only ? !only.includes(l.n) : existsSync(file) && !force) { if (existsSync(file)) console.log(`${l.n}: kept (${length(file).toFixed(2)} s)`); continue }
  const r = await api(`/v1/text-to-speech/${await voiceId(l.who)}?output_format=mp3_44100_128`, {
    method: 'POST', body: JSON.stringify({ text: l.text, model_id: 'eleven_v3' }),
  })
  writeFileSync(file, Buffer.from(await r.arrayBuffer()))
  console.log(`${l.n}: ${l.who} · ${length(file).toFixed(2)} s`)
}
