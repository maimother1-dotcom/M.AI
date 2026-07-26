---
id: no-polling-use-n8n-linear
triggers: [polling, claude code poll, session check, client updates, client management, portal update]
severity: hard
applies_to: [client-delivery, n8n, architecture]
created: 2026-04-04
source: correction
---

Never design client management systems with Claude Code polling (requires computer to stay on). The correct architecture: portal updates → n8n webhook → Linear task created → Claude checks Linear via n8n endpoint at session start. Claude Code's role is to READ what's pending from Linear/n8n at session start and surface it, not to continuously poll. Build the bridge in n8n, store task state in Linear.
