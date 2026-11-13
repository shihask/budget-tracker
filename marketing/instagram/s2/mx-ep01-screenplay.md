# Money Experiments · S01 EP01 — Cash vs UPI

Its own series, not Season 2: same 3D cast, sets and pipeline (`render-s2.mjs`), its own numbers.
Page: `mx-ep01.html` · props: `mx-props3d.js` · output: `out/money-experiments/ep01/`.

## Decisions (2026-11-10)
- 3D, Season 2 cast. **Maaman narrates** (ElevenLabs **Manikandan**); he hosts on camera in the
  opening and closing shots and is heard over the rest.
- Manu's salary is **₹30,000** (this series doesn't follow Season 2's ₹45,000).
- Budget made to add up: 30,000 = fixed 18,000 + **savings 6,000** + daily expenses 6,000
  (the pasted script left ₹6,000 unaccounted for).
- Both months are labelled **illustrative** on screen (HUD, result cards, chart), not only in scene 5.
- No India map (an approximate outline of the borders is a liability). The data scene uses
  payment "pings" behind two bar panels instead.
- Generic phone screens only (salary notification, scanner, paid tick): no bank or payment-app
  branding. The closing MoneyPlant screen is a real recording (demo account).
- Emoji left out of the video (🆚 is set as a "VS" badge; 👇 is a comment icon). 🌱 stays in the caption.

## Facts (checked)
Ministry of Finance in the Lok Sabha / NPCI, FY = April–March:

| | FY 2016–17 | FY 2025–26 |
|---|---:|---:|
| Transactions | 1.78 crore | 24,161.69 crore (shown 24,162) |
| Value | ≈ ₹7,000 crore | ₹314.23 lakh crore (shown ≈ ₹314) |

Volume ≈ 13,000× (the government's own wording: "nearly 13,000-fold"); value 4,000×+.

## Voice lines (ElevenLabs v3, Maaman = **Manikandan**) → `private/voice/mx-ep01/01.mp3 … 18.mp3`
Generate all of them: `node marketing/instagram/s2/voice-eleven.mjs mx-ep01-screenplay.md mx-ep01`
(needs `ELEVENLABS_API_KEY` in the repo `.env.reels`, which is git-ignored; `--only=3,7` remakes single clips). Or paste one line per
clip on the website, as before. Amounts are Malayalam words in the voice, digits on screen.
Clip n starts at `LINES[n-1].a`: 1 → 0.4, 2 → 5, 3 → 8.9, 4 → 15.8, 5 → 19.6, 6 → 25.4, 7 → 31.8, 8 → 37, 9 → 43.2, 10 → 47.2, 11 → 54.8, 12 → 58.2, 13 → 63.4, 14 → 68.3, 15 → 73, 16 → 77.2, 17 → 82, 18 → 87 (script timings, refit after).
Line 18 is optional: the end card already shows the question.

1. Maaman — `[curious] Cash കൊടുക്കുമ്പോഴാണോ കൂടുതൽ ചെലവാകുന്നത്? അതോ UPI ഉപയോഗിക്കുമ്പോഴോ?`
2. Maaman — `[playful] ഒരേ Manu-നെ വെച്ച് ഒരു ചെറിയ experiment നോക്കാം!`
3. Maaman — `[clearly] Manu-ന്റെ salary മുപ്പതിനായിരം രൂപ. Fixed expenses പതിനെട്ടായിരം, savings ആറായിരം. ബാക്കി ആറായിരം daily expenses-ന്.`
4. Maaman — `[calm] രണ്ട് മാസവും ഒരേ budget, ഒരേ spending categories.`
5. Maaman — `[warmly] ആദ്യ മാസം Cash മാത്രം. ഓരോ തവണയും wallet തുറക്കുമ്പോൾ പണം കുറയുന്നത് Manu-ന് കാണാം.`
6. Maaman — `[thoughtful] Tea, snacks, petrol, groceries… ഓരോ ചെലവും രേഖപ്പെടുത്തി.`
7. Maaman — `[brisk] അടുത്ത മാസം UPI മാത്രം. Scan ചെയ്തു, pay ചെയ്തു… ചെറിയ ചെറിയ payments.`
8. Maaman — `[softly] Wallet-ൽ നിന്ന് cash പോകുന്നത് പോലെ നേരിട്ട് കാണുന്നില്ല.`
9. Maaman — `[clearly] ഈ example-ൽ UPI മാസം എണ്ണൂറ് രൂപ കൂടുതൽ ചെലവായി.`
10. Maaman — `[gently] പക്ഷേ ഇതുകൊണ്ട് UPI എപ്പോഴും കൂടുതൽ ചെലവാക്കും എന്ന് പറയാൻ പറ്റില്ല. ഇത് Manu-ന്റെ illustrative experiment മാത്രമാണ്.`
11. Maaman — `[excited] ഇനി ഇന്ത്യയുടെ യഥാർത്ഥ UPI കണക്കുകൾ നോക്കാം!`
12. Maaman — `[clearly] രണ്ടായിരത്തി പതിനാറ്–പതിനേഴിൽ ഒരു വർഷം നടന്നത് ഒരു കോടി എഴുപത്തിയെട്ട് ലക്ഷം UPI transactions മാത്രം.`
13. Maaman — `[amazed] രണ്ടായിരത്തി ഇരുപത്തഞ്ച്–ഇരുപത്താറ് ആയപ്പോഴേക്കും അത് ഇരുപത്തിനാലായിരത്തി നൂറ്റി അറുപത്തിരണ്ട് കോടി transactions ആയി!`
14. Maaman — `[curious] Transaction value നോക്കിയാലോ? ആദ്യ വർഷം ഏകദേശം ഏഴായിരം കോടി രൂപ.`
15. Maaman — `[amazed] രണ്ടായിരത്തി ഇരുപത്തഞ്ച്–ഇരുപത്താറിൽ ഏകദേശം മുന്നൂറ്റി പതിനാല് ലക്ഷം കോടി രൂപ!`
16. Maaman — `[warmly] Cash ആയാലും UPI ആയാലും… പണം എങ്ങനെ ചെലവാകുന്നു എന്ന് അറിയണം.`
17. Maaman — `[warmly] Convenience നല്ലതാണ്. പക്ഷേ spending awareness അതിലും പ്രധാനമാണ്!`
18. Maaman — `[friendly] Cash or UPI? നിങ്ങൾ ഏതാണ് കൂടുതലായി ഉപയോഗിക്കുന്നത്? Comment ചെയ്യൂ!`

Changes from the pasted script's narration: line 03 adds the savings split, lines 14–15 say
"ഏകദേശം" (about) for both rounded values, and line 18 voices the end card's question.

## Shots (script timings; refit to the voice once recorded)
| Time | Set | Shot |
|---|---|---|
| 0–4.5 | Room | Salary notification on Manu's phone ("₹30,000 credited") → notes fan into his wallet → the same Manu's UPI scanner |
| 4.5–8.7 | Room | Both Manus side by side (wallet left, phone right), Maaman hosting between them; CASH vs UPI badge; Maaman's bubble |
| 8.7–15.6 | Room | Overhead on three jars filling 18,000 / 6,000 / 6,000, with tags |
| 15.6–19.4 | Room | Wide: the checklist (same person, salary, budget; only the payment method changes) |
| 19.4–31.6 | Kada | Month 1, cash: running HUD; tea ₹15, snacks ₹40, petrol ₹300, groceries ₹850, each a note flying to the tray; fast-forward to day 30; result ₹5,200 spent / ₹800 left over the thinned wallet |
| 31.6–43.0 | Kada | Month 2, UPI: QR stand on the counter; the phone goes to it, "₹15 paid" pops; the transactions list piles up; fast-forward; result ₹6,000 / ₹0 |
| 43.0–54.6 | Room | Back home: bar chart CASH ₹5,200 vs UPI ₹6,000 against the ₹6,000 budget line; "+₹800 with UPI"; "Example only — not scientific proof" |
| 54.6–77.0 | Data | Push into the phone → green wipe → India's UPI journey: transactions panel, then value panel; source line |
| 77.0–86.8 | Room | Manu checks MoneyPlant (Mint in the screen), then Maaman's close-up for the takeaway |
| 86.8–93 | End | CASH or UPI? · Malayalam question · Comment below · MoneyPlant · Know Before You Spend. |

## Open
- The closing phone screen is a **placeholder** (`assets/app-dashboard-screen.webm`). Proposed real
  recording: a `cashupi` clip in `../record-app.mjs` showing Transactions with a Cash account and a
  UPI/bank account, with story rows added to the demo account and removed afterwards.
- Runtime is ~93 s against the script's 75 s. To shorten: trim scene 6 to one line each for
  volume and value (−8 s), and drop clip 18 (−5 s).
