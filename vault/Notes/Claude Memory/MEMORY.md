# Claude Memory — Bijoy Halder

> Auto-generated and auto-updated. Claude adds entries here when it learns something worth keeping.
> One fact, one home. Never duplicate what's in CLAUDE.md.

---

## User

- **Profile:** Bijoy Halder, 27, Kolkata, India
- **Role:** International Marketing Executive at WBCIL.com. Planning to go solopreneur.
- **Goal:** Launch best-in-class products and reach $100,000 USD per month
- **Tools:** Brevo (email marketing), Anymail Finder (email lookup), MS Office
- **Serves:** Clients and customers
- **Communication preference:** Short and direct
- **Schedule:** Night owl. Late-night work is normal, not an exception.
- **Timezone:** Asia/Kolkata (IST, UTC+5:30)

---

## Projects

### Solo AI business (primary direction)
Bijoy is building a one-person AI business that solves real business problems with AI. Still at the direction stage, not yet a defined product. The immediate need is picking the first offer: which problem, for which buyer, at what price.

Before any build: due diligence and a market survey. This is a hard rule from him, not a suggestion.

### AlarmX (first product)
Android alarm app paying users cash for waking on time. Full detail in [[Notes/Business/AlarmX]]; design work in `apps/alarmx/`.

The governing fact: the original ₹95/user/month payout loses ₹54.60 per active user per month against ₹26.16 of revenue. Launch cap is ₹15/month, raised only as measured ARPU proves it. Positioned for exam students, Hinglish by default. Any future feature that pays users has to be checked against `economics/AlarmX-unit-economics.xlsx` before it ships.

Accounting insight worth reusing: the ₹10 first payout is booked as **customer acquisition, not a reward**. It costs ₹13 per converting user against a ₹22 paid install, so it buys a paid retained user for 41% of what an ad buys a raw install. Charging trust-building spend to a reward budget wrongly depresses every later month.

Three design flaws were caught and fixed before build: a 10-second alarm that auto-dismissed (now the alarm rings until dismissed and 10s is only the reward window), a withdrawal bottleneck that was a Play Store removal risk (now cap earning, pay out in full), and a fake "technical difficulty" message for flagged accounts (now an honest under-review state with appeals).

Retention insight worth reusing: **a capped product cannot buy attention with money, so borrow a habit that already exists.** v0.4 added a Bengali panjika / Tamil daily calendar and a 4×2 home-screen widget. The calendar is the reason to look, AlarmX state is what is seen while looking — no notification needed, no rupees spent, and the ₹15 cap is untouched. It also merged two audiences that looked incompatible: one widget carries both the tithi and the exam countdown.

Two rules encoded there: **never scrape a competitor's copyrighted content** (bengalicalendar.com and tamildailycalendar.com are references for which fields to show, not data sources — everything is computed from ephemeris), and **check the licence before choosing a library** — Swiss Ephemeris under AGPL would have forced the whole app open-source including the anti-farming gate, so the commercial licence is a release blocker.

Domain trap to remember: **Bengali and Tamil solar calendars start their day by different rules**, and getting it wrong shifts every date. Tamil uses a sunset rule, Bengali starts the month the day after the sankranti. First implementation had both wrong; caught only by testing against real festival dates across two years, not one.

Decision principle worth reusing: **when a revenue lever collides with a safety promise, price the lever before arguing about it.** Bijoy proposed an ad before the alarm's math problem. Modelling it showed ₹0.73/user/month, worth ₹0.65 of cap — against delaying someone switching off a 5am alarm and handing Play a reward app that blocks an alarm. The number ended the argument in one line. Also: the better-behaved format was the more profitable one (rewarded eCPM $1.50 vs interstitial $0.40), which is common and worth checking before assuming a user-hostile placement pays.

Related: **"we have several revenue sources" is not the same as diversification.** Ads are 61% of AlarmX base revenue, but zeroing the survey line still produces a negative Conservative cap. More lines did not reduce the risk, they moved it from a price Bijoy can negotiate to an eCPM Google sets.

Standing principle from this feature: **where being wrong is worse than being absent** (dates people plan fasts on, medical or financial figures), verification against an independent published source is a release blocker, and unverified work gets said out loud rather than implied as done.

Validation technique worth reusing: **two independent implementations that agree with each other are a usable oracle; one is not.** Bijoy supplied a Python and a Go Bengali calendar library. Running both over 1461 days and finding zero disagreement is what made it safe to assert against them with zero tolerance. Freeze their agreed output as a golden file with a provenance header rather than vendoring the libraries, so the test has no runtime dependency.

Second lesson from the same exercise: **check what a reference actually implements before treating it as ground truth.** Both libraries turned out to compute the Bangladesh arithmetic calendar, not the West Bengal drik panjika, and compute no tithi or nakshatra at all. Using them naively would have "validated" the wrong system and produced false confidence. Say precisely which claims a validation run does and does not support.

That mistake-that-wasn't also found a real gap: **Bangladesh has more Bengali speakers than West Bengal and uses a different calendar.** Shipping only drik would have given every Dhaka user the wrong date on their biggest day. Note for market scoping: UPI does not reach Bangladesh, so payouts there need bKash or Nagad.

### WBCIL.com (day job)
International marketing executive role. Client and customer facing. Outreach stack is Brevo plus Anymail Finder, which means the outreach rules in the rule bank apply directly here (`outreach-draft-only`, `outreach-no-em-dash`, `outreach-followup-timing`, `outreach-followup-short`).

Watch for: day-job urgency crowding out the solo AI business. Flag it when it happens.

### Morning content ritual (daily)
Three LinkedIn posts per day with images, emailed out. Indian finance and international finance to mishtisaka417@gmail.com, Indian pharma to bijoy10987@gmail.com. Drafts only — Bijoy approves before anything sends. See [[Notes/Playbooks/Morning Content Ritual]].

---

## Behavioral

- **Security is financial, not academic.** Bijoy's stated fear is losing money to someone bypassing or modding what he builds. Treat every bypass vector as a revenue leak. Server-side enforcement always; never trust the client.
- **Two-factor or no access.** No shared logins, no single-factor admin, no "temporary" bypass.
- **"Done" means tested.** He explicitly asked for debugging and verification before completion is claimed. Never report done on unrun code. If something was not run, say so.
- **No dumb questions.** Infer from vault, code, and search first. Only ask what genuinely blocks the work, and batch it into one message.
- **Best version, not first version.** On anything non-trivial, weigh at least two approaches before committing.
- **Quality over speed, always.** He said it in both the ALWAYS and NEVER lists, which makes it the strongest signal in his profile.

---

## Tool Quirks

- **macOS bash is 3.2.** `/bin/bash` on macOS predates bash 4, so `${VAR,,}` lowercase expansion and associative arrays fail. Use `tr '[:upper:]' '[:lower:]'` instead. This bug was present in the shipped `vault-vector/setup.sh` and is fixed in this repo's `install.sh`.
- **`sed -i` differs by platform.** BSD/macOS needs `sed -i ''`, GNU/Linux needs plain `sed -i`. `install.sh` detects and branches.

---

## Build Patterns

*Repeatable technical patterns go here.*

---

*This file grows automatically. Don't edit manually — Claude manages it.*
