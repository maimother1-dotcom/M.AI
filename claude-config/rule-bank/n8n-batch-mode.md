---
id: n8n-batch-mode
triggers: [n8n, batch, aggregate, code node, loop]
severity: hard
applies_to: [n8n]
created: 2026-04-01
source: correction
---
n8n batch mode: Code nodes must use $input.all() + return array for Aggregate to work. Named node references ($('NodeName').item.json) break in batch mode with branching.
