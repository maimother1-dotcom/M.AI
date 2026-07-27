# AlarmX

An Android alarm app that pays students cash for waking up early to study.

Built for India first: Hinglish by default, designed around the phones and network conditions the target user actually has, and positioned for NEET / JEE / UPSC / board-exam preparation.

This directory holds the economics, the spec, a clickable prototype, and — as of v0.7 — the first real code: a Kotlin domain core and a Node backend, both compiled and tested.

---

## What's here

| Path | What it is |
|---|---|
| `economics/AlarmX-unit-economics.xlsx` | The model, and the no-loss gate. **Read this first.** |
| `economics/build_model.py` | Rebuilds the workbook from source |
| `PRD.md` | Full product spec |
| `prototype/index.html` | Interactive prototype. Open in a browser, no setup. |
| `prototype/i18n.js` | Every user-facing string, in five locales |
| `prototype/panchang.js` | Regional calendar engine — tithi, nakshatra, three Bengali/Tamil calendar systems |
| `tests/verify_prototype.py` | 216-check browser suite |
| `tests/verify_panchang.js` | 38-check astronomy suite, runs in node |
| `tests/verify_bengali_cross.js` | 19-check cross-validation against two independent Bengali calendar implementations |
| `tests/verify_security.py` | 55-check security audit — secrets, PII, money safety, shipped code, attacker paths |
| `tests/reference/` | Frozen reference data and its provenance |
| `android/core/` | **Kotlin domain core. Builds and tests.** Money, share ladder, day boundary, reward engine. |
| `android/app/` | Android layer. **Source only — does not compile here, no SDK.** See `android/README.md`. |
| `backend/` | **Node/TypeScript server. Builds and tests.** SSV verification, credit engine, payouts, referral gate. |

---

## Start here: the mechanism

**The user is paid a share of ad revenue that has already arrived.**

Not a rate. Not a cap. A percentage of money already in the account, credited only against ad impressions the **server** has verified.

| Condition | What happens |
|---|---|
| Ad served and verified server-side | User credited their share of its realised value |
| No fill | Nothing credited, nothing owed |
| eCPM halves | Payouts halve the same day, automatically |
| Client claims a view the server did not see | Not credited |

**This makes a loss on the reward line structurally impossible, not merely unlikely.** There is no forecast to be wrong about, because nothing is promised before the money exists.

Every earlier version of this product failed the same way: **a fixed promise made against variable revenue.** ₹95 a month. ₹0.50 a math. ₹2 a set. Each was a number picked first and defended afterwards, and each lost money the moment eCPM moved. A share cannot be wrong, because it is a fraction of whatever actually turns up.

### The numbers

Per active user per month, at the **highest** share tier — the worst case for the business:

| | Conservative | **Base** | Optimistic |
|---|---:|---:|---:|
| Ad revenue | ₹10.55 | **₹32.38** | ₹103.08 |
| Survey resale (retained in full) | ₹5.67 | **₹10.25** | ₹20.00 |
| **User earns** | ₹6.33 | **₹19.43** | ₹61.85 |
| **Per active day** | ₹0.32 | **₹0.75** | ₹2.06 |
| **PROFIT** | **+₹3.30** | **+₹19.03** | **+₹58.24** |

Positive in **every** column at the **highest** share. If eCPM halved it is still positive everywhere (+₹1.19 / +₹12.56 / +₹37.63), because the payout halves with it.

### The share ladder

| Streak | Share |
|---|---:|
| Days 1–6 | **50%** |
| Day 7+ | **55%** |
| Day 30+ | **60%** |
| Until lifetime ₹10 | **70%** (acquisition — first payout in ~11 days at base) |

The share rises with loyalty and never with a promise. If ad revenue grows, earnings grow automatically and nobody has to be told a new number.

### The monthly cap is gone

Replaced by a ceiling of **20 credited ad views per day**. A monthly cap created the failure it was meant to prevent: a user hits it and the app pays nothing for the rest of the cycle. The test suite simulates 26 days and asserts **every one of them pays**.

### The build gate

`economics/build_model.py` **refuses to write the workbook** if any scenario, at any share tier, at half or a quarter of the assumed eCPM, would lose money. 36 combinations on every build. The gate has been tested by deliberately breaking it.

```
$ python3 build_model.py
no-loss gate: PASSED (3 scenarios x 4 share tiers x 3 eCPM stresses)
```

### What is still unproven

1. **Average sets completed per day.** The revenue case leans on it and it has never been measured. It is deliberately where the uncertainty is parked, rather than hidden inside a rate.
2. **Rewarded eCPM and fill rate for India Android.** Published benchmarks, not measurements.
3. **Survey resale values.** Placeholders — but the user is paid from **ad revenue only**, so a worthless survey line reduces profit, never the payout, and never below zero.

---

## The ₹10 first payout, and the 70% boost

A user should not wait six weeks to find out whether the money is real. Six weeks of "trust me" is exactly what every reward app that never pays also says.

So the first payout threshold is **₹10**, then ₹30 after — and the share is **70% until lifetime earnings reach ₹10**, which brings the first real payout to about **11 days** at base.

**The boost is acquisition, not reward.** ₹10 plus a ₹3 fee is ₹13 per converting user, or ₹9.10 blended across all installs — **41% of a ₹22 paid install.** It buys a paid, retained, trusting user for less than half what an ad pays for a raw install that may never open the app twice. The no-loss gate tests the 70% tier too, and it clears in every column.

### It needs a farming gate

A ₹10 first payout is a ₹10 bounty on every fake account. Three conditions, all required:

1. Play Integrity passing
2. One first payout per verified phone number **and** device
3. **≥7 distinct calendar days with a completed alarm**

The third is load-bearing. It makes farming cost a week of real wall-clock time per ₹10, which cannot be compressed by running an emulator faster.

---

## Built for India

**OEM battery killers are the single biggest technical risk in the product.** MIUI, ColorOS, Funtouch and One UI all aggressively kill background apps, and they dominate the devices this user owns. An alarm that does not fire on a Redmi is a dead app.

The prototype includes the mitigation: pick your phone, get the literal menu path for your skin, with a verification pass afterwards rather than an assumption.

Also specified in PRD §11: offline-first alarms, APK under 15MB, 2GB RAM targets, data-cost transparency on rewarded video, and Indian digit grouping (₹1,00,000 — not ₹100,000).

**Language:** Hinglish default, with English, Devanagari Hindi, Bengali and Tamil switchable. Hinglish needs no font or keyboard support and is how the target user actually reads. Every string lives in `i18n.js` — five locales, 202 keys each, parity enforced by test.

**The wedge:** students. Waking at 5am to study is a real, already-felt need, so the money is a bonus on top of a reason the user already has — rather than the only reason to install, which is the fight you lose against a free stock alarm.

---

## The code

**`android/core/` builds and tests.** Pure Kotlin, no Android dependencies, so it runs on any JVM. Every rule that can lose money lives there on purpose: integer paise with a floor-and-carry, the share ladder in basis points, the server-side day boundary, and the credit engine whose first guard is verification. 28 tests, including a randomised property test asserting the engine **never pays more than the entitlement** across 200 trials of mixed tiers, spin multipliers, fill failures and replays.

**`backend/` builds and tests.** TypeScript, bigint money, and a real ECDSA signature round-trip for AdMob SSV — a generated keypair, not a mock that would pass anything. Tamper with one query parameter and verification fails; that test is the no-loss guarantee, executed.

**The two are kept in step by a parity test.** `backend/test/backend.test.ts` reads the Kotlin source and fails if a share tier, the daily ceiling, the micropaise resolution or the minimum day gap ever diverges. Verified by changing `STREAK_30` to 6500 and watching the TypeScript go red. The Android copy is advisory; the server decides what is actually paid.

**`android/app/` does not compile here.** The Android SDK cannot be installed in this environment — `dl.google.com` returns 403 — so the Android layer is reviewed source that no compiler has seen. It is excluded from `settings.gradle.kts` so `:core` stays green for a real reason rather than a lucky one. `android/README.md` lists exactly what is written and what is missing.

---

## Security

A five-check audit (Gitleaks, Bearer, ECC Production Audit, Trail of Bits, ECC Security Review) was run against the repository. `tests/verify_security.py` re-runs it as assertions that fail the build, and PRD §18 carries the requirements.

**No secrets anywhere**, in HEAD or in history. The scanner gates on entropy plus digit content, and **proves it works on three planted keys** rather than asserting a clean scan into the void — an earlier version silently missed AWS keys because it also demanded mixed case, and the self-test is what caught that.

Three real findings, all fixed:

**Money was floating-point.** A verified view is worth ₹0.0528. Rounding that up to the paisa leaks ₹0.0072 a view — **₹1.73 to ₹3.45 per user per month against a Conservative profit of ₹3.30.** At the daily ceiling it turns the no-loss guarantee negative. Money is now **integer paise, floored, with a sub-paisa carry**: exact over time, never overpaid at any moment.

**The day boundary was client-controlled.** "Local midnight" is meaningless when the device decides what local means. Changing the phone's timezone rolls the day repeatedly, defeating the 20-view ceiling, the streak ladder, and — worst — the **≥7 distinct alarm-days gate**, which is the load-bearing anti-farming control. The boundary is now server-side from a timezone pinned at signup, and a rollover inside 20 hours is refused.

**Self-referral was unaddressed.** ₹5 to each side, ₹10 per fake pair, with nothing tying referrer and referee to different humans. Now: the bonus pays only after the referee's own first payout to a **different VPA**, one bonus per device pair ever, and a cap of 10 paid referrals per account per month.

Also added: rate limits (OTP abuse is a direct SMS bill), a rule that **no debug surface ships** — the prototype's DEV bar can set your streak to 30 and fill the wallet — security headers, and an account deletion path.

**What the audit could not test, and says so in its own output:** there is no backend and no Android build, so IDOR, privilege escalation, JWT handling, SQL injection, Play Integrity and the payment rail are **specified and unverified**. No automated audit replaces a human security review for an app that moves real money.

---

## The daily loop — three touches, one habit

**Morning: the alarm.** Rings until dismissed. Completing it unlocks the day.

**Through the day: 5 sets of 4 questions**, one rewarded video after every 2 — 2 ads per set, 10 a day. Sets unlock in three tranches (after the alarm, midday, evening), so one session becomes three. Questions scale to the chosen exam, so the loop reads as revision rather than a chore.

**Locked until the alarm is done.** No alarm, no sets, no earning. Every rupee still traces to a real wake-up. Without it AlarmX becomes a math-for-cash app that happens to have an alarm.

**Evening: the Daily Close** — the moment the user feels paid, and the best idea in the design.

```
Aaj: 10 ads dekhe  ->  ₹0.53 kamaye
     Tumhara hissa: 50%     Streak: 6 din
     Kal 7 din ho jayenge -> hissa 55% ho jayega
```

Three things it always shows: **how many verified views**, **the share applied**, and **the rupees**. Effort maps onto money where the user can see it:

| Sets done | Verified views | Earned today |
|---:|---:|---:|
| 0 | 4 | ₹0.21 |
| 3 | 10 | ₹0.53 |
| 5 | 14 | ₹0.74 |

**Every reward app in this category hides this arithmetic, which is exactly why nobody believes them.** AlarmX can show its working because its working is honest. The receipt is computed from the ledger, never typed — the test suite asserts the number on screen equals the ledger total.

---

## Where the ads go, and where they never go

**No ad ever sits between the user and dismissing the alarm.** No interstitial, no banner, no rewarded video, not even a spinner waiting on an ad request. The dismissal task is interactive the instant the alarm fires.

A hard rule with the same standing as "the alarm rings until dismissed":

1. **It would reverse the change that de-risked this product.** AlarmX must never be the reason someone misses a shift or an exam.
2. **It is a Play suspension risk.** A reward app that blocks an alarm is close to the worst case Play's ads policy describes.
3. **It is worth almost nothing.** Priced: **₹0.73 per user per month.**

**Where ads do go:** the math section (2 per set), after dismissal, between survey questions, on results screens, and on app open when the user did not arrive from an alarm.

Every ad surface carries a `data-ad-slot` attribute, which makes the rule testable rather than a matter of opinion — `verify_prototype.py` asserts the ring screen contains zero of them.

---

## The regional calendar and the 4×2 widget

Ad-funded earning is real but modest — ₹0.32 to ₹0.75 a day. So engagement is also bought with something people already open every morning.

Bengali panjika and Tamil daily calendar are checked daily by millions of households. **That habit already exists — the widget does not have to create one, only occupy it.** The calendar is the reason to look; AlarmX state is what they see while looking. No nagging notification required.

It also settles a positioning tension: the panjika audience skews household and older, the exam wedge skews young. One widget carrying both the tithi and the NEET countdown serves both without diluting either.

**What it shows:** clock and Gregorian date · Bengali or Tamil date in native script · tithi, nakshatra and today's festival · next alarm, streak pot, exam countdown. Two tap targets — calendar half and AlarmX half.

**How it is computed:** Swiss Ephemeris in Moshier mode in production, which needs no ephemeris data files and so costs nothing against the 15MB APK budget. 365 days are precomputed into Room on first run and the widget reads cache only, which satisfies offline-first, battery and widget update cost at once. The prototype uses a Meeus implementation in `panchang.js` for the same mechanic without the licence.

**Two rules that are not negotiable:**

- **Nothing is scraped from bengalicalendar.com or tamildailycalendar.com.** Their content is copyrighted, both return HTTP 403 to automated requests, and every value here is computed independently. They are references for which fields to show, never a data source.
- **The Swiss Ephemeris Professional licence must be bought before distribution.** The AGPL alternative would force all of AlarmX open-source, including the anti-farming gate — self-defeating for a product whose security model assumes the attacker has the source.

**The traditions genuinely disagree, and the app says which one it is using** — name and basis both, "Vishuddha Siddhanta (drik)" or "Bangladesh revised (arithmetic)". v1 ships three: Vishuddha Siddhanta for West Bengal, the revised arithmetic calendar for Bangladesh, and Thirukanitham for Tamil Nadu. Gupta Press and Vakya are not an offset on those numbers — they need a separate Surya Siddhanta calculator — so they are v2.

**Bangladesh is a different system, not a different city.** It pins Pohela Boishakh to 14 April every year; drik lands on the 15th in 2025, 2026 and 2027, and on the 14th in 2028. Serving a Dhaka user the West Bengal date is wrong on the biggest day of their year. It is also the cheapest system here — pure arithmetic, no astronomy — and the only one validated exactly against outside sources.

Worth seeing: 14 April 2026 is Puthandu in Chennai, Pohela Boishakh in Dhaka, and still 30 Choitro in Kolkata — three systems, three answers, one day. Thai Pongal is 14 January in 2026 and 15 January in 2027, because the sankranti crosses sunset. All of it falls out of the engine rather than a lookup table.

---

## Running the prototype

```bash
open prototype/index.html      # macOS
```

No build step, no dependencies, no network. A **DEV** bar at the bottom lets you ring the alarm, switch language, jump the day counter, open the math section, advance the tranche and the streak, simulate an ad fill failure, and flag the account.

Worth doing in this order:

1. **Walk onboarding.** Language → calendar → exam → OEM setup → survey. Skip the survey and confirm the app still works fully.
2. **Arm a math alarm, ring it, let the 10 seconds lapse.** The alarm keeps ringing. That is the single most important change in the design.
3. **Press `Math` before doing the alarm.** Locked. Then ring and dismiss the alarm and try again.
4. **Solve two questions.** An ad appears. Watch it and see the exact credit — your share of what that view earned.
5. **Press `Close`.** The receipt shows the working: views × share = rupees. Nothing hidden.
6. **Press `NoFill`, then watch an ad.** ₹0, said plainly. That is the safety property, visible.
7. **Press `7d` and `30d`** and watch the share ladder move.
8. **Try to withdraw with 0 alarm days.** Blocked — the gate, not the money, is what is missing.
9. **Press `Lang`** and read the same dashboard in all five languages. In Bengali and Tamil the panchang itself changes script, not just the chrome.
10. **Press `Cal`, then `Boishakh` and `Pongal`.** The two traditions disagree on which day the year turns, and the app shows that rather than hiding it.
11. **Flag the account.** Read the review message and use the appeal.

### Tests

```bash
pip install playwright
python3 tests/verify_prototype.py       # 216 checks, browser
node tests/verify_panchang.js           # 38 checks, no dependencies
node tests/verify_bengali_cross.js      # 19 checks, no dependencies
python3 tests/verify_security.py        # 55 checks, security audit
(cd android && gradle :core:test)       # 28 checks, Kotlin core on the JVM
(cd backend && npm test)                #  51 checks, server logic
```

**407 checks, all passing as of this commit.**

```
gradle :core:test          28   Kotlin domain core, on the JVM
npm test  (backend/)       51   SSV, credit engine, referral, payout, parity
verify_prototype.py       216   browser
verify_panchang.js         38   astronomy
verify_bengali_cross.js    19   independent Bengali calendar cross-check
verify_security.py         55   secrets, PII, money safety, attacker paths
```

`verify_prototype.py` covers the share mechanism (an unverified view credits nothing, a fill failure pays ₹0, half the views pay half the money), the share tiers, the 20-view daily ceiling, a 26-day simulation asserting every day pays, the math section's alarm lock and ad cadence, the Daily Close receipt matching the ledger, locale parity across all five languages, the three Bengali/Tamil calendar systems, Indian number grouping, the alarm reward window, QR validation, the 4x2 widget, ad placement, and every regression from v0.2.

`verify_panchang.js` checks the astronomy from first principles rather than against a copied almanac: sun longitude at the 2026 solstices and equinoxes, lunation length, the tithi definition at syzygy, Lahiri ayanamsa, the Mesha sankranti window across four years, and the real festival anchors — Puthandu, Poila Boishakh and Thai Pongal in two different years, which land on different days under the two traditions.

Two honest notes:

- One step (solving math *after* the reward window closes) is driven through the page's own `checkMath()` handler rather than synthetic mouse events. A Playwright actionability quirk in that one long sequence reports the input as not visible, though it is provably visible and fills correctly in isolated repros. Same code path, different event source.
- The suite needs a Chromium binary. Set `CHROMIUM_PATH` if Playwright's bundled version doesn't match the installed one.
- The Bengali and Tamil screenshots need Indic fonts on the machine (`fonts-noto-core`, `fonts-indic`). Without them the strings are still correct but paint as boxes.

`verify_bengali_cross.js` checks the Bengali calendar against an external oracle. Two independent MIT implementations of the revised Bangladesh calendar were run over 1461 days and agreed on every one; their agreed output is frozen in `tests/reference/`. AlarmX's arithmetic calendar matches it **exactly, 1461 of 1461**, with no tolerance. See `tests/reference/regenerate.md`.

**The panchang is not release-ready and the tests say so.** What is verified is that the astronomy is internally correct and that the calendar anchors land on the right dates. The Bangladesh arithmetic calendar is now externally validated to the day. What is *not* done is the cross-check against a printed Vishuddha Siddhanta panjika and a Tamil daily calendar over 60 dates — those references compute no tithi, nakshatra, yoga or karana, and no drik dates, so none of that is touched. The drik Bengali month-start rule is confirmed against one year plus four new-year dates. PRD §16.3 treats this as a release blocker, not a warning.

---

## What this is not

The prototype is a design artefact for validating flows, not a production path. The real build is **native Android in Kotlin** — `AlarmManager` with exact-alarm permission, foreground service, Doze exemption, CameraX, Play Integrity. None of that is reachable from a web wrapper. PRD §8 has the stack.

Not covered here: the Android implementation, PSP integration, brand partnerships, the backend fraud service, or any study content. AlarmX is a wake-up app with study framing — the moment it starts competing with Physics Wallah it loses the thing that makes it work.

---

## Open questions

Full list in PRD §17. The two that matter most:

1. **What is the drip survey data actually worth?** Everything above the ad-revenue line rests on a placeholder. One signed indication from a real buyer settles it.
2. **Is 7 alarm-days the right gate, or is 5 enough?** Too long and genuine users lose the early trust moment the ₹10 exists to create. Tune against real fraud data, not a guess made now.
