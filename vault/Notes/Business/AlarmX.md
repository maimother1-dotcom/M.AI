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
| Sustainable earning cap | ₹1.93 | **₹21.65** | ₹84.90 |

The original concept paid up to **₹95/user/month**. Base case, that loses **₹39.18 per active user per month** — roughly **₹39 lakh a month at 100k MAU**. Sensitivity testing shows ₹95 is loss-making at every revenue level tested, including ₹50/user/month.

**Launch cap: ₹20/month**, with a documented ladder for raising it only as measured ARPU proves out.

The two weakest inputs are the survey resale values. They are placeholders and need validating with a real buyer before anyone counts that revenue.

## Three changes that de-risked the concept

1. **The alarm rings until dismissed.** The 10-second limit became a *reward window*, not the ring duration. The original auto-dismissed after 10 seconds, which makes the app the reason someone misses a shift.
2. **Cap earning, not withdrawal.** The original let users accrue ₹500–600 and released ₹60–100/month. That is a Play Store deceptive-behaviour risk and the mechanic behind "they won't let you withdraw" reviews.
3. **Tell flagged accounts the truth.** The proposed fake "technical difficulty" message became an honest under-review state with an appeals route. Every fraud system produces false positives; they need somewhere to go.

Also: the survey became optional and paid, which is what makes the consent valid under the DPDP Act, and now drips 2–3 questions daily instead of walling 30 up front. The drip is worth more — ₹6.50/user/month versus ₹3.75 for the amortised one-time dump.

## Decision needed before build

**The ₹30 minimum withdrawal conflicts with the ₹20 cap.** A user cannot reach ₹30 in their first cycle, so the first payout lands about six weeks in, contradicting the "pays fast, pays real" position the whole design rests on. Surfaced by prototype testing.

Recommendation: a one-off first payout at ₹10, then ₹30 after. Cheapest way to buy the "it actually paid me" moment.

## Status

Economics modelled, PRD written, prototype built and tested (48/48 checks). Not started: native Android build, PSP integration, brand partnerships, backend fraud service.

## Links

- [[Tasks.md]]
- [[Notes/Claude Memory/MEMORY.md]]
- [[Notes/Playbooks/Testing and Delivery Protocol]]
- [[CLAUDE.md]]
