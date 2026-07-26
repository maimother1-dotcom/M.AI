---
id: n8n-email-attribution
triggers: [n8n, email, node, Gmail, SMTP, Outlook, send]
severity: hard
applies_to: [n8n]
created: 2026-04-01
source: correction
---
n8n email nodes must ALWAYS set appendAttribution: false. No exceptions.
