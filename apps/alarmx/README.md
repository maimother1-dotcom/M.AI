# AlarmX

An Android alarm app that pays users cash for waking up on time.

This directory holds the design work: the economics that set the reward ceiling, the spec that drives development, and a clickable prototype of the revised mechanics.

---

## What's here

| Path | What it is |
|---|---|
| `economics/AlarmX-unit-economics.xlsx` | The model that sets the earning cap. Read this first. |
| `PRD.md` | Full product spec. The document a developer builds from. |
| `prototype/index.html` | Interactive prototype. Open it in a browser, no setup. |
| `tests/verify_prototype.py` | 48-check browser suite covering the golden and error paths. |

---

## Start here: the number

The economics model is the reason everything else looks the way it does.

| Per active user per month | Conservative | **Base** | Optimistic |
|---|---:|---:|---:|
| Revenue | ₹10.05 | **₹23.42** | ₹57.74 |
| Sustainable earning cap | ₹1.93 | **₹21.65** | ₹84.90 |

The original concept paid up to **₹95 per user per month**. In the base case that loses **₹39.18 per active user per month** — about **₹39 lakh a month at 100k MAU**. The sensitivity grid shows the ₹95 row is negative at every revenue level tested, including ₹50/user/month, which is more than double the base case.

**The launch cap is ₹20/month**, with a documented ladder for raising it as measured ARPU proves out. See PRD §2.

Open the workbook and edit the blue cells. The two least reliable inputs are the survey resale values — they are placeholders, not sourced, and should be validated with a real data buyer before anyone counts on them.

---

## Three design changes worth knowing about

Each replaces something in the original concept that carried real risk.

**1. The alarm rings until dismissed.** The 10-second limit is now a *reward window*, not the ring duration. Previously the alarm auto-dismissed after 10 seconds, which makes the app the reason someone misses a shift. Now it rings up to 5 minutes with escalating volume; dismissing inside 10 seconds earns the reward, dismissing after still stops the alarm but records a miss. The wake-up incentive is unchanged and the app can no longer cause an overslept morning.

**2. Earning is capped, withdrawal is not.** The original design let users accrue ₹500–600 and released ₹60–100/month. That is a Play Store deceptive-behaviour risk and the specific mechanic behind "they won't let you withdraw" reviews. Now earning stops at the cap and everything earned is withdrawable in full within 48 hours.

**3. Flagged accounts get told the truth.** The proposed fake "technical difficulty" message is replaced with "Your account is under review, we'll update you within 5 days," plus an appeals route and a shadow payout throttle. Same effect on fraudsters, and false positives — which every fraud system produces — now have somewhere to go.

The survey also became optional and paid, which is what makes the consent valid under the DPDP Act, and it now drips 2–3 questions a day instead of walling 30 up front. The drip is worth more: ₹6.50/user/month versus ₹3.75 for the amortised one-time dump.

---

## Running the prototype

```bash
open prototype/index.html      # macOS
```

No build step, no dependencies, no network. Everything is in the one file.

A **DEV** bar sits at the bottom for testing: ring the alarm, skip the survey, advance a day or a month, force the cap, flag the account.

Worth doing in this order:

1. **Skip the survey.** Confirm the app is fully usable and pays nothing.
2. **Arm a math alarm, ring it, and let the 10 seconds lapse.** The alarm keeps ringing. That is the single most important change in the design.
3. **Register a QR code, ring, and submit the wrong code.** It's rejected.
4. **Hit the cap.** Read the wallet message — no locked balance, no "unlocks next month".
5. **Flag the account.** Read the review message and use the appeal button.

### Tests

```bash
pip install playwright
python3 tests/verify_prototype.py
```

48 checks, all passing as of this commit. Two notes on honesty:

- One step (solving math *after* the reward window closes) is driven through the page's own `checkMath()` handler rather than synthetic mouse events. A Playwright actionability quirk in that one long sequence reports the input as not visible, though it is provably visible and fills correctly in four isolated repros. Same code path, same state transitions, different event source.
- The suite needs a Chromium binary. If Playwright's bundled version doesn't match the one installed, pass `executable_path` to `chromium.launch()`.

---

## What this is not

The prototype is a design artefact for validating flows, not a production path. The real build is **native Android in Kotlin** — `AlarmManager` with exact-alarm permission, foreground service, Doze exemption, CameraX, Play Integrity. None of that is reachable from a web wrapper. PRD §8 has the full stack.

Not covered here: the Android implementation, PSP integration, brand partnerships, or the backend fraud service.

---

## Open questions

The full list is PRD §10. The one that needs a decision before build:

**The ₹30 minimum withdrawal and the ₹20 cap conflict.** A user cannot reach ₹30 inside their first cycle, so the first payout lands about six weeks in — which contradicts the "pays fast, pays real" position the honest-cap design depends on. Surfaced by prototype testing. Recommended fix is a one-off first payout at ₹10, then ₹30 thereafter: the cheapest way to buy the "it actually paid me" moment.
