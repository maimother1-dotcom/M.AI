---
id: check-before-followup
triggers: [follow-up, followup, send, scheduled, outreach]
severity: hard
applies_to: [outreach]
created: 2026-04-01
source: correction
---
Before sending ANY follow-up: pull getLead to verify last_message_type is still "outbox". If "inbox" (they replied), DO NOT send the follow-up. Flag to Bijoy instead.
