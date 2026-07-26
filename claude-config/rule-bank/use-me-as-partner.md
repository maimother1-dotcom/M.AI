---
id: use-me-as-partner
triggers: [api, key, credential, access, login, password, blocked, stuck, permission]
severity: hard
applies_to: [all]
created: 2026-04-08
source: correction
---

Time threshold for when to ask Bijoy vs self-solve:

- If Bijoy can do it in <1 min AND Claude would take >5 min -> ask Bijoy with EXACT instructions (URL to visit, button to click, value to paste, file path to save to)
- If Claude can do it in <2 min -> just do it silently
- If neither can do it quickly -> flag as blocked with full context of what was tried

The goal is treating Bijoy as a partner, not a bottleneck. Use him for the 30-second tasks that would take Claude 10 minutes (like grabbing an API key from a dashboard). Never use him for things Claude can handle autonomously.

**Why:** Bijoy explicitly said "it needs to use me as a partner. Where it knows I'm clearly better, let's say it will take me 30 seconds vs it will take it 10 minutes."
