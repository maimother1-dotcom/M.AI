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

The governing fact: the original ₹95/user/month payout loses ₹39.18 per active user per month against ₹23.42 of revenue. Launch cap is ₹20/month, raised only as measured ARPU proves it. Any future feature that pays users has to be checked against `economics/AlarmX-unit-economics.xlsx` before it ships.

Three design flaws were caught and fixed before build: a 10-second alarm that auto-dismissed (now the alarm rings until dismissed and 10s is only the reward window), a withdrawal bottleneck that was a Play Store removal risk (now cap earning, pay out in full), and a fake "technical difficulty" message for flagged accounts (now an honest under-review state with appeals).

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
