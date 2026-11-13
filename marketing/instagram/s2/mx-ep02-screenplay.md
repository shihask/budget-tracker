# Money Experiments · S01 EP02 — Save First vs Save Later

**Plan approved; voice made; page built (2026-11-11), stills awaiting review.** Runtime 70 s (timed to the clips).
Page: `mx-ep02.html` · props: `mx-props3d.js` (shared with EP01) · output: `out/money-experiments/ep02/`.

## The experiment
The same Manu, salary, fixed costs and shop. Only one thing changes: **when** he saves.

| | Month 1: save what's left | Month 2: save first |
|---|---:|---:|
| Salary | 30,000 | 30,000 |
| Fixed expenses | 18,000 | 18,000 |
| Moved to savings on payday | 0 | **6,000** |
| Money to spend from | 12,000 | 6,000 |
| Spent | 10,500 | 5,700 |
| Saved at month end | **1,500** | **6,000 + 300 left** |
| Over one year (× 12) | 18,000 | 72,000 |

Spending grows to fill the money that's there. Both months are labelled **illustrative** on screen,
as in EP01. The year row is plain multiplication, with no returns and no interest rate, so it isn't
investment advice and needs no assumed return.

## Decisions to confirm
- **Topic:** Save First vs Save Later. It follows on from EP01 (EP01 is about how you pay; EP02 is
  about when you save) and reuses most of EP01's sets: room, jars, wallet, kada.
- **Same rules as EP01:** 3D Season 2 cast, ₹30,000, Maaman narrates (voice
  `Eclv6jJwMbGUhEki9Bro`), generic phone screens, no emoji in the video.
- **No "real data" scene this time.** The national figure (RBI household net financial savings) is
  6.0 % of GDP or 7 % of GNDI for 2024-25, depending on the report, and both are preliminary. That's
  too unsettled for a one-line on-screen fact. The one-year comparison stands in for it.
  If you want a data scene anyway, use "7 % of gross national disposable income, 2024-25, RBI
  Annual Report" with its source line.
- **Target 75 s** (EP01 ran 103.5 s). That allows 13 short lines and no second data panel.
- **Closing app screen:** a real recording of MoneyPlant's Savings page on the demo account (a
  ₹6,000 Record Contribution with "Paying for" on payday). This needs your go-ahead before recording.

## Voice lines (ElevenLabs v3, Maaman) → `private/voice/mx-ep02/01.mp3 … 13.mp3`
`node marketing/instagram/s2/voice-eleven.mjs mx-ep02-screenplay.md mx-ep02`
Amounts are spoken as Malayalam words and shown as digits on screen.

1. Maaman — `[curious] Salary കിട്ടിയാൽ ആദ്യം save ചെയ്യണോ? അതോ മാസം അവസാനം ബാക്കി വരുന്നത് save ചെയ്താൽ മതിയോ?`
2. Maaman — `[playful] Manu-നെ വെച്ച് അടുത്ത experiment!`
3. Maaman — `[clearly] Salary മുപ്പതിനായിരം രൂപ. Fixed expenses പതിനെട്ടായിരം. ബാക്കി പന്ത്രണ്ടായിരം.`
4. Maaman — `[warmly] ആദ്യ മാസം: ചെലവെല്ലാം കഴിഞ്ഞ് ബാക്കി വരുന്നത് save ചെയ്യും.`
5. Maaman — `[thoughtful] പണം കയ്യിലുണ്ടല്ലോ… ഒരു movie, ഒരു dinner, ഒരു online sale.`
6. Maaman — `[softly] മാസം അവസാനം ബാക്കി വന്നത് ആയിരത്തി അഞ്ഞൂറ് രൂപ മാത്രം.`
7. Maaman — `[brisk] അടുത്ത മാസം: salary വന്ന ദിവസം തന്നെ ആറായിരം രൂപ savings-ലേക്ക്.`
8. Maaman — `[calm] ബാക്കി ആറായിരം കൊണ്ട് മാസം മുഴുവൻ.`
9. Maaman — `[pleased] മാസം അവസാനം ആറായിരം savings-ൽ സുരക്ഷിതം. കൂടെ മുന്നൂറ് രൂപ ബാക്കിയും!`
10. Maaman — `[clearly] ഒരു വർഷം നോക്കിയാൽ… പതിനെട്ടായിരം, അല്ലെങ്കിൽ എഴുപത്തിരണ്ടായിരം.`
11. Maaman — `[gently] ഇത് Manu-ന്റെ illustrative experiment മാത്രമാണ്. എല്ലാവർക്കും ഒരേ result കിട്ടണമെന്നില്ല.`
12. Maaman — `[warmly] പക്ഷേ ഓർക്കുക… ബാക്കി വരുന്നതല്ല savings. ആദ്യം മാറ്റിവെക്കുന്നതാണ്.`
13. Maaman — `[friendly] നിങ്ങൾ save ചെയ്യുന്നത് ആദ്യമോ, അവസാനമോ? Comment ചെയ്യൂ!`

## Shots (planned times; refit to the voice once it's recorded)
| Time | Set | Shot | Reuses |
|---|---|---|---|
| 0–5 | Room | Maaman's hook; salary notification on Manu's phone, "₹30,000 credited" | EP01 opening |
| 5–7 | Room | Two Manus side by side: "SAVE LATER" badge on the left, "SAVE FIRST" on the right | EP01 split |
| 7–12 | Room | Overhead on the jars: Fixed fills to 18,000, Spend fills to 12,000, Savings stays empty with a "?" tag | `buildJar.setFill` |
| 12–30 | Kada + room | Month 1: HUD (day / spent / left). Spending beats: movie ticket, dinner, a parcel at the door ("sale"). The Spend jar drains; fast-forward to day 30; ₹1,500 drops into Savings. Result card "Saved ₹1,500" | EP01 kada, HUD, fast-forward |
| 30–46 | Room + kada | Month 2: on payday ₹6,000 moves from the Spend jar to Savings, with a "PAYDAY" stamp. The Spend jar starts at half. The same beats, but fewer. Day 30: ₹300 left, Savings full. Result card "Saved ₹6,000 + ₹300 left" | |
| 46–54 | Room | One-year chart: 12 small stacks on each side, counting up to 18,000 and 72,000 | EP01 chart (`.cbar`) |
| 54–60 | Room | "Illustrative — not a rule" banner, Maaman wide | EP01 proof banner |
| 60–68 | Room | Manu records the savings on payday in MoneyPlant (real recording), then Maaman's close-up for the takeaway | EP01 S7 |
| 68–75 | End | SAVE FIRST or LATER? · Malayalam question · Comment below · MoneyPlant · Know Before You Spend. | EP01 end card |

## New props (in `mx-props3d.js`)
- Movie ticket, dinner plate, and a parcel box (the "sale").
- PAYDAY stamp: an HTML overlay, not 3D (text is always HTML).
- A lid on the Savings jar that closes in Month 2 ("set aside, don't touch").

## Caption draft
Salary വന്നാൽ ആദ്യം save ചെയ്യണോ, അതോ ബാക്കി വരുന്നത് മതിയോ? 🌱
Manu-ന്റെ രണ്ട് മാസത്തെ experiment. (Illustrative example only)
#MoneyExperiments #SaveFirst #MalayalamFinance #MoneyPlant
