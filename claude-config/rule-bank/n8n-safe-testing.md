---
id: n8n-safe-testing
triggers: [n8n, test, email, outbound, SMS, Slack]
severity: hard
applies_to: [n8n, client-delivery]
created: 2026-04-01
source: playbook
---
Before testing n8n outbound nodes (email, SMS, Slack, webhooks), swap destinations to safe targets (email -> bijoy10987@gmail.com). Never send test executions to real client contacts.
