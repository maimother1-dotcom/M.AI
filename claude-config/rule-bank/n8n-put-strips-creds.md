---
id: n8n-put-strips-creds
triggers: [n8n, PUT, workflow, update, API, edit]
severity: hard
applies_to: [n8n]
created: 2026-04-01
source: observation
---
n8n PUT requests strip credentials from nodes. After any API PUT update, credentials must be reconnected via Chrome. Always warn about this after a PUT operation.
