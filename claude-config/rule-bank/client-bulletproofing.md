---
id: client-bulletproofing
triggers: [automation, client, build, delivery, workflow, production]
severity: hard
applies_to: [client-delivery, n8n]
created: 2026-04-01
source: playbook
---
Every client automation must have: error notifications, input validation, retry logic (3 attempts exponential backoff), and fallback paths. No exceptions.
