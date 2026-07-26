---
id: credential-swap
triggers: [credentials, build, client, delivery, API key]
severity: hard
applies_to: [client-delivery, n8n]
created: 2026-04-01
source: system
---
Credential swap principle: build with our credentials, swap to client's at delivery. Never use client creds during development/testing.
