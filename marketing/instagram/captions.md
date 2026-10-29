# Pinned posts: captions

Post them in reverse order (3, then 2, then 1), so that after pinning, Post 1 sits on the left.
Pin all three: open the post → ⋯ → Pin to your profile.

Images are in `out/`. Upload each post as a carousel, slides in number order.
Regenerate after editing `pinned-posts.html`: `node marketing/instagram/render.mjs`

---

## Post 1: What MoneyPlant is
Slides: post1-slide1 → post1-slide4

```
Payday is 12 days away. How much can you actually spend? 🤔

MoneyPlant looks at your balance, rent, EMIs, SIPs and card bills, and shows what's safe to spend until your next salary.

🌱 Payday forecast: your balance on every day until salary
💬 Ask Mint: "Can I afford this?" and get a straight answer
📅 Bill and EMI reminders before every due date
✈️ Trips and weddings tracked separately, so they don't wreck your monthly budget

Free. Works on any phone. No app store needed.
👉 Link in bio: moneyplant.online

#moneyplant #personalfinance #budgeting #expensetracker #moneymanagement #financeindia #savemoney #salary #budgetapp #indianfinance
```

---

## Post 2: How to install
Slides: post2-slide1 → post2-slide3

```
MoneyPlant isn't on the Play Store or App Store, and you don't need it to be. It installs straight from your browser in 20 seconds 📲

📱 iPhone: open moneyplant.online in Safari → Share → Add to Home Screen → Add
🤖 Android: open moneyplant.online in Chrome → ⋮ menu → Install app → Install

It opens full screen like any other app, and keeps working offline.

Save this post for later 🔖

#moneyplant #howto #pwa #expensetracker #budgetapp #personalfinance #financeindia
```

---

## Post 3: Free and private
Slides: post3-slide1 → post3-slide3

```
Your money data is yours. Here's exactly what we do and don't do with it 🔒

✅ We never sell your data
✅ No ads, no tracking cookies
✅ We never ask for your bank password
✅ Other users and our admin tools can't see your transactions
✅ AI is optional; turn Autopilot off any time
✅ Export everything to CSV, or ask us to delete your account

Full privacy policy: moneyplant.online

#moneyplant #privacy #personalfinance #budgeting #financeindia #expensetracker
```

---

## Reel: "Can I afford it?"
File: `out/reel-afford.mp4` (18 s, 1080×1920, no audio). Source: `reel-afford.html`
Regenerate: `node marketing/instagram/render-reel.mjs reel-afford` (needs ffmpeg; see the script header).

In the Instagram editor, add a trending sound at low volume before posting. Reels with
audio get far more reach, and the video has no audio of its own.
Cover: pick the end card (the logo frame), or the "Payday is 12 days away" opening.

```
Payday is 12 days away. Can you afford that ₹5,000 jacket? 🤔

Ask Mint. MoneyPlant checks your rent, EMIs and card bills, and tells you what's actually free to spend before payday.

Free. Works on any phone, even offline.
👉 Link in bio: moneyplant.online

#moneyplant #personalfinance #budgeting #moneytips #salary #expensetracker #financeindia #savemoney #budgetapp #reelsindia
```

For a Meta ad: same video, primary text = the first two lines above, headline
"Know before you spend", button "Learn more" → https://moneyplant.online

---

## More reels
All four reels share `reel-kit.css` / `reel-kit.js`. Render any of them:
`node marketing/instagram/render-reel.mjs reel-afford reel-trip reel-salary reel-offline`
Same posting notes as above: add a trending sound in Instagram; there's no audio in the file.

### Reel: "Mint noticed your trip" (Life Events)
File: `out/reel-trip.mp4` (18 s). Cover: the "Ooty Trip ₹8,460" card.
```
Back from a trip and now your budget says you overspent? 😅

MoneyPlant's Mint spots trips, weddings and other one-offs in your expenses and suggests grouping them. You review it, and it stays out of your monthly budget, while your balance stays accurate.

Nothing is linked without you.
👉 Link in bio: moneyplant.online

#moneyplant #travelbudget #weddingbudget #personalfinance #budgeting #expensetracker #financeindia #moneytips #reelsindia
```

### Reel: "Salary day reality"
File: `out/reel-salary.mp4` (17 s). Cover: "₹48,000 credited." or the "Actually free ₹14,300" frame.
```
₹48,000 credited. Feels rich for about 5 minutes 😬

Rent, EMI, credit card bill, SIP... MoneyPlant takes them out before you spend, and tells you what's actually free until next salary, per day.

Free. Works on any phone.
👉 Link in bio: moneyplant.online

#moneyplant #salaryday #salary #emi #personalfinance #budgeting #moneymanagement #financeindia #savemoney #reelsindia
```

### Reel: "No network? Still logged" (offline)
File: `out/reel-offline.mp4` (17 s). Cover: the "No network at the dhaba?" opening.
```
No network at the dhaba? Log it anyway 📵

MoneyPlant saves expenses on your phone when you're offline and updates your balance straight away. Back online, tap Save all and it's in your account.

Every rupee. Even offline.
👉 Link in bio: moneyplant.online

#moneyplant #offline #expensetracker #personalfinance #budgeting #financeindia #roadtrip #moneytips #reelsindia
```

### Reel: "When did I last pay the plumber?" (Mint find)
File: `out/reel-find.mp4` (17 s). Cover: the opening question.
```
When did I last pay the plumber? 🤔 You know you paid. Not when.

Just ask Mint. "find plumber", "find swiggy in August", "find 450", and the matching expenses show up with dates. You can even fix one: "change fuel 500 to 300".

👉 Link in bio: moneyplant.online

#moneyplant #expensetracker #personalfinance #budgeting #moneytips #financeindia #productivity #reelsindia
```

### Reel: "Friends paid you back"
File: `out/reel-payback.mp4` (17 s). Cover: the "₹1,200 → ₹400" Food card.
```
You paid ₹1,200 for dinner. Friends paid back ₹800. So what did you really spend? 🍽️

Link the payback to the bill in MoneyPlant. Your Food spending shows ₹400, the ₹800 isn't counted as income, and your balance still shows both.

Only count what's really yours.
👉 Link in bio: moneyplant.online

#moneyplant #splitbill #friends #personalfinance #budgeting #expensetracker #financeindia #moneytips #reelsindia
```

### Reel: "Credit card bill surprised you again?"
File: `out/reel-card.mp4` (17 s). Cover: the card with "Due in 6 days".
```
Credit card bill surprised you again? 💳

MoneyPlant shows this bill, its due date and what's already on the next one. And it takes the bill out of your safe-to-spend before you spend.

No more bill-day surprises.
👉 Link in bio: moneyplant.online

#moneyplant #creditcard #creditcardbill #personalfinance #budgeting #emi #financeindia #moneytips #reelsindia
```

---

## Carousel: "Your whole money life. One free app." (all features)
Files: `out/features-01.png` … `out/features-10.png` (upload as one carousel, in order).
Source: `carousel-features.html` → `node marketing/instagram/render.mjs carousel-features`.
Good one to pin, and to replace the oldest pinned post. Carousels get saved; the last slide asks for it.
```
Your whole money life. One free app. 🌱 Swipe to see everything MoneyPlant does 👉

1️⃣ Safe to spend today, with a plant that grows when you stick to it
2️⃣ Your balance on every day until payday
3️⃣ Bills, EMIs and subscriptions, before they're due
4️⃣ Credit card bill: billed and unbilled
5️⃣ SIPs, gold schemes, RDs and chit funds
6️⃣ Ask Mint: "Can I afford it?"
7️⃣ Needs, Wants and Savings plans
8️⃣ Trips, weddings and splitting with friends

Free. No bank password. Works offline.
👉 Link in bio: moneyplant.online · Save this for later 🔖

#moneyplant #personalfinance #budgeting #expensetracker #moneymanagement #financeindia #salary #sip #creditcard #budgetapp
```

## Reel: "8 things MoneyPlant does, for free"
File: `out/reel-features.mp4` (22 s). Cover: the "8 things" opening.
```
8 things MoneyPlant does, for free 🌱 Which one do you need most? Tell me in the comments 👇

Safe-to-spend · payday forecast · bills & EMIs · credit card bills · SIP & chit funds · Ask Mint · Needs/Wants/Savings · trips & splits

👉 Link in bio: moneyplant.online

#moneyplant #personalfinance #budgeting #expensetracker #financeindia #moneytips #salary #budgetapp #reelsindia
```

---

## Reel: "Still typing every bill? Just snap it." (receipt scan)
File: `out/reel-receipt.mp4` (18 s). Cover: the "Just snap it." opening or the filled-in form.
Note for comments: receipt reading needs **Autopilot** turned on (Settings) and an internet connection.
```
Still typing every bill? Just snap it 📸

Take a photo of the receipt (or send it to Mint in chat) and MoneyPlant fills in the shop, amount, date and category. You check it, tap Save, and the receipt stays attached to the expense.

Turn on Autopilot in Settings to use it. Free.
👉 Link in bio: moneyplant.online

#moneyplant #receipt #expensetracker #personalfinance #budgeting #moneytips #financeindia #productivity #reelsindia
```
For a Meta ad: headline "Snap. Check. Saved.", URL ending `utm_campaign=receipt_reel`.

---

## Reel: Manu & Maaman S1 EP 01 "ശമ്പളം വന്നാൽ പാർട്ടിയാണോ?" (Salary Reset Challenge)
File: **`out/manu-maaman/s1-ep01/toon-s1-ep01-voice.mp4`** (53.6 s, ElevenLabs voices from `private/voice/s1-ep01/1–8.mp3`, each starting at its `LINES[i].a`; turn on Instagram's AI info label). Silent-voice render: `toon-s1-ep01.mp4`. Cover: the salary-breakdown frame (~27.8 s).
Source: `toon-s1-ep01.html`, cast in `toon-cast.js`. Regenerate: `node marketing/instagram/render-reel.mjs toon-s1-ep01`.
```
Salary വന്നോ? 🎉

ചെലവാക്കുന്നതിന് മുൻപ് ഒരു പ്ലാൻ ഉണ്ടാക്കൂ.

നിങ്ങൾക്ക് ഈ മാസം എത്ര സേവ് ചെയ്യാൻ കഴിയും?

🌱 Follow Manu & Maaman for the 30-day Salary Reset Challenge.

Illustrative example. Your budget may differ.

#moneyplant #manuandmaaman #salary #savings #budgeting #personalfinance #malayalam #kerala #moneytips #reelsindia
```

## Reel: Manu & Maaman S1 EP 02 "പൈസ ചോരുന്നത് എവിടെയാണ്?" (small spends add up)
File: **`out/manu-maaman/s1-ep02/toon-s1-ep02-voice.mp4`** (45.2 s, ElevenLabs voices from `private/voice/s1-ep02/1–6.mp3`, each starting at its `LINES[i].a`; turn on Instagram's AI info label). Silent-voice render: `toon-s1-ep02.mp4`. Cover: the ₹730 spends list (~12 s).
Source: `toon-s1-ep02.html`. Scene 4 is the real Quick Add sheet on the reels demo account (`out/app-quickadd-sheet.webm`).
```
ചെറിയ ചെലവുകൾ കണക്കിൽ വരാത്തപ്പോഴാണ് പൈസ എവിടെ പോയെന്ന് അറിയാതാകുന്നത്.

ഇന്ന് മുതൽ എല്ലാ ചെലവും റെക്കോർഡ് ചെയ്യൂ.

നിങ്ങളുടെ money leak എന്താണ്? Comment ചെയ്യൂ 👇

🌱 Manu & Maaman · 30-day Salary Reset Challenge, EP 02

Illustrative example. Your budget may differ.

#moneyplant #manuandmaaman #expensetracker #savings #budgeting #personalfinance #malayalam #kerala #moneytips #reelsindia
```

## Reel: Manu & Maaman S1 EP 03 "ദിവസവും ₹400-ൽ ജീവിക്കാമോ?" (a daily guide, not a rigid limit)
File: **`out/manu-maaman/s1-ep03/toon-s1-ep03-voice.mp4`** (47 s, ElevenLabs voices from `private/voice/s1-ep03/1–6.mp3`, each starting at its `LINES[i].a`; turn on Instagram's AI info label). Silent-voice render: `toon-s1-ep03.mp4`. Cover: Mint's ₹400 breakdown (~16 s).
Source: `toon-s1-ep03.html`.
```
Budget എന്നത് സ്വയം ശിക്ഷിക്കാനുള്ള നിയമമല്ല. പണം എവിടെ പോകണമെന്ന് തീരുമാനിക്കാനുള്ള പ്ലാനാണ്.

നിങ്ങളുടെ daily budget എത്രയാണ്? 👇

🌱 Manu & Maaman · 30-day Salary Reset Challenge, EP 03

Illustrative example. Your budget may differ.

#moneyplant #manuandmaaman #dailybudget #budgeting #savings #personalfinance #malayalam #kerala #moneytips #reelsindia
```

## Reel: Manu & Maaman S1 EP 04 "Credit Card ഉണ്ടെങ്കിൽ പണമുണ്ടെന്നല്ല!" (credit limit ≠ spending budget)
File: `out/manu-maaman/s1-ep04/toon-s1-ep04.mp4` (42.6 s, sound effects only: add the voice-over before posting). Cover: the unrolling statement with the PAY BY DUE DATE stamp (~10.6 s).
Source: `toon-s1-ep04.html`. No amounts: the screenplay gives none for this episode.
```
Credit Card ഒരു payment tool ആണ്, extra salary അല്ല.

നിങ്ങളുടെ ചെലവുകൾ ട്രാക്ക് ചെയ്യൂ, ബിൽ ഡ്യൂ ഡേറ്റ് ശ്രദ്ധിക്കൂ, തിരിച്ചടവ് പ്ലാൻ ചെയ്യൂ.

ഈ അനുഭവം ഉണ്ടായിട്ടുണ്ടോ? Comment ചെയ്യൂ 👇

🌱 Manu & Maaman · 30-day Salary Reset Challenge, EP 04

Illustrative example. Not financial advice.

#moneyplant #manuandmaaman #creditcard #budgeting #savings #personalfinance #malayalam #kerala #moneytips #reelsindia
```

## Reel: Manu & Maaman S1 EP 05 "30 ദിവസം കഴിഞ്ഞപ്പോൾ എന്ത് സംഭവിച്ചു?" (season finale: Manu's ₹3,000 result)
File: `out/manu-maaman/s1-ep05/toon-s1-ep05.mp4` (45 s, sound effects only: add the voice-over before posting). Cover: "Challenge goal achieved!" with the ₹3,000 kept (~11 s).
Source: `toon-s1-ep05.html`. Illustrative success scenario (the script's): ₹15,000 − ₹12,000 = ₹3,000.
```
30 ദിവസത്തെ ചലഞ്ചിൽ ഏറ്റവും വലിയ വിജയം ₹3,000 മാത്രമല്ല — പണം എവിടെ പോകുന്നു എന്ന് മനസ്സിലാക്കാൻ പഠിച്ചതാണ്.

നിങ്ങളുടെ വരുമാനത്തിനും ആവശ്യങ്ങൾക്കും അനുയോജ്യമായ ഒരു ചെറിയ ലക്ഷ്യത്തിൽ നിന്ന് തുടങ്ങൂ. 🌱

നിങ്ങളുടെ അടുത്ത savings goal എത്രയാണ്? 👇

🌱 Manu & Maaman · 30-day Salary Reset Challenge, EP 05 (season finale)

Illustrative example. Your budget may differ.

#moneyplant #manuandmaaman #savingsgoal #emergencyfund #budgeting #savings #personalfinance #malayalam #kerala #reelsindia
```
