---
id: config-change-no-test-fire
triggers: [edit, swap, change, update, config, recipient, send to, switch to]
severity: hard
applies_to: [all]
created: 2026-04-12
source: correction
---
When Bijoy says "edit X so it does Y" or "swap X to Y" or "change X to Y", that means CHANGE THE CONFIGURATION ONLY. Do NOT test/trigger/execute the changed thing. A config change is not a build. The test-every-change rule does NOT apply to config swaps.

Specifically for email/notification recipients: "send to [client name]" means change the recipient field. It does NOT mean send a test email to that person. NEVER test outbound actions (email, SMS, webhook, notification) by firing them at real recipients. Test with bijoy10987@gmail.com, then swap recipient as a config-only change when Bijoy says go.

The no-client-emails rule ALWAYS overrides the test-every-change rule. If these two rules conflict, no-client-emails wins. Every time. No exceptions.
