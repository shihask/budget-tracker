# MoneyPlant Instagram: organic content plan (batch 1)

Ads brought clicks but no signups, so the account now grows on **useful money content**: build
followers first, promote the app later. People follow for the value; MoneyPlant shows up only as a
soft one-line mention on carousel last slides (and the bio link) until the account has an audience.

**Judge batch 1 by which topics earn attention from the right audience** (saves, shares, follows,
link taps), not by signups in the first weeks. The winners decide batch 2.

## Phases
| Phase | Until | What to post |
|---|---|---|
| **1 · Grow** (now) | 300–500 followers | Value only: tips, challenges, quotes. **Mostly reels**, plus carousels. No app reels. |
| **2 · Introduce** | ~1,000 followers | Keep value posts; add **1 app reel in every 4–5 posts**, picked to match the topics that won in phase 1. |
| **3 · Promote** | after that | App posts in step with demand (questions like "how do you track this?"); consider ads again, using the best-performing value reel. |

**Why reels first:** with few followers, carousels and photos are shown mostly to existing
followers, so they barely travel. Reels are shown to non-followers (Reels tab, Explore), which is
how a new account gets found. Carousels still matter: they're what convinces a profile visitor to follow.

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

**10 English posts + 3 Malayalam posts.** The existing app reels (`reel-*.mp4`) wait for phase 2.

### Value reels — to make next (no app in them)
7–12 s each, vertical, built with the existing reel kit (`reel-kit.css/js`, `render-reel.mjs`),
reusing batch 1's content and guardrails. Add a trending sound in Instagram when posting.

| Reel | Hook | From |
|---|---|---|
| V1 | "₹10 a day = ₹3,650 a year", building up line by line | challenge |
| V2 | "5 silent leaks in your salary", quick cuts | leaks |
| V3 | "Salary credited? Do these 5 things first" | salary-day checklist |
| V4 | "Can I afford this? Ask 4 questions" | afford |
| V5 | "The bills nobody plans for: divide by 12" | irregular bills |
| V6 | "One way to split ₹40,000" | 50/30/20 |
| V7 | Quote reel: "Small money, every day, is never small money." | quote 3 |
| V8 | Quote reel: "Save first, then spend. Not the other way round." | quote 2 |

## Cadence (phase 1)
**5 posts a week: 3 reels + 2 static posts, plus Stories most days.** If that's too much to keep
up, drop one static post before dropping a reel.

| Day | Slot |
|---|---|
| Monday | Carousel |
| Tuesday | Value reel |
| Wednesday | Quote card (English and Malayalam alternate) |
| Thursday | Value reel |
| Saturday | Value reel (or the carousel when a date calls for it) |

Post at the same time each slot (evening, roughly 7–9 pm, is a common starting point; adjust once
Insights shows when your followers are online).

## Calendar (phase 1, from Mon 12 Oct 2026)
| Week | Mon | Tue | Wed | Thu | Sat |
|---|---|---|---|---|---|
| 1 · 12–18 Oct | **5 silent leaks ✓ posted** | — (reels not ready) | Quote 1 (EN) | V1 ₹10 a day | V7 quote reel · *Fri 16: daily saving challenge carousel ("start Monday")* |
| 2 · 19–25 Oct | One way to split ₹40,000 | V2 leaks reel | Quote 1 (ML) | V5 divide by 12 | V8 quote reel |
| 3 · 26 Oct–1 Nov | Family money talk ("do it on the 1st") | V4 afford reel | Quote 2 (EN) | V3 salary-day reel | Salary-day checklist carousel (before 1 Nov salaries) |
| 4 · 2–8 Nov | Can I afford this? | V6 split reel | Quote 2 (ML) | Batch 2 reel | The bills nobody plans for |
| 5 · 9–15 Nov | Batch 2 | Batch 2 reel | Quote 3 (EN) | Batch 2 reel | Batch 2 |
| 6 · 16 Nov → | Batch 2 | Batch 2 reel | Quote 3 (ML) | Batch 2 reel | Batch 2 |

Week 1 has 6 posts because the challenge carousel is timed for Friday (people start on Monday).
**Value reels V1–V8 are made first, before Thu 15 Oct. Batch 2 production happens in week 3**,
using the week 1–2 scorecard, so content never runs out.

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

| Week | Followers (Sunday) | New followers | Bio `landing_view` | `signup_opened` | `account_created` | `first_expense` |
|---|---|---|---|---|---|---|
| 1 · 18 Oct | | | | | | |

**Decision rules:**
- Batch 2 doubles down on the **top two pillars** by saves + shares + follows. Views alone don't decide anything.
- Reels vs carousels: compare **follows per post**. If reels win clearly, move one more weekly slot to reels.
- **Phase gate:** move to phase 2 when followers pass 300–500 *and* the last two weeks each added followers.

### The Malayalam test
Each Malayalam quote card is the same line and design as an English one, in the same Wednesday
slot two weeks apart, so the main difference is language. Compare each pair on **reach from
non-followers, saves, shares and follows**, not views. After 3 pairs: if Malayalam clearly wins,
batch 2 makes Malayalam carousels too; if it's even, keep one a week; if it loses, drop it.
(The account grows between the pair's two dates, so compare non-follower reach rather than raw reach.)

## Growth routine
- **First 50–100 followers from people you know.** Share posts to your personal Instagram, WhatsApp
  status and groups; ask friends, family and colleagues to follow. An account at 0 followers looks
  untrustworthy to strangers; one at 80 doesn't.
- **10 minutes a day commenting** on bigger Indian personal-finance accounts. Add something useful
  (an example, a question, your experience), never "nice post". Good comments bring profile visits.
- Reply to **every** comment on your own posts within a few hours, with a real answer, not an emoji.
- Hashtags: 3–5 niche + 2 broad per post (captions below). Don't reuse the identical set every time.
- **Collabs from ~200 followers:** DM 3–5 small Indian or Kerala personal-finance creators a week:
  > Hi! I run @moneyplant.online, practical money ideas for salaried families. Loved your post on ___.
  > Would you be up for a collab carousel, e.g. "5 salary-day mistakes", posted on both accounts?
  > Happy to design it.
- **No app reels in phase 1** (see Phases). The bio link and the one-line mention on carousel last
  slides are enough until there's an audience.

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

## Value reel captions (phase 1 — no app; the goal is follows)
Files: `out/vreel-v1…v8-*.mp4` (vertical, 8–12 s, no audio). Source: `vreel-*.html` (scene lists)
+ `vreel.js` / `vreel.css`. Render: `node marketing/instagram/render-reel.mjs vreel-v1-ten-a-day …`
(needs ffmpeg; see that script's header).

When posting: **add a trending sound** in the Instagram editor (low volume), pick the opening frame
as the cover, and keep "Also share to Feed" on so the reel shows on your profile grid.

### V1 · ₹10 a day
```
Save ₹10 a day. What does it become? 🌱

₹70 a week, ₹300 a month, ₹3,650 a year. Pick an amount that doesn't hurt; the habit matters more than the number.

What's your daily number? 👇 Follow for more practical money ideas.

#savingchallenge #moneytipsindia #personalfinanceindia #savingtips #personalfinance #reelsindia
```

### V2 · 5 silent leaks
```
5 silent leaks in your salary 💸 Which one is yours? Comment the number 👇

Follow for practical money ideas for salaried families.

#moneytipsindia #personalfinanceindia #budgetingtips #salary #personalfinance #reelsindia
```

### V3 · Salary day
```
Salary credited? Do these 5 things first ✅

Save this for next salary day 🔖 and follow for more.

#salaryday #salary #budgetingtips #personalfinanceindia #moneytipsindia #reelsindia
```

### V4 · Can I afford this?
```
Can I afford this? Ask 4 questions before you tap Pay 🤔

Send this to the friend who's about to buy something big 😅 Follow for more.

#smartspending #moneytipsindia #personalfinanceindia #budgetingtips #personalfinance #reelsindia
```

### V5 · Divide by 12
```
The bills nobody plans for: insurance, school fees, festivals, vehicle service 🧾

Add up a year, divide by 12, set that aside every salary day. Which one always surprises you? 👇

#familybudget #householdbudget #budgetingtips #personalfinanceindia #moneytipsindia #reelsindia
```

### V6 · One way to split ₹40,000
```
Earning ₹40,000? Here's one way to split it 🧮

An example, not a rule. EMIs or supporting family? Adjust it. What's your split? 👇

#503020rule #budgetingtips #salary #personalfinanceindia #moneytipsindia #reelsindia
```

### V7 · Small money (quote)
```
Small money, every day, is never small money 🌱

Follow for practical money ideas.

#moneyquotes #savingtips #personalfinanceindia #moneytipsindia #reelsindia
```

### V8 · Save first (quote)
```
Save first, then spend. Not the other way round 🌱

Share this with someone who just got paid.

#moneyquotes #savemoney #personalfinanceindia #moneytipsindia #reelsindia
```

### Kakeibo reel (Manglish, includes the app — counts as the app post for its fortnight)
File: `out/vreel-ml-kakeibo.mp4` (22 s). Source: `vreel-ml-kakeibo.html`. **Check the Malayalam with a
native reader before posting.** What it is ("household account book"), history (Japan, 1904, journalist
Hani Motoko), 4 simple steps, then MoneyPlant's Analytics → Kakeibo (claims per CLAUDE.md "Kakeibo").
```
Kakeibo എന്താണ്? Japan-ന്റെ simple money method 🇯🇵🌱

1904-ൽ Hani Motoko എന്ന journalist തുടങ്ങിയ ഒരു household account book. Salary വന്നാൽ saving goal വെക്കുക, എല്ലാ expenses-ഉം എഴുതുക, 4 groups ആയി തിരിക്കുക (Needs, Wants, Culture, Unexpected), month end-ൽ review ചെയ്യുക.

MoneyPlant-ൽ ഇത് free ആയി ചെയ്യാം: Analytics → Kakeibo. Link in bio 👆

നിങ്ങൾ expenses എഴുതി വെക്കാറുണ്ടോ? Comment ചെയ്യൂ 👇

#kakeibo #malayali #kerala #moneytipsmalayalam #personalfinanceindia #savingtips #reelsindia
```

### Kakeibo long reel (~54 s, Manglish, educational + real app demo)
Three clips joined in Instagram's reel editor (or CapCut), in this order:
1. `out/vreel-ml-kakeibo-long-1.mp4` (35 s): hook → what Kakeibo is (Japan, 1904, Hani Motoko) →
   Needs / Wants / Culture / Unexpected → how to practise → "Analytics → Kakeibo". Soft whooshes + chime.
2. **Your own screen recording, ~12 s** (phone screen recorder, a test account with real-looking
   data, nothing personal visible): open MoneyPlant → Analytics → Kakeibo → show the cycle, the
   four groups, change one category's group, then the savings goal / reflection.
3. `out/vreel-ml-kakeibo-long-2.mp4` (7 s): "പണം track ചെയ്താൽ മാത്രം പോരാ, മനസ്സിലാക്കണം." → logo card.

Then: record the voice-over over the joined reel (Instagram → Voiceover, or a TTS tool), add a calm
instrumental at low volume under it, and use the hook frame as the cover. **Check the Malayalam
(screen text and voice-over) with a native reader before posting.** Counts as the app post for its fortnight.

Voice-over script:
```
ചെലവുകൾ track ചെയ്തിട്ടും പണം എവിടെ പോകുന്നു എന്ന് മനസ്സിലാകുന്നില്ലേ? ജപ്പാനിൽ നിന്നുള്ള ഒരു budgeting method പരിചയപ്പെടാം — Kakeibo!

Kakeibo എന്നതിന്റെ അർത്ഥം ഏകദേശം "household account book" എന്നാണ്. 1904-ൽ ജപ്പാനിൽ Hani Motoko ആണ് ഈ രീതി അവതരിപ്പിച്ചത്.

Kakeibo-യിൽ ചെലവുകളെ നാല് വിഭാഗങ്ങളായി കാണാം: Needs — അത്യാവശ്യങ്ങൾ, Wants — ആഗ്രഹങ്ങൾ, Culture — പഠനവും വിനോദവും, Unexpected — അപ്രതീക്ഷിത ചെലവുകൾ.

മാസത്തിന്റെ തുടക്കത്തിൽ ഒരു savings goal വെക്കുക. ചെലവുകൾ രേഖപ്പെടുത്തുക. മാസാവസാനം സ്വയം ചോദിക്കുക: എന്താണ് നന്നായി ചെയ്തത്? എവിടെയാണ് കൂടുതൽ ചെലവായത്? അടുത്ത മാസം എന്ത് മാറ്റണം?

ഇതേ ആശയം MoneyPlant-ലും ഉപയോഗിക്കാം! Analytics-ൽ Kakeibo തുറന്ന് നിങ്ങളുടെ monthly spending review ചെയ്യാം. ചെലവുകൾ നാല് വിഭാഗങ്ങളായി മനസ്സിലാക്കാം, ആവശ്യമെങ്കിൽ category മാറ്റാം, അടുത്ത മാസത്തേക്കുള്ള goal വെക്കാം.

പണം track ചെയ്യുന്നത് മാത്രം പോരാ, അത് മനസ്സിലാക്കുകയും വേണം. MoneyPlant — Know Before You Spend.
```

Caption:
```
Ever heard of Kakeibo? 🇯🇵 A Japanese method for spending more mindfully.

Kakeibo എന്നാൽ "household account book". Needs, Wants, Culture, Unexpected: 4 groups. മാസാവസാനം ഒരു review.

Try a monthly money reflection with MoneyPlant: Analytics → Kakeibo. Free, link in bio 🌱

#kakeibo #malayali #kerala #moneytipsmalayalam #personalfinanceindia #budgeting #reelsindia
```
