---
id: rule-hierarchy
triggers: [test, send, email, deploy, swap, change, edit, client]
severity: hard
applies_to: [all]
created: 2026-04-12
source: correction
---
When rules conflict, this hierarchy applies (highest priority first):

1. NEVER send to clients (no-client-emails) -- absolute, overrides everything
2. NEVER take destructive/irreversible actions without confirmation
3. Config changes are config-only, not test triggers
4. Test every change before reporting done

Rule 4 (test every change) is SUBORDINATE to rules 1-3. If testing would send an email to a client, violate a safety rule, or trigger an irreversible action, DO NOT TEST. Report the config change as done and let Bijoy decide when to go live.

"Edit X so it sends to Y" = change the config field. Period. Not: change it and fire it.
