# Flow plan, watermark and usage terms

Plan: **Google AI Pro**, account in **India**. Checked 2026-11-10 against Google's own pages only.
Re-check before each episode — Google says costs and limits "are subject to change at any time".

## Observed (this account, this Flow setup — not a guarantee)
- 2026-11-10, user report: videos generated in Flow on AI Pro and downloaded had **no visible
  watermark**. Not verified by Google's text (see below, it says the opposite for India). Every new
  download is still checked; if a visible watermark appears it is kept as delivered — **never
  cropped, blurred, covered or otherwise removed or concealed**, and the take is logged as such.
- 2026-11-11, EP01 Scene 01 takes (1080×1920, 24 fps, 3.92 s, audio): **`01C.mp4` carries a visible
  watermark** — a small four-point sparkle, bottom right (about x 1000, y 1700), in every frame.
  `01A.mp4` and `01B.mp4` show none. So the visible watermark does appear on this account; the
  earlier "none" was not a rule. 01C is kept as delivered.

## Verified (official)
| Topic | Finding | Source |
|---|---|---|
| Models | Flow is powered by "Omni Flash 1.2 or Veo 3.1 Lite". **Veo 3.1 Fast and Quality retire on 5 Dec 2026** (with Omni Flash 1.1); Veo Extend retired 5 Nov 2026 | support.google.com/flow/answer/16352836, /16526234 |
| Credits (AI Pro) | 50 per day (any user, no rollover) + 1,000 per month (no rollover). Veo 3.1 Lite 10 per 4/6/8 s video at 720p; Fast 20; Quality 100 (8 s only). Omni Flash 1.2: 3 credits/s at 720p | /16526234 |
| Veo 3.1 Lite features | Text to Video, Frames to Video (first; first+last), Ingredients to Video. Not supported: Video to Video editing, Extend | /16352836 |
| 1080p | Upscale to 1080p on Plus/Pro/Ultra, 0 credits up to 10 s — **documented for Omni Flash 1.2 and the retiring models only**. Veo 3.1 Lite: pages are silent. 4K: Ultra only | /16526234 |
| Visible watermark | "a visible watermark can be added"; a "Visible watermarking" toggle under the profile picture; "A visible watermark will be applied automatically for users in India, South Korea, and Vietnam who are not on the Google One AI Ultra 20x Plan." AI Pro is not exempt | /16353333 |
| SynthID | "All outputs generated in Google Flow using Veo, Omni, or Nano Banana include invisible SynthID watermarks." | /16353333 |
| C2PA | Flow pages don't say outputs carry Content Credentials — don't assume | — |
| Ownership | Flow FAQ defers to the Google Terms of Service: "Google won't claim ownership over that content" (ToS, India version, effective 30 Jul 2026) | /16353333, policies.google.com/terms |
| Conduct | ToS forbids "misleading others into thinking that generative AI content was created by a human". Prohibited Use Policy (17 Dec 2024) §4.5 provenance, §4.2 impersonation "in order to deceive"; exceptions possible for "educational, documentary, scientific, or artistic considerations". Flow can't generate "prominent people" | policies.google.com/terms/generative-ai/use-policy, /16353544 |
| Additional terms | Flow is **not** on the service-specific terms list; "Labs.google" points only to the ToS + Prohibited Use Policy. Google One terms (1 Oct 2026) cover AI credits only, nothing on use of output | policies.google.com/terms/service-specific, one.google.com/terms-of-service |
| SynthID check | Gemini app / gemini.google.com, signed in: video < 90 s and ≤ 100 MB, ~10 video checks per 24 h. Also SynthID Detector (synthid.com) | support.google.com/gemini/answer/16722517 |

## Open
1. **Commercial promotional use — OPEN.** No official page expressly permits or forbids it. What
   exists: no ownership claim, no Flow-specific additional terms, conduct rules above. Not
   verified until the user accepts that reading or Google confirms in writing.
2. **SynthID in our files** — documented for all Flow output; to be confirmed per approved take
   with Gemini's verification tool (≤ 90 s, ≤ 100 MB).
3. **1080p for Veo 3.1 Lite** — undocumented; to be observed on one T01 take (does Flow offer the
   upscale, at what credit cost).
4. **Visible watermark vs. the India rule** — docs say automatic; observed none. Recorded, not resolved.

## Our rules (unchanged)
Instagram "AI info" label on every post · "Dramatised reconstruction" on screen · no real or prominent
people · never alter or hide a watermark · narration and captions never claim the footage is real
or human-filmed.
