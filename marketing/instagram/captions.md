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
