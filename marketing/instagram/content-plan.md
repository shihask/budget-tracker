# MoneyPlant Instagram: organic content plan (batch 1)

Ads brought clicks but no signups, so the account now grows on **useful money content**. People
follow for the value; MoneyPlant shows up as a soft, natural mention on each carousel's last slide.

**Judge batch 1 by which topics earn attention from the right audience** (saves, shares, follows,
link taps), not by signups in week one. The winners decide batch 2, and app demonstrations come
in gradually.

## Guardrails (apply to every post)
- **No unverified news.** No RBI rates, tax rules or bank changes from memory. If you see a real
  news item, send the source; it gets verified and explained for everyday users.
- **No famous quotes.** Many are misattributed. Original MoneyPlant lines only.
- **Every number is arithmetic shown on the slide.** No statistics without a source.
- **Examples, never rules.** Saving amounts and budget splits are starting points to adapt.
  Never imply everyone can save a given amount or that one split fits every household.
- Label example figures "Example". Anything near investing says "Not investment advice".

## Batch 1 — what's ready
Files in `out/`, from `value-posts.html` (`node marketing/instagram/render.mjs value-posts`).
Upload each carousel's slides as one post, in number order.

| Post | Files | Slides |
|---|---|---|
| Save a little, every day (challenge) | `challenge-01…06` | 6 |
| One way to split ₹40,000 (50/30/20) | `rule503020-01…06` | 6 |
| 5 silent leaks in your salary | `leaks-01…07` | 7 |
| Salary-day checklist | `salaryday-01…07` | 7 |
| Can I afford this? 4 questions | `afford-01…06` | 6 |
| The bills nobody plans for | `irregular-01…06` | 6 |
| The monthly family money talk | `family-01…07` | 7 |
| Quote cards, English | `quote-01`, `quote-02`, `quote-03` | 1 each |
| Quote cards, Malayalam | `quote-ml-01`, `quote-ml-02`, `quote-ml-03` | 1 each |

**10 English posts + 3 Malayalam posts.** Existing app reels fill 2 more slots.

## Cadence
**3 feed posts a week + Stories most days.** Raise to 4–5 only if quality holds.

| Day | Slot |
|---|---|
| Monday | Carousel |
| Wednesday | Quote card (English and Malayalam alternate) |
| Friday | Carousel or an app reel |

Post at the same time each slot (evening, roughly 7–9 pm, is a common starting point; adjust once
Insights shows when your followers are online).

## 5-week calendar (from Mon 12 Oct 2026)
| Week | Mon | Wed | Fri |
|---|---|---|---|
| 1 · 12–16 Oct | 5 silent leaks | Quote 1 (EN) | Daily saving challenge ("start Monday") |
| 2 · 19–23 Oct | One way to split ₹40,000 | Quote 1 (ML) | App reel: receipt scan |
| 3 · 26–30 Oct | Family money talk ("do it on the 1st") | Quote 2 (EN) | Salary-day checklist (before 1 Nov salaries) |
| 4 · 2–6 Nov | Can I afford this? | Quote 2 (ML) | The bills nobody plans for |
| 5 · 9–13 Nov | App reel: 8 things MoneyPlant does | Quote 3 (EN) | Batch 2, post 1 |
| 6 · 16 Nov → | Batch 2 | Quote 3 (ML) | Batch 2 |

**Batch 2 production happens in week 3**, using the week 1–2 scorecard, so content never runs out.

### Stories (most days, 2–3 frames, low effort)
- Week 1: "Which leak is yours?" quiz sticker; on Sunday, "Who's starting the saving challenge tomorrow?" poll.
- Daily during the challenge: check-in poll ("Saved today? Yes / Not today"). Reshare commenters'
  progress **only with their permission**.
- Week 3: "Do you talk money as a family?" poll. Week 4: "What do you check before a big buy?" question box.
- Every story with a link sticker uses the Story link below.

## Links and measurement
**Bio link** (Edit profile → Links):
```
https://moneyplant.online/?utm_campaign=ig_bio
```
**Story link stickers:** `https://moneyplant.online/?utm_campaign=ig_story_<topic>`, for example
`ig_story_leaks`, `ig_story_challenge`, `ig_story_afford`.

The app records anonymous signup steps by that `utm_campaign` (no names, emails or cookies).
Read them in Supabase → SQL editor:
```sql
SELECT * FROM funnel_daily WHERE source LIKE 'ig_%' ORDER BY day DESC, step;
```
Steps to watch: `landing_view` → `signup_opened` → `account_created` → `first_expense`
(`first_expense` = the new user saved their first expense, i.e. actually started using it).

## Weekly scorecard
Fill in every Sunday from Instagram Insights (open each post → View insights) and the SQL above.

| Post | Reach | Non-follower reach % | Saves | Shares | Follows | Profile visits | Link taps |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

| Week | Bio `landing_view` | `signup_opened` | `account_created` | `first_expense` |
|---|---|---|---|---|
| | | | | |

**Decision rule:** batch 2 doubles down on the **top two pillars** by saves + shares + follows.
Views alone don't decide anything.

### The Malayalam test
Each Malayalam quote card is the same line and design as an English one, in the same Wednesday
slot two weeks apart, so the main difference is language. Compare each pair on **reach from
non-followers, saves, shares and follows**, not views. After 3 pairs: if Malayalam clearly wins,
batch 2 makes Malayalam carousels too; if it's even, keep one a week; if it loses, drop it.
(The account grows between the pair's two dates, so compare non-follower reach rather than raw reach.)

## Growth routine
- Reply to **every** comment within a few hours, with a real answer, not an emoji.
- Hashtags: 3–5 niche + 2 broad per post (captions below). Don't reuse the identical set every time.
- From week 3, DM 3–5 small Indian or Kerala personal-finance creators a week:
  > Hi! I run @moneyplant.online, practical money ideas for salaried families. Loved your post on ___.
  > Would you be up for a collab carousel, e.g. "5 salary-day mistakes", posted on both accounts?
  > Happy to design it.
- App reels: at most 1 in 4 posts. Value first.

## Batch 2 backlog
No-spend weekend · Emergency fund in 3 steps · Sending money home without breaking your budget ·
Festival budgeting · Chit fund vs RD, explained neutrally (no recommendation) · Any real news item
you send (verified first).

## Captions

### 5 silent leaks in your salary
```
5 silent leaks in your salary 💸 None of them feels like spending. All of them add up.

Swipe for each leak and a simple fix 👉 Which one is yours? Comment the number, 1 to 5.

#moneytipsindia #personalfinanceindia #budgetingtips #salary #creditcard #personalfinance #savemoney
```

### Save a little, every day
```
Save a little. Every day. Even ₹10 counts 🌱

₹10 a day is ₹3,650 in a year. Pick the amount that doesn't hurt; the habit matters more than the number.

Starting Monday? Comment your daily number and save this post 🔖

#savingchallenge #moneytipsindia #personalfinanceindia #savingsgoals #budgetingtips #personalfinance #savemoney
```

### One way to split ₹40,000
```
Earning ₹40,000? Here's one way to split it: Needs, Wants and Savings 🧮

It's an example, not a rule. City rent, EMIs or supporting family? 60/30/10 or 70/20/10 are normal. Adjust it, and keep some saving, even a small one.

What's your split? Tell us in the comments 👇

#budgetingtips #503020rule #personalfinanceindia #salary #moneytipsindia #personalfinance #budgeting
```

### Salary-day checklist
```
Salary credited ✅ Do these 5 things before the first shopping app opens.

Fixed bills → card bill → money for family → your saving → then find your daily number.

Which step do you usually skip? Save this for next salary day 🔖

#salaryday #salary #emi #budgetingtips #personalfinanceindia #moneytipsindia #personalfinance
```

### Can I afford this?
```
Can I afford this? 🤔 4 questions before you tap Pay.

Money in your account isn't the same as money you're free to spend. Swipe to check before your next big buy.

Know before you spend. What are you saving for? 👇

#smartspending #moneytipsindia #personalfinanceindia #budgetingtips #shopping #personalfinance #savemoney
```

### The bills nobody plans for
```
The bills nobody plans for: insurance, school fees, festivals, vehicle service 🧾

They don't come every month, so they always feel like a surprise. Add up a year, divide by 12, and set that aside every salary day.

Which one always catches you out? Share this with whoever runs the house budget.

#familybudget #householdbudget #budgetingtips #personalfinanceindia #moneytipsindia #insurance #personalfinance
```

### The monthly family money talk
```
The monthly family money talk 🏠 15 minutes on the 1st. No blame. Just 5 questions.

Save this and send it to your family group 👨‍👩‍👧

#familybudget #familyfinance #householdbudget #personalfinanceindia #moneytipsindia #budgetingtips #personalfinance
```

### Quote cards (English)
Quote 1:
```
Your salary isn't what you earn. It's what's left after the bills.

Agree? Share it with someone who just got paid 🌱

#moneyquotes #salary #personalfinanceindia #moneytipsindia #personalfinance
```
Quote 2:
```
Save first, then spend. Not the other way round 🌱

#moneyquotes #savemoney #personalfinanceindia #moneytipsindia #personalfinance
```
Quote 3:
```
Small money, every day, is never small money 🌱

#moneyquotes #savingtips #personalfinanceindia #moneytipsindia #personalfinance
```

### Quote cards (Malayalam) — check the wording with a native reader before posting
ML 1:
```
നിങ്ങളുടെ ശമ്പളം നിങ്ങൾ സമ്പാദിക്കുന്നതല്ല. ബില്ലുകൾ കഴിഞ്ഞ് ബാക്കിയുള്ളതാണ് 🌱

ശരിയല്ലേ? ഇപ്പോൾ ശമ്പളം കിട്ടിയ ഒരാൾക്ക് ഷെയർ ചെയ്യൂ.

#malayali #kerala #moneytipsmalayalam #personalfinanceindia #salary
```
ML 2:
```
ആദ്യം മിച്ചം വെക്കൂ, പിന്നെ ചെലവാക്കൂ. തിരിച്ചല്ല 🌱

#malayali #kerala #moneytipsmalayalam #savemoney #personalfinanceindia
```
ML 3:
```
ദിവസവും ചെറിയ തുക, ഒരിക്കലും ചെറിയ തുകയല്ല 🌱

#malayali #kerala #moneytipsmalayalam #savingtips #personalfinanceindia
```
