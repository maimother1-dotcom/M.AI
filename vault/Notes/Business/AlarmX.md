# AlarmX

> Android alarm app that pays users cash for waking up on time. First real product of the solo AI business.
> Design work lives in the repo at `apps/alarmx/`.

---

## What it is

Dismissing the alarm requires an active task — shake, math, or scanning a registered QR code — so the user is genuinely awake before it stops. Consistency earns rupees, paid over UPI.

Revenue: in-app advertising plus resale of aggregated survey data. A third line, brand-sponsored QR scans, is designed in but switched off until partnerships exist.

## The number that governs everything

The unit economics model is the spine of this project.

| Per active user / month | Conservative | **Base** | Optimistic |
|---|---:|---:|---:|
| Revenue | ₹10.05 | **₹23.42** | ₹57.74 |
| Sustainable earning cap | ₹1.16 | **₹16.75** | ₹63.18 |

The original concept paid up to **₹95/user/month**. Base case, that loses **₹54.60 per active user per month**. Sensitivity testing shows ₹95 is loss-making at every revenue level tested, including ₹50/user/month.

**Launch cap: ₹15/month**, with a documented ladder for raising it only as measured ARPU proves out. At 100k MAU that clears a 26% margin after acquisition.

The two weakest inputs are the survey resale values. They are placeholders and need validating with a real buyer before anyone counts that revenue.

## Three changes that de-risked the concept

1. **The alarm rings until dismissed.** The 10-second limit became a *reward window*, not the ring duration. The original auto-dismissed after 10 seconds, which makes the app the reason someone misses a shift.
2. **Cap earning, not withdrawal.** The original let users accrue ₹500–600 and released ₹60–100/month. That is a Play Store deceptive-behaviour risk and the mechanic behind "they won't let you withdraw" reviews.
3. **Tell flagged accounts the truth.** The proposed fake "technical difficulty" message became an honest under-review state with an appeals route. Every fraud system produces false positives; they need somewhere to go.

Also: the survey became optional and paid, which is what makes the consent valid under the DPDP Act, and now drips 2–3 questions daily instead of walling 30 up front. The drip is worth more — ₹6.50/user/month versus ₹3.75 for the amortised one-time dump.

## v0.3 decisions

**First payout ₹10, then ₹30.** A user cannot reach ₹30 in their first cycle at a ₹15 cap, so the first payout would land six weeks in — and six weeks of "trust me" is what every reward app that never pays also says.

It cost real headroom: breakage falls 40% → 25%, so the sustainable cap dropped ₹21.65 → ₹16.75, a 23% cut. Worth it because the first payout is **acquisition, not a reward** — ₹13 per converting user, ₹9.10 blended, which is 41% of a ₹22 paid install. It buys a paid, retained, trusting user for less than half what an ad buys a raw install.

Needs a farming gate: Play Integrity, one payout per number and device, and ≥7 distinct alarm-days. The 7 days is the load-bearing part — it makes farming cost a week of wall-clock time per ₹10.

**Hinglish is the default language.** Roman-script Hindi, with English and Devanagari switchable. No font or keyboard dependency, and it is how the target user actually reads.

**The wedge is students and exam prep.** NEET, JEE, UPSC, boards. Waking at 5am to study is an already-felt need, so the money becomes a bonus rather than the only reason to install.

**Biggest technical risk: OEM battery killers.** MIUI, ColorOS, Funtouch and One UI kill background apps, and they dominate the target user's devices. An alarm that does not fire on a Redmi is a dead app. Guided per-OEM onboarding with verification afterwards, not assumption.

## v0.4 decisions

**A regional calendar and a 4x2 home-screen widget.** The cap means engagement cannot be bought with money, so it is bought with a habit that already exists: Bengali panjika and Tamil daily calendar are checked every morning by millions of households. The calendar is the reason to look, AlarmX state is what they see while looking. No nagging notification needed.

It also settles the positioning tension. The panjika audience skews household and older, the exam wedge skews young. One widget carrying both the tithi and the NEET countdown serves both.

**Bengali and Tamil become real locales**, taking the string table to five. Not a guess about where installs land — showing a Vishuddha Siddhanta panjika inside English chrome is incoherent. The panchang element names change script too, not just the surrounding copy.

**Computed, never copied.** Swiss Ephemeris in Moshier mode, which needs no data files and so costs nothing against the APK budget. Nothing is scraped from the two reference sites; their content is copyrighted and both block automated requests anyway.

**The commercial licence must be bought before distribution.** AGPL would force the whole app open-source including the anti-farming gate, which defeats a security model that assumes the attacker has the source. One-time capitalised cost, not per-user.

**v1 ships drik only, and says so on screen.** Gupta Press and Vakya are not an offset on drik values, they need a separate Surya Siddhanta calculator. Naming the system in use means a Gupta Press household is not quietly given wrong dates.

**Wrong panchang is worse than no panchang.** People plan fasts and rituals on this. A 60-date cross-check against printed almanacs for Kolkata and Chennai is a release blocker, and it has not been done yet.

**Bangladesh is a third system, and it was a gap.** Bangladesh uses a revised arithmetic calendar with fixed month lengths that pins Pohela Boishakh to 14 April every year. West Bengal's drik panjika lands on the 15th in 2025, 2026 and 2027. Shipping only drik meant a Dhaka user got the wrong date on the biggest day of their year — and Bangladesh has more Bengali speakers than West Bengal does. It is also the cheapest system in the product: pure arithmetic, no astronomy, no licence.

**The first external validation.** Two independent MIT implementations of the Bangladesh calendar were run over 1461 days and agreed on every single one, which makes them a usable oracle. AlarmX matches them exactly, 1461 of 1461, zero tolerance. That also confirms what both Bengali systems share — month names, month order, year numbering, Bengali numerals — and confirms the drik engine reproduces a documented real-world difference rather than an arbitrary one: West Bengal really did keep Poila Boishakh on 15 April 2025 while Bangladesh observed it on the 14th.

The limit of that is worth stating plainly: those references compute no tithi, nakshatra, yoga or karana, and no drik dates. So the printed-panjika cross-check is untouched by it and still blocks release.

## Status

Economics modelled, PRD at v0.4, prototype built and tested — **212 checks passing** (155 browser, 38 astronomy, 19 cross-validation). The engine gets Puthandu, Poila Boishakh and Thai Pongal right across two years, including the sunset rule that moves Pongal from the 14th to the 15th in 2027.

Not started: native Android build, PSP integration, brand partnerships, backend fraud service. Not verified: the 60-date almanac cross-check, every drik date that is not the new year, every tithi and nakshatra, and the Tamil 60-year cycle spellings.

## Links

- [[Tasks.md]]
- [[Notes/Claude Memory/MEMORY.md]]
- [[Notes/Playbooks/Testing and Delivery Protocol]]
- [[CLAUDE.md]]
