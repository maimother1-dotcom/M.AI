# AlarmX — Product Requirements Document

**Version:** 0.2 (revised) · **Date:** 26th July 2026 · **Owner:** Bijoy Halder
**Status:** Spec agreed, pre-development

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
| Non-reward costs | ₹5.45 | **₹2.75** | ₹1.45 |
| **Sustainable earning cap** | **₹1.93** | **₹21.65** | **₹84.90** |

The original design paid up to ₹95 per user per month (₹60 math + ₹30 streak + ₹5 signup). In the base case that loses **₹39.18 per active user per month**. At 100k MAU that is a **₹39 lakh monthly loss**. The sensitivity grid shows the ₹95 row is negative at every revenue level tested, including ₹50/user/month — roughly double the base case.

**Decision: the launch earning cap is ₹20 per user per month**, sitting just under the base-case sustainable figure.

This is not a number to be optimistic about. It rises only when measured ARPU rises. The cap is a config value, not a constant in code, and there is a documented ladder:

| Trigger | New cap |
|---|---|
| Launch | ₹20 |
| 60 days of measured ARPU ≥ ₹30 | ₹25 |
| 60 days of measured ARPU ≥ ₹40 | ₹35 |
| First sponsored-QR partner live | Re-model, sponsor revenue is incremental |

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

### 6.2 Minimum withdrawal

₹30 minimum retained. Note the trade-off honestly: at ₹2–5 per UPI payout, a ₹30 withdrawal loses 7–17% to transaction cost. Monthly batch payouts keep this to one payout per user per month.

Users below ₹30 at churn constitute **breakage**, modelled at 40% of accrued rewards in the base case. This is a legitimate consequence of a minimum threshold, not a dark pattern, provided the cap is honest and reachable — which at ₹20/month and a ₹30 minimum means roughly six weeks of consistent use. State that plainly in the wallet UI: *"You're ₹12 away from your first withdrawal."*

### 6.3 UI requirements

- Wallet shows earned, withdrawable, and remaining monthly cap.
- When the cap is hit: *"You've earned this month's maximum of ₹20. Your cap resets on 1 August."* Honest, no fake scarcity, no implication that more is coming.
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
| Users churn once they learn the cap is ₹20 | Medium | Honesty is the trade. A ₹20 cap that pays reliably retains better than a ₹95 promise that does not pay. Non-cash rewards carry the rest. |

---

## 10. Open questions

1. What is the actual resale value of the drip survey data? Everything above the ad revenue line depends on this and it is currently a guess.
2. Which PSP, and what is their real per-payout rate at AlarmX's expected volume?
3. Does the smart wake window justify the overnight sensor permission ask, in install-conversion terms?
4. Hindi and regional language coverage at launch, or English-only for v1?
5. **The ₹30 minimum and the ₹20 cap are in direct conflict — decide before build.** At a ₹20 monthly cap, a user cannot reach a ₹30 minimum inside their first cycle. Their first payout lands roughly six weeks in, which flatly contradicts the "pays fast, pays real" position that justifies the honest-cap design in the first place. Surfaced by prototype testing, where the withdraw button is correctly disabled even after a user maxes their month.

   Three options, none free:
   - **Drop the minimum to ₹20.** First payout at the end of month 1. But more users reach the threshold, so breakage falls below the modelled 40%, cash cost rises, and the sustainable cap drops. Re-run the model before choosing this.
   - **Keep ₹30 and say so plainly** — "your first withdrawal unlocks in about 6 weeks" at signup. Honest, but a materially worse hook.
   - **One-off first payout at ₹10**, then ₹30 thereafter. Buys the early trust moment at a known, bounded cost.

   Recommendation: the third. It is the cheapest way to buy the "it actually paid me" moment, which is what drives retention and word of mouth in this category.
