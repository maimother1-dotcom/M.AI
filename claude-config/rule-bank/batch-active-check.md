---
id: batch-active-check
triggers: [new task, mid-day, active batch, request]
severity: hard
applies_to: [all]
created: 2026-04-01
source: system
---
Every session reads Active Batch.md first. If active batch exists and [USER] asks for something new, ask urgency test: does NOT doing this right now cost a client or block revenue? If not urgent, log to Tasks.md, do not execute.
