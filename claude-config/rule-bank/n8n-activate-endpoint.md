---
id: n8n-activate-endpoint
triggers: [n8n, activate, workflow, enable]
severity: hard
applies_to: [n8n]
created: 2026-04-01
source: observation
---
n8n activate endpoint is POST /workflows/{id}/activate (NOT /active). Wrong endpoint silently fails.
