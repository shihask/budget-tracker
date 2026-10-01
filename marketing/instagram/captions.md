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
