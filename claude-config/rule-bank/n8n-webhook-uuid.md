---
id: n8n-webhook-uuid
triggers: [n8n, webhook, create, workflow creation, API]
severity: hard
applies_to: [n8n]
created: 2026-04-01
source: observation
---
n8n webhook nodes require a webhookId UUID field when created via API. Without it, the webhook never registers and silently fails.
