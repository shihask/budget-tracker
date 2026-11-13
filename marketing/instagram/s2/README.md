# Manu & Maaman — Season 2 (3D) production notes

Season 2 ("Manu's First Budget") is 3D. It lives entirely in this folder; Season 1 files
(`../toon-*`, `../render-reel.mjs`) are untouched and keep rendering as before.

## Files
| File | Purpose |
|---|---|
| `cast3d.js` | The cast and set: `buildManu`, `buildMaaman`, `buildMint`, `buildPhone`, `buildHome`, `lightRoom`. Premium-toy style, Season 1 colours. Everything posed from `(t, state)` only |
| `stage.js` | Renderer, depth of field (BokehPass), `shotAt` shot keyframes (dolly, cut, `via` arcs, `rack` focus, handheld drift), `recordingTexture` for real app recordings on the phone, `bootS2` |
| `s2.css` | HTML overlays (badge, bubble, subtitle). Copied from `../toon-s1.css`, not linked |
| `sheets.html` | Character sheets: `?sheet=manu`, `maaman`, `manu-faces`, `maaman-faces`, `mint`, `lineup` |
| `looktest.html` | 8 s look test: dolly-in, cut to talking medium close-up, rack focus, push-in |
| `render-s2.mjs` | Renderer: local HTTP server (ES modules need it), real GPU, timings, `--stills`, `--verify` |
| `assets/` | Real app recordings (demo account) re-encoded for the phone screen |

## Run
```sh
cd marketing/instagram/s2 && npm install           # three 0.170.0 + ffmpeg-static, pinned here only
node render-s2.mjs looktest                         # → ../out/manu-maaman/s2/looktest/looktest.mp4
node render-s2.mjs looktest --stills                # review stills (times from the page)
node render-s2.mjs looktest --verify                # renders the stills twice, compares pixels (PSNR)
node render-s2.mjs "sheets?sheet=manu" --stills     # one character sheet
node render-s2.mjs looktest --frames=60             # benchmark only, writes nothing
```

## Voices (ElevenLabs, Eleven v3 — the same voices as Season 1)
| Character | ElevenLabs voice |
|---|---|
| Manu | Adhira |
| Maaman | Manikandan |
| Mint | Aisyah |

Clips go in `../private/voice/s2-epNN/<n>.mp3`, numbered in `LINES` order; clip n starts at
`LINES[n-1].a`. Amounts are written as Malayalam words in the voice lines, digits stay on screen.

## Rules that keep it working
- **Text is HTML, never 3D.** Malayalam shapes correctly and never blurs with depth of field.
- **Phone screens show real recordings only** (`recordingTexture`). Frames are copied through a
  canvas: uploading the `<video>` directly gave black screens on ANGLE/D3D11 headless.
- **Pose from t only.** Place the camera (`stage.frame`) before anything that aims at it.
- **Focus is view-space depth** (along the lens axis), which is what BokehShader compares.
- Painted face parts are flat shapes bent onto the head; their lift must exceed the chord sag
  (≈ w²/2R) or skin shows through the middle of an open mouth.
- A trailing `//` comment on a long one-line declaration silently swallows the rest of the line.

## Benchmark (Intel UHD 750, ANGLE/D3D11, 1080×1920, DOF + soft shadows)
- 3D render ≈ 15–21 ms/frame; page capture ≈ 360–440 ms/frame (the real cost).
- 8 s look test: 240 frames in ~90–110 s. A 45 s episode ≈ 1,350 frames ≈ 9–10 min.
- `--verify`: 4 of 10 stills pixel-identical across fresh loads, the rest 57–68 dB PSNR
  (sub-visible GPU rounding in wide/two-shot frames).
