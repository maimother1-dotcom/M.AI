---
id: health-checks-burn-in-only
triggers: [health check, monitoring, scheduled, workflow, automation, deploy, live]
severity: hard
applies_to: [n8n, client-delivery, all]
created: 2026-04-06
source: correction
---
Health checks for live automations are burn-in only -- not infinite. Schedule exactly 2-3 one-time fireAt checks spread randomly across a 7-day window after launch. Use `fireAt` (not cron) so each check auto-disables after firing. The final check sends a "Verified" ntfy summary and updates the vault note to mark monitoring complete. Never schedule an infinite cron for routine health monitoring -- that implies the system can't be trusted, which wastes resources. If persistent monitoring is genuinely needed (e.g. client SLA), discuss with Bijoy first.

**Why:** Bijoy corrected an infinite daily cron health check. Burn-in = verify it works over a week, then trust it.
**How to apply:** At build time, create 3 one-time scheduled tasks (not 1 cron) spaced across day 2, day 5, and day 7 post-launch.
