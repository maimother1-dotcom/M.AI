# Tasks

> Single source of truth for all work. Updated by Claude automatically every session.
> Format: `- [ ] [P1] Task — due: date`
> P1 revenue-critical | P2 important | P3 background | P4 someday

---

## Daily — Morning Ritual

Recurring every day. Drafts only, Bijoy approves before sending. See [[Notes/Playbooks/Morning Content Ritual]].

- [ ] [P2] Indian finance LinkedIn post + image → mishtisaka417@gmail.com — due: daily
- [ ] [P2] International finance LinkedIn post + image → mishtisaka417@gmail.com — due: daily
- [ ] [P2] Indian pharma LinkedIn post + image → bijoy10987@gmail.com — due: daily

---

## Active

### AlarmX — see [[Notes/Business/AlarmX]]

- [x] [P1] Decide the first-withdrawal rule — ₹10 first payout then ₹30, booked as acquisition
- [ ] [P1] Validate survey data resale value with a real buyer — still the weakest input, and with ads alone the Conservative case is loss-making — due: 2nd August 2026
- [ ] [P1] Open a real AdMob account and confirm actual rewarded eCPM and fill rate for India Android — both are published benchmarks, not measurements. Under the share model a wrong number changes earnings, never solvency — due: 9th August 2026
- [ ] [P1] Confirm AdMob server-side verification (SSV) is available on the chosen ad units and that the callback carries realised revenue — the entire no-loss guarantee depends on it — due: 9th August 2026
- [ ] [P2] Decide the legal and tax framing of a revenue share paid to users — it is closer to a rev-share than a prize, which may be better for the Play policy position and worse for TDS — due: 16th August 2026
- [ ] [P2] Measure whether users actually complete 4 rewarded videos a day once the app is live — the v0.5 cap rise rests on it — due: 60 days after launch
- [ ] [P2] Pick the PSP (RazorpayX vs Cashfree) and confirm the real per-payout rate at expected volume — due: 5th August 2026
- [ ] [P2] Legal review of the DPDP consent flow and the Play Store reward-app policy position — due: 9th August 2026
- [ ] [P1] Book a human security review before launch — the automated audit explicitly cannot test IDOR, privilege escalation, JWT handling or the payment rail because none of them exist yet, and this app moves real money — due: before any public release
- [ ] [P2] Build the account deletion flow and publish the deletion URL Play now requires — due: 23rd August 2026
- [ ] [P1] Test the alarm on a physical Redmi and a physical Realme before anything else ships — OEM battery killers are the biggest technical risk and emulators do not reproduce them — due: 5th August 2026
- [ ] [P2] Get Hinglish strings read by 3 real students in the segment — tone has to sound like texting, not translated English — due: 7th August 2026
- [ ] [P2] Cross-check 60 dates of computed panchang against a printed Vishuddha Siddhanta panjika and a Tamil daily calendar, Kolkata and Chennai — no longer a v1 release blocker (PRD 19.3 moves the calendar to v1.1) but still a blocker for shipping it — due: 20th September 2026
- [ ] [P2] Buy the Swiss Ephemeris Professional licence from Astrodienst and sign the contract — AGPL would force the whole app open-source including the anti-farming gate. Deferred with the calendar to v1.1 — due: 20th September 2026
- [x] [P1] Validate the Bengali calendar against independent implementations — Bangladesh arithmetic system matches exactly on 1461 days, and it revealed Bangladesh needed its own system
- [ ] [P2] Get the Bengali and Tamil strings, and the Tamil 60-year cycle names, read by native speakers — the cycle spellings are unverified — due: 12th August 2026
- [ ] [P2] Decide whether Bangladesh is a launch market — it now has a working calendar and more Bengali speakers than West Bengal, but UPI does not reach it so payouts need a different rail (bKash/Nagad) — due: 20th August 2026
- [ ] [P3] Find out whether the median Bengali household follows Vishuddha Siddhanta or Gupta Press — if Gupta Press dominates, the v2 calculator becomes urgent — due: 23rd August 2026
- [x] [P1] Build the money and anti-fraud core — Kotlin domain module, 28 tests passing on the JVM
- [x] [P1] Build the server credit engine — Node backend, 51 tests including a real AdMob signature round-trip
- [x] [P1] Turn the backend into a running service and attack it — 37 hostile-request tests, IDOR and SSV replay both confirmed to fail against a reintroduced bug first
- [x] [P1] Move the UX logic into pure Kotlin so it is tested — onboarding, permissions, OEM battery guide, Daily Close, maths. 78 core tests
- [ ] [P1] Create the Play Console developer account — identity verification takes days on its own and the 14-day closed-testing clock sits behind it — due: 30th July 2026
- [ ] [P1] Recruit 12 closed testers and collect their Google account emails — 12, opted in, continuously for 14 days. This is the requirement that most often slips — due: 1st August 2026
- [ ] [P1] Enable 2FA on Play, AdMob, Firebase and the PSP before connecting anything, and set up Play App Signing — a lost upload keystore ends the app permanently — due: 30th July 2026
- [ ] [P1] Finish the Android app layer on a machine with the SDK — UI, Room, AdMob, Firebase Auth. Core, backend and the UX state machines are done; what is left is renderers and resources — due: 11th August 2026
- [ ] [P1] Test the alarm on a physical Redmi and Realme once the app compiles — emulators do not reproduce OEM battery killers — due: with the first build
- [ ] [P1] Re-run the backend security suite against a real Postgres — the store's row locks and ON CONFLICT claims are reviewed source, not verified behaviour. MemoryStore is what the 88 tests actually execute — due: 18th August 2026
- [ ] [P2] Wire RevenueSource to real AdMob reporting — the SSV callback confirms a view but does not carry revenue, so until then the gross-per-view figure must be a floor, never an estimate — due: 18th August 2026
- [ ] [P2] Verify the OEM deep links resolve on real devices — component names change between MIUI/ColorOS builds, so each must fall back to generic battery settings — due: with the first build

### System

- [ ] [P1] Run `install.sh` on the Mac to activate the system locally — due: today
- [ ] [P1] Pick the first offer for the solo AI business: which problem, which buyer, what price — due: 2nd August 2026
- [ ] [P1] Market survey for that first offer — competitors, pricing, positioning gap — due: 2nd August 2026
- [ ] [P2] Add Anthropic API key to `~/.claude/credentials/anthropic.env` — due: today
- [ ] [P2] Set up Gmail OAuth so the morning ritual can send without manual copy-paste — due: 29th July 2026
- [ ] [P3] Install ntfy on phone, subscribe to topic `BijoyClaude` — due: today

---

## Done

- [x] Install Obsidian
- [x] Install Claude Code
- [x] Run first-time setup interview
- [x] Personalize the vault, CLAUDE.md, and memory system
