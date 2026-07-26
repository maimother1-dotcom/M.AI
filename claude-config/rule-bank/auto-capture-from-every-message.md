---
id: auto-capture-from-every-message
triggers: [vault, logging, notes, adding, capturing, context, message, session]
severity: hard
applies_to: [all]
created: 2026-04-07
source: correction
---

Vault maintenance must ACTIVELY EXTRACT and WRITE new information from every message — not just acknowledge that maintenance happened. If Bijoy mentions a person, deal value, decision, new opportunity, pipeline update, revenue number, or any context useful for future sessions — write it into the vault immediately in the SAME response. Do not wait for Bijoy to say "okay now add to vault." Do not just "run maintenance" and add nothing.

The trigger is: did this message contain anything a future Claude session would need to know? If yes — write it now.

This applies to: deal values mentioned, new people introduced, revenue targets stated, pipeline updates, decisions made, new tasks implied, client context, offer changes, anything.

**Why:** Bijoy explicitly said "I'm dropping sauce but it's not logging it into the vault with every message. It should just automatically add stuff which is important." He is not going to manually trigger vault updates — Claude captures everything autonomously.

**How to apply:** After every response, ask: "Did this message contain new information about a person, deal, decision, or context?" If yes — it must be written to the vault in this response. No exceptions.
