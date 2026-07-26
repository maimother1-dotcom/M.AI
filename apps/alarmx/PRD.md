# AlarmX — Product Requirements Document

**Version:** 0.4 · **Date:** 26th July 2026 · **Owner:** Bijoy Halder
**Status:** Spec agreed, pre-development

**v0.4 changes:** regional calendar and a 4×2 home-screen widget (§16) — Bengali panjika and Tamil daily calendar, computed from Swiss Ephemeris, with `bn` and `ta` added to the string table. It is the non-cash retention the ₹15 cap forces. Open questions renumbered to §17.

**v0.3 changes:** first payout drops to ₹10 (§6.2), launch cap drops to ₹15 (§2), Hinglish becomes the default language (§12), and the product is positioned for students and exam prep (§13). New India-specific engineering requirements in §11 and a trust section in §14.

---

## 1. What AlarmX is

An Android alarm clock that pays users real cash, in rupees, for waking up on time.

Dismissing the alarm requires an active task — shake, math, or scanning a registered QR code — so the user is physically and mentally awake before the alarm stops. Consistency earns money, paid out over UPI.

Revenue comes from in-app advertising and from reselling aggregated survey data. A third line, brand-sponsored QR scans, is designed into the product now but stays switched off until partnerships exist.

### Non-goals for v1

- iOS
- Real-money gaming, wagering, or prize draws unlinked from a skill task
- Social feed, chat, or content
- Sleep tracking as a standalone feature (accelerometer is used only for the smart wake window)

---

## 2. The number that governs everything

`economics/AlarmX-unit-economics.xlsx` models revenue per active user against payout. Results, per active user per month:

| | Conservative | **Base** | Optimistic |
|---|---:|---:|---:|
| Total revenue | ₹10.05 | **₹23.42** | ₹57.74 |
| Non-reward costs | ₹5.95 | **₹3.20** | ₹1.75 |
| **Sustainable earning cap** | **₹1.16** | **₹16.75** | **₹63.18** |

The original design paid up to ₹95 per user per month (₹60 math + ₹30 streak + ₹5 signup). In the base case that loses **₹54.60 per active user per month**. The sensitivity grid shows the ₹95 row is negative at every revenue level tested, including ₹50/user/month — roughly double the base case.

**Decision: the launch earning cap is ₹15 per user per month.** At 100k MAU that clears a 26% contribution margin after acquisition costs.

### Why the cap fell from ₹20 to ₹15

The ₹10 first payout (§6.2) is not free, and the model prices it exactly. A lower first threshold means fewer users churn without ever cashing out, so **breakage falls from 40% to 25%**. Less breakage means more of what is accrued is genuinely paid, which raises real cash cost:

| | v0.2 (₹30 first) | **v0.3 (₹10 first)** |
|---|---:|---:|
| Breakage | 40% | **25%** |
| Sustainable cap | ₹21.65 | **₹16.75** |
| Cost of the decision | — | **−₹4.90/user/month (−23%)** |

That is the price of the trust position, paid knowingly. §6.2 explains why it is worth it.

### The cap is a config value, not a constant

It rises only when measured ARPU rises:

| Trigger | New cap |
|---|---|
| Launch | ₹15 |
| 60 days of measured ARPU ≥ ₹30 | ₹20 |
| 60 days of measured ARPU ≥ ₹40 | ₹30 |
| First sponsored-QR partner live | Re-model; sponsor revenue is incremental |

**Read the Conservative column before getting comfortable.** At the low end of the published India eCPM range the cap is **₹1.16**, not ₹15. That is not pessimism — it is a realistic first-year outcome for an app with no traffic history. Do not scale spend until the base case is confirmed with real numbers.

The single most important thing this table says: **do not promise users an earning rate the ad revenue has not yet proven.** Every reward-app failure in this category starts by doing exactly that.

---

## 3. Alarm mechanics

### 3.1 The reward window is not the ring duration

This is the most important change from the original concept.

The original design rang the alarm for exactly 10 seconds and then auto-dismissed. That makes the app the reason someone misses work, which is the fastest possible uninstall.

**Revised:**

- The alarm **rings until dismissed**, volume escalating, to a maximum of 5 minutes.
- A **10-second reward window** runs from first ring, with a visible countdown.
- Dismiss within 10 seconds → reward earned.
- Dismiss after 10 seconds → alarm still stops, no reward, and it counts as a "miss" against the streak.

The jump-out-of-bed incentive is fully preserved. The risk of AlarmX causing a missed shift is removed.

### 3.2 Dismissal tasks

| Task | Behaviour |
|---|---|
| **Shake** | Accelerometer, configurable intensity. Retained, lowest anti-fraud value. |
| **Math** | 3 consecutive correct answers. A wrong answer resets to 0. Difficulty set the night before. |
| **QR scan** | Scans a **specific pre-registered code**, not any code. |

**Registered QR is a requirement, not a preference.** Accepting any QR means the user tapes one to the nightstand and defeats the product half-asleep. During setup the user registers a code located in another room — bathroom mirror, kettle, fridge. Dismissal validates the decoded payload against the registered hash. This is simultaneously the strongest anti-automation control in the product, because it cannot be scripted.

Users may register up to 3 codes and the app picks one at random per alarm.

### 3.3 Night-before difficulty lock

Task type and difficulty are chosen when the alarm is **set**, and locked once the alarm is armed. Rational 11pm-self binds irrational 6am-self. This is the commitment-device mechanism the whole category depends on, and it costs nothing to build.

### 3.4 Smart wake window

Optional. Within a 15-minute window before the target time, the app rings at the lightest detected sleep point using accelerometer movement data. Waking mid-deep-sleep is what makes people feel terrible and blame the app.

Off by default. Requires an explicit opt-in because it implies overnight sensor sampling — disclose this in the privacy copy.

### 3.5 Grace tokens

3 snoozes per month, each 5 minutes. One additional token earned per 7-day streak, capped at 5 banked. Using a token does not break the streak; running out and snoozing anyway does.

Products that ban snooze outright lose to the stock clock app.

### 3.6 Sounds

Library of pleasant wake tones. Volume escalation curve configurable. Default respects Do Not Disturb override permission, which must be requested explicitly.

---

## 4. Reward economy

### 4.1 Cash is the primary medium

Cash converts installs immediately and AlarmX has no brand equity to trade on. Everything below is denominated in rupees and counts against the ₹20 monthly cap.

### 4.2 Streak pot — inverted

Credit **₹30 into a locked pot on day 1** of each 30-day cycle. Decrement per miss. The user watches it shrink rather than watching zero grow.

Identical cost, materially better retention. Loss aversion runs roughly twice as strong as equivalent gain, and this change costs one afternoon of work.

Final payout follows the agreed tiers:

| Misses in cycle | Pot pays |
|---|---|
| ≤ 4 | ₹30 |
| 5–10 | ₹15 |
| > 10 | ₹5 |

The pot UI must make the current bracket and the next threshold visible at all times — "2 more misses and this drops to ₹15" is the screen that drives daily opens.

### 4.3 Daily spin, replacing the flat daily payout

The original ₹1/₹2 flat daily math reward is replaced with a **spin**: probabilistic, non-zero floor, expected value ≈ ₹1.

Variable reward outperforms a fixed payout per rupee spent by a wide margin. The floor is never ₹0, so it never reads as a loss.

**The spin is gated behind a completed alarm that morning.** Two reasons, both load-bearing:

1. It ties every rupee earned to a verified human event at a real time in a real place, which is the single best fraud control available.
2. It keeps the reward attached to a skill task rather than pure chance, which is the defensible side of Indian prize-draw law.

Suggested distribution (tunable): ₹0.25 (40%), ₹0.50 (30%), ₹1 (20%), ₹2 (7%), ₹5 (2.5%), ₹25 (0.5%).

### 4.4 Non-cash reward shelf

Zero marginal cost, disproportionately valued by the users who stay longest:

- Streak freezes and extra grace tokens
- Premium alarm sounds
- App themes and icon packs
- Badges and streak milestones

Reserve rupees for behaviours that genuinely need buying. Everything else should be earned in kind.

### 4.5 Wake-up buddy

Paired users. The buddy bonus pays only if **both** dismiss on time.

Same payout as solo, roughly double the retention, and it produces organic invites, which are the cheapest installs available. Pairing is opt-in, with a block/unpair control and no exposure of the buddy's phone number or precise location.

### 4.6 Sponsored QR — rails built, dormant

The QR scan is currently a pure cost. It is also the most monetisable surface in the app: a verified human, awake, at home, holding a specific product, at a known time each morning. That is exactly what a CPG brand pays for.

**Build now, activate later:**

- Every scan event carries a `sponsor_id`, null today.
- Every reward carries a `funding_source` enum: `SELF` today, `BRAND` later.
- The dismissal UI has a sponsor badge slot, hidden while `sponsor_id` is null.
- Payout attribution reports split by funding source from day 1.

When the first partner signs, activation is a config change and a creative asset, not a rewrite. Sponsored scans are **incremental** to the ₹20 cap, not counted against it, because a different balance sheet funds them.

---

## 5. Onboarding and survey

### 5.1 Optional, not mandatory

The 30-question survey becomes **skippable**. There is a real, visible skip control, and the app is fully functional without it.

This is not a nicety. India's DPDP Act requires consent to be free, specific, informed, and **unconditional**. Gating app access on answering questions whose purpose is resale fails the "unconditional" test. Making it optional and paying ₹5 for completion is legally clean, and completion will still be high because the money is attached and it is the first thing the user sees.

### 5.2 Drip structure

- **8 questions at signup** — demographics and icebreakers only.
- **2–3 questions per day thereafter**, as a daily earn task.

Three reasons this beats the 30-question wall:

1. Onboarding drop-off falls sharply.
2. It creates a reason to open the app beyond the alarm.
3. Recurring responses from a known, retained cohort are worth **multiples** of a one-time snapshot to a data buyer. The economics model quantifies this: drip revenue is ₹6.50/user/month at base case versus ₹3.75 for the amortised one-time dump.

The high-value B2B questions move into the drip, not the signup block. A user who has been answering for three weeks answers more honestly than one clicking through a wall to reach a signup bonus.

### 5.3 Consent

- Separate, unticked checkbox for **resale of survey responses**, distinct from consent to use the app.
- Plain-language purpose statement in English and Hindi at minimum.
- Withdrawable at any time from Settings, with the same ease as granting.
- Withdrawal stops future resale; already-transmitted aggregates cannot be recalled, and the copy must say so honestly.
- Retention limit: raw responses purged 24 months after collection or 6 months after account deletion, whichever is sooner.

### 5.4 What is sold

**Aggregated cohort data only.** No row-level records, no device identifiers, no phone numbers, minimum cohort size of 50 before any cell is released.

This cuts legal exposure sharply at minimal revenue cost, since buyers of consumer survey data overwhelmingly want cohort statistics, not individuals.

---

## 6. Wallet, cap and withdrawal

### 6.1 Cap earning, not withdrawal

The original design let users accumulate ₹500–600 and released ₹60–100 per month.

That is a Google Play deceptive-behaviour risk, and it is the specific mechanic that generates "they won't let you withdraw" reviews, which kill install conversion faster than any ASO work can repair.

**Revised:** earning is capped at ₹20 per user per month. Everything earned is withdrawable **in full**, within 48 hours of request, once the ₹30 minimum is reached.

Same cash leaving the business. Completely different trust position — "pays fast, pays real" is a genuine differentiator in a category where nobody believes anybody.

### 6.2 Two thresholds: ₹10 first, ₹30 after

| | Threshold | Booked as |
|---|---:|---|
| First ever payout | **₹10** | Customer acquisition |
| Every payout after | ₹30 | Reward cost |

**Why the first payout is an acquisition cost, not a reward.** ₹10 plus a ₹3 fee is ₹13 per converting user, or **₹9.10 blended across all installs**. A paid install in India costs around ₹22. So the first payout buys a *paid, retained, trusting* user for **41% of what an ad pays for a raw install that may never open the app twice.*

That is the correct frame. Charging it to the reward budget would wrongly depress the cap in every subsequent month, for a cost that is structurally marketing.

**Why it was necessary at all.** At a ₹15 cap and a flat ₹30 minimum, a new user cannot be paid inside their first cycle — the first payout would land around six weeks in. Six weeks of "trust me" is exactly what every reward app that never pays also says. The whole honest-cap design in §6.1 depends on the user finding out quickly that the money is real. ₹10 buys that discovery in about two weeks.

### 6.3 Anti-farming gate on the first payout — required, not optional

A ₹10 first payout is a ₹10 bounty on every fake account. **All** of these must pass before the first payout unlocks:

1. Play Integrity verdict passing
2. One first payout per verified phone number **and** per device fingerprint
3. **≥7 distinct calendar days with a completed alarm**

Condition 3 is the load-bearing one. It makes farming cost a week of real wall-clock time per ₹10, which destroys the economics of automation, while being invisible to a genuine user who needs about two weeks to reach ₹10 anyway. It cannot be compressed by running an emulator faster, because it is gated on calendar days containing a real alarm event.

Show the gate honestly in the UI, as progress rather than an obstacle: *"4 of 7 days done — first payout unlocks at ₹10."*

### 6.4 Payout mechanics

Monthly batch payouts, one per user per month, keeping transaction cost to a single fee. UPI ID collected with a name-match confirmation before the first payout is released.

Users who churn below their threshold constitute **breakage**, modelled at 25% of accrued rewards in the base case. That is a legitimate consequence of a minimum, not a dark pattern, provided the cap is honest and the threshold is reachable — which at ₹15/month and a ₹10 first threshold it clearly is.

### 6.5 UI requirements

- Wallet shows earned, withdrawable, and remaining monthly cap.
- When the cap is hit: *"You've earned this month's maximum of ₹15. Your cap resets on 1 August."* Honest, no fake scarcity, no implication that more is coming.
- Before the first payout, show both gates: the rupee distance **and** the 7-day progress. Whichever is further away is the one that matters.
- Never display a balance the user cannot eventually withdraw.

---

## 7. Anti-fraud

### 7.1 Play Integrity API is the primary control

Device fingerprinting alone will not hold. Play Integrity detects emulators, rooted devices, and tampered builds at OS level, which is where the actual attackers operate. Verdicts checked server-side on every reward event; client-side results are advisory only.

### 7.2 Signals

| Signal | Use |
|---|---|
| Play Integrity verdict | Hard gate on reward eligibility |
| Device ID ↔ account cardinality | Multiple accounts per device |
| IP velocity | Same device claiming from several IPs in minutes |
| Response-time **variance** | Humans are inconsistent; scripts are not. Variance beats raw speed as a detector. |
| GPS ↔ IP geo mismatch | Requires location permission, which is optional; absence is not itself evidence |
| Alarm-to-scan interval | Physically implausible transitions between registered QR locations |

### 7.3 Honest review state

The originally proposed fake "technical difficulty" message is replaced.

Flagged accounts see: **"Your account is under review. We'll update you within 5 days."**

This is true, discloses no detection method, and gives false positives somewhere to go. Every fraud system has false positives — a legitimate user on shared office wifi or a factory-reset phone will hit these flags, and under a fake error they have nothing to appeal.

Behind it, a **shadow payout throttle**: flagged accounts continue to accrue on screen while the payout queue holds. Actual fraudsters burn days producing nothing. An appeals form is mandatory, with a human reviewing within the stated 5 days.

### 7.4 Calendar-day reset

Reward eligibility resets at **local midnight**, not on a rolling 24-hour timer. An 8am Monday alarm followed by a 7am Tuesday alarm is 23 hours and must not be flagged.

### 7.5 Tie earning to alarms

Every rupee should trace to a completed alarm event. The detached daily challenge is the soft target for automation; gating the spin behind a morning alarm closes it.

### 7.6 First-payout farming

The ₹10 first payout creates a per-account bounty and needs its own gate — Play Integrity, one payout per phone number and per device, and ≥7 distinct alarm-days. Specified in full in §6.3. This is the single highest-risk fraud surface in the product, because unlike the reward cap it is a one-off prize that resets with every new account.

---

## 8. Technical requirements

### 8.1 Client — native Android, Kotlin

Native is required, not preferred. None of the following is reachable from a web wrapper:

- `AlarmManager` with `SCHEDULE_EXACT_ALARM`, plus a foreground service for reliable firing
- Doze and battery-optimisation exemption flow, with onboarding that explains why
- `BOOT_COMPLETED` receiver to restore alarms after restart
- Accelerometer for shake and the smart wake window
- CameraX + ML Kit barcode scanning for QR
- Play Integrity API
- Full-screen intent notification for lock-screen alarm display

Minimum SDK 26, target current. The React prototype in `prototype/` is a design artefact for validating flows, not a production path.

### 8.2 Backend

- Firebase Auth (phone OTP)
- Firestore for user, alarm, streak, wallet state
- Cloud Functions for **all** reward and payout logic — never client-triggered
- A dedicated fraud-evaluation function on every reward event
- Payout via a PSP (RazorpayX or Cashfree), server-side only, idempotent, with a settlement reconciliation job

### 8.3 Hard rules

- Reward amounts, caps, and the spin distribution are **server-authoritative**. The client displays; it never decides.
- Every payout is idempotent, keyed on `(user_id, cycle, reward_id)`.
- All transport TLS. No certificate pinning bypass, no debug flags in release.
- Secrets in Cloud Functions config or Secret Manager, never in the APK. Assume the APK is decompiled on day one.
- Every reward event is written to an immutable audit log before the wallet is credited.

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Ad ARPU comes in at the Conservative column, making the cap ~₹2 | **High** | Cap is a config value. Launch at ₹20 with a 60-day ARPU review before any raise. Do not scale spend until base case is confirmed. |
| Survey resale values are unvalidated placeholders | **High** | Get a signed indication from one buyer before counting the revenue. These are the least reliable inputs in the model. |
| Play Store rejection under reward/deceptive policy | Medium | Honest cap, full withdrawal, no fake errors, clear disclosures. Pre-submission policy review. |
| DPDP enforcement on the resale consent | Medium | Optional survey, granular unticked consent, aggregate-only sale, documented retention. Legal review before launch. |
| Fraud exceeding the 5% modelled leakage | Medium | Play Integrity as a hard gate, alarm-tied earning, shadow throttle, monthly leakage reporting against the model. |
| Exact-alarm permission restrictions tightening in future Android | Medium | Monitor platform releases. Foreground-service fallback path. |
| Users churn once they learn the cap is ₹15 | Medium | Honesty is the trade. A ₹15 cap that pays reliably retains better than a ₹95 promise that does not. The student wedge (§13) and non-cash rewards carry the rest — the money was never going to be the whole reason to stay. |
| **OEM battery killers stop alarms firing** | **High** | The single biggest technical risk. Per-OEM onboarding, post-onboarding verification, re-check on update, physical Redmi and Realme testing before release. See §11.1. |
| First-payout farming at ₹10 per fake account | High | Play Integrity, one payout per number and device, ≥7 alarm-days. See §6.3. |
| Hinglish copy reads as inauthentic | Low | Write it how people text, not translated English. Test the strings with real users in the segment before launch. |

---

## 11. Building for India

This section is not localisation polish. Everything here is a launch blocker.

### 11.1 OEM battery killers are the biggest technical risk in the product

Xiaomi/MIUI, Realme and Oppo/ColorOS, Vivo/Funtouch, and Samsung/OneUI all aggressively kill background apps to protect battery life. These skins dominate the exact devices the target user owns. **An alarm that does not fire on a Redmi is a dead app**, and no amount of reward design compensates for it.

Required:

- Detect `Build.MANUFACTURER` and show the **exact** autostart and battery-unrestricted path for that skin. Generic "please allow background activity" copy is useless — the user needs the literal menu path on their phone.
- **Verify afterwards rather than assuming.** Schedule a silent test alarm shortly after onboarding and confirm it fired. If it did not, re-prompt.
- **Re-check on every app update.** OEM skins silently reset these permissions.
- Request `SCHEDULE_EXACT_ALARM` and battery-optimisation exemption with a plain-language reason, not a bare system dialog.

Treat dontkillmyapp.com as the reference for per-OEM paths, and re-test on a physical Redmi and a physical Realme before any release. Emulators do not reproduce these skins.

### 11.2 Offline-first

The alarm must fire with **zero connectivity**. Rewards accrue locally and sync when a network returns. Network is never in the path of the core promise. A user in a patchy-signal hostel must still be woken.

### 11.3 Low-end devices

Target 2GB RAM. **APK under 15MB.** No heavy animation, no large bundled assets. Every megabyte is a real install-conversion cost on a budget device with full storage.

### 11.4 Data cost is the user's money

Rewarded video burns mobile data, and the target user is often on a metered daily pack. Preload video on wifi where possible, cap daily video count, and be transparent about data used. Silently consuming someone's data to show them ads is how you earn an uninstall in this market.

### 11.5 Formatting

- **Indian digit grouping**: ₹1,00,000 — lakh and crore, not thousands. `##,##,##0`. Getting this wrong instantly signals the app was not built for them.
- 12-hour clock with AM/PM.
- Rupee symbol always prefixed, never "Rs." in UI copy.

---

## 12. Localisation

Five locales at launch:

| Locale | Role |
|---|---|
| **`hi-Latn` — Hinglish** | **Default.** Roman-script Hindi. |
| `en` — English | Switchable |
| `hi` — Devanagari Hindi | Switchable |
| `bn` — Bengali | Switchable. Added in v0.4 with the panjika (§16). |
| `ta` — Tamil | Switchable. Added in v0.4 with the daily calendar (§16). |

Bengali and Tamil arrive as a consequence of §16 rather than as a guess about install geography: if the app is showing a Vishuddha Siddhanta panjika, showing it inside English chrome is incoherent.

**Hinglish is the default because it is how the target user actually reads and texts.** It needs no font support and no special keyboard, and it avoids both the downmarket read of formal Devanagari and the exclusion of English-only copy.

Tone rule: write how people text, not translated English. *"Alarm band karo, ₹15 tak kamao"* — not a formal register nobody uses out loud.

Implementation: **every user-facing string lives in one table.** No hardcoded copy in components. Adding Tamil, Telugu, Bengali or Marathi later then becomes a data change rather than a rebuild. Language switcher on the very first screen and in settings.

---

## 13. The wedge: students and exam prep

AlarmX launches for NEET, JEE, UPSC and board-exam students.

**Why this segment and not "everyone".** Waking at 5am to study is a real, painful, already-felt need. The money becomes a bonus on top of a reason the user already has, rather than the sole reason to install — which is the fight you lose against a free stock alarm. It is also a large, concentrated, highly referral-active group that already shares study apps on WhatsApp.

Features that follow from the wedge:

- **Default alarm times 4:30–6:30am.**
- **Exam countdown** as a first-class widget — *"NEET in 214 days"*. Costs nothing and reframes every morning as progress toward something the user already cares about.
- **Study streak** framing rather than a generic wake streak.
- **Batch challenges** — the wake-up buddy (§4.5) extended to small groups. Study groups already exist on WhatsApp; this rides an existing behaviour instead of inventing one.
- **Morning missions** after dismissal — revise 5 cards, 10 minutes of reading — for **non-cash** points.
- **Cohort leaderboards** by exam and by city. Non-cash, strongly motivating, near-zero cost.

**Scope boundary, stated explicitly:** this is a wake-up app with study framing. It is **not** an edtech product. No content library, no question bank, no syllabus tracking. The moment it starts competing with Physics Wallah it loses the thing that makes it work.

---

## 14. Trust

Most Indian reward apps never pay. Users know this, and they arrive assuming AlarmX is the same. **Trust is the moat here, not a feature.**

- **Payout history in-app**, with UPI reference IDs the user can check against their bank.
- **A public "paid this week" ticker** — real numbers, updated automatically.
- **Exact timelines everywhere.** No indefinite "processing" state. If something takes 48 hours, say 48 hours.
- **The ₹10 first payout is the primary trust mechanism.** It exists to be received early and screenshotted. Design the success screen to be worth sharing.

**Referral**: one-tap WhatsApp share, because that is where this segment lives. Referral bonuses are **CAC, never counted against the reward cap** — same accounting logic as §6.2.

### 14.1 Festivals and events

Diwali, Holi, Eid, Pongal, and exam-season pushes. **Non-cash only** — themes, badges, bonus grace tokens, leaderboard events. Zero marginal cost, and it creates a reason to reopen without touching the cap.

---

## 16. Regional calendar and the home-screen widget

The ₹15 cap (§2) means engagement cannot be bought with money. AlarmX needs a daily reason to be opened that has nothing to do with rupees.

Bengali panjika and Tamil daily calendar are checked every morning by millions of households. **That habit already exists — the widget does not have to create one, only occupy it.**

**The mechanic: the calendar is the reason to look, AlarmX state is what they see while looking.** No nagging notification is needed. The reminder is ambient.

It also resolves a positioning tension. The panjika audience skews household and older; the student wedge (§13) skews young. One widget carrying both the tithi and the NEET countdown serves both without diluting either.

### 16.1 Engine

**Swiss Ephemeris in Moshier mode.** Moshier is analytical: it needs **no `.se1` data files**, versus roughly 90MB for full Swiss mode. Accuracy is far beyond what tithi and nakshatra boundaries require, and it keeps the APK inside the 15MB budget in §11.3.

**Precompute, do not compute daily.** On first run, and on any location change, generate 365 days of panchang for the user's coordinates and cache it in Room. Roughly 365 rows × 200 bytes ≈ 75KB. **The widget reads cache only.**

That satisfies three constraints at once: offline-first (§11.2), battery on a budget phone, and widget update cost.

Fields computed: tithi, nakshatra, yoga, karana, sunrise, sunset, Rahu Kalam, Yamagandam, Gulika Kalam, Nalla Neram / Abhijit, the Bengali and Tamil solar date, and the festival list.

### 16.2 Panjika systems are user-selectable and labelled

The competing systems genuinely disagree on dates, and families follow one or the other.

| Tradition | Region | Basis | Version |
|---|---|---|---|
| **Vishuddha Siddhanta** | West Bengal | Drik / observational | **v1** |
| **Bangladesh revised** | Bangladesh | Arithmetic, fixed month lengths | **v1** |
| Gupta Press | West Bengal | Surya Siddhanta mean positions | v2 |
| **Thirukanitham** | Tamil Nadu | Drik / observational | **v1** |
| Vakya | Tamil Nadu | Traditional mean positions | v2 |

**Bangladesh is a different system, not a different city.** It pins Pohela Boishakh to 14 April every year, while drik lands on the 15th in most years — 2025, 2026 and 2027 all differ, 2028 agrees. Serving a Dhaka user the West Bengal date is wrong on the biggest day of their year. It is also the cheapest system AlarmX will ever add: pure arithmetic, no astronomy, and it is verified exactly against two independent implementations across 1461 days (§16.3).

Scoping honesty: Gupta Press and Vakya are **not an offset** applied to drik values. They need a separate Surya Siddhanta mean-position calculator, which is its own piece of work. v1 ships drik plus the Bangladesh arithmetic calendar, and **names the system and its basis on screen** — "Vishuddha Siddhanta (drik)" or "Bangladesh revised (arithmetic)" — so a household knows immediately what it is looking at rather than quietly getting the wrong dates.

### 16.3 Validation gate — release blocker

**Wrong panchang is worse than no panchang.** People plan fasts, rituals and auspicious timings on this. It is not a cosmetic bug class.

**Done.** The Bangladesh arithmetic calendar is validated *exactly* — 1461 days, 2025 to 2028, against two independent MIT-licensed implementations that agree with each other on every day. Zero tolerance, zero mismatches. That run also confirms the parts both Bengali systems share: month names, month order, year numbering and Bengali numerals. And it confirms the drik engine reproduces a documented real-world difference rather than an arbitrary one — West Bengal really did keep Poila Boishakh on 15 April 2025 while Bangladesh observed it on the 14th.

Provenance and how to regenerate: `tests/reference/regenerate.md`. Assertions: `tests/verify_bengali_cross.js`.

**Still outstanding, and still blocking.** Those references compute no tithi, nakshatra, yoga or karana, and no drik dates. So the following remains untouched by that work:

- **60 dates spanning a full year, for Kolkata and Chennai**, against published almanacs, comparing tithi and nakshatra names *and* transition times. Encoded as a fixture with real reference values, not a spot check.
- The drik Bengali month-start rule is currently confirmed against **one year only**, plus the four new-year dates above.
- The Tamil 60-year cycle spellings are unverified. The cycle *position* is tested; the Tamil-script names are not.

Any mismatch is a failure, not a warning.

### 16.4 The widget

**4 cells wide × 2 tall** — the standard wide Android widget.

- `minWidth` 250dp, `minHeight` 110dp; Android 12+ `targetCellWidth=4`, `targetCellHeight=2`
- `resizeMode="horizontal|vertical"` with 4×1 and 2×2 layouts so it survives being resized
- **RemoteViews only.** Custom views are not permitted in app widgets.
- Updates **once at local midnight** via `AlarmManager`, plus on alarm-state change. Never `updatePeriodMillis` — it floors at 30 minutes and wastes battery for no gain when the content changes once a day.

**Layout, left to right:** clock and Gregorian date · Bengali or Tamil date and month in native script · tithi + nakshatra + today's festival · AlarmX strip (next alarm, streak pot, exam countdown, spin-ready dot).

**Two tap targets, two `PendingIntent`s:** the calendar area opens the calendar screen, the AlarmX strip opens the app.

### 16.5 In-app calendar screen

Month grid with festival and tithi marks. Tap a day for the full panchang detail. Reads the same cached table as the widget. Bengali and Tamil month names in native script, rendered with system Noto fonts — bundling font files would blow the APK budget for no gain.

Locales `bn` and `ta` are added to the string table alongside the three in §12, bringing it to five.

### 16.6 No nagging

The widget is ambient and that is the point. One optional daily notification at a user-chosen time, **default off**. Android 13+ requires `POST_NOTIFICATIONS`, that permission is a finite budget, and spending it on marketing is how you lose it for alarms.

### 16.7 Licensing and sourcing — non-negotiable

**Swiss Ephemeris Professional licence must be purchased and the contract signed before distribution.** Astrodienst charge a one-time fee per project. The AGPL alternative would force all of AlarmX open-source, including the anti-farming gate in §6.3 — self-defeating for a product whose security model assumes the attacker has the source (see the security baseline).

**Do not scrape bengalicalendar.com or tamildailycalendar.com.** Their content is copyrighted, redistributing it is infringement, and both already return HTTP 403 to automated requests. They are references for *which fields to show*, never a data source. Every value AlarmX displays is computed independently from ephemeris.

### 16.8 Economics

The widget pays no cash, so it does not touch the ₹15 cap. It is exactly the non-cash retention the cap forces.

It may raise active days per month (base case 26), which would raise revenue and the cap. **That is deliberately not baked into the model.** Raising a revenue assumption on the strength of an unshipped feature is how the ₹95 design happened in the first place. It is recorded as a candidate uplift to re-measure after 60 days of live data. The Swiss Ephemeris licence is a capitalised one-time cost, not a per-user cost.

---

## 17. Open questions

1. **What is the drip survey data actually worth?** Everything above the ad-revenue line rests on this and it is still a placeholder. One signed indication from a real buyer settles it. Highest-value unknown in the model.
2. Which PSP, and what is their real per-payout rate at AlarmX's expected volume? At a ₹10 first payout the fee is 20–50% of the payout, so the rate matters more than it looks.
3. Does the smart wake window justify the overnight sensor permission ask, in install-conversion terms?
4. Which panjika system does the median Bengali household actually follow — Vishuddha Siddhanta or Gupta Press? v1 ships drik and labels it (§16.2), but if Gupta Press turns out to dominate, the v2 Surya Siddhanta calculator becomes urgent rather than optional.
5. Is 7 alarm-days the right anti-farming gate, or is 5 enough? Too long and genuine users lose the early trust moment the ₹10 exists to create. Tune against real fraud data after launch, not before.
6. What does the exam-countdown ask look like for someone with no exam? The wedge must not make the app unusable for a working adult who installs it anyway.

7. Does the widget actually move active days? It is the whole retention argument for §16 and it is unmeasured. Re-check after 60 days of live data, and only then consider raising the cap ladder.

**Resolved in v0.4:** which regional languages come next (§12 — `bn` and `ta`, pulled in by the panjika rather than guessed from install geography).

**Resolved in v0.3:** the ₹30-minimum vs cap conflict (§6.2 — ₹10 first payout, booked as acquisition), and the launch language question (§12 — Hinglish default).
