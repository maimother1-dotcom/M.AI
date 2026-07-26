# AlarmX

An Android alarm app that pays students cash for waking up early to study.

Built for India first: Hinglish by default, designed around the phones and network conditions the target user actually has, and positioned for NEET / JEE / UPSC / board-exam preparation.

This directory holds the design work — the economics that set the reward ceiling, the spec a developer builds from, and a clickable prototype of every mechanic.

---

## What's here

| Path | What it is |
|---|---|
| `economics/AlarmX-unit-economics.xlsx` | The model that sets the earning cap. **Read this first.** |
| `economics/build_model.py` | Rebuilds the workbook from source |
| `PRD.md` | Full product spec |
| `prototype/index.html` | Interactive prototype. Open in a browser, no setup. |
| `prototype/i18n.js` | Every user-facing string, in five locales |
| `prototype/panchang.js` | Regional calendar engine — tithi, nakshatra, three Bengali/Tamil calendar systems |
| `tests/verify_prototype.py` | 155-check browser suite |
| `tests/verify_panchang.js` | 38-check astronomy suite, runs in node |
| `tests/verify_bengali_cross.js` | 19-check cross-validation against two independent Bengali calendar implementations |
| `tests/reference/` | Frozen reference data and its provenance |

---

## Start here: the number

| Per active user / month | Conservative | **Base** | Optimistic |
|---|---:|---:|---:|
| Revenue | ₹10.05 | **₹23.42** | ₹57.74 |
| Sustainable earning cap | ₹1.16 | **₹16.75** | ₹63.18 |

The original concept paid up to **₹95/user/month**. Base case, that loses **₹54.60 per active user per month**. The sensitivity grid shows ₹95 is loss-making at every revenue level tested, including ₹50/user/month — more than double the base case.

**The launch cap is ₹15/month.** At 100k MAU that clears a 26% contribution margin after acquisition costs.

**Read the Conservative column before getting comfortable.** At the low end of the published India eCPM range the cap is ₹1.16, not ₹15. That is a realistic first-year outcome for an app with no traffic history, not a pessimism exercise.

The two least reliable inputs are the survey resale values. They are placeholders, not sourced, and should be validated with a real data buyer before anyone counts that revenue.

---

## The ₹10 first payout, and what it cost

A user cannot reach a ₹30 minimum inside their first month at a ₹15 cap. Their first payout would land about six weeks in — and six weeks of "trust me" is exactly what every reward app that never pays also says.

So the first payout is **₹10**, then ₹30 after.

That is not free, and the model prices it exactly:

| | v0.2 (₹30 first) | **v0.3 (₹10 first)** |
|---|---:|---:|
| Breakage | 40% | **25%** |
| Sustainable cap | ₹21.65 | **₹16.75** |
| Cost of the decision | — | **−₹4.90/user/month (−23%)** |

A lower threshold means fewer users churn without ever cashing out, so less of what is accrued goes unpaid, so real cash cost rises and the cap falls.

**Worth it, because the first payout is acquisition, not a reward.** ₹10 plus a ₹3 fee is ₹13 per converting user, or ₹9.10 blended across all installs — **41% of a ₹22 paid install.** It buys a paid, retained, trusting user for less than half what an ad pays for a raw install that may never open the app twice. Booking it against the reward budget would wrongly depress the cap in every later month.

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

**Language:** Hinglish default, with English, Devanagari Hindi, Bengali and Tamil switchable. Hinglish needs no font or keyboard support and is how the target user actually reads. Every string lives in `i18n.js` — five locales, 147 keys each, parity enforced by test.

**The wedge:** students. Waking at 5am to study is a real, already-felt need, so the money is a bonus on top of a reason the user already has — rather than the only reason to install, which is the fight you lose against a free stock alarm.

---

## The regional calendar and the 4×2 widget

A ₹15 cap means engagement cannot be bought with money. So it is bought with something people already open every morning.

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

No build step, no dependencies, no network. A **DEV** bar at the bottom lets you ring the alarm, switch language, jump the day counter, force the cap and flag the account.

Worth doing in this order:

1. **Walk onboarding.** Language → calendar → exam → OEM setup → survey. Skip the survey and confirm the app still works fully.
2. **Arm a math alarm, ring it, let the 10 seconds lapse.** The alarm keeps ringing. That is the single most important change in the design.
3. **Try to withdraw with ₹15 but 0 alarm days.** Blocked — the gate, not the money, is what is missing.
4. **Hit `7 days`, then withdraw.** ₹10 goes out with a UPI reference. Then watch the minimum become ₹30.
5. **Press `Lang`** and read the same dashboard in all five languages. In Bengali and Tamil the panchang itself changes script, not just the chrome.
6. **Press `Cal`, then `Boishakh` and `Pongal`.** The two traditions disagree on which day the year turns, and the app shows that rather than hiding it.
7. **Flag the account.** Read the review message and use the appeal.

### Tests

```bash
pip install playwright
python3 tests/verify_prototype.py       # 155 checks, browser
node tests/verify_panchang.js           # 38 checks, no dependencies
node tests/verify_bengali_cross.js      # 19 checks, no dependencies
```

**212 checks, all passing as of this commit.**

`verify_prototype.py` covers the payout gate, locale parity across all five languages, the three Bengali/Tamil calendar systems, Indian number grouping, the alarm reward window, QR validation, the 4x2 widget geometry, the calendar screen, and every regression from v0.2.

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
