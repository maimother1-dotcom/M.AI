---
id: edge-case-analysis-before-build
triggers: [automation, workflow, n8n, build, implement, integrate, platform]
severity: hard
applies_to: [all]
created: 2026-04-07
source: correction
---
Before building ANY automation or platform feature: list all edge cases explicitly and handle them in the implementation. Do NOT start coding until edge cases are enumerated. Edge cases include: duplicate data, missing fields, timing collisions, retries on failure, what happens if the trigger fires twice, what if the upstream data is stale, what if the downstream system is down. Testing is also mandatory — only test the things being changed and the immediate surrounding logic. Never test unrelated flows. Never say "done" without having run a real test of the specific change.
