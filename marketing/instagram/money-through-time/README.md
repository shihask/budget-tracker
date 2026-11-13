# Money Through Time — production notes

Photorealistic historical reconstruction series, 9:16, assembled from Google Flow (Veo) clips.
Separate from Manu & Maaman: nothing here imports from `../s2` or the Season 1 files, and nothing
there changes. Status: **production test T01 only** — the full EP01 is not built.

## Files
| Path | Purpose |
|---|---|
| `bible/look.md` | Locked visual direction, sound, safe areas, language |
| `bible/eras/uruk-3300bce.md` | Era file: documented / interpretation / plausible / banned, per item |
| `bible/flow-plan.md` | Flow plan facts (official, dated), observed results, open checks (commercial use) |
| `bible/references.md` | Sources; which images may be fed to Flow (own or public-domain only) |
| `bible/characters/<id>.md` | Character description + where its frozen reference set lives |
| `ep01/screenplay.md` | Decisions · Facts (sourced) · Fiction · Voice lines · Shots |
| `ep01/shots.json` | The edit and take log: shots, takes, approvals, trims, subtitles, cards, ambience |
| `ep01/prompts/<shot>.md` | The exact prompt sent to Flow, with failure → v2 changes |
| `ep01/overlay.html` | Transparent subtitle / place-card / reconstruction-tag layer, `render(t)` |
| `inspect-takes.mjs` | Logs new takes into shots.json, probes them, writes review stills + strip |
| `overlay-render.mjs` | overlay.html → `overlay.mov` (PNG with alpha) |
| `assemble.mjs` | Approved takes → conform → cut → overlay → mix → loudness → MP4 |
| `voice-eleven.mjs` | Narration via ElevenLabs v3 (copied from S2, narrator voice required) |

Large and licensed files live in `../private/money-through-time/` (git-ignored):
`refs/`, `characters/<id>/`, `flow/<ep>/<shot>/` (raw Flow downloads, never edited),
`voice/<ep>/NN.mp3`, `ambience/`. Renders go to `../out/money-through-time/<ep>/`.

## Run
```sh
cd marketing/instagram/money-through-time && npm install     # ffmpeg-static, pinned here; playwright from the repo root
node inspect-takes.mjs ep01 T01                               # after dropping Flow downloads in private/…/flow/ep01/T01/
node voice-eleven.mjs ep01                                     # needs ELEVENLABS_API_KEY + VOICE_NARRATOR
node overlay-render.mjs ep01 T01 [--stills]
node assemble.mjs ep01 T01 --name=T01-test [--placeholder]
node overlay-render.mjs ep01 T01 --test && node assemble.mjs ep01 T01 --test --name=T01-test   # T01 alone, test-only subtitle
```

## Rules
- **Flow pixels never go through the browser.** Only the overlay is rendered in Chromium; ffmpeg lays
  it over the untouched clips.
- **24 fps, 1080×1920** end to end. Veo's 720p output is upscaled (lanczos) — prefer 1080p downloads.
- **One source of truth:** `shots.json` drives the overlay timing, the cut and the mix. Subtitle and
  card times are episode times, so a partial render must start at the first shot.
- **Test entries stay out of the episode.** `shots.json` → `tests.<shot>` holds a shot's local-time
  subtitle/card for a one-shot preview; only `--test` reads it, and production renders never do.
- **A take is approved by hand** in `shots.json` (`takes[].status`, `notes`, `shot.approved`, `shot.in`)
  after the review checklist — never by the scripts.
- **No on-screen speech.** Flow audio is kept only as ambience (`audio.keep`, `audio.gain`); a take with
  generated voices is muted or rejected.
- **Loudness:** two-pass loudnorm to -14 LUFS integrated, -1 dBTP; the measured value is printed.
- No emoji, no invented readable inscriptions, "Dramatised reconstruction" on screen, Instagram
  "AI info" label when posting.
