---
id: n8n-anthropic-schema
triggers: [n8n, Anthropic, Claude API, credential, AI node]
severity: hard
applies_to: [n8n]
created: 2026-04-01
source: observation
---
n8n Anthropic credential schema requires BOTH apiKey AND headerName/headerValue. apiKey alone returns 400.
